import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { WorkoutInterval, WorkoutPlan } from '../types';

export interface UseWorkoutOptions {
  /** Interval length for the internal timer (ms). */
  tickIntervalMs?: number;
  /** Optional plan to initialise the workout with. */
  plan?: WorkoutPlan | null;
}

export interface WorkoutState {
  isActive: boolean;
  elapsed: number;
  intervalElapsed: number;
  currentIntervalIndex: number;
  currentInterval: WorkoutInterval | null;
  targetPower: number;
  targetCadence: number;
  totalDuration: number;
  progress: number;
}

export interface UseWorkoutResult extends WorkoutState {
  start: (planOverride?: WorkoutPlan | null) => boolean;
  stop: () => boolean;
  reset: () => void;
  setPlan: (nextPlan: WorkoutPlan | null) => void;
}

const DEFAULT_OPTIONS: Required<Pick<UseWorkoutOptions, 'tickIntervalMs'>> = {
  tickIntervalMs: 1_000,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const computeTargetCadence = (power: number) => {
  if (power <= 0) {
    return 0;
  }

  const baseCadence = 85;
  const slope = 0.06;
  const cadence = baseCadence + (power - 200) * slope;
  return Math.round(clamp(cadence, 70, 110));
};

const sumDurations = (intervals: WorkoutInterval[]) =>
  intervals.reduce((total, interval) => total + clamp(interval.duration, 0, Number.MAX_SAFE_INTEGER), 0);

export const useWorkout = (options: UseWorkoutOptions = {}): UseWorkoutResult => {
  const { tickIntervalMs, plan: initialPlan = null } = { ...DEFAULT_OPTIONS, ...options };

  const [plan, setPlan] = useState<WorkoutPlan | null>(initialPlan);
  const [isActive, setIsActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [intervalElapsed, setIntervalElapsed] = useState(0);
  const [currentIntervalIndex, setCurrentIntervalIndex] = useState(0);

  const startTimestampRef = useRef<number | null>(null);
  const intervalStartTimestampRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalDuration = useMemo(() => (plan ? sumDurations(plan.intervals) : 0), [plan]);

  const currentInterval = useMemo(() => {
    if (!plan) {
      return null;
    }

    return plan.intervals[currentIntervalIndex] ?? null;
  }, [plan, currentIntervalIndex]);

  const targetPower = currentInterval?.targetPower ?? 0;
  const targetCadence = useMemo(() => computeTargetCadence(targetPower), [targetPower]);

  const progress = useMemo(() => {
    if (!totalDuration) {
      return 0;
    }

    return clamp(elapsed / totalDuration, 0, 1);
  }, [elapsed, totalDuration]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    if (!isActive) {
      return false;
    }

    clearTimer();
    setIsActive(false);
    return true;
  }, [clearTimer, isActive]);

  const reset = useCallback(() => {
    clearTimer();
    startTimestampRef.current = null;
    intervalStartTimestampRef.current = null;
    setIsActive(false);
    setElapsed(0);
    setIntervalElapsed(0);
    setCurrentIntervalIndex(0);
  }, [clearTimer]);

  const start = useCallback(
    (planOverride?: WorkoutPlan | null) => {
      const resolvedPlan = planOverride ?? plan;
      if (!resolvedPlan || resolvedPlan.intervals.length === 0) {
        return false;
      }

      if (isActive) {
        clearTimer();
      }

      const now = Date.now();
      startTimestampRef.current = now;
      intervalStartTimestampRef.current = now;
      setPlan(resolvedPlan);
      setElapsed(0);
      setIntervalElapsed(0);
      setCurrentIntervalIndex(0);
      setIsActive(true);
      return true;
    },
    [clearTimer, isActive, plan],
  );

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const tick = () => {
      const now = Date.now();
      const startTs = startTimestampRef.current ?? now;
      const intervalStartTs = intervalStartTimestampRef.current ?? now;

      startTimestampRef.current = startTs;
      intervalStartTimestampRef.current = intervalStartTs;

      const nextElapsed = (now - startTs) / 1_000;
      const nextIntervalElapsed = (now - intervalStartTs) / 1_000;

      setElapsed(nextElapsed);
      setIntervalElapsed(nextIntervalElapsed);

      if (!plan) {
        return;
      }

      setCurrentIntervalIndex((prevIndex) => {
        const activeInterval = plan.intervals[prevIndex];
        if (!activeInterval) {
          stop();
          return prevIndex;
        }

        if (nextIntervalElapsed < activeInterval.duration) {
          return prevIndex;
        }

        const nextIndex = prevIndex + 1;
        if (nextIndex >= plan.intervals.length) {
          stop();
          return prevIndex;
        }

        intervalStartTimestampRef.current = now;
        setIntervalElapsed(0);
        return nextIndex;
      });
    };

    timerRef.current = setInterval(tick, tickIntervalMs);

    return () => {
      clearTimer();
    };
  }, [clearTimer, isActive, plan, stop, tickIntervalMs]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  useEffect(() => {
    if (!plan || plan.intervals.length === 0) {
      reset();
      return;
    }

    setCurrentIntervalIndex((prev) => clamp(prev, 0, plan.intervals.length - 1));
  }, [plan, reset]);

  return {
    isActive,
    elapsed,
    intervalElapsed,
    currentIntervalIndex,
    currentInterval,
    targetPower,
    targetCadence,
    totalDuration,
    progress,
    start,
    stop,
    reset,
    setPlan,
  };
};

export default useWorkout;
