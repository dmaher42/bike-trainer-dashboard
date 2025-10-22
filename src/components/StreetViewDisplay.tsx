import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Route } from "../types";
import { GoogleMapsManager } from "../utils/googleMapsUtils";
import { useMapSettings } from "../hooks/useMapSettings";

const MIN_POINTS_FOR_STREET_VIEW = 2;

interface StreetViewDisplayProps {
  route: Route;
  distance: number;
  routeTotal: number;
  isRiding: boolean;
  apiKey?: string;
  onLocationUpdate?: (location: string) => void;
  onError?: (error: string) => void;
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

const bearing = (a: google.maps.LatLngLiteral, b: google.maps.LatLngLiteral): number => {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLon = toRadians(b.lng - a.lng);

  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

  const heading = toDegrees(Math.atan2(y, x));
  return (heading + 360) % 360;
};

export const StreetViewDisplay: React.FC<StreetViewDisplayProps> = ({
  route,
  distance,
  routeTotal,
  isRiding,
  apiKey,
  onLocationUpdate,
  onError,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<string>("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  const streetViewRef = useRef<HTMLDivElement | null>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const lastIndexRef = useRef<number>(-1);
  const lastAppliedIndexRef = useRef<number>(-1);
  const lastUpdateMsRef = useRef(0);
  const mapsManagerRef = useRef<GoogleMapsManager | null>(null);
  const warnedAboutTotalRef = useRef(false);

  const {
    streetViewUpdateMs,
    usePointStep,
    streetViewPointsPerStep,
  } = useMapSettings();

  const routeLatLngs = useMemo(() => {
    return route.pts
      .filter(
        (point) =>
          typeof point.lat === "number" &&
          (typeof point.lon === "number" || typeof point.lng === "number"),
      )
      .map((point) => ({
        lat: point.lat as number,
        lng: (point.lon ?? point.lng) as number,
      }));
  }, [route.pts]);

  const progress = useMemo(() => {
    const total = routeTotal > 0 ? routeTotal : route.total;
    const loop = Math.max(1, total || 1);
    const mod = ((distance % loop) + loop) % loop;
    const fraction = total > 0 ? mod / loop : 0;

    return {
      fraction,
      percent: Math.round(fraction * 100),
    };
  }, [distance, route.total, routeTotal]);

  useEffect(() => {
    if (routeTotal > 0) {
      warnedAboutTotalRef.current = false;
      return;
    }

    if (!warnedAboutTotalRef.current) {
      console.warn(
        "StreetViewDisplay: route.total is zero or missing. Street View progress may be inaccurate.",
      );
      warnedAboutTotalRef.current = true;
    }
  }, [routeTotal]);

  useEffect(() => {
    if (!apiKey) {
      setIsLoading(false);
      setError(null);
      setCurrentLocation("");
      mapsManagerRef.current = null;
      panoramaRef.current = null;
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const initialise = async () => {
      try {
        const manager = GoogleMapsManager.getInstance({ apiKey });
        mapsManagerRef.current = manager;
        await manager.loadGoogleMaps();
        if (!cancelled) {
          setIsLoading(false);
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        const message =
          err instanceof Error ? err.message : "Failed to load Google Maps";
        setError(message);
        setIsLoading(false);
        onError?.(message);
      }
    };

    void initialise();

    return () => {
      cancelled = true;
    };
  }, [apiKey, loadAttempt, onError]);

  useEffect(() => {
    lastIndexRef.current = -1;
    lastAppliedIndexRef.current = -1;
    lastUpdateMsRef.current = 0;
    if (routeLatLngs.length < MIN_POINTS_FOR_STREET_VIEW) {
      setCurrentLocation("");
    }
  }, [routeLatLngs]);

  useEffect(() => {
    lastUpdateMsRef.current = 0;
    lastAppliedIndexRef.current = -1;
  }, [usePointStep, streetViewPointsPerStep]);

  useEffect(() => {
    lastUpdateMsRef.current = 0;
  }, [streetViewUpdateMs]);

  useEffect(() => {
    if (routeLatLngs.length < MIN_POINTS_FOR_STREET_VIEW) {
      return;
    }

    if (!streetViewRef.current) {
      return;
    }

    const manager = mapsManagerRef.current;
    if (!manager?.isLoaded()) {
      return;
    }

    const initialHeading =
      routeLatLngs.length > 1
        ? bearing(routeLatLngs[0], routeLatLngs[1])
        : 0;

    if (!panoramaRef.current) {
      panoramaRef.current = new google.maps.StreetViewPanorama(
        streetViewRef.current,
        {
          position: routeLatLngs[0],
          pov: { heading: initialHeading, pitch: 0 },
          zoom: 1,
          visible: true,
          addressControl: false,
          linksControl: false,
          panControl: false,
          zoomControl: false,
          fullscreenControl: false,
          motionTracking: false,
          motionTrackingControl: false,
        },
      );
    } else {
      panoramaRef.current.setPosition(routeLatLngs[0]);
      panoramaRef.current.setPov({ heading: initialHeading, pitch: 0 });
    }
  }, [apiKey, isLoading, routeLatLngs]);

  useEffect(() => {
    const panorama = panoramaRef.current;
    if (!panorama) {
      return;
    }

    if (routeLatLngs.length < MIN_POINTS_FOR_STREET_VIEW) {
      panorama.setVisible(false);
      return;
    }

    panorama.setVisible(true);

    const scaledIndex = progress.fraction * (routeLatLngs.length - 1);
    const targetIndex = Math.max(
      0,
      Math.min(routeLatLngs.length - 1, Math.floor(scaledIndex)),
    );

    const lastAppliedIndex = lastAppliedIndexRef.current;

    if (usePointStep) {
      const requiredStep = Math.max(1, streetViewPointsPerStep);
      if (
        lastAppliedIndex !== -1 &&
        Math.abs(targetIndex - lastAppliedIndex) < requiredStep
      ) {
        return;
      }
    } else {
      const now = Date.now();
      const throttleMs = Math.max(500, streetViewUpdateMs);
      if (lastAppliedIndex !== -1 && now - lastUpdateMsRef.current < throttleMs) {
        return;
      }
      lastUpdateMsRef.current = now;
    }

    const position = routeLatLngs[targetIndex];
    lastAppliedIndexRef.current = targetIndex;

    panorama.setPosition(position);

    const headingTarget = (() => {
      if (targetIndex < routeLatLngs.length - 1) {
        return routeLatLngs[targetIndex + 1];
      }
      if (targetIndex > 0) {
        return routeLatLngs[targetIndex - 1];
      }
      return position;
    })();

    const heading = headingTarget === position ? 0 : bearing(position, headingTarget);
    panorama.setPov({ heading, pitch: 0 });
    panorama.setZoom(1);

    const manager = mapsManagerRef.current;
    if (manager?.isLoaded() && lastIndexRef.current !== targetIndex) {
      lastIndexRef.current = targetIndex;
      let cancelled = false;
      const latLng = new google.maps.LatLng(position.lat, position.lng);

      manager
        .reverseGeocode(latLng)
        .then((location) => {
          if (cancelled) {
            return;
          }
          setCurrentLocation(location);
          onLocationUpdate?.(location);
        })
        .catch((err) => {
          if (!cancelled) {
            console.warn("Failed to get location name:", err);
          }
        });

      return () => {
        cancelled = true;
      };
    }

    return undefined;
  }, [
    progress.fraction,
    onLocationUpdate,
    routeLatLngs,
    streetViewUpdateMs,
    usePointStep,
    streetViewPointsPerStep,
  ]);

  const handleRetry = useCallback(() => {
    if (!apiKey) {
      return;
    }
    setError(null);
    setLoadAttempt((attempt) => attempt + 1);
  }, [apiKey]);

  const missingApiKey = !apiKey;
  const insufficientGeo = routeLatLngs.length < MIN_POINTS_FOR_STREET_VIEW;

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-dark-200">Street View</h3>
        {currentLocation && (
          <div className="text-sm text-dark-400 max-w-xs truncate">
            {currentLocation}
          </div>
        )}
      </div>

      <div className="relative w-full aspect-video bg-dark-900 rounded-xl overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-900/80 z-10">
            <div className="text-center">
              <div className="loading-spinner mx-auto mb-2" />
              <p className="text-sm text-dark-400">Loading Street View...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-900/80 z-20">
            <div className="text-center p-4 max-w-md">
              <div className="text-danger-400 mb-2">
                <svg
                  className="w-8 h-8 mx-auto"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <p className="text-sm text-dark-400">{error}</p>
              <button
                type="button"
                onClick={handleRetry}
                className="mt-4 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-400 focus:outline-none focus-visible:ring-2"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {missingApiKey && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-900/80 z-20 px-6 text-center">
            <p className="text-sm text-dark-300">
              Add your Google Maps API key in Settings to enable Street View.
            </p>
          </div>
        )}

        {!missingApiKey && insufficientGeo && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-900/80 z-20 px-6 text-center">
            <p className="text-sm text-dark-300">
              Street View needs GPX points with latitude/longitude.
            </p>
          </div>
        )}

        <div
          ref={streetViewRef}
          className="w-full h-full"
          style={{
            display:
              missingApiKey || insufficientGeo || error ? "none" : "block",
          }}
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isRiding ? "bg-success-400 animate-pulse" : "bg-dark-600"
            }`}
          />
          <span className="text-dark-400">{isRiding ? "Riding" : "Paused"}</span>
        </div>

        <div className="text-dark-400">
          Position:
          {routeLatLngs.length >= MIN_POINTS_FOR_STREET_VIEW
            ? ` ${progress.percent}%`
            : " --"}
        </div>
      </div>
    </div>
  );
};
