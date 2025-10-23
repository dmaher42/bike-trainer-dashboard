import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Route } from "../types";
import { GoogleMapsManager } from "../utils/googleMapsUtils";
import { useMapSettings } from "../hooks/useMapSettings";
import { STREET_VIEW_MAX_PAN_MS, STREET_VIEW_MIN_PAN_MS } from "../types/settings";

const MIN_POINTS_FOR_STREET_VIEW = 2;
const LOOKAHEAD = 5;
const MIN_INDEX_STEP_FOR_HEADING = 1;
const MAX_TURN_PER_UPDATE = 20;
const HEADING_EMA_ALPHA = 0.25;

interface StreetViewDisplayProps {
  route: Route;
  distance: number;
  routeTotal: number;
  isRiding: boolean;
  apiKey?: string;
  onLocationUpdate?: (location: string) => void;
  onError?: (error: string) => void;
}

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

const bearing = (a: google.maps.LatLngLiteral, b: google.maps.LatLngLiteral): number => {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLon = toRadians(b.lng - a.lng);

  const y = Math.sin(deltaLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon);

  const heading = toDegrees(Math.atan2(y, x));
  return (heading + 360) % 360;
};

const normalizeDeg = (deg: number) => {
  let d = deg % 360;
  if (d < 0) {
    d += 360;
  }
  return d;
};

const shortestDeltaDeg = (from: number, to: number) => {
  const a = normalizeDeg(from);
  const b = normalizeDeg(to);
  let d = b - a;
  if (d > 180) {
    d -= 360;
  }
  if (d < -180) {
    d += 360;
  }
  return d;
};

const closestLinkHeading = (
  links: google.maps.StreetViewLink[] | null | undefined,
  desired: number,
): number | null => {
  if (!links || links.length === 0) return null;
  let best: { h: number; d: number } | null = null;
  for (const l of links) {
    const h = normalizeDeg(l.heading ?? 0);
    const d = Math.abs(shortestDeltaDeg(desired, h));
    if (!best || d < best.d) best = { h, d };
  }
  return best ? best.h : null;
};

const easeInOutQuad = (t: number) => {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
};

const MIN_FRAME_DELTA = 1000 / 30;

