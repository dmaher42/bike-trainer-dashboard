import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Sample } from "./types";
import { useMetrics } from "./hooks/useMetrics";
import { downloadCSV } from "./utils/metricsUtils";
import { Metric } from "./components/Metric";
import { useRoute } from "./hooks/useRoute";
import VirtualMap from "./components/VirtualMap";
import RouteLoader from "./components/RouteLoader";
import { GPXDebugPanel } from "./components/GPXDebugPanel";
import { useSettings } from "./hooks/useSettings";
import useBluetooth from "./hooks/useBluetooth";
import useWorkout from "./hooks/useWorkout";
import { useTrainerControl } from "./hooks/useTrainerControl";
import { useRideHistory } from "./hooks/useRideHistory";
import { ModernHeader } from "./components/ModernHeader";
import { ModernNavigation } from "./components/ModernNavigation";
import { ModernControls } from "./components/ModernControls";
import { LoadingSpinner } from "./components/LoadingStates";

const DEVICE_KEYS = ["ftms", "cps", "hr"] as const;

type DeviceKey = (typeof DEVICE_KEYS)[number];

const DEVICE_LABELS: Record<DeviceKey, string> = {
  ftms: "Smart Trainer",
  cps: "Cadence Sensor",
  hr: "Heart Rate Monitor",
};

