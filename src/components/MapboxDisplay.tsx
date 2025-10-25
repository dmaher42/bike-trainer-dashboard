import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Feature, LineString } from "geojson";

type MapboxDisplayProps = {
  accessToken: string;
  route: {
    pts: Array<{ x: number; y: number; lat?: number; lon?: number; lng?: number }>;
    name?: string;
  };
  options: {
    showBuildings: boolean;
    showTraffic: boolean;
    show3D: boolean;
  };
};

const MAPLIBRE_MODULE_URL = "https://esm.sh/maplibre-gl@3.7.0";
const MAPLIBRE_CSS_URL = "https://unpkg.com/maplibre-gl@3.7.0/dist/maplibre-gl.css";
const BASE_STYLE_ID = "mapbox/streets-v12";
const TRAFFIC_STYLE_ID = "mapbox/traffic-day-v2";
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

const mapboxProtocolToHttp = (url: string, token: string) => {
  if (!url.startsWith("mapbox://")) {
    return url;
  }

  const path = url.replace("mapbox://", "");

  if (path.startsWith("styles/")) {
    const stylePath = path.replace("styles/", "");
    return `https://api.mapbox.com/styles/v1/${stylePath}?access_token=${token}`;
  }

  if (path.startsWith("sprites/")) {
    const spritePath = path.replace("sprites/", "");
    const segments = spritePath.split("/");
    const last = segments.pop();
    if (!last) {
      return url;
    }

    const match = last.match(/([^@]+)(@[^.]*)?\.(png|json)$/);
    if (!match) {
      return url;
    }

    const [, styleId, retina = "", format] = match;
    const ownerPath = segments.join("/");
    const base = ownerPath ? `${ownerPath}/${styleId}` : styleId;
    return `https://api.mapbox.com/styles/v1/${base}/sprite${retina}.${format}?access_token=${token}`;
  }

  if (path.startsWith("glyphs/")) {
    const glyphPath = path.replace("glyphs/", "");
    return `https://api.mapbox.com/fonts/v1/${glyphPath}?access_token=${token}`;
  }

  const [base, query = ""] = path.split("?");
  const needsJson = !base.endsWith(".json") && !base.endsWith(".pbf");
  const resourcePath = needsJson ? `${base}.json` : base;
  const params = new URLSearchParams(query);
  if (!params.has("secure")) {
    params.set("secure", "1");
  }
  params.set("access_token", token);
  const queryString = params.toString();
  return `https://api.mapbox.com/v4/${resourcePath}${queryString ? `?${queryString}` : ""}`;
};

const ensureCssLoaded = () => {
  if (typeof document === "undefined") {
    return;
  }

  if (document.getElementById("maplibre-gl-css")) {
    return;
  }

  const link = document.createElement("link");
  link.id = "maplibre-gl-css";
  link.rel = "stylesheet";
  link.href = MAPLIBRE_CSS_URL;
  document.head.appendChild(link);
};

const MapboxDisplay = ({ accessToken, route, options }: MapboxDisplayProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const mapboxModuleRef = useRef<any>();
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapboxReady, setMapboxReady] = useState(false);
  const hasFitBoundsRef = useRef(false);
  const currentStyleRef = useRef("");
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialPositionRef = useRef<{ center: [number, number]; zoom: number }>();

  if (!initialPositionRef.current) {
    const firstPoint = route.pts[0];
    const hasCoordinates =
      firstPoint &&
      typeof firstPoint.lat === "number" &&
      (typeof firstPoint.lon === "number" || typeof firstPoint.lng === "number");
    initialPositionRef.current = {
      center: hasCoordinates
        ? ([(firstPoint.lon ?? firstPoint.lng) as number, firstPoint.lat as number] as [number, number])
        : DEFAULT_CENTER,
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
        coordinates: route.pts
          .filter(
            (pt) => typeof pt.lat === "number" && (typeof pt.lon === "number" || typeof pt.lng === "number"),
          )
          .map((pt) => [(pt.lon ?? pt.lng) as number, pt.lat as number] as [number, number]),
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

    const source = map.getSource(ROUTE_SOURCE_ID) as { setData: (data: Feature<LineString>) => void } | undefined;
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
        const layout = (layer as { layout?: Record<string, unknown> }).layout;
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

  const ensureTerrain = useCallback(
    (enable: boolean) => {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) {
        return;
      }

      const hasSource = Boolean(map.getSource(TERRAIN_SOURCE_ID));

      if (enable) {
        if (!hasSource) {
          map.addSource(TERRAIN_SOURCE_ID, {
            type: "raster-dem",
            url: mapboxProtocolToHttp("mapbox://mapbox.terrain-rgb", accessToken),
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
    },
    [accessToken],
  );

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

    const bounds = coordinates.reduce<any>((acc, coord) => {
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
    if (!IS_BROWSER) {
      return;
    }

    let cancelled = false;

    const loadModule = async () => {
      try {
        ensureCssLoaded();
        const mod = await import(/* @vite-ignore */ MAPLIBRE_MODULE_URL);
        if (cancelled) {
          return;
        }

        const mapbox = (mod as { default?: any }).default ?? mod;
        mapboxModuleRef.current = mapbox;
        setMapboxReady(true);
      } catch (error) {
        console.error("[MapboxDisplay] Failed to load maplibre-gl", error);
      }
    };

    void loadModule();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!mapboxReady) {
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
    const baseStyleUrl = mapboxProtocolToHttp(`mapbox://styles/${BASE_STYLE_ID}`, accessToken);
    const map = new mapbox.Map({
      container,
      style: baseStyleUrl,
      center,
      zoom,
      antialias: true,
      transformRequest: (url: string) => {
        if (url.startsWith("mapbox://")) {
          return { url: mapboxProtocolToHttp(url, accessToken) };
        }

        if (url.startsWith("https://api.mapbox.com") && !url.includes("access_token=")) {
          const separator = url.includes("?") ? "&" : "?";
          return { url: `${url}${separator}access_token=${accessToken}` };
        }

        return { url };
      },
    });

    mapRef.current = map;
    currentStyleRef.current = baseStyleUrl;

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
  }, [accessToken, mapboxReady]);

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

  const baseStyle = useMemo(() => mapboxProtocolToHttp(`mapbox://styles/${BASE_STYLE_ID}`, accessToken), [accessToken]);
  const trafficStyle = useMemo(
    () => mapboxProtocolToHttp(`mapbox://styles/${TRAFFIC_STYLE_ID}`, accessToken),
    [accessToken],
  );

  useEffect(() => {
    if (!mapLoaded) {
      return;
    }

    const map = mapRef.current;
    if (!map) {
      return;
    }

    const desiredStyle = options.showTraffic ? trafficStyle : baseStyle;
    if (currentStyleRef.current === desiredStyle) {
      return;
    }

    currentStyleRef.current = desiredStyle;
    map.setStyle(desiredStyle);
  }, [mapLoaded, options.showTraffic, baseStyle, trafficStyle]);

  return <div ref={containerRef} className="h-full w-full" />;
};

export default MapboxDisplay;