export const StreetViewDisplay: React.FC<StreetViewDisplayProps> = ({
  route,
  distance,
  routeTotal,
  isRiding,
  apiKey,
  onLocationUpdate,
  onError,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<string>("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  const streetViewRef = useRef<HTMLDivElement | null>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const lastIndexRef = useRef<number>(-1);
  const lastAppliedIndexRef = useRef<number>(-1);
  const lastUpdateMsRef = useRef(0);
  const distanceSinceLastSVRef = useRef<number>(0);
  const lastDistanceKmRef = useRef<number>(0);
  const mapsManagerRef = useRef<GoogleMapsManager | null>(null);
  const warnedAboutTotalRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const animStartRef = useRef(0);
  const startHeadingRef = useRef(0);
  const startPitchRef = useRef(0);
  const targetHeadingRef = useRef(0);
  const targetPitchRef = useRef(0);
  const lastFrameMsRef = useRef(0);
  const smoothedHeadingRef = useRef<number | null>(null);
  const latestTargetHeadingRef = useRef<number>(0);
  const latestTargetPitchRef = useRef<number>(0);
  const fixedHeadingRef = useRef<number | null>(null);

  const {
    streetViewUpdateMs,
    usePointStep,
    streetViewPointsPerStep,
    streetViewPanMs,
    lockForwardHeading,
    streetViewMetersPerStep,
    headingMode,
    reverseRoute,
  } = useMapSettings();

  const routeLatLngs = useMemo(() => {
    return route.pts
      .filter(
        (point) =>
          typeof point.lat === "number" &&
          (typeof point.lon === "number" || typeof point.lng === "number"),
      )
      .map((point) => ({
        lat: point.lat as number,
        lng: (point.lon ?? point.lng) as number,
      }));
  }, [route.pts]);

  const progress = useMemo(() => {
    const total = routeTotal > 0 ? routeTotal : route.total;
    const loop = Math.max(1, total || 1);
    const mod = ((distance % loop) + loop) % loop;
    const fraction = total > 0 ? mod / loop : 0;

    return {
      fraction,
      percent: Math.round(fraction * 100),
    };
  }, [distance, route.total, routeTotal]);

  useEffect(() => {
    if (routeTotal > 0) {
      warnedAboutTotalRef.current = false;
      return;
    }

    if (!warnedAboutTotalRef.current) {
      console.warn(
        "StreetViewDisplay: route.total is zero or missing. Street View progress may be inaccurate.",
      );
      warnedAboutTotalRef.current = true;
    }
  }, [routeTotal]);

  useEffect(() => {
    if (!apiKey) {
      setIsLoading(false);
      setError(null);
      setCurrentLocation("");
      mapsManagerRef.current = null;
      panoramaRef.current = null;
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const initialise = async () => {
      try {
        const manager = GoogleMapsManager.getInstance({ apiKey });
        mapsManagerRef.current = manager;
        await manager.loadGoogleMaps();
        if (!cancelled) {
          setIsLoading(false);
        }
      } catch (err) {
        if (cancelled) {
          return;
        }
        const message =
          err instanceof Error ? err.message : "Failed to load Google Maps";
        setError(message);
        setIsLoading(false);
        onError?.(message);
      }
    };

    void initialise();

    return () => {
      cancelled = true;
    };
  }, [apiKey, loadAttempt, onError]);

  useEffect(() => {
    lastIndexRef.current = -1;
    lastAppliedIndexRef.current = -1;
    lastUpdateMsRef.current = 0;
    smoothedHeadingRef.current = null;
    if (routeLatLngs.length < MIN_POINTS_FOR_STREET_VIEW) {
      setCurrentLocation("");
    }
  }, [routeLatLngs]);

  useEffect(() => {
    lastUpdateMsRef.current = 0;
    lastAppliedIndexRef.current = -1;
    smoothedHeadingRef.current = null;
  }, [usePointStep, streetViewPointsPerStep]);

  useEffect(() => {
    distanceSinceLastSVRef.current = 0;
  }, [streetViewMetersPerStep, usePointStep]);

  useEffect(() => {
    lastUpdateMsRef.current = 0;
  }, [streetViewUpdateMs]);

  useEffect(() => {
    distanceSinceLastSVRef.current = 0;
    lastDistanceKmRef.current = Number.isFinite(distance) ? distance : 0;
  }, [routeLatLngs]);

  useEffect(() => {
    fixedHeadingRef.current = null;
  }, [routeLatLngs, headingMode, reverseRoute]);

  useEffect(() => {
    if (routeLatLngs.length < MIN_POINTS_FOR_STREET_VIEW) {
      return;
    }

    if (!streetViewRef.current) {
      return;
    }

    const manager = mapsManagerRef.current;
    if (!manager?.isLoaded()) {
      return;
    }

    const hasStableHeadings =
      Array.isArray(route.headings) && route.headings.length === routeLatLngs.length;
    const baseInitialHeading = hasStableHeadings
      ? route.headings![0]
      : routeLatLngs.length > 1
      ? bearing(routeLatLngs[0], routeLatLngs[1])
      : 0;
    const initialHeading = reverseRoute
      ? normalizeDeg(360 - baseInitialHeading)
      : baseInitialHeading;
    smoothedHeadingRef.current = initialHeading;
    if (headingMode === "fixed") {
      fixedHeadingRef.current = initialHeading;
    }
    latestTargetHeadingRef.current = initialHeading;
    latestTargetPitchRef.current = 0;

    if (!panoramaRef.current) {
      panoramaRef.current = new google.maps.StreetViewPanorama(
        streetViewRef.current,
        {
          position: routeLatLngs[0],
          pov: { heading: initialHeading, pitch: 0 },
          zoom: 1,
          visible: true,
          addressControl: false,
          linksControl: false,
          panControl: false,
          zoomControl: false,
          fullscreenControl: false,
          motionTracking: false,
          motionTrackingControl: false,
        },
      );
    } else {
      panoramaRef.current.setPosition(routeLatLngs[0]);
      panoramaRef.current.setPov({ heading: initialHeading, pitch: 0 });
    }

    const panoramaInstance = panoramaRef.current;
    const listeners: google.maps.MapsEventListener[] = [];
    let linksTimeout: ReturnType<typeof setTimeout> | null = null;

    if (panoramaInstance) {
      const cancelOngoingAnimation = () => {
        if (rafIdRef.current != null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
      };

      const desiredForward = initialHeading;
      const pano = panoramaInstance;
      const immediateLinks = pano.getLinks ? pano.getLinks() : undefined;
      const best = closestLinkHeading(immediateLinks, desiredForward);
      if (best != null) {
        pano.setPov({ heading: best, pitch: 0, zoom: 1 });
        smoothedHeadingRef.current = best;
        latestTargetHeadingRef.current = best;
        latestTargetPitchRef.current = 0;
      }

      const onLinksReady = () => {
        const links = pano.getLinks ? pano.getLinks() : undefined;
        const best2 = closestLinkHeading(links, desiredForward);
        if (best2 != null) {
          cancelOngoingAnimation();
          pano.setPov({ heading: best2, pitch: 0, zoom: 1 });
          smoothedHeadingRef.current = best2;
          latestTargetHeadingRef.current = best2;
          latestTargetPitchRef.current = 0;
        }
      };

      const linksListener = pano.addListener("links_changed", onLinksReady);
      listeners.push(linksListener);
      linksTimeout = setTimeout(onLinksReady, 0);

      const reassert = () => {
        if (!lockForwardHeading) {
          return;
        }

        const heading = latestTargetHeadingRef.current;
        const pitch = latestTargetPitchRef.current;
        const currentPov = panoramaInstance.getPov ? panoramaInstance.getPov() : undefined;
        const drift = currentPov
          ? Math.abs(shortestDeltaDeg(currentPov.heading ?? 0, heading))
          : 999;

        if (drift > 2) {
          cancelOngoingAnimation();
          panoramaInstance.setPov({ heading, pitch, zoom: 1 });
        }
      };

      listeners.push(panoramaInstance.addListener("pano_changed", reassert));
      listeners.push(panoramaInstance.addListener("position_changed", reassert));

      if (lockForwardHeading) {
        reassert();
      }
    }

    return () => {
      if (linksTimeout != null) {
        clearTimeout(linksTimeout);
      }
      while (listeners.length) {
        const listener = listeners.pop();
        listener?.remove();
      }
    };
  }, [
    apiKey,
    headingMode,
    isLoading,
    lockForwardHeading,
    reverseRoute,
    route.headings,
    routeLatLngs,
  ]);

  useEffect(() => {
    const panorama = panoramaRef.current;
    if (!panorama) {
      return;
    }

    const totalPoints = routeLatLngs.length;
    if (totalPoints < MIN_POINTS_FOR_STREET_VIEW) {
      panorama.setVisible(false);
      return;
    }

    panorama.setVisible(true);

    let lastAppliedIndex = lastAppliedIndexRef.current;
    const previousAppliedIndex = lastAppliedIndex;
    const currentDistanceKm = Number.isFinite(distance) ? distance : 0;
    const previousDistanceKm = lastDistanceKmRef.current ?? 0;

    if (!usePointStep && currentDistanceKm + 1e-6 < previousDistanceKm) {
      lastAppliedIndexRef.current = -1;
      lastAppliedIndex = -1;
      distanceSinceLastSVRef.current = 0;
      smoothedHeadingRef.current = null;
      fixedHeadingRef.current = null;
    }

    lastDistanceKmRef.current = currentDistanceKm;

    const rawIndex = Math.floor(progress.fraction * (totalPoints - 1));
    const clampedIndex = Math.max(0, Math.min(totalPoints - 1, rawIndex));
    const monotonicIndex =
      lastAppliedIndex < 0 ? clampedIndex : Math.max(lastAppliedIndex, clampedIndex);

    let nextIndex = lastAppliedIndex;
    let shouldAdvance = false;

    if (usePointStep) {
      distanceSinceLastSVRef.current = 0;
      const requiredStep = Math.max(1, streetViewPointsPerStep);
      if (lastAppliedIndex < 0 || monotonicIndex - lastAppliedIndex >= requiredStep) {
        nextIndex = monotonicIndex;
        shouldAdvance = nextIndex !== lastAppliedIndex;
      }
    } else {
      const metersPerStep = Math.max(3, Math.min(50, streetViewMetersPerStep ?? 15));
      const deltaKm = Math.max(0, currentDistanceKm - previousDistanceKm);
      const deltaMeters = deltaKm * 1000;

      if (lastAppliedIndex >= 0) {
        distanceSinceLastSVRef.current += deltaMeters;
      }

      const needsInitialStep = lastAppliedIndex < 0;
      if (needsInitialStep || distanceSinceLastSVRef.current >= metersPerStep) {
        if (!needsInitialStep) {
          distanceSinceLastSVRef.current = Math.max(
            0,
            distanceSinceLastSVRef.current - metersPerStep,
          );
        } else {
          distanceSinceLastSVRef.current = 0;
        }

        if (needsInitialStep || monotonicIndex > lastAppliedIndex) {
          nextIndex = monotonicIndex;
          shouldAdvance = nextIndex !== lastAppliedIndex;
        }
      }
    }

    if (!shouldAdvance) {
      return;
    }

    const now = Date.now();
    if (lastAppliedIndex >= 0) {
      const throttleMs = Math.max(0, streetViewUpdateMs);
      if (throttleMs > 0 && now - lastUpdateMsRef.current < throttleMs) {
        return;
      }
    }
    lastUpdateMsRef.current = now;

    const targetIndex = nextIndex;
    const position = routeLatLngs[targetIndex];
    panorama.setPosition(position);

    const forwardIndex = Math.min(totalPoints - 1, targetIndex + LOOKAHEAD);
    const backwardIndex = Math.max(0, targetIndex - LOOKAHEAD);

    const headingTargetPoint =
      forwardIndex !== targetIndex
        ? routeLatLngs[forwardIndex]
        : backwardIndex !== targetIndex
        ? routeLatLngs[backwardIndex]
        : position;

    const hasStableHeadings =
      Array.isArray(route.headings) && route.headings.length === totalPoints;

    const smallStep =
      previousAppliedIndex !== -1 &&
      Math.abs(targetIndex - previousAppliedIndex) < MIN_INDEX_STEP_FOR_HEADING;

    const applyDirection = (heading: number) => {
      const normalized = normalizeDeg(heading);
      return reverseRoute ? normalizeDeg(360 - normalized) : normalized;
    };

    let baseHeading: number;
    let shouldApplyDirection = true;
    if (hasStableHeadings) {
      baseHeading = route.headings![targetIndex];
    } else if (smallStep || headingTargetPoint === position) {
      const currentPov = panorama.getPov ? panorama.getPov() : undefined;
      baseHeading = currentPov?.heading ?? smoothedHeadingRef.current ?? 0;
      shouldApplyDirection = false;
    } else {
      baseHeading = bearing(position, headingTargetPoint);
    }

    const targetHeadingRaw = shouldApplyDirection
      ? applyDirection(baseHeading)
      : normalizeDeg(baseHeading);

    const prev = smoothedHeadingRef.current ?? targetHeadingRaw;
    const deltaShortest = shortestDeltaDeg(prev, targetHeadingRaw);
    const clampedDelta = Math.max(
      -MAX_TURN_PER_UPDATE,
      Math.min(MAX_TURN_PER_UPDATE, deltaShortest),
    );
    const clampedHeading = normalizeDeg(prev + clampedDelta);
    const targetHeadingStable = normalizeDeg(
      prev + HEADING_EMA_ALPHA * shortestDeltaDeg(prev, clampedHeading),
    );
    smoothedHeadingRef.current = targetHeadingStable;

    if (headingMode === "fixed") {
      if (fixedHeadingRef.current == null) {
        fixedHeadingRef.current = targetHeadingStable;
      }
    } else {
      fixedHeadingRef.current = null;
    }

    const effectiveHeading =
      headingMode === "fixed"
        ? fixedHeadingRef.current ?? targetHeadingStable
        : targetHeadingStable;

    const targetPitch = 0;
    latestTargetHeadingRef.current = effectiveHeading;
    latestTargetPitchRef.current = targetPitch;
    panorama.setZoom(1);

    const cancelOngoingAnimation = () => {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };

    const panMs =
      headingMode === "fixed"
        ? 0
        : Number.isFinite(streetViewPanMs)
        ? Math.min(
            STREET_VIEW_MAX_PAN_MS,
            Math.max(
              STREET_VIEW_MIN_PAN_MS,
              Math.trunc(streetViewPanMs ?? STREET_VIEW_MIN_PAN_MS),
            ),
          )
        : 0;

    if (panMs <= STREET_VIEW_MIN_PAN_MS) {
      cancelOngoingAnimation();
      panorama.setPov({ heading: effectiveHeading, pitch: targetPitch, zoom: 1 });
    } else {
      const currentPov = panorama.getPov
        ? panorama.getPov()
        : { heading: effectiveHeading, pitch: targetPitch, zoom: 1 };

      cancelOngoingAnimation();
      animStartRef.current = performance.now();
      lastFrameMsRef.current = 0;
      startHeadingRef.current = currentPov.heading ?? effectiveHeading;
      startPitchRef.current = currentPov.pitch ?? targetPitch;
      targetHeadingRef.current = effectiveHeading;
      targetPitchRef.current = targetPitch;

      const duration = panMs;

      const animate = (time: number) => {
        const panoramaInstance = panoramaRef.current;
        if (!panoramaInstance) {
          rafIdRef.current = null;
          return;
        }

        if (lastFrameMsRef.current && time - lastFrameMsRef.current < MIN_FRAME_DELTA) {
          rafIdRef.current = requestAnimationFrame(animate);
          return;
        }

        lastFrameMsRef.current = time;

        const elapsed = time - animStartRef.current;
        const t = duration > 0 ? Math.min(1, elapsed / duration) : 1;
        const eased = easeInOutQuad(t);

        const deltaHeading = shortestDeltaDeg(startHeadingRef.current, targetHeadingRef.current);
        const nextHeading = normalizeDeg(startHeadingRef.current + deltaHeading * eased);
        const nextPitch =
          startPitchRef.current + (targetPitchRef.current - startPitchRef.current) * eased;

        panoramaInstance.setPov({ heading: nextHeading, pitch: nextPitch });

        if (t < 1) {
          rafIdRef.current = requestAnimationFrame(animate);
        } else {
          rafIdRef.current = null;
        }
      };

      rafIdRef.current = requestAnimationFrame(animate);
    }

    lastAppliedIndexRef.current = targetIndex;

    const manager = mapsManagerRef.current;
    if (manager?.isLoaded() && lastIndexRef.current !== targetIndex) {
      lastIndexRef.current = targetIndex;
      let cancelled = false;
      const latLng = new google.maps.LatLng(position.lat, position.lng);

      manager
        .reverseGeocode(latLng)
        .then((location) => {
          if (cancelled) {
            return;
          }
          setCurrentLocation(location);
          onLocationUpdate?.(location);
        })
        .catch((err) => {
          if (!cancelled) {
            console.warn("Failed to get location name:", err);
          }
        });

      return () => {
        cancelled = true;
      };
    }

    return undefined;
  }, [
    distance,
    headingMode,
    onLocationUpdate,
    progress.fraction,
    reverseRoute,
    route.headings,
    routeLatLngs,
    streetViewPanMs,
    streetViewPointsPerStep,
    streetViewMetersPerStep,
    streetViewUpdateMs,
    usePointStep,
  ]);

  useEffect(() => {
    return () => {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  const handleRetry = useCallback(() => {
    if (!apiKey) {
      return;
    }
    setError(null);
    setLoadAttempt((attempt) => attempt + 1);
  }, [apiKey]);

  const missingApiKey = !apiKey;
  const insufficientGeo = routeLatLngs.length < MIN_POINTS_FOR_STREET_VIEW;

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-dark-200">Street View</h3>
        {currentLocation && (
          <div className="text-sm text-dark-400 max-w-xs truncate">
            {currentLocation}
          </div>
        )}
      </div>

      <div className="relative w-full aspect-video bg-dark-900 rounded-xl overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-900/80 z-10">
            <div className="text-center">
              <div className="loading-spinner mx-auto mb-2" />
              <p className="text-sm text-dark-400">Loading Street View...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-900/80 z-20">
            <div className="text-center p-4 max-w-md">
              <div className="text-danger-400 mb-2">
                <svg
                  className="w-8 h-8 mx-auto"
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
              <button
                type="button"
                onClick={handleRetry}
                className="mt-4 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-primary-400 focus:outline-none focus-visible:ring-2"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        {missingApiKey && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-900/80 z-20 px-6 text-center">
            <p className="text-sm text-dark-300">
              Add your Google Maps API key in Settings to enable Street View.
            </p>
          </div>
        )}

        {!missingApiKey && insufficientGeo && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-900/80 z-20 px-6 text-center">
            <p className="text-sm text-dark-300">
              Street View needs GPX points with latitude/longitude.
            </p>
          </div>
        )}

        <div
          ref={streetViewRef}
          className="w-full h-full"
          style={{
            display:
              missingApiKey || insufficientGeo || error ? "none" : "block",
          }}
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isRiding ? "bg-success-400 animate-pulse" : "bg-dark-600"
            }`}
          />
          <span className="text-dark-400">{isRiding ? "Riding" : "Paused"}</span>
        </div>

        <div className="text-dark-400">
          Position:
          {routeLatLngs.length >= MIN_POINTS_FOR_STREET_VIEW
            ? ` ${progress.percent}%`
            : " --"}
        </div>
      </div>
    </div>
  );
};
