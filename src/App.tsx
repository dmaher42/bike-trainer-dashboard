import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import BluetoothConnectPanel from "./components/BluetoothConnectPanel";
import EnvDiagnostics from "./components/EnvDiagnostics";
import Metric from "./components/Metric";
import MetricsChart from "./components/MetricsChart";
import RouteLoader from "./components/RouteLoader";
import VirtualMap from "./components/VirtualMap";
import WorkoutPanel from "./components/WorkoutPanel";
import useBluetooth from "./hooks/useBluetooth";
import useMetrics from "./hooks/useMetrics";
import useRoute from "./hooks/useRoute";
import { useWorkout } from "./hooks/useWorkout";
import { downloadCSV, formatTime } from "./utils/metricsUtils";
import defaultWorkouts from "./utils/workoutPlans";
import type { BluetoothDevice } from "./types";

const TABS = [
  { key: "dashboard", label: "Dashboard", description: "Live ride overview" },
  { key: "workouts", label: "Workouts", description: "Structured training" },
  { key: "analysis", label: "Analysis", description: "Review ride data" },
  { key: "settings", label: "Settings", description: "Environment & preferences" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const FTP_ESTIMATE = 260;

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [isSimulatorEnabled, setSimulatorEnabled] = useState(true);
  const [rideStartedAt, setRideStartedAt] = useState<Date | null>(null);
  const [lastExportedAt, setLastExportedAt] = useState<Date | null>(null);
  const [autoPauseOnAnalysis, setAutoPauseOnAnalysis] = useState(true);
  const [activeWorkoutId, setActiveWorkoutId] = useState<string | null>(
    defaultWorkouts[0]?.id ?? null,
  );
  const [workoutPlans] = useState(defaultWorkouts);
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null);

  const {
    metrics,
    samples,
    isRunning,
    isSimulating,
    start: startRideMetrics,
    stop: stopRideMetrics,
    reset: resetRideMetrics,
    setSimulating,
  } = useMetrics({ sampleThrottleMs: 2_000, simulate: isSimulatorEnabled });

  const {
    environment,
    statuses,
    errors,
    connectedDevices,
    refreshEnvironment,
    disconnect,
  } = useBluetooth();

  const {
    route,
    isLoading: isRouteLoading,
    error: routeError,
    loadGpxFile,
    resetRoute,
  } = useRoute();

  const {
    isActive: isWorkoutActive,
    elapsed: workoutElapsed,
    intervalElapsed,
    currentIntervalIndex,
    currentInterval,
    targetPower,
    targetCadence,
    totalDuration,
    start: startWorkout,
    stop: stopWorkout,
    reset: resetWorkout,
    setPlan,
  } = useWorkout({ plan: defaultWorkouts[0] ?? null });

  const wasScanningRef = useRef(false);

  const activePlan = useMemo(
    () => workoutPlans.find((plan) => plan.id === activeWorkoutId) ?? null,
    [workoutPlans, activeWorkoutId],
  );

  const nextInterval = useMemo(() => {
    if (!activePlan) {
      return null;
    }

    return activePlan.intervals[currentIntervalIndex + 1] ?? null;
  }, [activePlan, currentIntervalIndex]);

  const connectedDevicesList = useMemo(
    () =>
      (Object.values(connectedDevices).filter(Boolean) as BluetoothDevice[]).map((device) => ({
        ...device,
        connected: true,
      })),
    [connectedDevices],
  );

  const connectedDeviceEntries = useMemo(
    () =>
      Object.entries(connectedDevices).filter(
        (entry): entry is [keyof typeof statuses, BluetoothDevice] => Boolean(entry[1]),
      ),
    [connectedDevices],
  );

  const isScanning = useMemo(
    () =>
      Object.values(statuses).some(
        (status) => status === "connecting" || status === "requesting",
      ),
    [statuses],
  );

  const rideDurationSeconds = samples.length > 0 ? samples[samples.length - 1].elapsed : 0;

  const targetPowerWatts = Math.round(targetPower * FTP_ESTIMATE);

  const averageSpeed = rideDurationSeconds > 0
    ? metrics.distance / (rideDurationSeconds / 3_600)
    : 0;

  const workoutProgress = totalDuration > 0
    ? Math.min(Math.round((workoutElapsed / totalDuration) * 100), 100)
    : 0;

  const bluetoothErrorMessage = useMemo(
    () => Object.values(errors)[0] ?? null,
    [errors],
  );

  const summaryMetrics = useMemo(
    () => [
      {
        label: "Power",
        value: Math.round(metrics.power),
        unit: "W",
        target: targetPowerWatts > 0 ? targetPowerWatts : undefined,
      },
      {
        label: "Cadence",
        value: Math.round(metrics.cadence),
        unit: "rpm",
        target: targetCadence > 0 ? Math.round(targetCadence) : undefined,
      },
      {
        label: "Speed",
        value: metrics.speed,
        unit: "km/h",
        precision: 1,
      },
      {
        label: "Distance",
        value: metrics.distance,
        unit: "km",
        precision: 2,
      },
      {
        label: "Heart Rate",
        value: Math.round(metrics.hr),
        unit: "bpm",
      },
    ],
    [metrics, targetCadence, targetPowerWatts],
  );

  const powerSamples = useMemo(
    () => samples.map((sample) => ({ timestamp: sample.timestamp, value: sample.power })),
    [samples],
  );
  const speedSamples = useMemo(
    () => samples.map((sample) => ({ timestamp: sample.timestamp, value: sample.speed })),
    [samples],
  );
  const cadenceSamples = useMemo(
    () => samples.map((sample) => ({ timestamp: sample.timestamp, value: sample.cadence })),
    [samples],
  );
  const heartRateSamples = useMemo(
    () => samples.map((sample) => ({ timestamp: sample.timestamp, value: sample.hr })),
    [samples],
  );

  useEffect(() => {
    setSimulating(isSimulatorEnabled);
  }, [isSimulatorEnabled, setSimulating]);

  useEffect(() => {
    if (isSimulating !== isSimulatorEnabled) {
      setSimulatorEnabled(isSimulating);
    }
  }, [isSimulating, isSimulatorEnabled]);

  useEffect(() => {
    if (!autoPauseOnAnalysis || activeTab !== "analysis") {
      return;
    }

    if (isRunning) {
      stopRideMetrics();
    }

    if (isWorkoutActive) {
      stopWorkout();
    }
  }, [
    activeTab,
    autoPauseOnAnalysis,
    isRunning,
    isWorkoutActive,
    stopRideMetrics,
    stopWorkout,
  ]);

  useEffect(() => {
    if (isScanning) {
      wasScanningRef.current = true;
      return;
    }

    if (wasScanningRef.current) {
      wasScanningRef.current = false;
      setLastScanAt(new Date());
    }
  }, [isScanning]);

  const handleTabChange = useCallback(
    (nextTab: TabKey) => {
      setActiveTab(nextTab);
    },
    [],
  );

  const handleStartRide = useCallback(() => {
    if (!isRunning) {
      startRideMetrics();
      setRideStartedAt((prev) => prev ?? new Date());
    }

    if (activeWorkoutId && !isWorkoutActive && workoutPlans.length > 0) {
      startWorkout();
    }
  }, [activeWorkoutId, isRunning, isWorkoutActive, startRideMetrics, startWorkout, workoutPlans]);

  const handlePauseRide = useCallback(() => {
    if (isRunning) {
      stopRideMetrics();
    }

    if (isWorkoutActive) {
      stopWorkout();
    }
  }, [isRunning, isWorkoutActive, stopRideMetrics, stopWorkout]);

  const handleResetRide = useCallback(() => {
    resetRideMetrics();
    resetWorkout();
    setRideStartedAt(null);
    setLastExportedAt(null);
  }, [resetRideMetrics, resetWorkout]);

  const handleStartWorkout = useCallback(
    (planId: string) => {
      const plan = workoutPlans.find((item) => item.id === planId);
      if (!plan) {
        return;
      }

      setPlan(plan);
      setActiveWorkoutId(planId);
      resetWorkout();
      startWorkout();

      if (!isRunning) {
        startRideMetrics();
      }

      setRideStartedAt((prev) => prev ?? new Date());
    },
    [isRunning, resetWorkout, setPlan, startRideMetrics, startWorkout, workoutPlans],
  );

  const handleSimulatorToggle = useCallback(() => {
    setSimulatorEnabled((previous) => !previous);
  }, []);

  const handleExportData = useCallback(() => {
    if (samples.length === 0) {
      return;
    }

    const timestamp = (rideStartedAt ?? new Date())
      .toISOString()
      .replace(/[:.]/g, "-");

    downloadCSV(samples, `ride-${timestamp}.csv`);
    setLastExportedAt(new Date());
  }, [rideStartedAt, samples]);

  const handleRefreshEnvironment = useCallback(() => {
    void refreshEnvironment().then(() => {
      setLastScanAt(new Date());
    });
  }, [refreshEnvironment]);

  const rideStatusLabel = isRunning ? "Riding" : "Paused";

  const renderDashboard = () => (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {summaryMetrics.map((metric) => (
            <Metric key={metric.label} {...metric} />
          ))}
        </div>

        <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Ride Status</h2>
              <p className="text-sm text-slate-500">
                {rideStartedAt
                  ? `Started ${rideStartedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : "Waiting to start"}
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                isRunning ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
              }`}
            >
              {rideStatusLabel}
            </span>
          </header>

          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={handleStartRide}
              className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={isRunning && isWorkoutActive}
            >
              {isRunning ? "Resume Ride" : "Start Ride"}
            </button>
            <button
              type="button"
              onClick={handlePauseRide}
              className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!isRunning && !isWorkoutActive}
            >
              Pause
            </button>
            <button
              type="button"
              onClick={handleResetRide}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
            >
              Reset
            </button>
          </div>

          <div className="flex flex-col gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-800">Ride time</span>
              <span>{formatTime(rideDurationSeconds)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-800">Simulation</span>
              <button
                type="button"
                onClick={handleSimulatorToggle}
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                  isSimulatorEnabled
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-200 text-slate-600"
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${isSimulatorEnabled ? "bg-emerald-500" : "bg-slate-400"}`} />
                {isSimulatorEnabled ? "Enabled" : "Disabled"}
              </button>
            </div>
          </div>
        </section>

        <VirtualMap route={route} metrics={metrics} />
      </div>

      <div className="flex flex-col gap-6">
        <BluetoothConnectPanel />
        <RouteLoader
          route={route}
          isLoading={isRouteLoading}
          error={routeError}
          loadGpxFile={loadGpxFile}
          resetRoute={resetRoute}
        />
      </div>
    </div>
  );

  const renderWorkouts = () => {
    const intervalRemaining = currentInterval
      ? Math.max(currentInterval.duration - intervalElapsed, 0)
      : 0;
    const nextTargetPower = nextInterval
      ? Math.round(nextInterval.targetPower * FTP_ESTIMATE)
      : null;

    return (
      <div className="flex flex-col gap-6">
        <WorkoutPanel
          workouts={workoutPlans}
          activeWorkoutId={activeWorkoutId}
          currentIntervalIndex={currentIntervalIndex}
          overallElapsedSeconds={workoutElapsed}
          intervalElapsedSeconds={intervalElapsed}
          targetMetrics={[
            {
              label: "Target Power",
              value: targetPowerWatts > 0 ? targetPowerWatts : null,
              unit: "W",
            },
            {
              label: "Target Cadence",
              value: targetCadence > 0 ? Math.round(targetCadence) : null,
              unit: "rpm",
            },
          ]}
          onStartWorkout={handleStartWorkout}
        />

        <section className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm">
          <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Active Interval Insights</h2>
              <p className="text-sm text-slate-500">
                Monitor your structured workout progress and upcoming efforts.
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
              {isWorkoutActive ? "Workout running" : "Workout paused"}
            </span>
          </header>

          {currentInterval ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <dl className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Current target
                </dt>
                <dd className="mt-2 text-2xl font-semibold text-slate-900">
                  {targetPowerWatts > 0 ? `${targetPowerWatts} W` : "-"}
                </dd>
                <dd className="text-sm text-slate-500">
                  Cadence goal: {targetCadence > 0 ? `${Math.round(targetCadence)} rpm` : "--"}
                </dd>
              </dl>
              <dl className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Timing
                </dt>
                <dd className="mt-2 text-2xl font-semibold text-slate-900">
                  {formatTime(intervalRemaining)} remaining
                </dd>
                <dd className="text-sm text-slate-500">
                  Elapsed {formatTime(intervalElapsed)}
                </dd>
              </dl>
              <dl className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Next interval
                </dt>
                <dd className="mt-2 text-2xl font-semibold text-slate-900">
                  {nextInterval
                    ? `${Math.round(nextInterval.duration)}s at ${
                        nextTargetPower ? `${nextTargetPower} W` : `${Math.round(nextInterval.targetPower * 100)}%`
                      }`
                    : "Cool-down"}
                </dd>
                <dd className="text-sm text-slate-500">
                  {nextInterval
                    ? "Prepare for the next effort"
                    : "Final interval or recovery"}
                </dd>
              </dl>
              <dl className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Workout progress
                </dt>
                <dd className="mt-2 text-2xl font-semibold text-slate-900">{workoutProgress}%</dd>
                <dd className="text-sm text-slate-500">
                  {formatTime(workoutElapsed)} of {formatTime(totalDuration)}
                </dd>
              </dl>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Choose a workout from the list to receive detailed guidance and timing insights.
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleStartRide}
              className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={isWorkoutActive && isRunning}
            >
              Resume workout
            </button>
            <button
              type="button"
              onClick={handlePauseRide}
              className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!isWorkoutActive}
            >
              Pause workout
            </button>
            <button
              type="button"
              onClick={handleResetRide}
              className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
            >
              Reset session
            </button>
          </div>
        </section>
      </div>
    );
  };

  const renderAnalysis = () => (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Ride Summary</h2>
            <p className="text-sm text-slate-500">
              Review the current session before exporting your training data.
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportData}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={samples.length === 0}
          >
            Export ride CSV
          </button>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <dl className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Duration</dt>
            <dd className="mt-2 text-2xl font-semibold text-slate-900">{formatTime(rideDurationSeconds)}</dd>
          </dl>
          <dl className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Distance</dt>
            <dd className="mt-2 text-2xl font-semibold text-slate-900">{metrics.distance.toFixed(2)} km</dd>
          </dl>
          <dl className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Average speed</dt>
            <dd className="mt-2 text-2xl font-semibold text-slate-900">
              {averageSpeed > 0 ? `${averageSpeed.toFixed(1)} km/h` : "--"}
            </dd>
          </dl>
          <dl className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Samples recorded</dt>
            <dd className="mt-2 text-2xl font-semibold text-slate-900">{samples.length}</dd>
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
          {lastExportedAt ? (
            <span>Last export {lastExportedAt.toLocaleTimeString()}</span>
          ) : (
            <span>Data exports include every recorded sample in CSV format.</span>
          )}
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
            {samples.length > 0 ? "Live recording" : "Awaiting data"}
          </span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <MetricsChart
          data={powerSamples}
          ariaLabel="Power trace"
          caption="Power output (watts)"
          color="#f97316"
        />
        <MetricsChart
          data={speedSamples}
          ariaLabel="Speed trace"
          caption="Speed (km/h)"
          color="#0ea5e9"
        />
        <MetricsChart
          data={cadenceSamples}
          ariaLabel="Cadence trace"
          caption="Cadence (rpm)"
          color="#6366f1"
        />
        <MetricsChart
          data={heartRateSamples}
          ariaLabel="Heart-rate trace"
          caption="Heart rate (bpm)"
          color="#ef4444"
        />
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm">
        <header className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-slate-900">Preferences</h2>
          <p className="text-sm text-slate-500">
            Adjust simulator behaviour and automatic ride management preferences.
          </p>
        </header>

        <div className="flex flex-col gap-4">
          <label className="flex items-center justify-between gap-4">
            <div>
              <span className="text-sm font-medium text-slate-800">Simulator mode</span>
              <p className="text-xs text-slate-500">Use the built-in data generator when hardware is unavailable.</p>
            </div>
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              checked={isSimulatorEnabled}
              onChange={(event) => setSimulatorEnabled(event.target.checked)}
            />
          </label>

          <label className="flex items-center justify-between gap-4">
            <div>
              <span className="text-sm font-medium text-slate-800">Auto-pause on analysis</span>
              <p className="text-xs text-slate-500">Pause the ride when switching away from live dashboards.</p>
            </div>
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
              checked={autoPauseOnAnalysis}
              onChange={(event) => setAutoPauseOnAnalysis(event.target.checked)}
            />
          </label>

          <button
            type="button"
            onClick={handleRefreshEnvironment}
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Re-check environment
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm">
        <header className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-slate-900">Connected devices</h2>
          <p className="text-sm text-slate-500">Manage paired trainers and sensors.</p>
        </header>

        {connectedDeviceEntries.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {connectedDeviceEntries.map(([kind, device]) => (
              <li
                key={kind}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm"
              >
                <div className="flex flex-col">
                  <span className="text-base font-semibold text-slate-900">{device.name}</span>
                  <span className="text-xs uppercase tracking-wide text-slate-500">ID: {device.id}</span>
                </div>
                <button
                  type="button"
                  onClick={() => disconnect(kind)}
                  className="inline-flex items-center justify-center rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-rose-600 transition hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
                >
                  Disconnect
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            No bluetooth devices connected yet. Use the dashboard tab to pair a trainer or sensor.
          </p>
        )}
      </section>

      <EnvDiagnostics
        environment={environment}
        connectedDevices={connectedDevicesList}
        isScanning={isScanning}
        lastScanAt={lastScanAt}
        errorMessage={bluetoothErrorMessage}
      />
    </div>
  );

  const renderActiveTab = () => {
    switch (activeTab) {
      case "workouts":
        return renderWorkouts();
      case "analysis":
        return renderAnalysis();
      case "settings":
        return renderSettings();
      case "dashboard":
      default:
        return renderDashboard();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 pb-16">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 pt-10 sm:px-6 lg:px-10">
        <header className="flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Bike Trainer Dashboard
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Monitor smart trainer metrics, manage structured workouts, and export your indoor training data from a single, responsive interface.
            </p>
          </div>

          <nav className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-800/60 p-2 shadow-lg ring-1 ring-white/5 backdrop-blur">
            {TABS.map((tab) => {
              const isActive = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => handleTabChange(tab.key)}
                  className={`flex flex-col gap-1 rounded-xl px-4 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
                    isActive
                      ? "bg-white text-slate-900 shadow"
                      : "text-slate-200 hover:bg-white/10"
                  }`}
                >
                  <span className="text-sm font-semibold uppercase tracking-wide">
                    {tab.label}
                  </span>
                  <span className="text-xs text-slate-400">{tab.description}</span>
                </button>
              );
            })}
          </nav>
        </header>

        <main className="flex-1">
          <div className="mx-auto flex w-full flex-col gap-6 rounded-3xl bg-white/5 p-4 shadow-xl ring-1 ring-white/10 backdrop-blur-xl sm:p-6 lg:p-8">
            {renderActiveTab()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
