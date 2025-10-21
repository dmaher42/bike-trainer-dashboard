import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Route } from "../types";
import { MapProxyService } from "../services/mapProxy";
import { GoogleMapsManager } from "../utils/googleMapsUtils";

const MAX_STREET_VIEW_RETRIES = 3;

interface StreetViewDisplayProps {
  route: Route;
  currentPosition: number; // 0-1 fraction along the route
  isRiding: boolean;
  apiKey: string;
  onLocationUpdate?: (location: string) => void;
  onError?: (error: string) => void;
}

export const StreetViewDisplay: React.FC<StreetViewDisplayProps> = ({
  route,
  currentPosition,
  isRiding,
  apiKey,
  onLocationUpdate,
  onError,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<string>("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [routeLatLngs, setRouteLatLngs] = useState<google.maps.LatLng[]>([]);

  const streetViewRef = useRef<HTMLDivElement | null>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const lastRequestedIndexRef = useRef<number | null>(null);

  const [mapsManager, setMapsManager] = useState<GoogleMapsManager | null>(null);

  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Initialize Google Maps
  useEffect(() => {
    const initializeMaps = async () => {
      try {
        const manager = GoogleMapsManager.getInstance({ apiKey });
        setMapsManager(manager);

        await manager.loadGoogleMaps();
        setIsLoading(false);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load Google Maps";
        setError(errorMessage);
        setIsLoading(false);
        onError?.(errorMessage);
      }
    };

    initializeMaps();
  }, [apiKey, onError]);

  // Convert route points to LatLng objects
  useEffect(() => {
    if (!mapsManager || !mapsManager.isLoaded()) return;

    const convertRoutePoints = async () => {
      try {
        const latLngs = route.pts.map((point, index) => {
          const baseLat = 37.7749;
          const baseLng = -122.4194;
          const angle = (index / route.pts.length) * 2 * Math.PI;
          const radius = 0.01;
          const lat = baseLat + radius * Math.cos(angle);
          const lng = baseLng + radius * Math.sin(angle);
          return new google.maps.LatLng(lat, lng);
        });

        setRouteLatLngs(latLngs);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to convert route points";
        setError(errorMessage);
        onError?.(errorMessage);
      }
    };

    convertRoutePoints();
  }, [mapsManager, route, onError]);

  // calculateHeading helper
  const calculateHeading = useCallback(
    (index: number) => {
      if (routeLatLngs.length === 0) return 0;
      const position = routeLatLngs[index];
      if (!position) return 0;
      let heading = 0;
      if (index < routeLatLngs.length - 1) {
        const nextPoint = routeLatLngs[index + 1];
        heading = google.maps.geometry.spherical.computeHeading(position, nextPoint);
      }
      return heading;
    },
    [routeLatLngs]
  );

  // Initialize Street View panorama and update function
  useEffect(() => {
    if (!streetViewRef.current || !mapsManager || !mapsManager.isLoaded() || routeLatLngs.length === 0) {
      return;
    }

    try {
      if (!panoramaRef.current) {
        panoramaRef.current = new google.maps.StreetViewPanorama(streetViewRef.current, {
          position: routeLatLngs[0],
          pov: { heading: 0, pitch: 0 },
          zoom: 1,
          visible: true,
          addressControl: false,
          linksControl: false,
          panControl: false,
          zoomControl: false,
          fullscreenControl: false,
          motionTracking: false,
          motionTrackingControl: false,
        });
      }

      const updateStreetViewPosition = (index: number) => {
        if (!panoramaRef.current || routeLatLngs.length === 0) return;
        const position = routeLatLngs[index];
        if (!position) return;
        panoramaRef.current.setPosition(position);
        panoramaRef.current.setPov({ heading: calculateHeading(index), pitch: 0 });
        panoramaRef.current.setZoom(1);
      };

      // Set initial panorama position
      updateStreetViewPosition(0);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize Street View';
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [mapsManager, routeLatLngs, calculateHeading, onError]);

  const loadStreetViewWithRetry = useCallback(
    async (index: number, attempt = 0) => {
      const position = routeLatLngs[index];
      if (!position) {
        return;
      }

      if (attempt === 0) {
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = undefined;
        }
        lastRequestedIndexRef.current = index;
        setIsLoading(true);
        setError(null);
        setRetryCount(0);
      }

      try {
        const proxy = MapProxyService.getInstance();

        const image = await proxy.getStreetViewImage({
          location: `${position.lat()},${position.lng()}`,
          heading: calculateHeading(index),
          pitch: 0,
          fov: 90,
          size: "640x640",
        });

        setImageUrl(image);

        // Get current location name
        if (mapsManager) {
          try {
            const location = await mapsManager.reverseGeocode(position);
            setCurrentLocation(location);
            onLocationUpdate?.(location);
          } catch (err) {
            console.warn('Failed to get location name:', err);
          }
        }

        setRetryCount(0);
        setIsLoading(false);
        retryTimeoutRef.current = undefined;
        lastRequestedIndexRef.current = index;
      } catch (err) {
        console.error("Failed to load Street View:", err);
        const nextAttempt = attempt + 1;

        if (nextAttempt <= MAX_STREET_VIEW_RETRIES) {
          setRetryCount(nextAttempt);
          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
          }
          retryTimeoutRef.current = setTimeout(() => {
            void loadStreetViewWithRetry(index, nextAttempt);
          }, 1000 * nextAttempt);
          return;
        }

        const baseMessage = err instanceof Error ? err.message : "Failed to load Street View image";

        const finalMessage = baseMessage
          ? `Failed to load Street View after ${MAX_STREET_VIEW_RETRIES} attempts: ${baseMessage}`
          : `Failed to load Street View after ${MAX_STREET_VIEW_RETRIES} attempts.`;

        setImageUrl(null);
        setError(finalMessage);
        onError?.(finalMessage);
        setRetryCount(0);
        setIsLoading(false);
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = undefined;
        }
      }
    },
    [routeLatLngs, calculateHeading, onLocationUpdate, onError, mapsManager]
  );

  const handleManualRetry = useCallback(() => {
    if (lastRequestedIndexRef.current !== null) {
      void loadStreetViewWithRetry(lastRequestedIndexRef.current);
    }
  }, [loadStreetViewWithRetry]);

  useEffect(() => {
    if (routeLatLngs.length === 0) {
      setImageUrl(null);
      setCurrentLocation("");
      return;
    }

    const index = Math.max(
      0,
      Math.min(
        routeLatLngs.length - 1,
        Math.floor(currentPosition * (routeLatLngs.length - 1)),
      ),
    );

    void loadStreetViewWithRetry(index);
  }, [routeLatLngs, currentPosition, loadStreetViewWithRetry]);

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
              <p className="text-sm text-dark-400">
                {retryCount > 0
                  ? `Retrying Street View... (Attempt ${retryCount} of ${MAX_STREET_VIEW_RETRIES})`
                  : "Loading Street View..."}
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-900/80 z-10">
            <div className="text-center p-4 max-w-md">
              <div className="text-danger-400 mb-2">
                <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm text-dark-400">{error}</p>
              <button
                type="button"
                onClick={handleManualRetry}
                className="mt-4 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-400 focus:outline-none focus-visible:ring-2"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        <div
          ref={streetViewRef}
          className="w-full h-full"
          style={{ display: isLoading || error ? 'none' : 'block' }}
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isRiding ? 'bg-success-400 animate-pulse' : 'bg-dark-600'}`} />
          <span className="text-dark-400">
            {isRiding ? 'Riding' : 'Paused'}
          </span>
        </div>

        <div className="text-dark-400">
          Position: {Math.round(currentPosition * 100)}%
        </div>
      </div>
    </div>
  );
};
