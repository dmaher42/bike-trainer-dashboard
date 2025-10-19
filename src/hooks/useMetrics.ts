import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Metrics, Sample } from "../types";

export interface UseMetricsOptions {
  /** Minimum time between recorded samples (ms). */
  sampleThrottleMs?: number;
  /** Enable simulator mode that continuously updates the ride metrics. */
  simulate?: boolean;
  /** Initial metrics used when the hook mounts or resets. */
  initialMetrics?: Partial<Metrics>;
}

export interface UseMetricsResult {
  metrics: Metrics;
  samples: Sample[];
  isRunning: boolean;
  isSimulating: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
  updateMetrics: (next: Partial<Metrics> | ((current: Metrics) => Partial<Metrics>)) => void;
  setSimulating: (enabled: boolean) => void;
}

const DEFAULT_METRICS: Metrics = {
  power: 0,
  cadence: 0,
  speed: 0,
  distance: 0,
  hr: 0,
};

const DEFAULT_OPTIONS: Required<Pick<UseMetricsOptions, "sampleThrottleMs" | "simulate">> = {
  sampleThrottleMs: 1_000,
  simulate: false,
};

const clampPositive = (value: number) => Math.max(0, value);

const getNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

const computeSimulatedTargets = (elapsedSeconds: number) => {
  const power = 190 + 40 * Math.sin(elapsedSeconds / 5);
  const cadence = 88 + 6 * Math.sin((elapsedSeconds + 4) / 7);
  const speed = 34 + 3 * Math.sin((elapsedSeconds + 2) / 6);
  const hr = 152 + 9 * Math.sin((elapsedSeconds + 1) / 12);

  return { power, cadence, speed, hr };
};

const blendValue = (current: number, target: number, smoothing: number, noiseRange: number) => {
  const blended = current + (target - current) * smoothing;
  const noise = (Math.random() - 0.5) * noiseRange;
  return clampPositive(blended + noise);
};

export const useMetrics = (options: UseMetricsOptions = {}): UseMetricsResult => {
  const { sampleThrottleMs, simulate } = { ...DEFAULT_OPTIONS, ...options };
  const initialMetrics = useMemo(() => ({ ...DEFAULT_METRICS, ...options.initialMetrics }), [options.initialMetrics]);

  const [metrics, setMetrics] = useState<Metrics>(initialMetrics);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isSimulating, setIsSimulating] = useState(simulate);

  const frameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const lastSampleTimeRef = useRef<number | null>(null);
  const metricsRef = useRef<Metrics>(initialMetrics);
  const isRunningRef = useRef(false);

  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  useEffect(() => {
    setIsSimulating(simulate);
  }, [simulate]);

  const recordSample = useCallback(
    (timestamp: number, nextMetrics: Metrics) => {
      if (!isRunningRef.current) {
        return;
      }

      const lastSampleTime = lastSampleTimeRef.current;
      if (lastSampleTime && timestamp - lastSampleTime < sampleThrottleMs) {
        return;
      }

      const startTime = startTimeRef.current ?? timestamp;
      const elapsed = (timestamp - startTime) / 1_000;

      const sample: Sample = {
        ...nextMetrics,
        timestamp,
        elapsed,
      };

      lastSampleTimeRef.current = timestamp;
      setSamples((prev) => [...prev, sample]);
    },
    [sampleThrottleMs]
  );

  const animationStep = useCallback(
    (timestamp: number) => {
      if (!isRunningRef.current) {
        frameRef.current = null;
        return;
      }

      const lastFrame = lastFrameTimeRef.current ?? timestamp;
      const deltaMs = timestamp - lastFrame;
      lastFrameTimeRef.current = timestamp;

      const prevMetrics = metricsRef.current;

      let nextMetrics = prevMetrics;

      if (isSimulating) {
        const simElapsed = startTimeRef.current ? (timestamp - startTimeRef.current) / 1_000 : 0;
        const targets = computeSimulatedTargets(simElapsed);

        const nextSpeed = blendValue(prevMetrics.speed, targets.speed, 0.05, 0.3);
        const nextPower = blendValue(prevMetrics.power, targets.power, 0.1, 5);
        const nextCadence = blendValue(prevMetrics.cadence, targets.cadence, 0.08, 1.5);
        const nextHr = blendValue(prevMetrics.hr, targets.hr, 0.04, 1);

        nextMetrics = {
          power: nextPower,
          cadence: nextCadence,
          speed: nextSpeed,
          hr: nextHr,
          distance: prevMetrics.distance,
        };
      }

      const distanceIncrementKm = (nextMetrics.speed / 3_600) * (deltaMs / 1_000);
      nextMetrics = {
        ...nextMetrics,
        distance: nextMetrics.distance + distanceIncrementKm,
      };

      metricsRef.current = nextMetrics;
      setMetrics(nextMetrics);
      recordSample(timestamp, nextMetrics);

      frameRef.current = requestAnimationFrame(animationStep);
    },
    [isSimulating, recordSample]
  );

  const start = useCallback(() => {
    if (isRunningRef.current) {
      return;
    }

    const now = getNow();
    startTimeRef.current = now;
    lastFrameTimeRef.current = now;
    lastSampleTimeRef.current = null;
    isRunningRef.current = true;
    setIsRunning(true);
    frameRef.current = requestAnimationFrame(animationStep);
  }, [animationStep]);

  const stop = useCallback(() => {
    if (!isRunningRef.current) {
      return;
    }

    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    isRunningRef.current = false;
    setIsRunning(false);
  }, []);

  const reset = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const nextMetrics = { ...initialMetrics };
    metricsRef.current = nextMetrics;
    setMetrics(nextMetrics);
    setSamples([]);
    isRunningRef.current = false;
    setIsRunning(false);
    startTimeRef.current = null;
    lastFrameTimeRef.current = null;
    lastSampleTimeRef.current = null;
  }, [initialMetrics]);

  const updateMetrics = useCallback(
    (next: Partial<Metrics> | ((current: Metrics) => Partial<Metrics>)) => {
      setMetrics((current) => {
        const patch = typeof next === "function" ? next(current) : next;
        const merged: Metrics = {
          power: clampPositive(patch.power ?? current.power),
          cadence: clampPositive(patch.cadence ?? current.cadence),
          speed: clampPositive(patch.speed ?? current.speed),
          distance: clampPositive(patch.distance ?? current.distance),
          hr: clampPositive(patch.hr ?? current.hr),
        };
        metricsRef.current = merged;
        return merged;
      });
    },
    []
  );

  const setSimulating = useCallback((enabled: boolean) => {
    setIsSimulating(enabled);
  }, []);

  useEffect(() => {
    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
      isRunningRef.current = false;
    };
  }, []);

  return {
    metrics,
    samples,
    isRunning,
    isSimulating,
    start,
    stop,
    reset,
    updateMetrics,
    setSimulating,
  };
};

export default useMetrics;
