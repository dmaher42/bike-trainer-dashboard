import type { Route, RoutePoint } from "../types";

interface BuildRouteOptions {
  /** Optional name to associate with the generated route. */
  name?: string;
  /**
   * Controls the amplitude of the synthetic elevation changes (in metres).
   * Defaults to 40m to keep the route rolling but realistic.
   */
  elevationAmplitude?: number;
  /**
   * Controls the curvature of the synthetic route. Larger values create
   * greater lateral variation.
   */
  curvature?: number;
}

const DEFAULT_BUILD_OPTIONS: Required<Omit<BuildRouteOptions, "name">> = {
  elevationAmplitude: 40,
  curvature: 0.15,
};

function computeRouteMetrics(pts: RoutePoint[], name?: string): Route {
  if (pts.length < 2) {
    throw new Error("Route requires at least two points");
  }

  const cum: number[] = new Array(pts.length).fill(0);

  for (let i = 1; i < pts.length; i += 1) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    cum[i] = cum[i - 1] + Math.hypot(dx, dy);
  }

  return {
    pts,
    cum,
    total: cum[cum.length - 1],
    name,
  };
}

/**
 * Generates a synthetic route that loosely resembles rolling terrain.
 */
export function buildRoute(
  length: number,
  numPoints: number,
  options: BuildRouteOptions = {}
): Route {
  if (!Number.isFinite(length) || length <= 0) {
    throw new Error("Route length must be a positive number");
  }
  if (!Number.isInteger(numPoints) || numPoints < 2) {
    throw new Error("Route must contain at least two points");
  }

  const { name, ...rest } = options;
  const { elevationAmplitude, curvature } = {
    ...DEFAULT_BUILD_OPTIONS,
    ...rest,
  };

  const step = length / (numPoints - 1);
  const pts: RoutePoint[] = [];
  for (let i = 0; i < numPoints; i += 1) {
    const distance = step * i;
    const t = i / (numPoints - 1);

    const x = distance;
    const y = Math.sin(t * Math.PI * 2) * length * curvature;
    const elevation = elevationAmplitude * Math.sin(t * Math.PI * 4);

    pts.push({ x, y, elevation });
  }

  return computeRouteMetrics(pts, name ?? "Synthetic Route");
}

/**
 * Linearly interpolates a position along the supplied route.
 *
 * @param route Route to traverse.
 * @param fraction Normalised distance along the route (0-1).
 * @returns A new {@link RoutePoint} positioned at the requested fraction.
 */
export function interpRoute(route: Route, fraction: number): RoutePoint {
  if (route.pts.length < 2) {
    throw new Error("Route requires at least two points for interpolation");
  }
  if (!Number.isFinite(fraction)) {
    throw new Error("Fraction must be a finite number");
  }

  const clamped = Math.min(Math.max(fraction, 0), 1);
  const target = route.total * clamped;
  const { pts, cum } = route;

  let upperIndex = cum.findIndex((d) => d >= target);
  if (upperIndex === -1) {
    upperIndex = cum.length - 1;
  }

  if (upperIndex === 0) {
    return { ...pts[0] };
  }

  const lowerIndex = upperIndex - 1;
  const lowerDist = cum[lowerIndex];
  const upperDist = cum[upperIndex];
  const span = upperDist - lowerDist || 1;
  const localT = (target - lowerDist) / span;

  const lower = pts[lowerIndex];
  const upper = pts[upperIndex];

  const interpolate = (a: number | undefined, b: number | undefined) => {
    if (a === undefined && b === undefined) {
      return undefined;
    }
    const start = a ?? b ?? 0;
    const end = b ?? a ?? 0;
    return start + (end - start) * localT;
  };

  return {
    x: lower.x + (upper.x - lower.x) * localT,
    y: lower.y + (upper.y - lower.y) * localT,
    elevation: interpolate(lower.elevation, upper.elevation),
  };
}

/**
 * Parses GPX XML content and converts it into a {@link Route}.
 */
export function parseGPX(gpxXml: string): Route {
  if (!gpxXml.trim()) {
    throw new Error("GPX content is empty");
  }

  const nameMatch = gpxXml.match(/<name>([^<]+)<\/name>/i);
  const name = nameMatch?.[1]?.trim();

  const trkptRegex = /<trkpt[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/gi;
  const eleRegex = /<ele>([^<]+)<\/ele>/i;

  const pts: RoutePoint[] = [];
  let match: RegExpExecArray | null;

  while ((match = trkptRegex.exec(gpxXml)) !== null) {
    const lat = parseFloat(match[1]);
    const lon = parseFloat(match[2]);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }

    const inner = match[3];
    const eleMatch = inner.match(eleRegex);
    const elevation = eleMatch ? parseFloat(eleMatch[1]) : undefined;

    pts.push({
      // Treat longitude as x and latitude as y for planar representation.
      x: lon,
      y: lat,
      elevation: Number.isFinite(elevation) ? elevation : undefined,
    });
  }

  if (pts.length < 2) {
    throw new Error("GPX file must contain at least two track points");
  }

  return computeRouteMetrics(pts, name ?? "GPX Route");
}