function App() {
  type AppTab = "dashboard" | "workouts" | "analysis" | "routes" | "settings";

  const [sim, setSim] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>("dashboard");
  const [rideOn, setRideOn] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [waypoints, setWaypoints] = useState<{ x: number; y: number }[]>([]);

  const { settings, updateSetting } = useSettings();

  const {
    metrics,
    samples,
    elapsed,
    startRide,
    stopRide,
    resetRide,
  } = useMetrics(sim, rideOn);

  const {
    route,
    isLoading,
    error,
    lastLoadedFile,
    loadGPX,
    resetToDefault,
    clearError,
  } = useRoute();

  const {
    environment: env,
    connectedDevices: devices,
    statuses,
    errors,
    disconnect,
  } = useBluetooth();
  const { isActive: activeWorkout, targetPower, targetCadence } = useWorkout();
  const { saveRide } = useRideHistory();

  const ftmsDevice = devices.ftms;
  const { setTargetPower, initializeControl } = useTrainerControl(ftmsDevice);

  const isConnecting = useMemo(
    () => ({
      ftms: statuses.ftms === "connecting" || statuses.ftms === "requesting",
      cps: statuses.cps === "connecting" || statuses.cps === "requesting",
      hr: statuses.hr === "connecting" || statuses.hr === "requesting",
    }),
    [statuses],
  );

  const bluetoothStatusMessage = useMemo(() => {
    const activeConnection = DEVICE_KEYS.find((key) =>
      ["connecting", "requesting"].includes(statuses[key] ?? ""),
    );
    if (activeConnection) {
      return `Connecting to ${DEVICE_LABELS[activeConnection]}...`;
    }

    const deviceError = DEVICE_KEYS.find((key) => Boolean(errors[key]));
    if (deviceError) {
      return `${DEVICE_LABELS[deviceError]}: ${errors[deviceError]}`;
    }

    const connectedCount = DEVICE_KEYS.filter((key) => devices[key]?.connected).length;
    if (connectedCount > 0) {
      return `${connectedCount} device${connectedCount > 1 ? "s" : ""} connected`;
    }

    if (env.canUse === false) {
      return "Bluetooth unavailable in this environment.";
    }

    return null;
  }, [devices, env.canUse, errors, statuses]);

  const handleDisconnectAll = useCallback(() => {
    DEVICE_KEYS.forEach((key) => {
      const device = devices[key];
      if (device?.connected) {
        disconnect(key);
      }
    });
  }, [devices, disconnect]);

  const handleSimToggle = useCallback(
    (enabled: boolean) => {
      setSim(enabled);
      updateSetting("autoStartRide", enabled);
    },
    [updateSetting],
  );

  useEffect(() => {
    setSim(settings.autoStartRide);
  }, [settings.autoStartRide]);

  useEffect(() => {
    if (ftmsDevice?.connected) {
      void initializeControl(ftmsDevice);
    }
  }, [ftmsDevice?.connected, ftmsDevice, initializeControl]);

  useEffect(() => {
    if (activeWorkout && targetPower && ftmsDevice?.connected) {
      void setTargetPower(targetPower);
    }
  }, [activeWorkout, targetPower, ftmsDevice?.connected, ftmsDevice, setTargetPower]);

  const handleStartRide = () => {
    if (startRide()) {
      setRideOn(true);
    }
  };

  const handleStopRide = () => {
    if (stopRide()) {
      setRideOn(false);
      if (samples.length > 0 && elapsed > 60) {
        saveRide(samples, elapsed, metrics.distance);
        setStatus("Ride saved!");
      }
    }
  };

  const handleResetRide = () => {
    if (resetRide()) {
      setRideOn(false);
    }
  };

  const handleRouteClick = useCallback((point: { x: number; y: number }) => {
    setWaypoints((prev) => [...prev, point]);
    setStatus(`Waypoint added at (${point.x.toFixed(2)}, ${point.y.toFixed(2)})`);
  }, []);

  return (
    <div className="min-h-screen bg-dark-950 text-dark-50">
      {/* Background elements */}
      <div className="fixed inset-0 bg-gradient-to-br from-primary-900/10 via-transparent to-success-900/10 pointer-events-none" />

      <div className="relative z-10">
        <ModernHeader env={env} devices={devices} sim={sim} onSimToggle={handleSimToggle} />
        <ModernNavigation activeTab={activeTab} onTabChange={(tab) => setActiveTab(tab as AppTab)} />

        <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
          <section className="glass-card p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold text-dark-50">Virtual Route</h2>
                <p className="text-dark-400 text-sm">
                  Follow immersive courses, add waypoints, and let the trainer adjust automatically.
                </p>
              </div>
              <RouteLoader
                route={route}
                isLoading={isLoading}
                error={error}
                onLoadGPX={loadGPX}
                onResetToDefault={resetToDefault}
              />
            </div>

            {lastLoadedFile && (
              <div className="mt-2 text-sm text-success-400">
                Route loaded: {lastLoadedFile}
              </div>
            )}

            {waypoints.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-dark-300">
                <span>Waypoints: {waypoints.length}</span>
                <button
                  onClick={() => {
                    setWaypoints([]);
                    setStatus("Waypoints cleared");
                  }}
                  className="btn-secondary px-4 py-2 text-xs font-medium"
                >
                  Clear
                </button>
              </div>
            )}

            <p className="mt-4 text-sm text-dark-400">
              Tip: Load a .gpx file to follow a real-world route.
            </p>

            <div className="mt-6">
              <GPXDebugPanel route={route} error={error} onClearError={clearError} />
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-6">
              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-4">
                <Metric label="Power" value={metrics.power} unit="W" target={targetPower} />
                <Metric label="Cadence" value={metrics.cadence} unit="rpm" target={targetCadence} />
                <Metric label="Speed" value={metrics.speed} unit="kph" />
                <Metric label="Distance" value={metrics.distance} unit="km" />
                <Metric label="Heart Rate" value={metrics.hr} unit="bpm" />
                <Metric label="Elapsed" value={elapsed} unit="" />
              </div>

              {/* Controls */}
              <div className="glass-card p-6">
                <ModernControls
                  rideOn={rideOn}
                  onStartRide={handleStartRide}
                  onStopRide={handleStopRide}
                  onResetRide={handleResetRide}
                  onExportCSV={() => downloadCSV(`ride-${new Date().toISOString()}.csv`, samples)}
                  samples={samples}
                />
              </div>

              {/* Status */}
              {status && (
                <div className="glass-card p-4">
                  <div className="flex items-center gap-3">
                    <LoadingSpinner size="sm" />
                    <span className="text-dark-300">{status}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Virtual Map */}
            <div className="lg:col-span-2">
              <VirtualMap
                route={route}
                metrics={metrics}
                waypoints={waypoints}
                onRouteClick={handleRouteClick}
                showRouteInfo={true}
              />
            </div>
          </section>

          {activeTab === "settings" && (
            <section className="glass-card p-6">
              <h2 className="text-2xl font-semibold text-dark-50">Settings</h2>
              <p className="text-sm text-dark-400 mt-1">
                Configure how the dashboard behaves and personalize your experience.
              </p>

              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-dark-200">Data Recording</h3>
                  <label className="flex items-center gap-3 text-dark-300">
                    <input
                      type="checkbox"
                      checked={settings.dataRecording}
                      onChange={(e) => updateSetting("dataRecording", e.target.checked)}
                    />
                    <span>Record ride data automatically</span>
                  </label>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-dark-200">Units</h3>
                  <div className="flex flex-col gap-3 text-dark-300">
                    <label className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="units"
                        value="metric"
                        checked={settings.units === "metric"}
                        onChange={() => updateSetting("units", "metric")}
                      />
                      <span>Metric (km/h, km)</span>
                    </label>
                    <label className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="units"
                        value="imperial"
                        checked={settings.units === "imperial"}
                        onChange={() => updateSetting("units", "imperial")}
                      />
                      <span>Imperial (mph, miles)</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-4 md:col-span-2">
                  <h3 className="text-lg font-medium text-dark-200">Display</h3>
                  <label className="flex items-center gap-3 text-dark-300">
                    <input
                      type="checkbox"
                      checked={settings.showAnimations}
                      onChange={(e) => updateSetting("showAnimations", e.target.checked)}
                    />
                    <span>Show animations</span>
                  </label>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
