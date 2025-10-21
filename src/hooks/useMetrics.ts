import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Metrics, Sample } from "../types";

const INITIAL_METRICS: Metrics = {
  power: 0,
  cadence: 0,
  speed: 0,
  distance: 0,
  hr: 0,
};

const formatElapsed = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours > 0) {
    return `${hours}:${remMinutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }
  return `${remMinutes}:${seconds.toString().padStart(2, "0")}`;
};

const computeSimulatedMetrics = (elapsedSeconds: number, previous: Metrics): Metrics => {
  const power = 200 + 40 * Math.sin(elapsedSeconds / 8) + (Math.random() - 0.5) * 20;
  const cadence = 90 + 5 * Math.sin((elapsedSeconds + 3) / 6) + (Math.random() - 0.5) * 5;
  const speed = 32 + 4 * Math.sin((elapsedSeconds + 1) / 7) + (Math.random() - 0.5) * 2;
  const hr = 150 + 8 * Math.sin((elapsedSeconds + 2) / 10) + (Math.random() - 0.5) * 6;
  const distance = previous.distance + Math.max(speed, 0) / 3600;

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

  const applyMetricsUpdate = useCallback((updates: Partial<Metrics>) => {
    setMetrics((prev) => {
      const next = { ...prev, ...updates };
      metricsRef.current = next;
      return next;
    });
  }, []);

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
      const nextElapsed = elapsedRef.current + 1;
      elapsedRef.current = nextElapsed;
      setElapsedSeconds(nextElapsed);

      const nextMetrics = simulate
        ? computeSimulatedMetrics(nextElapsed, metricsRef.current)
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
    };
  }, [isRunning, simulate]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (simulate || typeof window === "undefined") {
      return;
    }

    const handleFtmsData = (event: Event) => {
      const detail = (event as CustomEvent<Partial<Metrics>>).detail;
      if (!detail) {
        return;
      }

      const updates: Partial<Metrics> = {};
      if (typeof detail.power === "number") {
        updates.power = detail.power;
      }
      if (typeof detail.cadence === "number") {
        updates.cadence = detail.cadence;
      }
      if (typeof detail.speed === "number") {
        updates.speed = detail.speed;
      }
      if (Object.keys(updates).length > 0) {
        applyMetricsUpdate(updates);
      }
    };

    const handleHeartRateData = (event: Event) => {
      const detail = (event as CustomEvent<{ hr?: number }>).detail;
      if (detail && typeof detail.hr === "number") {
        applyMetricsUpdate({ hr: detail.hr });
      }
    };

    window.addEventListener("ftms-data", handleFtmsData as EventListener);
    window.addEventListener("hr-data", handleHeartRateData as EventListener);

    return () => {
      window.removeEventListener("ftms-data", handleFtmsData as EventListener);
      window.removeEventListener("hr-data", handleHeartRateData as EventListener);
    };
  }, [applyMetricsUpdate, simulate]);

  const startRide = () => {
    if (isRunning) {
      return false;
    }
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
};

export default useMetrics;
