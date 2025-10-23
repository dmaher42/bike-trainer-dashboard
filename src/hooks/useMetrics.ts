import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Metrics, Sample } from "../types";
import { computeVirtualSpeedKph } from "../utils/metricsUtils";

const INITIAL_METRICS: Metrics = {
  power: 0,
  cadence: 0,
  speed: 0,
  distance: 0,
  hr: 0,
};

const FTMS_SPEED_STALE_MS = 2000;
const POWER_STALE_MS = 2000;

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

interface SensorState {
  ftmsSpeed: number | null;
  ftmsPower: number | null;
  cpsPower: number | null;
  cadence: number | null;
  hr: number | null;
}

interface UseMetricsOptions {
  usePowerToDriveSpeed?: boolean;
}

type FtmsEventDetail = Partial<Metrics> & { source?: "ftms" | "cps" };

export interface UseMetricsResult {
  metrics: Metrics;
  samples: Sample[];
  elapsed: string;
  startRide: () => boolean;
  stopRide: () => boolean;
  resetRide: () => boolean;
}

export const useMetrics = (
  simulate: boolean,
  rideOn: boolean,
  options: UseMetricsOptions = {},
): UseMetricsResult => {
  const [metrics, setMetrics] = useState<Metrics>(INITIAL_METRICS);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);

  const metricsRef = useRef<Metrics>(INITIAL_METRICS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const distanceRef = useRef(0);
  const sensorStateRef = useRef<SensorState>({
    ftmsSpeed: null,
    ftmsPower: null,
    cpsPower: null,
    cadence: null,
    hr: null,
  });
  const usePowerFallbackRef = useRef<boolean>(options.usePowerToDriveSpeed ?? true);
  const lastFtmsSpeedAtRef = useRef<number | null>(null);
  const lastPowerAtRef = useRef<{ ftms: number | null; cps: number | null }>({
    ftms: null,
    cps: null,
  });

  useEffect(() => {
    usePowerFallbackRef.current = options.usePowerToDriveSpeed ?? true;
  }, [options.usePowerToDriveSpeed]);

  const applyMetricsUpdate = useCallback((updates: Partial<Metrics>) => {
    setMetrics((prev) => {
      const next = { ...prev, ...updates };
      metricsRef.current = next;
      distanceRef.current = next.distance;
      return next;
    });
  }, []);

  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  const computeRealtimeMetrics = () => {
    const previous = metricsRef.current;
    const sensors = sensorStateRef.current;
    const fallbackEnabled = usePowerFallbackRef.current;

    let nextSpeed: number | null = Number.isFinite(sensors.ftmsSpeed ?? NaN)
      ? (sensors.ftmsSpeed as number)
      : null;

    const now = Date.now();
    if (
      nextSpeed != null &&
      lastFtmsSpeedAtRef.current != null &&
      now - lastFtmsSpeedAtRef.current > FTMS_SPEED_STALE_MS
    ) {
      nextSpeed = null;
    }

    const ftmsPowerFresh =
      lastPowerAtRef.current.ftms != null && now - lastPowerAtRef.current.ftms <= POWER_STALE_MS;
    const cpsPowerFresh =
      lastPowerAtRef.current.cps != null && now - lastPowerAtRef.current.cps <= POWER_STALE_MS;

    const ftmsPower =
      ftmsPowerFresh && Number.isFinite(sensors.ftmsPower ?? NaN)
        ? (sensors.ftmsPower as number)
        : null;
    const cpsPower =
      cpsPowerFresh && Number.isFinite(sensors.cpsPower ?? NaN)
        ? (sensors.cpsPower as number)
        : null;

    if ((nextSpeed == null || !Number.isFinite(nextSpeed)) && fallbackEnabled) {
      const powerSource = cpsPower ?? ftmsPower ?? 0;
      nextSpeed = computeVirtualSpeedKph(powerSource);
    }

    const safeSpeed = Math.max(0, Math.min(60, Number.isFinite(nextSpeed ?? NaN) ? (nextSpeed as number) : 0));

    const baseDistance = Number.isFinite(distanceRef.current)
      ? distanceRef.current
      : previous.distance;
    const nextDistance = baseDistance + safeSpeed / 3600;
    distanceRef.current = nextDistance;

    const powerValue = (ftmsPower ?? cpsPower) ?? 0;

    const cadenceValue = Number.isFinite(sensors.cadence ?? NaN)
      ? (sensors.cadence as number)
      : previous.cadence;

    const hrValue = Number.isFinite(sensors.hr ?? NaN) ? (sensors.hr as number) : previous.hr;

    return {
      power: Number.isFinite(powerValue ?? NaN) ? (powerValue as number) : 0,
      cadence: Number.isFinite(cadenceValue ?? NaN) ? (cadenceValue as number) : 0,
      speed: safeSpeed,
      distance: nextDistance,
      hr: Number.isFinite(hrValue ?? NaN) ? (hrValue as number) : 0,
    } satisfies Metrics;
  };

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
        : computeRealtimeMetrics();

      metricsRef.current = nextMetrics;
      distanceRef.current = nextMetrics.distance;
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
      const detail = (event as CustomEvent<FtmsEventDetail>).detail;
      if (!detail) {
        return;
      }

      const source = detail.source ?? "ftms";
      const sensors = sensorStateRef.current;
      const updates: Partial<Metrics> = {};
      if (typeof detail.power === "number") {
        if (source === "ftms") {
          sensors.ftmsPower = detail.power;
          lastPowerAtRef.current.ftms = Date.now();
        } else if (source === "cps") {
          sensors.cpsPower = detail.power;
          lastPowerAtRef.current.cps = Date.now();
        }
        updates.power = detail.power;
      }
      if (typeof detail.cadence === "number") {
        sensors.cadence = detail.cadence;
        updates.cadence = detail.cadence;
      }

      if (source === "ftms") {
        if (typeof detail.speed === "number") {
          if (Number.isFinite(detail.speed)) {
            sensors.ftmsSpeed = detail.speed;
            lastFtmsSpeedAtRef.current = Date.now();
            updates.speed = detail.speed;
          } else {
            sensors.ftmsSpeed = null;
            lastFtmsSpeedAtRef.current = null;
          }
        }
      }
      if (Object.keys(updates).length > 0) {
        applyMetricsUpdate(updates);
      }
    };

    const handleHeartRateData = (event: Event) => {
      const detail = (event as CustomEvent<{ hr?: number }>).detail;
      if (detail && typeof detail.hr === "number") {
        sensorStateRef.current.hr = detail.hr;
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
    distanceRef.current = 0;
    sensorStateRef.current = {
      ftmsSpeed: null,
      ftmsPower: null,
      cpsPower: null,
      cadence: null,
      hr: null,
    };
    lastFtmsSpeedAtRef.current = null;
    lastPowerAtRef.current = { ftms: null, cps: null };
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
