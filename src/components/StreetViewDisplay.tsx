import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Route } from "../types";
import { GoogleMapsManager } from "../utils/googleMapsUtils";
import { RouteToCoordinatesConverter } from "../utils/routeToCoordinatesConverter";
import { useMapSettings } from "../hooks/useMapSettings";

const MIN_POINTS_FOR_STREET_VIEW = 2;
const DEFAULT_SAMPLE_DISTANCE_METERS = 200;
const MIN_SAMPLE_COUNT = 5;
const MAX_SAMPLE_COUNT = 15;
const FALLBACK_VIRTUAL_ROUTE_ADDRESS = "Golden Gate Park, San Francisco, CA";

interface StreetViewDisplayProps {
  route: Route;
  distance: number;
  routeTotal: number;
  isRiding: boolean;
  apiKey?: string;
  onLocationUpdate?: (location: string) => void;
  onError?: (error: string) => void;
}

interface PanoramaInfo {
  panoId: string;
  description?: string;
  latLng?: google.maps.LatLng | null;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const getCurrentPanoramaIndex = (progress: number, totalPanoramas: number) => {
  if (totalPanoramas <= 0) {
    return -1;
  }
  const clampedProgress = clamp(progress, 0, 1);
  if (totalPanoramas === 1) {
    return 0;
  }
  return Math.min(totalPanoramas - 1, Math.floor(clampedProgress * (totalPanoramas - 1)));
};

const sampleRoutePoints = (
  points: google.maps.LatLngLiteral[],
  sampleDistanceMeters: number = DEFAULT_SAMPLE_DISTANCE_METERS,
): google.maps.LatLng[] => {
  if (!points.length) {
    return [];
  }

  const latLngs = points.map((point) => new google.maps.LatLng(point.lat, point.lng));

  if (latLngs.length === 1) {
    return latLngs;
  }

  const spherical = google.maps.geometry?.spherical;

  if (!spherical?.computeDistanceBetween) {
    const fallbackSamples: google.maps.LatLng[] = [];
    const step = Math.max(1, Math.floor(points.length / Math.max(MIN_SAMPLE_COUNT, 1)));

    for (let i = 0; i < points.length; i += step) {
      fallbackSamples.push(new google.maps.LatLng(points[i].lat, points[i].lng));
      if (fallbackSamples.length >= MAX_SAMPLE_COUNT) {
        break;
      }
    }

    const lastFallback = fallbackSamples.at(-1);
    const routeLast = latLngs.at(-1) as google.maps.LatLng;
    if (!lastFallback || !lastFallback.equals(routeLast)) {
      fallbackSamples.push(routeLast);
    }

    return fallbackSamples;
  }

  const cumulative: number[] = new Array(latLngs.length).fill(0);
  for (let i = 1; i < latLngs.length; i += 1) {
    cumulative[i] =
      cumulative[i - 1] + spherical.computeDistanceBetween(latLngs[i - 1], latLngs[i]);
  }

  const totalDistance = cumulative[cumulative.length - 1];

  if (totalDistance <= 0) {
    return [latLngs[0], latLngs.at(-1) ?? latLngs[0]].filter(Boolean) as google.maps.LatLng[];
  }

  const approximateCount = clamp(
    Math.round(totalDistance / sampleDistanceMeters) + 1,
    MIN_SAMPLE_COUNT,
    MAX_SAMPLE_COUNT,
  );

  const desiredCount = Math.min(approximateCount, latLngs.length);
  if (desiredCount <= 1) {
    return [latLngs[0]];
  }

  const samples: google.maps.LatLng[] = [];
  const seen = new Set<string>();

  const pushSample = (latLng: google.maps.LatLng) => {
    const key = `${latLng.lat().toFixed(6)}:${latLng.lng().toFixed(6)}`;
    if (!seen.has(key)) {
      seen.add(key);
      samples.push(latLng);
    }
  };

  for (let i = 0; i < desiredCount; i += 1) {
    const targetDistance = (totalDistance * i) / (desiredCount - 1);
    let targetIndex = cumulative.findIndex((value) => value >= targetDistance);
    if (targetIndex === -1) {
      targetIndex = cumulative.length - 1;
    }
    pushSample(latLngs[targetIndex]);
    if (samples.length >= MAX_SAMPLE_COUNT) {
      break;
    }
  }

  if (!samples.length) {
    pushSample(latLngs[0]);
  }
  pushSample(latLngs.at(-1) as google.maps.LatLng);

  return samples;
};

const preloadPanoramas = async (
  samplePoints: google.maps.LatLng[],
): Promise<PanoramaInfo[]> => {
  if (!samplePoints.length) {
    return [];
  }

  const service = new google.maps.StreetViewService();
  const panoramas: PanoramaInfo[] = [];
  const seen = new Set<string>();

  for (const point of samplePoints) {
    // eslint-disable-next-line no-await-in-loop
    const panorama = await new Promise<PanoramaInfo | null>((resolve) => {
      service.getPanorama(
        {
          location: point,
          radius: 150,
          source: google.maps.StreetViewSource.OUTDOOR,
        },
        (data, status) => {
          if (status === google.maps.StreetViewStatus.OK && data?.location?.pano) {
            resolve({
              panoId: data.location.pano,
              description: data.location.description ?? undefined,
              latLng: data.location.latLng ?? point,
            });
            return;
          }

          resolve(null);
        },
      );
    });

    if (panorama && !seen.has(panorama.panoId)) {
      seen.add(panorama.panoId);
      panoramas.push(panorama);
    }
  }

  return panoramas;
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
  const [isMapsLoading, setIsMapsLoading] = useState(false);
  const [isPanoramaLoading, setIsPanoramaLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<string>("");
  const [routeLatLngs, setRouteLatLngs] = useState<google.maps.LatLngLiteral[]>([]);
  const [panoramaSequence, setPanoramaSequence] = useState<PanoramaInfo[]>([]);
  const [mapsReady, setMapsReady] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  const streetViewRef = useRef<HTMLDivElement | null>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const mapsManagerRef = useRef<GoogleMapsManager | null>(null);
  const converterRef = useRef<RouteToCoordinatesConverter | null>(null);
  const currentPanoramaIndexRef = useRef<number>(-1);

  const { reverseRoute } = useMapSettings();

  const isLoading = isMapsLoading || isPanoramaLoading;

  const resetStateForRoute = useCallback(() => {
    setPanoramaSequence([]);
    currentPanoramaIndexRef.current = -1;
    setCurrentLocation("");
  }, []);

  const convertRoutePoints = useCallback(async () => {
    if (!apiKey) {
      return [] as google.maps.LatLngLiteral[];
    }

    if (!route?.pts?.length) {
      return [] as google.maps.LatLngLiteral[];
    }

    const validPoints = route.pts.filter(
      (point) =>
        typeof point.lat === "number" &&
        (typeof point.lon === "number" || typeof point.lng === "number"),
    );

    if (validPoints.length >= MIN_POINTS_FOR_STREET_VIEW) {
      return validPoints.map((point) => ({
        lat: point.lat as number,
        lng: (point.lon ?? point.lng) as number,
      }));
    }

    let converter = converterRef.current;
    if (!converter) {
      converter = new RouteToCoordinatesConverter(apiKey);
      converterRef.current = converter;
    }

    const fallbackAddress = route.bounds
      ? `${(route.bounds.minLat + route.bounds.maxLat) / 2}, ${(route.bounds.minLon + route.bounds.maxLon) / 2}`
      : FALLBACK_VIRTUAL_ROUTE_ADDRESS;

    try {
      const convertedRoute = await converter.convertVirtualRouteToReal(route, fallbackAddress, 2);
      return convertedRoute.pts
        .filter(
          (point) =>
            typeof point.lat === "number" &&
            (typeof point.lon === "number" || typeof point.lng === "number"),
        )
        .map((point) => ({
          lat: point.lat as number,
          lng: (point.lon ?? point.lng) as number,
        }));
    } catch (err) {
      console.error("StreetViewDisplay: failed to convert virtual route", err);
      return [] as google.maps.LatLngLiteral[];
    }
  }, [apiKey, route]);

  useEffect(() => {
    if (!apiKey) {
      setMapsReady(false);
      mapsManagerRef.current = null;
      panoramaRef.current = null;
      setRouteLatLngs([]);
      resetStateForRoute();
      setIsMapsLoading(false);
      setIsPanoramaLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsMapsLoading(true);
    setError(null);

    const initialise = async () => {
      try {
        const manager = GoogleMapsManager.getInstance({ apiKey });
        mapsManagerRef.current = manager;
        await manager.loadGoogleMaps();
        if (cancelled) {
          return;
        }
        setMapsReady(true);
        setIsMapsLoading(false);
      } catch (err) {
        if (cancelled) {
          return;
        }
        const message = err instanceof Error ? err.message : "Failed to load Google Maps";
        setError(message);
        setIsMapsLoading(false);
        setMapsReady(false);
        onError?.(message);
      }
    };

    void initialise();

    return () => {
      cancelled = true;
    };
  }, [apiKey, loadAttempt, onError, resetStateForRoute]);

  useEffect(() => {
    if (!mapsReady || !streetViewRef.current) {
      return;
    }

    const options: google.maps.StreetViewPanoramaOptions = {
      visible: false,
      zoom: 1,
      addressControl: false,
      linksControl: false,
      panControl: false,
      zoomControl: false,
      fullscreenControl: false,
      motionTracking: false,
      motionTrackingControl: false,
    };

    panoramaRef.current = new google.maps.StreetViewPanorama(streetViewRef.current, options);

    return () => {
      panoramaRef.current = null;
    };
  }, [mapsReady]);

  useEffect(() => {
    if (!mapsReady || !apiKey) {
      setRouteLatLngs([]);
      resetStateForRoute();
      return;
    }

    let cancelled = false;

    const prepareRoute = async () => {
      try {
        const points = await convertRoutePoints();
        if (!cancelled) {
          setRouteLatLngs(points);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("StreetViewDisplay: unable to prepare Street View route", err);
          setRouteLatLngs([]);
          resetStateForRoute();
          onError?.("Failed to prepare Street View route");
        }
      }
    };

    void prepareRoute();

    return () => {
      cancelled = true;
    };
  }, [apiKey, convertRoutePoints, mapsReady, onError, resetStateForRoute]);

  useEffect(() => {
    resetStateForRoute();
    setError(null);
  }, [route, resetStateForRoute]);

  const sampledPoints = useMemo(() => {
    if (!mapsReady || routeLatLngs.length < MIN_POINTS_FOR_STREET_VIEW) {
      return [] as google.maps.LatLng[];
    }
    return sampleRoutePoints(routeLatLngs);
  }, [mapsReady, routeLatLngs]);

  useEffect(() => {
    if (!mapsReady) {
      return;
    }

    if (!sampledPoints.length) {
      setPanoramaSequence([]);
      currentPanoramaIndexRef.current = -1;
      setIsPanoramaLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsPanoramaLoading(true);

    const loadPanoramas = async () => {
      try {
        const panoramas = await preloadPanoramas(sampledPoints);
        if (cancelled) {
          return;
        }

        if (!panoramas.length) {
          setError("No Street View imagery found along this route.");
          onError?.("No Street View imagery found along this route.");
        } else {
          setError(null);
        }

        setPanoramaSequence(panoramas);
      } catch (err) {
        if (!cancelled) {
          console.error("StreetViewDisplay: failed to load panoramas", err);
          const message = "Failed to load Street View imagery.";
          setError(message);
          onError?.(message);
          setPanoramaSequence([]);
        }
      } finally {
        if (!cancelled) {
          setIsPanoramaLoading(false);
        }
      }
    };

    void loadPanoramas();

    return () => {
      cancelled = true;
    };
  }, [mapsReady, onError, sampledPoints]);

  useEffect(() => {
    if (!panoramaRef.current) {
      return;
    }

    panoramaRef.current.setVisible(panoramaSequence.length > 0 && !error);
    currentPanoramaIndexRef.current = -1;
  }, [error, panoramaSequence]);

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
    if (!panoramaRef.current || !panoramaSequence.length) {
      return;
    }

    const effectiveProgress = reverseRoute ? 1 - progress.fraction : progress.fraction;
    const targetIndex = getCurrentPanoramaIndex(effectiveProgress, panoramaSequence.length);

    if (targetIndex < 0 || targetIndex === currentPanoramaIndexRef.current) {
      return;
    }

    const targetPanorama = panoramaSequence[targetIndex];

    panoramaRef.current.setPano(targetPanorama.panoId);
    panoramaRef.current.setPov({ heading: 0, pitch: 0 });
    panoramaRef.current.setZoom(1);
    panoramaRef.current.setVisible(true);

    currentPanoramaIndexRef.current = targetIndex;

    const locationLabel =
      targetPanorama.description?.trim() && targetPanorama.description.trim().length > 0
        ? targetPanorama.description.trim()
        : targetPanorama.latLng
        ? `${targetPanorama.latLng.lat().toFixed(4)}, ${targetPanorama.latLng.lng().toFixed(4)}`
        : "Street View";

    setCurrentLocation(locationLabel);
    onLocationUpdate?.(locationLabel);
  }, [onLocationUpdate, panoramaSequence, progress.fraction, reverseRoute]);

  const handleRetry = useCallback(() => {
    if (!apiKey) {
      return;
    }

    setError(null);
    setMapsReady(false);
    setRouteLatLngs([]);
    resetStateForRoute();
    setLoadAttempt((attempt) => attempt + 1);
  }, [apiKey, resetStateForRoute]);

  const missingApiKey = !apiKey;
  const insufficientGeo = routeLatLngs.length < MIN_POINTS_FOR_STREET_VIEW;

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-dark-200">Street View</h3>
        {currentLocation && (
          <div className="text-sm text-dark-400 max-w-xs truncate">{currentLocation}</div>
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

        {error && !missingApiKey && (
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
          style={{ display: missingApiKey || insufficientGeo ? "none" : "block" }}
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
          {panoramaSequence.length > 0 ? ` ${progress.percent}%` : " --"}
        </div>
      </div>
    </div>
  );
};

