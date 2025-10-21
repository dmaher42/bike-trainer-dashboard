import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
} from "react";
import type { Metrics, Route, RoutePoint } from "../types";
import { interpRoute } from "../utils/routeUtils";

interface VirtualMapProps {
  route: Route;
  metrics: Metrics;
  waypoints?: { x: number; y: number }[];
  onRouteClick?: (point: { x: number; y: number }) => void;
  showRouteInfo?: boolean;
  realCoordinates?: Array<{ lat: number; lng: number }>;
}

const MAP_PADDING = 0.08;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

type Bounds = {
  minX: number;
  minY: number;
  spanX: number;
  spanY: number;
};

const defaultBounds: Bounds = {
  minX: 0,
  minY: 0,
  spanX: 1,
  spanY: 1,
};

const VirtualMap: React.FC<VirtualMapProps> = ({
  route,
  metrics,
  waypoints = [],
  onRouteClick,
  showRouteInfo = false,
  realCoordinates,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const baseId = useId();
  const gridPatternId = `${baseId}-grid`;
  const routeGradientId = `${baseId}-routeGradient`;
  const glowFilterId = `${baseId}-glow`;

  const routePoints = useMemo(() => {
    if (realCoordinates?.length) {
      return realCoordinates.map(({ lat, lng }) => [lng, lat] as [number, number]);
    }

    return route.pts.map(({ x, y }) => [x, y] as [number, number]);
  }, [realCoordinates, route.pts]);

  const bounds = useMemo<Bounds>(() => {
    if (!routePoints.length) {
      return defaultBounds;
    }

    const xs = routePoints.map(([x]) => x);
    const ys = routePoints.map(([, y]) => y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    return {
      minX,
      minY,
      spanX: Math.max(maxX - minX, 1),
      spanY: Math.max(maxY - minY, 1),
    };
  }, [routePoints]);

  const normalizePoint = useCallback(
    (point: RoutePoint | { x: number; y: number }) => {
      const safeSpanX = bounds.spanX || 1;
      const safeSpanY = bounds.spanY || 1;
      const normalisedX =
        MAP_PADDING + ((point.x - bounds.minX) / safeSpanX) * (1 - MAP_PADDING * 2);
      const normalisedY =
        MAP_PADDING +
        (1 - (point.y - bounds.minY) / safeSpanY) * (1 - MAP_PADDING * 2);

      return {
        x: clamp(normalisedX, MAP_PADDING, 1 - MAP_PADDING),
        y: clamp(normalisedY, MAP_PADDING, 1 - MAP_PADDING),
      };
    },
    [bounds.minX, bounds.spanX, bounds.spanY, bounds.minY],
  );

  const routePolyline = useMemo(() => {
    if (!routePoints.length) {
      return "";
    }

    return routePoints
      .map(([x, y]) => {
        const normalised = normalizePoint({ x, y });
        return `${(normalised.x * 1000).toFixed(2)},${(normalised.y * 500).toFixed(2)}`;
      })
      .join(" ");
  }, [normalizePoint, routePoints]);

  const totalDistance = useMemo(() => {
    if (route.total > 0) {
      return route.total;
    }
    const last = route.cum.at(-1);
    return last && last > 0 ? last : 0;
  }, [route.cum, route.total]);

  const loopDistance = totalDistance || 1;
  const fracOnLoop = totalDistance
    ? (metrics.distance % totalDistance) / totalDistance
    : 0;

  const currentPosition = useMemo(() => {
    if (realCoordinates?.length) {
      if (realCoordinates.length === 1) {
        return realCoordinates[0];
      }

      const index = Math.min(
        realCoordinates.length - 1,
        Math.floor(fracOnLoop * (realCoordinates.length - 1)),
      );

      return realCoordinates[index];
    }

    if (!route.pts.length) {
      return null;
    }

    return interpRoute(route, fracOnLoop);
  }, [fracOnLoop, realCoordinates, route]);

  const currentPositionNormalised = useMemo(() => {
    if (!currentPosition) {
      return null;
    }

    if ("lat" in currentPosition && "lng" in currentPosition) {
      return normalizePoint({ x: currentPosition.lng, y: currentPosition.lat });
    }

    return normalizePoint(currentPosition);
  }, [currentPosition, normalizePoint]);

  const waypointDots = useMemo(() => {
    if (!waypoints.length) {
      return [] as { x: number; y: number }[];
    }

    return waypoints.map((point) => normalizePoint(point));
  }, [normalizePoint, waypoints]);

  useEffect(() => {
    if (!svgRef.current || !onRouteClick) {
      return undefined;
    }

    const svg = svgRef.current;

    const handlePointClick = (event: MouseEvent) => {
      const rect = svg.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }

      const xRatio = (event.clientX - rect.left) / rect.width;
      const yRatio = (event.clientY - rect.top) / rect.height;

      const adjustedX = clamp(
        (xRatio - MAP_PADDING) / (1 - MAP_PADDING * 2),
        0,
        1,
      );
      const adjustedY = clamp(
        (yRatio - MAP_PADDING) / (1 - MAP_PADDING * 2),
        0,
        1,
      );

      const actualX = bounds.minX + bounds.spanX * adjustedX;
      const actualY = bounds.minY + bounds.spanY * (1 - adjustedY);

      onRouteClick({ x: actualX, y: actualY });
    };

    svg.addEventListener("click", handlePointClick);
    return () => svg.removeEventListener("click", handlePointClick);
  }, [bounds.minX, bounds.spanX, bounds.spanY, bounds.minY, onRouteClick]);

  return (
    <div className="relative rounded-3xl border border-glass-border bg-dark-950/40 p-6 shadow-lg shadow-dark-900/20 backdrop-blur-xl">
      <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-dark-900/60 via-dark-900/20 to-dark-800/20" />
      <div className="relative z-10 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-dark-100">
              {route.name ?? "Virtual Route"}
            </h3>
            <p className="text-sm text-dark-400">
              Distance ridden: {metrics.distance.toFixed(1)} km of {totalDistance.toFixed(1)} km
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-dark-900/60 px-3 py-1 text-xs font-medium text-success-300">
            <span className="h-2 w-2 animate-pulse rounded-full bg-success-400" />
            Live Tracking
          </div>
        </div>

        <div className="w-full overflow-hidden rounded-2xl border border-glass-border bg-dark-950/60 shadow-inner">
          <svg
            ref={svgRef}
            viewBox="0 0 1000 500"
            className="h-full w-full"
            role="img"
            aria-label="Virtual route map"
          >
            <defs>
              <pattern id={gridPatternId} width="50" height="50" patternUnits="userSpaceOnUse">
                <path
                  d="M 50 0 L 0 0 0 50"
                  fill="none"
                  stroke="rgba(148, 163, 184, 0.12)"
                  strokeWidth="1"
                />
              </pattern>

              <linearGradient id={routeGradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.9" />
                <stop offset="50%" stopColor="#34d399" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#fbbf24" stopOpacity="0.9" />
              </linearGradient>

              <filter id={glowFilterId}>
                <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <rect x="0" y="0" width="1000" height="500" fill={`url(#${gridPatternId})`} />

            {routePolyline ? (
              <>
                <polyline
                  fill="none"
                  stroke="rgba(56, 189, 248, 0.3)"
                  strokeWidth="10"
                  points={routePolyline}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  fill="none"
                  stroke={`url(#${routeGradientId})`}
                  strokeWidth="5"
                  points={routePolyline}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter={`url(#${glowFilterId})`}
                />
              </>
            ) : null}

            {waypointDots.map((point, index) => (
              <g key={`waypoint-${index}`}>
                <circle
                  cx={point.x * 1000}
                  cy={point.y * 500}
                  r={10}
                  fill="#ef4444"
                  stroke="#fff"
                  strokeWidth={2}
                  filter={`url(#${glowFilterId})`}
                />
                <circle
                  cx={point.x * 1000}
                  cy={point.y * 500}
                  r={16}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth={1.5}
                  opacity={0.5}
                  className="animate-pulse"
                />
              </g>
            ))}

            {currentPositionNormalised ? (
              <g>
                <circle
                  cx={currentPositionNormalised.x * 1000}
                  cy={currentPositionNormalised.y * 500}
                  r={18}
                  fill="#fbbf24"
                  opacity={0.25}
                  className="animate-pulse"
                />
                <circle
                  cx={currentPositionNormalised.x * 1000}
                  cy={currentPositionNormalised.y * 500}
                  r={10}
                  fill="#f59e0b"
                  stroke="#fff"
                  strokeWidth={2}
                  filter={`url(#${glowFilterId})`}
                />
                <circle
                  cx={currentPositionNormalised.x * 1000}
                  cy={currentPositionNormalised.y * 500}
                  r={14}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth={1.5}
                  className="animate-pulse"
                />
              </g>
            ) : null}
          </svg>
        </div>

        {showRouteInfo && (
          <div className="mt-4 p-4 bg-dark-800/50 border border-dark-700 rounded-xl">
            <h4 className="text-sm font-medium text-dark-300 mb-2">Route Information</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-dark-500">Points:</span>
                <span className="ml-2 text-dark-300">{route.pts.length}</span>
              </div>
              <div>
                <span className="text-dark-500">Distance:</span>
                <span className="ml-2 text-dark-300">{route.total.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-dark-500">Elevation:</span>
                <span className="ml-2 text-dark-300">
                  {route.pts.some((p) => p.elevation !== undefined) ? "Yes" : "No"}
                </span>
              </div>
              <div>
                <span className="text-dark-500">Name:</span>
                <span className="ml-2 text-dark-300">{route.name || "Default Route"}</span>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 text-center sm:grid-cols-3">
          <div className="rounded-2xl border border-glass-border bg-dark-900/50 p-4">
            <p className="text-xs uppercase tracking-widest text-dark-500">Distance</p>
            <p className="text-xl font-semibold text-dark-100">
              {metrics.distance.toFixed(2)} km
            </p>
          </div>
          <div className="rounded-2xl border border-glass-border bg-dark-900/50 p-4">
            <p className="text-xs uppercase tracking-widest text-dark-500">Loop Progress</p>
            <p className="text-xl font-semibold text-dark-100">{(fracOnLoop * 100).toFixed(0)}%</p>
          </div>
          <div className="rounded-2xl border border-glass-border bg-dark-900/50 p-4">
            <p className="text-xs uppercase tracking-widest text-dark-500">Waypoints</p>
            <p className="text-xl font-semibold text-dark-100">{waypoints.length}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VirtualMap;
