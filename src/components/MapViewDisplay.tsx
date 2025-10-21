import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "../types";
import { GoogleMapsManager } from "../utils/googleMapsUtils";

interface MapViewDisplayProps {
  route: Route;
  currentPosition: number;
  apiKey: string;
  height?: string;
  showTraffic?: boolean;
}

const DEFAULT_HEIGHT = "400px";

const normalizePosition = (position: number): number => {
  if (!Number.isFinite(position)) {
    return 0;
  }

  if (position <= 0) {
    return 0;
  }

  if (position >= 1) {
    return position % 1;
  }

  return position;
};

const buildRouteLatLngs = (route: Route): google.maps.LatLng[] => {
  if (!route.pts.length) {
    return [];
  }

  const baseLat = 37.7749;
  const baseLng = -122.4194;
  const radius = 0.01;

  return route.pts.map((_, index) => {
    const angle = (index / Math.max(route.pts.length, 1)) * 2 * Math.PI;
    const lat = baseLat + radius * Math.cos(angle);
    const lng = baseLng + radius * Math.sin(angle);

    return new google.maps.LatLng(lat, lng);
  });
};

export const MapViewDisplay: React.FC<MapViewDisplayProps> = ({
  route,
  currentPosition,
  apiKey,
  height = DEFAULT_HEIGHT,
  showTraffic = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);
  const [mapsManager, setMapsManager] = useState<GoogleMapsManager | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const routeLatLngs = useMemo(() => {
    if (!mapsManager?.isLoaded()) {
      return [];
    }

    try {
      return buildRouteLatLngs(route);
    } catch (err) {
      console.error("Failed to build route coordinates", err);
      return [];
    }
  }, [mapsManager, route]);

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const manager = GoogleMapsManager.getInstance({ apiKey });
        await manager.loadGoogleMaps();
        if (!isMounted) {
          return;
        }

        setMapsManager(manager);
        setIsLoading(false);
      } catch (err) {
        if (!isMounted) {
          return;
        }

        const message = err instanceof Error ? err.message : "Failed to load Google Maps";
        setError(message);
        setIsLoading(false);
      }
    };

    void initialize();

    return () => {
      isMounted = false;
    };
  }, [apiKey]);

  useEffect(() => {
    if (!mapsManager?.isLoaded() || !containerRef.current) {
      return;
    }

    if (routeLatLngs.length === 0) {
      return;
    }

    const map = new google.maps.Map(containerRef.current, {
      center: routeLatLngs[0],
      zoom: 14,
      disableDefaultUI: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      backgroundColor: "#0f172a",
      styles: [
        {
          elementType: "geometry",
          stylers: [{ color: "#1f2937" }],
        },
        {
          elementType: "labels.text.fill",
          stylers: [{ color: "#f9fafb" }],
        },
        {
          featureType: "road",
          elementType: "geometry",
          stylers: [{ color: "#334155" }],
        },
        {
          featureType: "water",
          elementType: "geometry",
          stylers: [{ color: "#0f172a" }],
        },
      ],
    });

    mapRef.current = map;

    const polyline = new google.maps.Polyline({
      map,
      path: routeLatLngs,
      strokeColor: "#60a5fa",
      strokeOpacity: 0.9,
      strokeWeight: 4,
    });

    const marker = new google.maps.Marker({
      map,
      position: routeLatLngs[0],
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 6,
        fillColor: "#facc15",
        fillOpacity: 1,
        strokeColor: "#facc15",
      },
    });

    markerRef.current = marker;

    const bounds = new google.maps.LatLngBounds();
    routeLatLngs.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds);

    return () => {
      polyline.setMap(null);
      marker.setMap(null);
      if (trafficLayerRef.current) {
        trafficLayerRef.current.setMap(null);
        trafficLayerRef.current = null;
      }
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [mapsManager, routeLatLngs]);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current || routeLatLngs.length === 0) {
      return;
    }

    const normalized = normalizePosition(currentPosition);
    const index = Math.min(
      routeLatLngs.length - 1,
      Math.max(0, Math.floor(normalized * (routeLatLngs.length - 1))),
    );
    const position = routeLatLngs[index];

    markerRef.current.setPosition(position);

    if (routeLatLngs.length > 1) {
      mapRef.current.panTo(position);
    }
  }, [currentPosition, routeLatLngs]);

  useEffect(() => {
    if (!mapRef.current || !mapsManager?.isLoaded()) {
      return;
    }

    if (showTraffic) {
      if (!trafficLayerRef.current) {
        trafficLayerRef.current = new google.maps.TrafficLayer();
      }

      trafficLayerRef.current.setMap(mapRef.current);
    } else if (trafficLayerRef.current) {
      trafficLayerRef.current.setMap(null);
    }
  }, [showTraffic, mapsManager]);

  return (
    <div className="glass-card space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-dark-200">Map View</h3>
        {showTraffic && (
          <span className="text-xs uppercase tracking-wide text-success-400">Traffic On</span>
        )}
      </div>

      <div className="relative overflow-hidden rounded-xl bg-dark-900" style={{ height }}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-900/80">
            <div className="text-center">
              <div className="loading-spinner mx-auto mb-2" />
              <p className="text-sm text-dark-400">Loading Map...</p>
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
          ref={containerRef}
          className="h-full w-full"
          style={{ display: isLoading || error ? "none" : "block" }}
        />
      </div>
    </div>
  );
};

export default MapViewDisplay;
