import React, { useId, useMemo } from "react";

import type { Route } from "../types";
import { interpRoute } from "../utils/routeUtils";

export interface ElevationProfileProps {
  route: Route;
  /** Normalised progress along the route (0-1). */
  currentProgress: number;
  /** Total route distance in kilometres. */
  totalDistance: number;
}

interface NormalizedPoint {
  x: number;
  y: number;
}

interface ChartGeometry {
  points: NormalizedPoint[];
  areaPath: string;
  linePath: string;
  minElevation: number;
  maxElevation: number;
  toX: (distanceKm: number) => number;
  toY: (elevation: number) => number;
  minDistance: number;
  maxDistance: number;
}

const getMarkerStep = (totalDistance: number): number => {
  if (totalDistance <= 0) {
    return 1;
  }
  if (totalDistance <= 2) {
    return 0.5;
  }
  if (totalDistance <= 5) {
    return 1;
  }
  if (totalDistance <= 20) {
    return 2;
  }
  if (totalDistance <= 50) {
    return 5;
  }
  if (totalDistance <= 100) {
    return 10;
  }
  return 20;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

const useChartGeometry = (
  route: Route,
  totalDistance: number,
): ChartGeometry | null => {
  return useMemo(() => {
    const { pts, cum, total } = route;
    if (!pts.length || !cum.length) {
      return null;
    }

    const distanceScale =
      Number.isFinite(totalDistance) && totalDistance > 0 && Number.isFinite(total)
        ? totalDistance / (total || 1)
        : 1;

    const validPoints = pts
      .map((pt, index) => {
        const elevation = pt.elevation;
        const rawDistance = cum[index] ?? 0;
        if (typeof elevation !== "number" || !Number.isFinite(elevation)) {
          return null;
        }

        const distanceKm = rawDistance * distanceScale;
        return { distanceKm, elevation };
      })
      .filter((value): value is { distanceKm: number; elevation: number } => value !== null);

    if (validPoints.length === 0) {
      return null;
    }

    const distances = validPoints.map((point) => point.distanceKm);
    const elevations = validPoints.map((point) => point.elevation);

    const minDistance = Math.min(...distances);
    const maxDistance = Math.max(...distances);
    const distanceRange = maxDistance - minDistance || 1;

    const minElevation = Math.min(...elevations);
    const maxElevation = Math.max(...elevations);
    const elevationRange = maxElevation - minElevation;
    const padding = Math.max(elevationRange * 0.1, 5);
    const adjustedMinElevation = minElevation - padding;
    const adjustedMaxElevation = maxElevation + padding;
    const adjustedRange = adjustedMaxElevation - adjustedMinElevation || 1;

    const toX = (distanceKm: number) =>
      ((distanceKm - minDistance) / distanceRange) * 100;
    const toY = (elevation: number) =>
      100 - ((elevation - adjustedMinElevation) / adjustedRange) * 100;

    const points = validPoints.map((point) => ({
      x: toX(point.distanceKm),
      y: toY(point.elevation),
    }));

    const linePath = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x},${point.y}`)
      .join(" ");

    const areaPath = `${linePath} L ${points[points.length - 1].x},100 L ${points[0].x},100 Z`;

    return {
      points,
      areaPath,
      linePath,
      minElevation,
      maxElevation,
      toX: (distanceKm: number) => clamp(toX(distanceKm), 0, 100),
      toY: (elevation: number) => clamp(toY(elevation), 0, 100),
      minDistance,
      maxDistance,
    };
  }, [route, totalDistance]);
};

const formatElevation = (value: number): string => `${Math.round(value)} m`;

const formatDistanceLabel = (distance: number): string => {
  if (!Number.isFinite(distance) || distance <= 0) {
    return "0 km";
  }

  if (distance < 1) {
    return `${distance.toFixed(1)} km`;
  }

  if (distance < 10) {
    return `${distance.toFixed(1)} km`;
  }

  return `${Math.round(distance)} km`;
};

export const ElevationProfile: React.FC<ElevationProfileProps> = ({
  route,
  currentProgress,
  totalDistance,
}) => {
  const chart = useChartGeometry(route, totalDistance);
  const rawId = useId();
  const gradientId = `elevation-profile-${rawId.replace(/:/g, "")}`;

  const hasData = chart && chart.points.length > 1;

  const safeProgress = Number.isFinite(currentProgress)
    ? clamp(currentProgress, 0, 1)
    : 0;

  const progressDistanceKm = Number.isFinite(totalDistance) && totalDistance > 0
    ? totalDistance * safeProgress
    : 0;

  const currentPoint = useMemo(() => {
    if (!route || route.pts.length < 2) {
      return null;
    }

    try {
      return interpRoute(route, safeProgress);
    } catch {
      return null;
    }
  }, [route, safeProgress]);

  const markerX = chart ? chart.toX(progressDistanceKm) : 0;
  const markerY = chart && currentPoint?.elevation != null
    ? chart.toY(currentPoint.elevation)
    : 100;

  const distanceMarkers = useMemo(() => {
    if (!chart || totalDistance <= 0) {
      return [];
    }

    const step = getMarkerStep(totalDistance);
    const markers: Array<{ distance: number; label: string; x: number }> = [];

    for (let d = 0; d <= totalDistance + step / 2; d += step) {
      const clampedDistance = Math.min(d, totalDistance);
      markers.push({
        distance: clampedDistance,
        label: formatDistanceLabel(Number(clampedDistance.toFixed(2))),
        x: chart.toX(clampedDistance),
      });
    }

    if (markers.length === 0 || markers[markers.length - 1].distance < totalDistance) {
      markers.push({
        distance: totalDistance,
        label: formatDistanceLabel(totalDistance),
        x: chart.toX(totalDistance),
      });
    }

    return markers.filter((marker, index, array) => {
      if (index === 0) {
        return true;
      }

      const previous = array[index - 1];
      return Math.abs(marker.distance - previous.distance) > 1e-3;
    });
  }, [chart, totalDistance]);

  if (!hasData || !chart) {
    return (
      <section
        className="mt-4 flex min-h-[140px] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-700 bg-neutral-900/40 p-6 text-center text-sm text-neutral-400"
        aria-label="Elevation profile"
      >
        <svg
          className="h-10 w-10 text-neutral-700"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 17H21" />
          <path d="M5 13L9 9 13 12 21 4" />
          <path d="M17 4H21V8" />
        </svg>
        <p>No elevation data available for this route.</p>
      </section>
    );
  }

  return (
    <section
      className="mt-4 w-full rounded-2xl border border-neutral-800 bg-neutral-900/60 p-4 shadow-inner"
      aria-label="Route elevation profile"
    >
      <header className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-neutral-200">Elevation profile</h3>
        <p className="text-xs text-neutral-400">
          {formatElevation(chart.minElevation)} – {formatElevation(chart.maxElevation)}
        </p>
      </header>
      <div className="relative h-32 w-full">
        <svg
          className="h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          role="img"
          aria-labelledby={`${gradientId}-title`}
        >
          <title id={`${gradientId}-title`}>Route elevation in metres across distance</title>
          <defs>
            <linearGradient id={`${gradientId}-fill`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgb(59 130 246)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="rgb(59 130 246)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[20, 40, 60, 80].map((y) => (
            <line
              key={`grid-${y}`}
              x1="0"
              y1={y}
              x2="100"
              y2={y}
              stroke="currentColor"
              strokeWidth={0.3}
              className="text-neutral-800"
              strokeDasharray="2 2"
            />
          ))}

          <path d={chart.areaPath} fill={`url(#${gradientId}-fill)`} />
          <path
            d={chart.linePath}
            fill="none"
            stroke="rgb(59 130 246)"
            strokeWidth={1.4}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          <line
            x1={markerX}
            y1="0"
            x2={markerX}
            y2="100"
            stroke="rgb(248 250 252 / 0.4)"
            strokeWidth={0.6}
            strokeDasharray="1 3"
            className="transition-all duration-300 ease-out"
          />

          <g className="transition-all duration-300 ease-out" transform={`translate(${markerX}, ${markerY})`}>
            <circle r={1.5} fill="#22c55e" stroke="#065f46" strokeWidth={0.5} />
          </g>
        </svg>
      </div>
      <div className="relative mt-3 h-6">
        {distanceMarkers.map((marker) => (
          <div
            key={`marker-${marker.distance.toFixed(2)}`}
            className="absolute flex -translate-x-1/2 flex-col items-center text-[10px] text-neutral-400"
            style={{ left: `${marker.x}%` }}
            aria-hidden="true"
          >
            <span className="h-2 w-px bg-neutral-700" />
            <span className="mt-1 whitespace-nowrap">{marker.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default ElevationProfile;
