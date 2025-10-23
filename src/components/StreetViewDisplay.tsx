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

type Link = google.maps.StreetViewLink & {
  pano?: string;
  heading?: number;
  description?: string;
};

const chooseBestForwardLink = (
  links: Link[] | null | undefined,
  desiredHeading: number,
  nextLat: number,
  nextLng: number,
  currentPanoId: string | null,
  recent: string[],
): Link | null => {
  if (!links || links.length === 0) {
    return null;
  }

  void nextLat;
  void nextLng;

  const recentFiltered = recent.filter(Boolean);
  const candidates = links.filter((link) => {
    if (!link) {
      return false;
    }
    if (!link.pano) {
      return false;
    }
    if (link.pano === currentPanoId) {
      return false;
    }
    return !recentFiltered.includes(link.pano);
  });

  if (candidates.length === 0) {
    return null;
  }

  let best: { link: Link; score: number } | null = null;

  for (const link of candidates) {
    const heading = normalizeDeg(link.heading ?? 0);
    const angularDistance = Math.abs(shortestDeltaDeg(desiredHeading, heading));
    const backPenalty = angularDistance > 120 ? 30 : 0;
    const score = 0.7 * angularDistance + backPenalty;

    if (!best || score < best.score) {
      best = { link, score };
    }
  }

  return best ? best.link : null;
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
  const lastAppliedIndexRef = useRef<number>(0);
  const distanceSinceLastSVRef = useRef<number>(0);
  const lastStepAtRef = useRef<number>(0);
  const lastPanoIdRef = useRef<string | null>(null);
  const recentPanosRef = useRef<string[]>([]);
  const lastDistanceKmRef = useRef<number>(0);
  const hasInitialisedRef = useRef(false);
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
    usePointStep,
    streetViewPointsPerStep,
    streetViewPanMs,
    streetViewMinStepMs,
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
    lastAppliedIndexRef.current = 0;
    smoothedHeadingRef.current = null;
    lastStepAtRef.current = 0;
    lastPanoIdRef.current = null;
    recentPanosRef.current = [];
    hasInitialisedRef.current = false;
    distanceSinceLastSVRef.current = 0;
    if (routeLatLngs.length < MIN_POINTS_FOR_STREET_VIEW) {
      setCurrentLocation("");
    }
  }, [routeLatLngs]);

  useEffect(() => {
    lastAppliedIndexRef.current = Math.max(0, lastAppliedIndexRef.current);
    smoothedHeadingRef.current = null;
    lastStepAtRef.current = 0;
  }, [usePointStep, streetViewPointsPerStep]);

  useEffect(() => {
    distanceSinceLastSVRef.current = 0;
    lastStepAtRef.current = 0;
  }, [streetViewMetersPerStep, usePointStep]);

  useEffect(() => {
    distanceSinceLastSVRef.current = 0;
    lastDistanceKmRef.current = Number.isFinite(distance) ? distance : 0;
    lastStepAtRef.current = 0;
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
    hasInitialisedRef.current = true;
    lastAppliedIndexRef.current = 0;
    distanceSinceLastSVRef.current = 0;
    const initialNow =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    lastStepAtRef.current = initialNow;
    recentPanosRef.current = [];
    const initialPanoId = panoramaInstance?.getPano ? panoramaInstance.getPano() : null;
    lastPanoIdRef.current = initialPanoId ?? null;

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
      const immediateLinks = pano.getLinks ? (pano.getLinks() as Link[]) : undefined;
      const best = chooseBestForwardLink(
        immediateLinks,
        desiredForward,
        routeLatLngs[0].lat,
        routeLatLngs[0].lng,
        lastPanoIdRef.current,
        recentPanosRef.current,
      );
      if (best?.heading != null) {
        const aligned = normalizeDeg(best.heading);
        pano.setPov({ heading: aligned, pitch: 0, zoom: 1 });
        smoothedHeadingRef.current = aligned;
        latestTargetHeadingRef.current = aligned;
        latestTargetPitchRef.current = 0;
      }

      const onLinksReady = () => {
        const links = pano.getLinks ? (pano.getLinks() as Link[]) : undefined;
        const best2 = chooseBestForwardLink(
          links,
          desiredForward,
          routeLatLngs[0].lat,
          routeLatLngs[0].lng,
          lastPanoIdRef.current,
          recentPanosRef.current,
        );
        if (best2?.heading != null) {
          const aligned = normalizeDeg(best2.heading);
          cancelOngoingAnimation();
          pano.setPov({ heading: aligned, pitch: 0, zoom: 1 });
          smoothedHeadingRef.current = aligned;
          latestTargetHeadingRef.current = aligned;
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

    if (!hasInitialisedRef.current) {
      return;
    }

    const currentDistanceKm = Number.isFinite(distance) ? distance : 0;
    const previousDistanceKm = lastDistanceKmRef.current ?? currentDistanceKm;

    if (!usePointStep && currentDistanceKm + 1e-6 < previousDistanceKm) {
      lastAppliedIndexRef.current = 0;
      distanceSinceLastSVRef.current = 0;
      lastStepAtRef.current = 0;
      recentPanosRef.current = [];
      smoothedHeadingRef.current = null;
      fixedHeadingRef.current = null;
    }

    const deltaKm = Math.max(0, currentDistanceKm - previousDistanceKm);
    lastDistanceKmRef.current = currentDistanceKm;

    if (!usePointStep) {
      distanceSinceLastSVRef.current += deltaKm * 1000;
    }

    const totalSegments = Math.max(1, totalPoints - 1);
    const rawIndex = Math.floor(progress.fraction * totalSegments);
    const clampedRawIndex = Math.max(0, Math.min(totalSegments, rawIndex));

    const previousAppliedIndex = lastAppliedIndexRef.current;
    const monotonicIndex = Math.min(
      totalSegments,
      Math.max(previousAppliedIndex + 1, clampedRawIndex),
    );

    const now =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    if (previousAppliedIndex === 0 && lastStepAtRef.current === 0) {
      lastStepAtRef.current = now;
    }

    const timeSinceLastStep = now - lastStepAtRef.current;

    let nextIndex = previousAppliedIndex;
    let shouldAdvance = false;

    if (usePointStep) {
      const requiredStep = Math.max(1, streetViewPointsPerStep);
      if (
        monotonicIndex > previousAppliedIndex &&
        monotonicIndex - previousAppliedIndex >= requiredStep &&
        timeSinceLastStep >= streetViewMinStepMs
      ) {
        nextIndex = monotonicIndex;
        shouldAdvance = true;
      }
    } else {
      const metersPerStep = Math.max(3, Math.min(50, streetViewMetersPerStep ?? 15));
      if (
        monotonicIndex > previousAppliedIndex &&
        distanceSinceLastSVRef.current >= metersPerStep &&
        timeSinceLastStep >= streetViewMinStepMs
      ) {
        nextIndex = monotonicIndex;
        shouldAdvance = true;
      }
    }

    if (!shouldAdvance) {
      return;
    }

    distanceSinceLastSVRef.current = 0;
    lastStepAtRef.current = now;

    const targetIndex = nextIndex;
    const position = routeLatLngs[targetIndex];
    if (!position) {
      return;
    }

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

    const previousHeading = smoothedHeadingRef.current ?? targetHeadingRaw;
    const deltaShortest = shortestDeltaDeg(previousHeading, targetHeadingRaw);
    const clampedDelta = Math.max(
      -MAX_TURN_PER_UPDATE,
      Math.min(MAX_TURN_PER_UPDATE, deltaShortest),
    );
    const clampedHeading = normalizeDeg(previousHeading + clampedDelta);
    const smoothedHeading = normalizeDeg(
      previousHeading +
        HEADING_EMA_ALPHA * shortestDeltaDeg(previousHeading, clampedHeading),
    );

    let forwardHeading = smoothedHeading;

    if (headingMode === "fixed") {
      if (fixedHeadingRef.current == null) {
        fixedHeadingRef.current = forwardHeading;
      }
    } else {
      fixedHeadingRef.current = null;
    }

    let effectiveHeading =
      headingMode === "fixed"
        ? fixedHeadingRef.current ?? forwardHeading
        : forwardHeading;

    const targetPitch = 0;

    const previousPanoId = lastPanoIdRef.current;
    const links = panorama.getLinks ? (panorama.getLinks() as Link[]) : undefined;
    const bestLink = chooseBestForwardLink(
      links,
      forwardHeading,
      position.lat,
      position.lng,
      previousPanoId,
      recentPanosRef.current,
    );

    const normalizedLinkHeading =
      bestLink?.heading != null ? normalizeDeg(bestLink.heading) : null;

    panorama.setZoom(1);

    const newPanoId = panorama.getPano ? panorama.getPano() : null;
    const panoChanged = newPanoId != null && newPanoId !== previousPanoId;

    if (panoChanged && normalizedLinkHeading != null && headingMode !== "fixed") {
      forwardHeading = normalizedLinkHeading;
      effectiveHeading = normalizedLinkHeading;
    }

    smoothedHeadingRef.current =
      panoChanged && headingMode !== "fixed" ? effectiveHeading : forwardHeading;

    if (headingMode === "fixed") {
      effectiveHeading = fixedHeadingRef.current ?? effectiveHeading;
    }

    latestTargetHeadingRef.current = effectiveHeading;
    latestTargetPitchRef.current = targetPitch;

    const cancelOngoingAnimation = () => {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };

    const basePanMs =
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

    const panMs = panoChanged ? 0 : basePanMs;

    if (panMs <= STREET_VIEW_MIN_PAN_MS) {
      cancelOngoingAnimation();
      panorama.setPov({ heading: effectiveHeading, pitch: targetPitch, zoom: 1 });
    } else {
      const currentPov = panorama.getPov
        ? panorama.getPov()
        : { heading: effectiveHeading, pitch: targetPitch, zoom: 1 };

      cancelOngoingAnimation();
      animStartRef.current = now;
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

    if (panoChanged) {
      if (previousPanoId) {
        if (recentPanosRef.current.length > 2) {
          recentPanosRef.current.shift();
        }
        recentPanosRef.current.push(previousPanoId);
      }
      lastPanoIdRef.current = newPanoId ?? null;
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
    streetViewMinStepMs,
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
