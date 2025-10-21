export interface GPXValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    pointCount: number;
    hasElevation: boolean;
    hasTime: boolean;
    bounds?: {
      minLat: number;
      maxLat: number;
      minLon: number;
      maxLon: number;
    };
  };
}

/**
 * Validates a GPX file and returns detailed statistics about its contents.
 * Performs basic XML integrity checks and analyses track, route, or waypoint points.
 */
export function validateGPX(gpxText: string): GPXValidationResult {
  const result: GPXValidationResult = {
    isValid: true,
    errors: [],
    warnings: [],
    stats: {
      pointCount: 0,
      hasElevation: false,
      hasTime: false,
    },
  };

  try {
    if (!gpxText || typeof gpxText !== "string") {
      result.isValid = false;
      result.errors.push("GPX data is empty or not a string");
      return result;
    }

    const trimmedText = gpxText.trim();

    if (!trimmedText.includes("<gpx")) {
      result.isValid = false;
      result.errors.push("Missing GPX root element");
      return result;
    }

    if (!trimmedText.includes("</gpx>")) {
      result.isValid = false;
      result.errors.push("Missing GPX closing tag");
      return result;
    }

    const parser = new DOMParser();
    const gpx = parser.parseFromString(trimmedText, "text/xml");

    const parserError = gpx.querySelector("parsererror");
    if (parserError) {
      result.isValid = false;
      result.errors.push("Invalid XML format");
      return result;
    }

    let trackPoints = gpx.querySelectorAll("trkpt");
    if (trackPoints.length === 0) {
      trackPoints = gpx.querySelectorAll("wpt");
    }
    if (trackPoints.length === 0) {
      trackPoints = gpx.querySelectorAll("rtept");
    }

    if (trackPoints.length === 0) {
      result.isValid = false;
      result.errors.push("No track points found in GPX file");
      return result;
    }

    result.stats.pointCount = trackPoints.length;

    let minLat = 90;
    let maxLat = -90;
    let minLon = 180;
    let maxLon = -180;
    let validPoints = 0;

    trackPoints.forEach((point) => {
      const lat = parseFloat(point.getAttribute("lat") ?? "NaN");
      const lon = parseFloat(point.getAttribute("lon") ?? "NaN");
      const ele = point.querySelector("ele")?.textContent?.trim();
      const time = point.querySelector("time")?.textContent?.trim();

      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return;
      }

      validPoints += 1;
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);

      if (ele) {
        result.stats.hasElevation = true;
      }

      if (time) {
        result.stats.hasTime = true;
      }
    });

    if (validPoints === 0) {
      result.isValid = false;
      result.errors.push("No valid coordinates found");
      return result;
    }

    if (validPoints < trackPoints.length) {
      result.warnings.push(`${trackPoints.length - validPoints} points had invalid coordinates and were skipped`);
    }

    if (validPoints < 10) {
      result.warnings.push("Route has very few points, which may result in poor visualization");
    }

    result.stats.bounds = { minLat, maxLat, minLon, maxLon };

    if (minLat < -90 || maxLat > 90 || minLon < -180 || maxLon > 180) {
      result.isValid = false;
      result.errors.push("Coordinates out of valid range");
      return result;
    }

    const latRange = maxLat - minLat;
    const lonRange = maxLon - minLon;

    if (latRange < 0.0001 && lonRange < 0.0001) {
      result.warnings.push("Route has very small geographic extent");
    }
  } catch (error) {
    result.isValid = false;
    result.errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
  }

  return result;
}
