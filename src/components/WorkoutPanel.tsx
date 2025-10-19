import React from "react";
import Metric from "./Metric";
import { WorkoutPlan } from "../types";

type TargetMetric = {
  label: string;
  value: number | string;
  unit?: string;
  precision?: number;
};

type WorkoutPanelProps = {
  /** All available workout plans for the athlete. */
  workouts: WorkoutPlan[];
  /** Identifier of the currently active workout, if any. */
  activeWorkoutId?: string | null;
  /** Index of the currently active interval within the workout. */
  currentIntervalIndex?: number;
  /** Total elapsed workout time in seconds. */
  overallElapsedSeconds?: number;
  /** Elapsed time inside the current interval in seconds. */
  intervalElapsedSeconds?: number;
  /** Optional metrics to display alongside the active interval. */
  targetMetrics?: TargetMetric[];
  /** Callback for when a workout plan should start. */
  onStartWorkout?: (planId: string) => void;
};

const sumDurations = (plan?: WorkoutPlan | null): number => {
  if (!plan) {
    return 0;
  }

  return plan.intervals.reduce((total, interval) => total + Math.max(interval.duration, 0), 0);
};

const clampIndex = (value: number, maxExclusive: number): number => {
  if (Number.isNaN(value) || value < 0) {
    return 0;
  }

  return Math.min(value, Math.max(maxExclusive - 1, 0));
};

const formatSeconds = (seconds: number): string => {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = Math.floor(safeSeconds % 60);

  return `${minutes.toString().padStart(2, "0")}:${remainingSeconds
    .toString()
    .padStart(2, "0")}`;
};

const WorkoutPanel: React.FC<WorkoutPanelProps> = ({
  workouts,
  activeWorkoutId = null,
  currentIntervalIndex = 0,
  overallElapsedSeconds = 0,
  intervalElapsedSeconds = 0,
  targetMetrics,
  onStartWorkout,
}) => {
  const activeWorkout = workouts.find((plan) => plan.id === activeWorkoutId) ?? null;
  const totalDuration = sumDurations(activeWorkout);

  const normalizedIntervalIndex = activeWorkout
    ? clampIndex(currentIntervalIndex, activeWorkout.intervals.length)
    : 0;
  const currentInterval = activeWorkout?.intervals[normalizedIntervalIndex] ?? null;
  const intervalDuration = currentInterval?.duration ?? 0;
  const intervalRemaining = Math.max(intervalDuration - intervalElapsedSeconds, 0);

  const overallProgress = totalDuration > 0
    ? Math.min(Math.max(overallElapsedSeconds / totalDuration, 0), 1)
    : 0;
  const intervalProgress = intervalDuration > 0
    ? Math.min(Math.max(intervalElapsedSeconds / intervalDuration, 0), 1)
    : 0;

  const resolvedTargetMetrics: TargetMetric[] = React.useMemo(() => {
    if (targetMetrics && targetMetrics.length > 0) {
      return targetMetrics;
    }

    if (currentInterval) {
      return [
        {
          label: "Target Power",
          value: currentInterval.targetPower,
          unit: "W",
        },
      ];
    }

    return [];
  }, [currentInterval, targetMetrics]);

  return (
    <section
      className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white/70 p-6 shadow-sm backdrop-blur"
      aria-label="Workout management panel"
    >
      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-slate-900">Workout</h2>
          {activeWorkout ? (
            <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-sky-700">
              Active
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              Idle
            </span>
          )}
        </div>
        {activeWorkout ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span className="font-medium text-slate-800">{activeWorkout.name}</span>
              <span>{Math.round(overallProgress * 100)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-sky-500 transition-all"
                style={{ width: `${overallProgress * 100}%` }}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(overallProgress * 100)}
                aria-label="Overall workout progress"
              />
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{formatSeconds(overallElapsedSeconds)}</span>
              <span>{formatSeconds(totalDuration)}</span>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Choose a workout from the list to begin your training session.
          </p>
        )}
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section
          className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm"
          aria-label="Workout interval timer"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Interval Timer</h3>
            {activeWorkout && currentInterval ? (
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Interval {normalizedIntervalIndex + 1} of {activeWorkout.intervals.length}
              </span>
            ) : null}
          </div>
          {activeWorkout && currentInterval ? (
            <>
              <div className="flex items-baseline justify-between text-sm text-slate-600">
                <span>Elapsed</span>
                <span>{formatSeconds(intervalElapsedSeconds)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${intervalProgress * 100}%` }}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(intervalProgress * 100)}
                  aria-label="Interval progress"
                />
              </div>
              <div className="flex items-baseline justify-between text-sm text-slate-600">
                <span>Remaining</span>
                <span>{formatSeconds(intervalRemaining)}</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              Start a workout to see live interval timing updates.
            </p>
          )}
        </section>

        <section
          className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm"
          aria-label="Target metrics"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Target Metrics</h3>
            {activeWorkout && currentInterval ? (
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Current Interval
              </span>
            ) : null}
          </div>
          {resolvedTargetMetrics.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {resolvedTargetMetrics.map((metric) => (
                <Metric
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  unit={metric.unit}
                  precision={metric.precision}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No target metrics available.</p>
          )}
        </section>
      </div>

      <section
        className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/90 p-4 shadow-sm"
        aria-label="Workout list"
      >
        <h3 className="text-lg font-semibold text-slate-900">Available Workouts</h3>
        {workouts.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {workouts.map((plan) => {
              const planDuration = sumDurations(plan);
              const isActive = activeWorkout?.id === plan.id;

              return (
                <li
                  key={plan.id}
                  className={`flex flex-col gap-3 rounded-lg border p-4 transition-colors ${
                    isActive
                      ? "border-sky-300 bg-sky-50/60"
                      : "border-transparent bg-white"
                  }`}
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col">
                      <span className="text-base font-semibold text-slate-900">{plan.name}</span>
                      <span className="text-xs uppercase tracking-wide text-slate-500">
                        {plan.intervals.length} intervals · {formatSeconds(planDuration)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onStartWorkout?.(plan.id)}
                      className={`inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${
                        isActive
                          ? "bg-slate-200 text-slate-600"
                          : "bg-sky-600 text-white hover:bg-sky-500"
                      }`}
                      disabled={isActive}
                    >
                      {isActive ? "In Progress" : "Start"}
                    </button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {plan.intervals.map((interval, index) => (
                      <div
                        key={`${plan.id}-interval-${index}`}
                        className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600"
                      >
                        <span>Interval {index + 1}</span>
                        <span>
                          {formatSeconds(interval.duration)} · {interval.targetPower} W
                        </span>
                      </div>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">No workouts available.</p>
        )}
      </section>
    </section>
  );
};

export default WorkoutPanel;
