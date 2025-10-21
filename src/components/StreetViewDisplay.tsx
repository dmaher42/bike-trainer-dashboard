import React, { useEffect, useRef, useState } from "react";
import type { Route } from "../types";
import { GoogleMapsManager } from "../utils/googleMapsUtils";

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
  const streetViewRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<string>("");
  const [mapsManager, setMapsManager] = useState<GoogleMapsManager | null>(null);
  const [routeLatLngs, setRouteLatLngs] = useState<google.maps.LatLng[]>([]);

  useEffect(() => {
    let isMounted = true;

    const initializeMaps = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const manager = GoogleMapsManager.getInstance({ apiKey });
        if (!isMounted) {
          return;
        }

        setMapsManager(manager);
        await manager.loadGoogleMaps();

        if (isMounted) {
          setIsLoading(false);
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to load Google Maps";
        if (!isMounted) {
          return;
        }

        setError(errorMessage);
        setIsLoading(false);
        onError?.(errorMessage);
      }
    };

    void initializeMaps();

    return () => {
      isMounted = false;
    };
  }, [apiKey, onError]);

  useEffect(() => {
    if (!mapsManager || !mapsManager.isLoaded()) {
      return;
    }

    if (!route.pts.length) {
      setRouteLatLngs([]);
      return;
    }

    const convertRoutePoints = () => {
      try {
        const latLngs = route.pts.map((_, index) => {
          const baseLat = 37.7749;
          const baseLng = -122.4194;

          const angle = (index / Math.max(route.pts.length, 1)) * 2 * Math.PI;
          const radius = 0.01;

          const lat = baseLat + radius * Math.cos(angle);
          const lng = baseLng + radius * Math.sin(angle);

          return new google.maps.LatLng(lat, lng);
        });

        setRouteLatLngs(latLngs);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to convert route points";
        setError(errorMessage);
        onError?.(errorMessage);
      }
    };

    convertRoutePoints();
  }, [mapsManager, route, onError]);

  useEffect(() => {
    if (
      !streetViewRef.current ||
      !mapsManager ||
      !mapsManager.isLoaded() ||
      routeLatLngs.length === 0
    ) {
      return;
    }

    try {
      if (!panoramaRef.current) {
        panoramaRef.current = new google.maps.StreetViewPanorama(
          streetViewRef.current,
          {
            position: routeLatLngs[0],
            pov: {
              heading: 0,
              pitch: 0,
              zoom: 1,
            },
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
      }

      const updateStreetViewPosition = async () => {
        if (!panoramaRef.current || routeLatLngs.length === 0) {
          return;
        }

        const index = Math.max(
          0,
          Math.min(
            routeLatLngs.length - 1,
            Math.floor(currentPosition * (routeLatLngs.length - 1)),
          ),
        );
        const position = routeLatLngs[index];

        let heading = 0;
        if (index < routeLatLngs.length - 1) {
          const nextPoint = routeLatLngs[index + 1];
          heading =
            google.maps.geometry?.spherical?.computeHeading(position, nextPoint) ??
            0;
        }

        panoramaRef.current.setPosition(position);
        panoramaRef.current.setPov({
          heading,
          pitch: 0,
          zoom: 1,
        });

        try {
          const location = await mapsManager.reverseGeocode(position);
          setCurrentLocation(location);
          onLocationUpdate?.(location);
        } catch (err) {
          console.warn("Failed to get location name:", err);
        }
      };

      void updateStreetViewPosition();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to initialize Street View";
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [mapsManager, routeLatLngs, currentPosition, onLocationUpdate, onError]);

  useEffect(() => {
    if (!isRiding || !panoramaRef.current) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      const pov = panoramaRef.current?.getPov();
      if (pov) {
        panoramaRef.current?.setPov({
          ...pov,
          heading: pov.heading + 0.5,
        });
      }
    }, 100);

    return () => window.clearInterval(interval);
  }, [isRiding]);

  return (
    <div className="glass-card space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-dark-200">Street View</h3>
        {currentLocation && (
          <div className="max-w-xs truncate text-sm text-dark-400">
            {currentLocation}
          </div>
        )}
      </div>

      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-dark-900">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-900/80">
            <div className="text-center">
              <div className="loading-spinner mx-auto mb-2" />
              <p className="text-sm text-dark-400">Loading Street View...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-900/80">
            <div className="p-4 text-center">
              <div className="text-danger-400 mb-2">
                <svg
                  className="mx-auto h-8 w-8"
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
            </div>
          </div>
        )}

        <div
          ref={streetViewRef}
          className="h-full w-full"
          style={{ display: isLoading || error ? "none" : "block" }}
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${isRiding ? "bg-success-400 animate-pulse" : "bg-dark-600"}`}
          />
          <span className="text-dark-400">{isRiding ? "Riding" : "Paused"}</span>
        </div>

        <div className="text-dark-400">Position: {Math.round(currentPosition * 100)}%</div>
      </div>
    </div>
  );
};
