import { useEffect, useState, useRef, useCallback } from "react";
import { Metrics, Sample } from "../types";
import { speedFromPower } from "../utils/metricsUtils";

export function useMetrics(sim: boolean, rideOn: boolean) {
  const [metrics, setMetrics] = useState<Metrics>({
    power: 0,
    cadence: 0,
    speed: 0,
    distance: 0,
    hr: 0,
  });
  const [samples, setSamples] = useState<Sample[]>([]);
  const [startTs, setStartTs] = useState<number | null>(null);
  const lastUpdateRef = useRef<number | null>(null);

  useEffect(() => {
    let rafId: number;
    function tick(ts: number) {
      if (!lastUpdateRef.current) lastUpdateRef.current = ts;
      const dt = (ts - lastUpdateRef.current) / 1000;
      lastUpdateRef.current = ts;

      if (rideOn) {
        setMetrics((m) => {
          const speed = m.speed || (sim ? speedFromPower(m.power) : 0);
          const distance = m.distance + (speed * dt) / 3600;
          return { ...m, distance };
        });
        setSamples((arr) => {
          const now = Date.now();
          const elapsed = startTs ? (now - startTs) / 1000 : 0;
          const m = metrics;
          const row: Sample = {
            ts: now,
            elapsed,
            power: m.power,
            cadence: m.cadence,
            speed: m.speed,
            distance: m.distance,
            hr: m.hr,
          };
          if (arr.length === 0 || now - arr[arr.length - 1].ts > 500) {
            return [...arr, row];
          }
          return arr;
        });
      }
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [rideOn, startTs, sim, metrics]);

  useEffect(() => {
    if (!sim) return;
    let id = setInterval(() => {
      if (!rideOn) return;
      setMetrics((m) => {
        const t = (Date.now() / 1000) % 1000;
        const power = 180 + 40 * Math.sin(t * 0.4) + 20 * Math.cos(t * 0.9);
        const cadence = 85 + 5 * Math.sin(t * 0.7);
        const speed = speedFromPower(power);
        const hr = 120 + Math.round(15 * Math.sin(t * 0.2));
        return { ...m, power, cadence, speed, hr };
      });
    }, 250);
    return () => clearInterval(id);
  }, [sim, rideOn]);

  const startRide = useCallback(() => {
    if (!startTs) setStartTs(Date.now());
    return true;
  }, [startTs]);

  const stopRide = useCallback(() => {
    return true;
  }, []);

  const resetRide = useCallback(() => {
    setStartTs(null);
    setSamples([]);
    setMetrics({ power: 0, cadence: 0, speed: 0, distance: 0, hr: 0 });
    return true;
  }, []);

  const elapsed = startTs ? (Date.now() - startTs) / 1000 : 0;

  return {
    metrics,
    samples,
    elapsed,
    startRide,
    stopRide,
    resetRide,
  };
}
