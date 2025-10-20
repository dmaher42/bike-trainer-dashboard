import React, { useCallback, useEffect, useState } from "react";
import { Sample } from "./types";
import { useMetrics } from "./hooks/useMetrics";
import { downloadCSV } from "./utils/metricsUtils";
import { Metric } from "./components/Metric";
import { useRoute } from "./hooks/useRoute";
import VirtualMap from "./components/VirtualMap";
import RouteLoader from "./components/RouteLoader";
import { useSettings } from "./hooks/useSettings";
import useBluetooth from "./hooks/useBluetooth";
import useWorkout from "./hooks/useWorkout";
import { useTrainerControl } from "./hooks/useTrainerControl";

function App() {
  const [sim, setSim] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "settings">("dashboard");
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
    loadGPX,
    resetToDefault,
  } = useRoute();

  const { connectedDevices: devices } = useBluetooth();
  const { isActive: activeWorkout, targetPower } = useWorkout();

  const ftmsDevice = devices.ftms;
  const { setTargetPower, initializeControl } = useTrainerControl(ftmsDevice);

  useEffect(() => {
    setSim(settings.autoStartRide);
  }, [settings.autoStartRide]);

  useEffect(() => {
    if (ftmsDevice?.connected) {
      void initializeControl(ftmsDevice);
    }
  }, [ftmsDevice?.connected, ftmsDevice, initializeControl]);

  useEffect(() => {
    if (activeWorkout && ftmsDevice?.connected) {
      void setTargetPower(targetPower ?? 0);
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
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="max-w-6xl mx-auto p-6">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold">Bike Trainer Dashboard</h1>
            <p className="text-neutral-400 text-sm">
              Connect BLE FTMS/Cycling Power & Heart Rate. If Bluetooth is blocked, the Simulator runs automatically.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <label className="px-3 py-2 rounded-2xl text-sm border border-neutral-700 flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sim}
                onChange={(e) => {
                  setSim(e.target.checked);
                  updateSetting("autoStartRide", e.target.checked);
                }}
              />
              Simulator
            </label>
          </div>
        </header>

        <div className="mt-6 flex gap-2">
          {[
            { label: "Dashboard", value: "dashboard" },
            { label: "Settings", value: "settings" },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value as typeof activeTab)}
              className={`px-4 py-2 rounded-xl border transition-colors ${
                activeTab === tab.value
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-200"
                  : "border-neutral-800 bg-neutral-900/50 text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <section className="mt-6 border border-neutral-800 rounded-2xl p-4 bg-neutral-900/50">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-medium">Virtual Route</h2>
            <RouteLoader
              route={route}
              isLoading={isLoading}
              error={error}
              loadGpxFile={loadGPX}
              resetRoute={resetToDefault}
            />
          </div>
          <VirtualMap route={route} metrics={metrics} onRouteClick={handleRouteClick} />
          {status ? (
            <p className="mt-2 text-sm text-emerald-400" role="status">
              {status}
            </p>
          ) : null}
          {waypoints.length > 0 && (
            <div className="mt-2 text-sm text-neutral-400">
              Waypoints: {waypoints.length}
              <button
                onClick={() => {
                  setWaypoints([]);
                  setStatus("Waypoints cleared");
                }}
                className="ml-2 px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700"
              >
                Clear
              </button>
            </div>
          )}
          <p className="mt-2 text-neutral-400 text-sm">
            Tip: Load a .gpx file to follow a real-world route.
          </p>
        </section>

        {activeTab === "settings" && (
          <div className="mt-6 border border-neutral-800 rounded-2xl p-4 bg-neutral-900/50">
            <h2 className="text-lg font-medium mb-3">Settings</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium mb-2">Data Recording</h3>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.dataRecording}
                    onChange={(e) => updateSetting("dataRecording", e.target.checked)}
                  />
                  <span>Record ride data automatically</span>
                </label>
              </div>
              <div>
                <h3 className="font-medium mb-2">Units</h3>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="units"
                      value="metric"
                      checked={settings.units === "metric"}
                      onChange={() => updateSetting("units", "metric")}
                    />
                    <span>Metric (km/h, km)</span>
                  </label>
                  <label className="flex items-center gap-2">
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
              <div>
                <h3 className="font-medium mb-2">Display</h3>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.showAnimations}
                    onChange={(e) => updateSetting("showAnimations", e.target.checked)}
                  />
                  <span>Show animations</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
