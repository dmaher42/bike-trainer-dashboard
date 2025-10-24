import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type mapboxgl from "mapbox-gl";
import type { Feature, LineString } from "geojson";
import "mapbox-gl/dist/mapbox-gl.css";

type MapboxDisplayProps = {
  mapboxToken?: string;
  route: { pts: Array<{ x: number; y: number }>; name?: string };
  options: {
    showBuildings: boolean;
    showTraffic: boolean;
    show3D: boolean;
  };
};

const BASE_STYLE = "mapbox://styles/mapbox/streets-v12";
const TRAFFIC_STYLE = "mapbox://styles/mapbox/traffic-day-v2";
const ROUTE_SOURCE_ID = "route-line-source";
const ROUTE_LAYER_ID = "route-line-layer";
const BUILDINGS_LAYER_ID = "3d-buildings-layer";
const TERRAIN_SOURCE_ID = "mapbox-dem";
const IS_BROWSER = typeof window !== "undefined";

const EMPTY_ROUTE: Feature<LineString> = {
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates: [] },
};

const DEFAULT_CENTER: [number, number] = [-122.4194, 37.7749];
const DEFAULT_ZOOM = 11;

const MapboxDisplay = ({ mapboxToken, route, options }: MapboxDisplayProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const mapboxModuleRef = useRef<typeof mapboxgl>();
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapboxReady, setMapboxReady] = useState(false);
  const hasFitBoundsRef = useRef(false);
  const currentStyleRef = useRef(BASE_STYLE);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialPositionRef = useRef<{ center: [number, number]; zoom: number }>();

  const resolvedToken = useMemo(() => {
    if (mapboxToken && mapboxToken.trim()) {
      return mapboxToken;
    }

    const envToken = (import.meta.env.VITE_MAPBOX_TOKEN as string | undefined) ?? undefined;
    if (envToken && envToken.trim()) {
      return envToken;
    }

    return undefined;
  }, [mapboxToken]);

  if (!initialPositionRef.current) {
    const firstPoint = route.pts[0];
    initialPositionRef.current = {
      center: firstPoint ? ([firstPoint.x, firstPoint.y] as [number, number]) : DEFAULT_CENTER,
      zoom: firstPoint ? DEFAULT_ZOOM : 2,
    };
  }

  const routeFeature = useMemo<Feature<LineString> | null>(() => {
    if (!route.pts.length) {
      return null;
    }

    return {
      type: "Feature",
      properties: route.name ? { name: route.name } : {},
      geometry: {
        type: "LineString",
        coordinates: route.pts.map((pt) => [pt.x, pt.y] as [number, number]),
      },
    };
  }, [route]);

  const ensureRouteLayer = useCallback(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      return;
    }

    if (!map.getSource(ROUTE_SOURCE_ID)) {
      map.addSource(ROUTE_SOURCE_ID, {
        type: "geojson",
        data: routeFeature ?? EMPTY_ROUTE,
      });
    }

    const source = map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    source?.setData(routeFeature ?? EMPTY_ROUTE);

    if (!map.getLayer(ROUTE_LAYER_ID)) {
      map.addLayer({
        id: ROUTE_LAYER_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        layout: {
          "line-cap": "round",
          "line-join": "round",
        },
        paint: {
          "line-width": 3,
          "line-color": "#38bdf8",
        },
      });
    }
  }, [routeFeature]);

  const ensureBuildingsLayer = useCallback((shouldShow: boolean) => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      return;
    }

    const exists = map.getLayer(BUILDINGS_LAYER_ID);

    if (shouldShow) {
      if (exists) {
        return;
      }

      const layers = map.getStyle()?.layers ?? [];
      const labelLayerId = layers.find((layer) => {
        if (layer.type !== "symbol") {
          return false;
        }
        const layout = layer.layout as mapboxgl.SymbolLayout | undefined;
        return Boolean(layout && "text-field" in layout && layout["text-field"]);
      })?.id;

      map.addLayer(
        {
          id: BUILDINGS_LAYER_ID,
          source: "composite",
          "source-layer": "building",
          filter: ["==", "extrude", "true"],
          type: "fill-extrusion",
          minzoom: 15,
          paint: {
            "fill-extrusion-color": "#aaa",
            "fill-extrusion-height": ["get", "height"],
            "fill-extrusion-base": ["get", "min_height"],
            "fill-extrusion-opacity": 0.6,
          },
        },
        labelLayerId,
      );
      return;
    }

    if (exists) {
      map.removeLayer(BUILDINGS_LAYER_ID);
    }
  }, []);

  const ensureTerrain = useCallback((enable: boolean) => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      return;
    }

    const hasSource = Boolean(map.getSource(TERRAIN_SOURCE_ID));

    if (enable) {
      if (!hasSource) {
        map.addSource(TERRAIN_SOURCE_ID, {
          type: "raster-dem",
          url: "mapbox://mapbox.terrain-rgb",
          tileSize: 512,
          maxzoom: 14,
        });
      }

      map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration: 1 });
      return;
    }

    map.setTerrain(null);
    if (hasSource) {
      map.removeSource(TERRAIN_SOURCE_ID);
    }
  }, []);

  const fitRoute = useCallback(() => {
    const map = mapRef.current;
    const mapbox = mapboxModuleRef.current;
    if (!map || !map.isStyleLoaded() || !routeFeature || !mapbox) {
      return;
    }

    const coordinates = routeFeature.geometry.coordinates;
    if (!coordinates.length) {
      return;
    }

    if (coordinates.length === 1) {
      map.easeTo({ center: coordinates[0] as [number, number], zoom: 14, duration: 0 });
      hasFitBoundsRef.current = true;
      return;
    }

    const bounds = coordinates.reduce<mapboxgl.LngLatBounds | null>((acc, coord) => {
      if (!acc) {
        return new mapbox.LngLatBounds(coord as [number, number], coord as [number, number]);
      }
      return acc.extend(coord as [number, number]);
    }, null);

    if (bounds) {
      map.fitBounds(bounds, { padding: 48, maxZoom: 16, duration: 800 });
      hasFitBoundsRef.current = true;
    }
  }, [routeFeature]);

  const applyPitch = useCallback(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const targetPitch = options.show3D ? 60 : 0;
    map.easeTo({ pitch: targetPitch, duration: 600 });
  }, [options.show3D]);

  const syncLayers = useCallback(() => {
    ensureRouteLayer();
    ensureTerrain(options.show3D);
    ensureBuildingsLayer(options.showBuildings || options.show3D);
  }, [ensureRouteLayer, ensureTerrain, ensureBuildingsLayer, options.show3D, options.showBuildings]);

  useEffect(() => {
    if (!IS_BROWSER || !resolvedToken) {
      setMapboxReady(false);
      return;
    }

    let cancelled = false;

    const loadModule = async () => {
      try {
        const mod = await import("mapbox-gl");
        if (cancelled) {
          return;
        }

        const mapbox = (mod as { default?: typeof mapboxgl }).default ?? (mod as typeof mapboxgl);
        mapboxModuleRef.current = mapbox;
        mapbox.accessToken = resolvedToken;
        setMapboxReady(true);
      } catch (error) {
        console.error("[MapboxDisplay] Failed to load mapbox-gl", error);
      }
    };

    void loadModule();

    return () => {
      cancelled = true;
    };
  }, [resolvedToken]);

  useEffect(() => {
    const mapbox = mapboxModuleRef.current;
    if (!mapbox || !resolvedToken) {
      return;
    }

    mapbox.accessToken = resolvedToken;
  }, [resolvedToken]);

  useEffect(() => {
    if (!mapboxReady || !resolvedToken) {
      return;
    }

    const mapbox = mapboxModuleRef.current;
    const container = containerRef.current;

    if (!mapbox || !container || mapRef.current) {
      return;
    }

    const { center, zoom } = initialPositionRef.current ?? {
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    };

    mapbox.accessToken = resolvedToken;

    const map = new mapbox.Map({
      container,
      style: BASE_STYLE,
      center,
      zoom,
      antialias: true,
    });

    mapRef.current = map;
    currentStyleRef.current = BASE_STYLE;

    const handleLoad = () => {
      setMapLoaded(true);
    };

    map.once("load", handleLoad);

    const handleResize = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = setTimeout(() => {
        map.resize();
      }, 150);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, [resolvedToken, mapboxReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    const handleStyleLoad = () => {
      syncLayers();
      if (!hasFitBoundsRef.current) {
        fitRoute();
      }
      applyPitch();
    };

    map.on("style.load", handleStyleLoad);
    return () => {
      map.off("style.load", handleStyleLoad);
    };
  }, [syncLayers, fitRoute, applyPitch]);

  useEffect(() => {
    if (!mapLoaded) {
      return;
    }

    syncLayers();
    if (!hasFitBoundsRef.current) {
      fitRoute();
    }
    applyPitch();
    mapRef.current?.resize();
  }, [mapLoaded, syncLayers, fitRoute, applyPitch]);

  useEffect(() => {
    hasFitBoundsRef.current = false;
  }, [route.name, route.pts.length]);

  useEffect(() => {
    if (!mapLoaded) {
      return;
    }

    if (!hasFitBoundsRef.current) {
      fitRoute();
    }
  }, [mapLoaded, routeFeature, fitRoute]);

  useEffect(() => {
    if (!mapLoaded) {
      return;
    }

    const map = mapRef.current;
    if (!map) {
      return;
    }

    const desiredStyle = options.showTraffic ? TRAFFIC_STYLE : BASE_STYLE;
    if (currentStyleRef.current === desiredStyle) {
      return;
    }

    currentStyleRef.current = desiredStyle;
    map.setStyle(desiredStyle);
  }, [mapLoaded, options.showTraffic]);

  return <div ref={containerRef} className="h-full w-full" />;
};

export default MapboxDisplay;
