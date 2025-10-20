import React, { useCallback, useId, useMemo, useState } from "react";
import type { Metrics, Route, RoutePoint } from "../types";

interface VirtualMapProps {
  route: Route;
  metrics: Metrics;
  onRouteClick?: (point: { x: number; y: number }) => void;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const VirtualMap: React.FC<VirtualMapProps> = ({ route, metrics, onRouteClick }) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const gridPatternId = `${useId()}-grid`;

  const pathData = useMemo(() => {
    if (!route.pts.length) {
      return "";
    }

    return route.pts
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");
  }, [route.pts]);

  const bounds = useMemo(() => {
    if (!route.pts.length) {
      return {
        minX: 0,
        minY: 0,
        width: 100,
        height: 100,
        viewBox: "0 0 100 100",
      };
    }

    const xs = route.pts.map((point) => point.x);
    const ys = route.pts.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const width = Math.max(maxX - minX, 1);
    const height = Math.max(maxY - minY, 1);
    const padding = Math.max(width, height) * 0.1;

    return {
      minX,
      minY,
      width,
      height,
      viewBox: `${minX - padding} ${minY - padding} ${width + padding * 2} ${height + padding * 2}`,
    };
  }, [route.pts]);

  const currentPosition = useMemo<RoutePoint | null>(() => {
    if (!route.pts.length) {
      return null;
    }

    const cumulative = route.cum;
    const totalDistance = route.total || (cumulative.length ? cumulative[cumulative.length - 1] : 0);

    if (!totalDistance) {
      return route.pts[0];
    }

    const targetDistance = clamp(metrics.distance ?? 0, 0, totalDistance);

    if (cumulative.length === route.pts.length && cumulative.length > 1) {
      for (let index = 1; index < cumulative.length; index += 1) {
        const prevDistance = cumulative[index - 1];
        const nextDistance = cumulative[index];

        if (targetDistance <= nextDistance) {
          const segment = nextDistance - prevDistance;
          const ratio = segment > 0 ? (targetDistance - prevDistance) / segment : 0;
          const start = route.pts[index - 1];
          const end = route.pts[index];

          return {
            x: start.x + (end.x - start.x) * ratio,
            y: start.y + (end.y - start.y) * ratio,
            elevation:
              start.elevation !== undefined && end.elevation !== undefined
                ? start.elevation + (end.elevation - start.elevation) * ratio
                : undefined,
          };
        }
      }
    }

    const ratio = clamp(totalDistance ? targetDistance / totalDistance : 0, 0, 1);
    const approximateIndex = Math.round(ratio * (route.pts.length - 1));
    return route.pts[approximateIndex];
  }, [metrics.distance, route.cum, route.pts, route.total]);

  const selectedPoint = useMemo<RoutePoint | null>(
    () => (selectedIndex !== null ? route.pts[selectedIndex] : null),
    [route.pts, selectedIndex],
  );

  const handleMapClick = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      if (!route.pts.length) {
        return;
      }

      const svg = event.currentTarget;
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      const ctm = svg.getScreenCTM();

      if (!ctm) {
        return;
      }

      const cursor = point.matrixTransform(ctm.inverse());
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      route.pts.forEach((routePoint, index) => {
        const dx = routePoint.x - cursor.x;
        const dy = routePoint.y - cursor.y;
        const distance = dx * dx + dy * dy;

        if (distance < nearestDistance) {
          nearestIndex = index;
          nearestDistance = distance;
        }
      });

      setSelectedIndex(nearestIndex);
      if (onRouteClick) {
        const { x, y } = route.pts[nearestIndex];
        onRouteClick({ x, y });
      }
    },
    [onRouteClick, route.pts],
  );

  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur-sm"
      aria-label={route.name ? `${route.name} virtual map` : "Virtual route map"}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-slate-900">
          {route.name ?? "Virtual Route"}
        </h2>
        <p className="text-sm text-slate-500">
          Distance ridden: {metrics.distance.toFixed(1)} km of {route.total.toFixed(1)} km
        </p>
      </div>
      <div className="relative">
        <svg
          className="h-72 w-full"
          viewBox={bounds.viewBox}
          role="img"
          aria-label="Route overview"
          onClick={handleMapClick}
        >
          <title>{route.name ?? "Virtual route"}</title>
          <defs>
            <pattern
              id={gridPatternId}
              x="0"
              y="0"
              width={bounds.width / 10}
              height={bounds.height / 10}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${bounds.width / 10} 0 L 0 0 0 ${bounds.height / 10}`}
                fill="none"
                stroke="rgba(148, 163, 184, 0.3)"
                strokeWidth={bounds.width / 200}
              />
            </pattern>
          </defs>
          <rect
            x={bounds.minX - bounds.width * 0.1}
            y={bounds.minY - bounds.height * 0.1}
            width={bounds.width * 1.2}
            height={bounds.height * 1.2}
            fill={`url(#${gridPatternId})`}
          />
          {pathData ? (
            <path
              d={pathData}
              fill="none"
              stroke="#6366f1"
              strokeWidth={Math.max(bounds.width, bounds.height) * 0.01}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {currentPosition ? (
            <g aria-label="Current position">
              <circle
                cx={currentPosition.x}
                cy={currentPosition.y}
                r={Math.max(bounds.width, bounds.height) * 0.015}
                fill="#22d3ee"
                opacity={0.9}
              />
              <circle
                cx={currentPosition.x}
                cy={currentPosition.y}
                r={Math.max(bounds.width, bounds.height) * 0.03}
                fill="none"
                stroke="#0e7490"
                strokeWidth={Math.max(bounds.width, bounds.height) * 0.006}
                opacity={0.7}
              />
            </g>
          ) : null}
          {selectedPoint ? (
            <g aria-label="Selected point">
              <circle
                cx={selectedPoint.x}
                cy={selectedPoint.y}
                r={Math.max(bounds.width, bounds.height) * 0.018}
                fill="#f97316"
                opacity={0.8}
              />
            </g>
          ) : null}
        </svg>
        {selectedPoint ? (
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-white/80 p-3 text-xs font-medium text-slate-700 shadow">
            <p>Segment point #{selectedIndex! + 1}</p>
            <p>
              Coordinates: {selectedPoint.x.toFixed(1)}, {selectedPoint.y.toFixed(1)}
            </p>
            {selectedPoint.elevation !== undefined ? (
              <p>Elevation: {selectedPoint.elevation.toFixed(1)} m</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default VirtualMap;
