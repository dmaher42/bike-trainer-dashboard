import { useEffect, useMemo, useRef, useState } from "react";

import { Metrics, Sample } from "../types";

const INITIAL_METRICS: Metrics = {
  power: 0,
  cadence: 0,
  speed: 0,
  distance: 0,
  hr: 0,
};

const formatElapsed = (totalSeconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours > 0) {
    return `${hours}:${remMinutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }
  return `${remMinutes}:${seconds.toString().padStart(2, "0")}`;
};

const computeSimulatedMetrics = (
  elapsedSeconds: number,
  previous: Metrics,
  deltaSeconds: number,
): Metrics => {
  const power = 200 + 40 * Math.sin(elapsedSeconds / 8) + (Math.random() - 0.5) * 20;
  const cadence = 90 + 5 * Math.sin((elapsedSeconds + 3) / 6) + (Math.random() - 0.5) * 5;
  const speed = 32 + 4 * Math.sin((elapsedSeconds + 1) / 7) + (Math.random() - 0.5) * 2;
  const hr = 150 + 8 * Math.sin((elapsedSeconds + 2) / 10) + (Math.random() - 0.5) * 6;
  const distance = previous.distance + (Math.max(speed, 0) * deltaSeconds) / 3600;

  return {
    power: Math.max(power, 0),
    cadence: Math.max(cadence, 0),
    speed: Math.max(speed, 0),
    distance,
    hr: Math.max(hr, 0),
  };
};

export interface UseMetricsResult {
  metrics: Metrics;
  samples: Sample[];
  elapsed: string;
  startRide: () => boolean;
  stopRide: () => boolean;
  resetRide: () => boolean;
}

export const useMetrics = (simulate: boolean, rideOn: boolean): UseMetricsResult => {
  const [metrics, setMetrics] = useState<Metrics>(INITIAL_METRICS);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const metricsRef = useRef<Metrics>(INITIAL_METRICS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);

  const nowMs = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  useEffect(() => {
    if (!rideOn && isRunning) {
      setIsRunning(false);
    }
  }, [rideOn, isRunning]);

  useEffect(() => {
    if (!isRunning) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      const now = nowMs();
      const lastTick = lastTickRef.current ?? now;
      const deltaSeconds = Math.max(0, (now - lastTick) / 1000);
      lastTickRef.current = now;

      const nextElapsed = elapsedRef.current + deltaSeconds;
      elapsedRef.current = nextElapsed;
      setElapsedSeconds(nextElapsed);

      const nextMetrics = simulate
        ? computeSimulatedMetrics(nextElapsed, metricsRef.current, deltaSeconds)
        : metricsRef.current;

      metricsRef.current = nextMetrics;
      setMetrics(nextMetrics);

      const sample: Sample = {
        ts: Date.now(),
        elapsed: nextElapsed,
        ...nextMetrics,
      };

      setSamples((prev) => [...prev, sample]);
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      lastTickRef.current = null;
    };
  }, [isRunning, simulate]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      lastTickRef.current = null;
    };
  }, []);

  const startRide = () => {
    if (isRunning) {
      return false;
    }
    lastTickRef.current = nowMs();
    setIsRunning(true);
    return true;
  };

  const stopRide = () => {
    if (!isRunning) {
      return false;
    }
    setIsRunning(false);
    return true;
  };

  const resetRide = () => {
    setIsRunning(false);
    elapsedRef.current = 0;
    setElapsedSeconds(0);
    metricsRef.current = INITIAL_METRICS;
    setMetrics(INITIAL_METRICS);
    setSamples([]);
    lastTickRef.current = null;
    return true;
  };

  const elapsed = useMemo(() => formatElapsed(elapsedSeconds), [elapsedSeconds]);

  return {
    metrics,
    samples,
    elapsed,
    startRide,
    stopRide,
    resetRide,
  };
}
