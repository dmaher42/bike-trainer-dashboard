import React, { useState, useEffect } from "react";
import { BluetoothDevice, Metrics, Sample, WorkoutPlan } from "./types";
import { useBluetooth } from "./hooks/useBluetooth";
import { useMetrics } from "./hooks/useMetrics";
import { useRoute } from "./hooks/useRoute";
import { useWorkout } from "./hooks/useWorkout";
import { downloadCSV } from "./utils/metricsUtils";
import Metric from "./components/Metric";
import VirtualMap from "./components/VirtualMap";
import { StreetViewDisplay } from "./components/StreetViewDisplay";
import { StreetViewPlaceholder } from "./components/LoadingStates";
import WorkoutPanel from "./components/WorkoutPanel";
import EnvDiagnostics from "./components/EnvDiagnostics";
import { BluetoothConnectPanel } from "./components/BluetoothConnectPanel";
import RouteLoader from "./components/RouteLoader";
import FixBluetoothModal from "./components/FixBluetoothModal";
import { ViewToggle } from "./components/ViewToggle";

function App() {
  const [sim, setSim] = useState(false);
  const [rideOn, setRideOn] = useState(false);
  const [showFix, setShowFix] = useState(false);
  const [copied, setCopied] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [currentView, setCurrentView] = useState<'virtual' | 'street' | 'mapbox' | 'osm'>('virtual');
  
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState<string>('');
  const [currentLocation, setCurrentLocation] = useState<string>('');
  const [mapboxApiKey, setMapboxApiKey] = useState<string>('');
  const [mapboxSettings, setMapboxSettings] = useState({
    showBuildings: true,
    showTraffic: false,
    show3D: true,
    animationSpeed: 1.0,
    autoFollow: true,
    centerCoords: [-122.4194, 37.7749],
    radiusKm: 1.0
  });
  
  const {
    env,
    devices,
    status,
    refreshEnv,
    connectFTMS,
    connectCPS,
    connectHR,
  } = useBluetooth();
  
  const {
    metrics,
    samples,
    elapsed,
    startRide,
    stopRide,
    resetRide,
    updateMetrics,
  } = useMetrics(sim, rideOn);
  
  const {
    route,
    isLoading,
    error,
    lastLoadedFile,
    loadGPX,
    resetToDefault,
  } = useRoute();
  
  const {
    workouts,
    activeWorkout,
    currentInterval,
    intervalTime,
    targetPower,
    targetCadence,
    startWorkout,
    stopWorkout,
  } = useWorkout();

  // Auto-enable simulator if Bluetooth is not available
  useEffect(() => {
    if (env.canUse === false && !sim) {
      setSim(true);
    }
  }, [env.canUse, sim]);

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

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("Copied!");
      setTimeout(() => setCopied(""), 1500);
    } catch {
      setCopied("Couldn't copy—select manually");
      setTimeout(() => setCopied(""), 2500);
    }
  };

  const handleRouteClick = (point: { x: number; y: number }) => {
    // Optional: handle route click events
    console.log('Route clicked at:', point);
  };

  const views = [
    { id: 'virtual', label: 'Virtual Map', icon: '🚴' },
    { id: 'street', label: 'Street View', icon: '🏙️' },
    { id: 'mapbox', label: 'Mapbox 3D', icon: '🗺️' },
    { id: 'osm', label: 'OpenStreetMap', icon: '🌍' },
  ];

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

        <div className="mt-4 flex gap-2 border-b border-neutral-800">
          {views.map((view) => (
            <button
              key={view.id}
              onClick={() => setActiveTab(view.id)}
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === view.id
                  ? "text-emerald-400 border-b-2 border-emerald-400"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <span className="mr-2">{view.icon}</span>
              {view.label}
            </button>
          ))}
        </div>

        <BluetoothConnectPanel
          env={env}
          devices={devices}
          status={status}
          onConnectFTMS={connectFTMS}
          onConnectCPS={connectCPS}
          onConnectHR={connectHR}
          onRefreshEnv={refreshEnv}
          onShowFix={() => setShowFix(true)}
        />

        <EnvDiagnostics environment={env} connectedDevices={Object.values(devices)} />

        {activeTab === "dashboard" && (
          <div className="space-y-6">
            {/* View Toggle */}
            <div className="flex justify-center">
              <ViewToggle
                currentView={currentView}
                onViewChange={setCurrentView}
                disabled={!googleMapsApiKey && currentView === 'street'}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Metrics Card */}
              <div className="lg:col-span-1 space-y-6">
                <div className="grid grid-cols-2 gap-3 text-center">
                  <Metric label="Power" value={metrics.power} unit="W" target={targetPower} />
                  <Metric label="Caden" value={metrics.cadence} unit="rpm" target={targetCadence} />
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
                <p className="mt-3 text-neutral-400 text-sm">{status}</p>
              </div>

              {/* View Display */}
              <div className="lg:col-span-2">
                {currentView === 'virtual' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-lg font-medium text-neutral-200">Virtual Map (5 km loop)</h3>
                      <RouteLoader
                        route={route}
                        isLoading={isLoading}
                        error={error}
                        onLoadGPX={loadGPX}
                        onResetToDefault={resetToDefault}
                      />
                    </div>
                    <VirtualMap
                      route={route}
                      metrics={metrics}
                      showRouteInfo={true}
                    />
                  </div>
                )}

                {currentView === 'street' && googleMapsApiKey && (
                  <StreetViewDisplay
                    route={route}
                    currentPosition={metrics.distance / 5} // Assuming 5km loop
                    isRiding={rideOn}
                    apiKey={googleMapsApiKey}
                    onLocationUpdate={setCurrentLocation}
                  />
                )}

                {currentView === 'street' && !googleMapsApiKey && (
                  <StreetViewPlaceholder 
                    onAddApiKey={() => setActiveTab('settings')}
                    title="Street View Unavailable"
                    description="Add your Google Maps API key to enable Street View functionality"
                  />
                )}

                {currentView === 'mapbox' && mapboxApiKey && (
                  <div className="text-center text-neutral-500 p-4">
                    Mapbox view would be implemented here
                  </div>
                )}

                {currentView === 'osm' && (
                  <div className="text-center text-neutral-500 p-4">
                    OpenStreetMap view would be implemented here
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "workouts" && (
          <div className="mt-6">
            <WorkoutPanel
              workouts={workouts}
              activeWorkout={activeWorkout}
              currentInterval={currentInterval}
              intervalTime={intervalTime}
              onStartWorkout={startWorkout}
              onStopWorkout={stopWorkout}
            />
          </div>
        )}

        {activeTab === "analysis" && (
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="border border-neutral-800 rounded-2xl p-4 bg-neutral-900/50">
              <h2 className="text-lg font-medium mb-3">Power Analysis</h2>
              <div className="h-64">
                Analysis chart would be implemented here
              </div>
            </section>
            <section className="border border-neutral-800 rounded-2xl p-4 bg-neutral-900/50">
              <h2 className="text-lg font-medium mb-3">Heart Rate Analysis</h2>
              <div className="h-64">
                Analysis chart would be implemented here
              </div>
            </section>
            <section className="border border-neutral-800 rounded-2xl p-4 bg-neutral-900/50">
              <h2 className="text-lg font-medium mb-3">Cadence Analysis</h2>
              <div className="h-64">
                Analysis chart would be implemented here
              </div>
            </section>
            <section className="border border-neutral-800 rounded-2xl p-4 bg-neutral-900/50">
              <h2 className="text-lg font-medium mb-3">Speed Analysis</h2>
              <div className="h-64">
                Analysis chart would be implemented here
              </div>
            </section>
          </div>
        )}

        {/* Session Table (recent rows) */}
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
                {samples.slice(-30).map((r, i) => (
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

        <footer className="mt-6 text-xs text-neutral-500 space-y-1">
          <p>
            Browser support: Chrome/Edge desktop. Requires HTTPS or localhost for Web Bluetooth. If Tacx Bushido lacks BLE FTMS/CPS, use Simulator or pair a BLE sensor.
          </p>
          <p>
            If you are embedding this page, ensure Permissions-Policy allows bluetooth (e.g., header <code>Permissions-Policy: bluetooth=(self)</code> or iframe attribute <code>allow="bluetooth"</code>), and avoid sandbox flags that block it.
          </p>
        </footer>

        {showFix && (
          <FixBluetoothModal
            env={env}
            onClose={() => setShowFix(false)}
            onCopy={handleCopy}
            copied={copied}
            onRefresh={refreshEnv}
          />
        )}
      </div>
    </div>
  );
}

export default App;
