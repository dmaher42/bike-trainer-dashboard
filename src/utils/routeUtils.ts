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
  try {
    console.log("Starting GPX parsing...");

    if (!gpxXml || typeof gpxXml !== "string" || !gpxXml.trim()) {
      throw new Error("Invalid GPX data: Empty or not a string");
    }

    if (!gpxXml.includes("<gpx") || !gpxXml.includes("</gpx>")) {
      throw new Error("Invalid GPX format: Missing GPX tags");
    }

    const parser = new DOMParser();
    const gpx = parser.parseFromString(gpxXml, "text/xml");

    const parserError = gpx.querySelector("parsererror");
    if (parserError) {
      throw new Error("XML parsing error: Invalid XML format");
    }

    let trackPoints = gpx.querySelectorAll("trkpt");
    if (trackPoints.length === 0) {
      trackPoints = gpx.querySelectorAll("wpt");
    }
    if (trackPoints.length === 0) {
      trackPoints = gpx.querySelectorAll("rtept");
    }

    if (trackPoints.length === 0) {
      throw new Error("No track points found in GPX file");
    }

    console.log(`Found ${trackPoints.length} track points`);

    const pts: RoutePoint[] = [];
    let minLat = 90;
    let maxLat = -90;
    let minLon = 180;
    let maxLon = -180;
    let hasElevation = false;

    trackPoints.forEach((point) => {
      const lat = parseFloat(point.getAttribute("lat") ?? "NaN");
      const lon = parseFloat(point.getAttribute("lon") ?? "NaN");
      const ele = point.querySelector("ele")?.textContent ?? undefined;

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        console.warn("Invalid coordinates found, skipping point");
        return;
      }

      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);

      if (ele !== undefined) {
        hasElevation = true;
      }
    });

    if (minLat === 90 && maxLat === -90 && minLon === 180 && maxLon === -180) {
      throw new Error("No valid coordinates found in GPX file");
    }

    const latRange = maxLat - minLat || 1;
    const lonRange = maxLon - minLon || 1;
    const latPadding = latRange * 0.05;
    const lonPadding = lonRange * 0.05;
    const paddedMinLat = minLat - latPadding;
    const paddedMaxLat = maxLat + latPadding;
    const paddedMinLon = minLon - lonPadding;
    const paddedMaxLon = maxLon + lonPadding;

    console.log(
      `Bounds: lat[${paddedMinLat.toFixed(6)}, ${paddedMaxLat.toFixed(
        6,
      )}] lon[${paddedMinLon.toFixed(6)}, ${paddedMaxLon.toFixed(6)}]`,
    );

    trackPoints.forEach((point, index) => {
      const lat = parseFloat(point.getAttribute("lat") ?? "NaN");
      const lon = parseFloat(point.getAttribute("lon") ?? "NaN");
      const ele = point.querySelector("ele")?.textContent ?? undefined;

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        console.warn(`Skipping invalid point at index ${index}`);
        return;
      }

      const x = (lon - paddedMinLon) / (paddedMaxLon - paddedMinLon || 1);
      const y = 1 - (lat - paddedMinLat) / (paddedMaxLat - paddedMinLat || 1);

      pts.push({
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
        elevation:
          ele && hasElevation && Number.isFinite(parseFloat(ele))
            ? parseFloat(ele)
            : undefined,
      });
    });

    if (pts.length === 0) {
      throw new Error("No valid points could be extracted from GPX file");
    }

    if (pts.length < 2) {
      throw new Error("GPX file must contain at least two valid points");
    }

    console.log(`Extracted ${pts.length} valid points`);

    const nameElements = [
      gpx.querySelector("trk > name"),
      gpx.querySelector("name"),
      gpx.querySelector("metadata > name"),
    ];

    let routeName: string | undefined;
    for (const nameEl of nameElements) {
      if (nameEl?.textContent) {
        routeName = nameEl.textContent.trim();
        break;
      }
    }

    const route = computeRouteMetrics(pts, routeName ?? "GPX Route");

    console.log(
      `Route "${route.name ?? "Unnamed"}" parsed successfully: ${route.pts.length} points, ${route.total.toFixed(
        2,
      )} total distance`,
    );

    return route;
  } catch (error) {
    console.error("Error parsing GPX:", error);
    throw error instanceof Error
      ? error
      : new Error("An unknown error occurred while parsing GPX");
  }
}
