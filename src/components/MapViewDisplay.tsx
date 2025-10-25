import React, { useEffect, useRef, useState } from "react";
import type { Route } from "../types";
import { interpRoute } from "../utils/routeUtils";
import { GoogleMapsManager } from "../utils/googleMapsUtils";

interface MapViewDisplayProps {
  route: Route;
  currentPosition: number; // 0-1 fraction along the route
  apiKey: string;
  height?: string;
  showTraffic?: boolean;
  onMapClick?: (event: google.maps.MapMouseEvent) => void;
}

export const MapViewDisplay: React.FC<MapViewDisplayProps> = ({
  route,
  currentPosition,
  apiKey,
  height = "300px",
  showTraffic = false,
  onMapClick,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapRefInstance = useRef<google.maps.Map | null>(null);
  const routePathRef = useRef<google.maps.Polyline | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const trafficLayerRef = useRef<google.maps.TrafficLayer | null>(null);
  const mapClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapsManager, setMapsManager] = useState<GoogleMapsManager | null>(null);
  const [routeLatLngs, setRouteLatLngs] = useState<google.maps.LatLng[]>([]);
  const [isMapInitialized, setIsMapInitialized] = useState(false);

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
      }
    };

    void initializeMaps();

    return () => {
      isMounted = false;
    };
  }, [apiKey]);

  useEffect(() => {
    if (!mapsManager || !mapsManager.isLoaded()) {
      return;
    }

    if (!route.pts.length) {
      setRouteLatLngs([]);
      return;
    }

    try {
      const latLngs = route.pts
        .filter(
          (p) => typeof p.lat === "number" && (typeof p.lon === "number" || typeof p.lng === "number"),
        )
        .map((p) => new google.maps.LatLng(p.lat as number, (p.lon ?? p.lng) as number));

      setRouteLatLngs(latLngs);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to convert route points";
      setError(errorMessage);
    }
  }, [mapsManager, route]);

  useEffect(() => {
    if (
      !mapRef.current ||
      !mapsManager ||
      !mapsManager.isLoaded() ||
      routeLatLngs.length === 0
    ) {
      return;
    }

    if (!mapRefInstance.current) {
      const map = new google.maps.Map(mapRef.current, {
        center: routeLatLngs[0],
        zoom: 15,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        styles: [
          {
            featureType: "all",
            elementType: "geometry",
            stylers: [{ color: "#242f3e" }],
          },
          {
            featureType: "all",
            elementType: "labels.text.stroke",
            stylers: [{ color: "#242f3e" }],
          },
          {
            featureType: "all",
            elementType: "labels.text.fill",
            stylers: [{ color: "#746855" }],
          },
          {
            featureType: "water",
            elementType: "geometry",
            stylers: [{ color: "#17263c" }],
          },
        ],
        disableDefaultUI: true,
        gestureHandling: "cooperative",
      });

      mapRefInstance.current = map;
      setIsMapInitialized(true);
    }
  }, [mapsManager, routeLatLngs]);

  useEffect(() => {
    const map = mapRefInstance.current;
    if (!map || !isMapInitialized) {
      return;
    }

    mapClickListenerRef.current?.remove();

    if (onMapClick) {
      mapClickListenerRef.current = map.addListener("click", onMapClick);
    }

    return () => {
      mapClickListenerRef.current?.remove();
      mapClickListenerRef.current = null;
    };
  }, [onMapClick, isMapInitialized]);

  useEffect(() => {
    const map = mapRefInstance.current;
    if (routeLatLngs.length === 0) {
      routePathRef.current?.setMap(null);
      routePathRef.current = null;
      return;
    }

    if (!map || !isMapInitialized) {
      return;
    }

    if (routePathRef.current) {
      routePathRef.current.setMap(null);
    }

    const routePath = new google.maps.Polyline({
      path: routeLatLngs,
      geodesic: true,
      strokeColor: "#3b82f6",
      strokeOpacity: 1,
      strokeWeight: 4,
    });

    routePath.setMap(map);
    routePathRef.current = routePath;

    const bounds = new google.maps.LatLngBounds();
    routeLatLngs.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds);
  }, [routeLatLngs, isMapInitialized]);

  useEffect(() => {
    const map = mapRefInstance.current;
    if (routeLatLngs.length === 0) {
      markerRef.current?.setMap(null);
      markerRef.current = null;
      return;
    }

    if (!map || !isMapInitialized) {
      return;
    }

    if (!markerRef.current) {
      markerRef.current = new google.maps.Marker({
        position: routeLatLngs[0],
        map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#f59e0b",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
    }

    let position: google.maps.LatLng | null = null;

    if (route.pts.length >= 2) {
      try {
        const p = interpRoute(route, currentPosition);
        if (typeof p.lat === "number" && (typeof p.lon === "number" || typeof p.lng === "number")) {
          position = new google.maps.LatLng(p.lat as number, (p.lon ?? p.lng) as number);
        }
      } catch (err) {
        console.warn("Failed to interpolate route position", err);
      }
    }

    if (!position) {
      const index = Math.floor(currentPosition * Math.max(routeLatLngs.length - 1, 0));
      const clampedIndex = Math.min(Math.max(index, 0), routeLatLngs.length - 1);
      position = routeLatLngs[clampedIndex] ?? null;
    }

    if (position) {
      markerRef.current.setPosition(position);
    }
  }, [currentPosition, route, routeLatLngs, isMapInitialized]);

  useEffect(() => {
    const map = mapRefInstance.current;
    if (!map || !isMapInitialized) {
      return;
    }

    if (showTraffic) {
      if (!trafficLayerRef.current) {
        trafficLayerRef.current = new google.maps.TrafficLayer();
      }

      trafficLayerRef.current.setMap(map);
    } else {
      trafficLayerRef.current?.setMap(null);
    }
  }, [showTraffic, isMapInitialized]);

  useEffect(() => {
    return () => {
      routePathRef.current?.setMap(null);
      markerRef.current?.setMap(null);
      trafficLayerRef.current?.setMap(null);
      mapClickListenerRef.current?.remove();
    };
  }, []);

  return (
    <div className="glass-card p-6 space-y-4">
      <h3 className="text-lg font-semibold text-dark-200">Route Map</h3>

      <div
        ref={mapRef}
        className="w-full rounded-xl overflow-hidden"
        style={{ height }}
      />

      {isLoading && (
        <div className="text-center text-sm text-dark-400">Loading map...</div>
      )}

      {error && (
        <div className="text-center text-sm text-danger-400">{error}</div>
      )}
    </div>
  );
};
