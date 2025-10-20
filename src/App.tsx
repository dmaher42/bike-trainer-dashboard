import React, { useCallback, useState } from "react";
import { Sample } from "./types";
import { useMetrics } from "./hooks/useMetrics";
import { downloadCSV } from "./utils/metricsUtils";
import { Metric } from "./components/Metric";
import { useRoute } from "./hooks/useRoute";
import VirtualMap from "./components/VirtualMap";
import RouteLoader from "./components/RouteLoader";

function App() {
  const [sim, setSim] = useState(false);
  const [rideOn, setRideOn] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [waypoints, setWaypoints] = useState<{ x: number; y: number }[]>([]);
  
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
              <input type="checkbox" checked={sim} onChange={(e) => setSim(e.target.checked)} />
              Simulator
            </label>
          </div>
        </header>

        <div className="mt-6 border border-neutral-800 rounded-2xl p-4 bg-neutral-900/50">
          <div className="grid grid-cols-2 gap-3 text-center">
            <Metric label="Power" value={metrics.power} unit="W" />
            <Metric label="Cadence" value={metrics.cadence} unit="rpm" />
            <Metric label="Speed" value={metrics.speed} unit="kph" />
            <Metric label="Distance" value={metrics.distance} unit="km" />
            <Metric label="Heart Rate" value={metrics.hr} unit="bpm" />
            <Metric label="Elapsed" value={elapsed} unit="" />
          </div>
          <div className="mt-4 flex gap-2 flex-wrap">
            {!rideOn ? (
              <button onClick={handleStartRide} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500">Start Ride</button>
            ) : (
              <button onClick={handleStopRide} className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500">Pause</button>
            )}
            <button onClick={handleResetRide} className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700">Reset</button>
            <button
              onClick={() => downloadCSV(`ride-${new Date().toISOString()}.csv`, samples)}
              className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700"
            >
              Export CSV
            </button>
          </div>
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

        <section className="mt-6 border border-neutral-800 rounded-2xl p-4 bg-neutral-900/50">
          <h2 className="text-lg font-medium mb-3">Recent Samples</h2>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-neutral-400">
                <tr>
                  <th className="text-left p-2">Time</th>
                  <th className="text-right p-2">Power</th>
                  <th className="text-right p-2">Cadence</th>
                  <th className="text-right p-2">Speed</th>
                  <th className="text-right p-2">Distance</th>
                  <th className="text-right p-2">HR</th>
                </tr>
              </thead>
              <tbody>
                {samples.slice(-10).map((r, i) => (
                  <tr key={i} className="border-t border-neutral-800">
                    <td className="p-2">{new Date(r.ts).toLocaleTimeString()}</td>
                    <td className="p-2 text-right">{r.power?.toFixed?.(0)}</td>
                    <td className="p-2 text-right">{r.cadence?.toFixed?.(0)}</td>
                    <td className="p-2 text-right">{r.speed?.toFixed?.(1)}</td>
                    <td className="p-2 text-right">{r.distance?.toFixed?.(3)}</td>
                    <td className="p-2 text-right">{r.hr ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

export default App;
