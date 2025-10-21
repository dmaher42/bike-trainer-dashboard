import React, { useCallback, useEffect, useState } from "react";
import type { Route } from "../types";
import { MapProxyService } from "../services/mapProxy";

interface StreetViewDisplayProps {
  route: Route;
  currentPosition: number; // 0-1 fraction along the route
  isRiding: boolean;
  onLocationUpdate?: (location: string) => void;
  onError?: (error: string) => void;
}

interface LatLng {
  lat: number;
  lng: number;
}

export const StreetViewDisplay: React.FC<StreetViewDisplayProps> = ({
  route,
  currentPosition,
  isRiding,
  onLocationUpdate,
  onError,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<string>("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [routeLatLngs, setRouteLatLngs] = useState<LatLng[]>([]);

  useEffect(() => {
    if (!route.pts.length) {
      setRouteLatLngs([]);
      return;
    }

    const convertRoutePoints = () => {
      try {
        const baseLat = 37.7749;
        const baseLng = -122.4194;
        const radius = 0.01;

        const latLngs = route.pts.map((point, index) => {
          if (
            typeof point.lat === "number" &&
            typeof point.lng === "number"
          ) {
            return { lat: point.lat, lng: point.lng };
          }

          const angle =
            (index / Math.max(route.pts.length, 1)) * 2 * Math.PI;

          const lat = baseLat + radius * Math.cos(angle);
          const lng = baseLng + radius * Math.sin(angle);

          return { lat, lng };
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
  }, [route, onError]);

  const calculateHeading = useCallback(
    (index: number) => {
      if (routeLatLngs.length <= 1) {
        return 0;
      }

      const current = routeLatLngs[index];

      let targetIndex = index;
      if (index < routeLatLngs.length - 1) {
        targetIndex = index + 1;
      } else if (index > 0) {
        targetIndex = index - 1;
      }
      const target = routeLatLngs[targetIndex];

      if (!current || !target || (current.lat === target.lat && current.lng === target.lng)) {
        return 0;
      }

      const toRadians = (deg: number) => (deg * Math.PI) / 180;
      const toDegrees = (rad: number) => (rad * 180) / Math.PI;

      const lat1 = toRadians(current.lat);
      const lat2 = toRadians(target.lat);
      const dLon = toRadians(target.lng - current.lng);

      const y = Math.sin(dLon) * Math.cos(lat2);
      const x =
        Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

      const heading = (toDegrees(Math.atan2(y, x)) + 360) % 360;

      return heading;
    },
    [routeLatLngs],
  );

  const loadStreetViewImage = useCallback(
    async (index: number) => {
      const position = routeLatLngs[index];
      if (!position) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const proxy = MapProxyService.getInstance();

        const image = await proxy.getStreetViewImage({
          location: `${position.lat},${position.lng}`,
          heading: calculateHeading(index),
          pitch: 0,
          fov: 90,
          size: "800x400",
        });

        setImageUrl(image);

        const locationString = `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
        setCurrentLocation(locationString);
        onLocationUpdate?.(locationString);
      } catch (err) {
        console.error("Failed to load Street View:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Failed to load Street View image";
        setError(errorMessage);
        onError?.(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [routeLatLngs, calculateHeading, onLocationUpdate, onError],
  );

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

    void loadStreetViewImage(index);
  }, [routeLatLngs, currentPosition, loadStreetViewImage]);

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

        {imageUrl && !isLoading && !error && (
          <img
            src={imageUrl}
            alt="Street View"
            className="h-full w-full object-cover"
          />
        )}
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
