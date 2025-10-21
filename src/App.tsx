import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { BluetoothDevice, Metrics, Sample } from "./types";
import { useBluetooth } from "./hooks/useBluetooth";
import { useMetrics } from "./hooks/useMetrics";
import { useRoute } from "./hooks/useRoute";
import { useWorkout } from "./hooks/useWorkout";
import { downloadCSV } from "./utils/metricsUtils";
import { Metric } from "./components/Metric";
import VirtualMap from "./components/VirtualMap";
import { StreetViewDisplay } from "./components/StreetViewDisplay";
import WorkoutPanel from "./components/WorkoutPanel";
import EnvDiagnostics from "./components/EnvDiagnostics";
import BluetoothConnectPanel from "./components/BluetoothConnectPanel";
import RouteLoader from "./components/RouteLoader";
import FixBluetoothModal from "./components/FixBluetoothModal";
import ViewToggle, { ViewOption } from "./components/ViewToggle";

type AppTab = "dashboard" | "workouts" | "analysis" | "routes" | "settings";

const TAB_CONFIG: { id: AppTab; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "workouts", label: "Workouts", icon: "🎯" },
  { id: "analysis", label: "Analysis", icon: "📈" },
  { id: "routes", label: "Routes", icon: "🗺️" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

const VIEW_TITLES: Record<ViewOption, string> = {
  virtual: "Virtual Map",
  street: "Street View",
  mapbox: "Mapbox 3D",
  osm: "OpenStreetMap",
};

const isAppTab = (value: string): value is AppTab =>
  TAB_CONFIG.some((tab) => tab.id === value);

function App() {
  const [sim, setSim] = useState(false);
  const [rideOn, setRideOn] = useState(false);
  const [showFix, setShowFix] = useState(false);
  const [copied, setCopied] = useState("");
  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    if (typeof window === "undefined") {
      return "dashboard";
    }

    const hash = window.location.hash.replace("#", "");
    return isAppTab(hash) ? hash : "dashboard";
  });
  const [currentView, setCurrentView] = useState<ViewOption>("virtual");

  const [googleMapsApiKey, setGoogleMapsApiKey] = useState<string>('');
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

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleTabChange = useCallback((tab: AppTab) => {
    setActiveTab(tab);
  }, []);

  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
        return;
      }

      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const totalTabs = TAB_CONFIG.length;
      const nextIndex = (index + direction + totalTabs) % totalTabs;
      const nextTab = tabRefs.current[nextIndex];
      nextTab?.focus();
    },
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "");
      if (isAppTab(hash)) {
        setActiveTab(hash);
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.location.hash.replace("#", "") !== activeTab) {
      window.location.hash = activeTab;
    }
  }, [activeTab]);

  const streetViewDisabled = !googleMapsApiKey;

  const {
    environment,
    connectedDevices,
    statuses,
    refreshEnvironment,
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
  } = useMetrics(sim, rideOn);
  
  const {
    route,
    isLoading,
    error,
    lastLoadedFile,
    loadGPX,
    resetToDefault,
  } = useRoute();

  const routeStats = useMemo(() => {
    const totalKm = Number.isFinite(route.total) ? route.total / 1000 : 0;
    const hasElevation = route.pts.some((pt) => typeof pt.elevation === "number");

    return {
      totalKm,
      hasElevation,
      points: route.pts.length,
    };
  }, [route]);
  
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
    if (environment.canUse === false && !sim) {
      setSim(true);
    }
  }, [environment.canUse, sim]);

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

  const renderDashboard = () => (
    <div data-testid="screen-dashboard" className="mt-6 space-y-6">
      <div className="flex flex-col items-center gap-2">
        <ViewToggle
          value={currentView}
          onChange={setCurrentView}
          disabledOptions={streetViewDisabled ? { street: true } : undefined}
        />
        {streetViewDisabled ? (
          <p className="text-xs text-neutral-400">
            Add a Google Maps API key in Settings to enable Street View.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <div className="grid grid-cols-2 gap-3 text-center">
            <Metric label="Power" value={metrics.power} unit="W" target={targetPower} />
            <Metric label="Caden" value={metrics.cadence} unit="rpm" target={targetCadence} />
            <Metric label="Speed" value={metrics.speed} unit="kph" />
            <Metric label="Distance" value={metrics.distance} unit="km" />
            <Metric label="Heart Rate" value={metrics.hr} unit="bpm" />
            <Metric label="Elapsed" value={elapsed} unit="" />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {!rideOn ? (
              <button
                onClick={handleStartRide}
                className="rounded-xl bg-emerald-600 px-4 py-2 hover:bg-emerald-500"
              >
                Start Ride
              </button>
            ) : (
              <button
                onClick={handleStopRide}
                className="rounded-xl bg-amber-600 px-4 py-2 hover:bg-amber-500"
              >
                Pause
              </button>
            )}
            <button
              onClick={handleResetRide}
              className="rounded-xl bg-neutral-800 px-4 py-2 hover:bg-neutral-700"
            >
              Reset
            </button>
            <button
              onClick={() => downloadCSV(`ride-${new Date().toISOString()}.csv`, samples)}
              className="rounded-xl bg-neutral-800 px-4 py-2 hover:bg-neutral-700"
            >
              Export CSV
            </button>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
            <h3 className="mb-3 text-sm font-medium text-neutral-200">Route summary</h3>
            <dl className="space-y-1 text-sm text-neutral-400">
              <div className="flex items-center justify-between">
                <dt className="font-medium text-neutral-300">Name</dt>
                <dd>{route.name ?? "Active route"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="font-medium text-neutral-300">Distance</dt>
                <dd>{routeStats.totalKm.toFixed(2)} km</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="font-medium text-neutral-300">Points</dt>
                <dd>{routeStats.points}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="font-medium text-neutral-300">Elevation data</dt>
                <dd>{routeStats.hasElevation ? "Available" : "Not available"}</dd>
              </div>
              {lastLoadedFile ? (
                <div className="flex items-center justify-between">
                  <dt className="font-medium text-neutral-300">Source</dt>
                  <dd className="truncate text-right" title={lastLoadedFile}>
                    {lastLoadedFile}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="space-y-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-medium text-neutral-200">{VIEW_TITLES[currentView]}</h3>
              <span className="text-sm text-neutral-400">{route.name ?? "Active route"}</span>
            </div>

            {currentView === "virtual" && (
              <VirtualMap route={route} metrics={metrics} showRouteInfo />
            )}

            {currentView === "street" && (
              <StreetViewDisplay
                route={route}
                distance={metrics.distance}
                routeTotal={route.total}
                isRiding={rideOn}
                apiKey={googleMapsApiKey}
                onError={(message) => console.error(message)}
              />
            )}

            {currentView === "mapbox" && mapboxApiKey && (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 text-center text-neutral-400">
                Mapbox view would be implemented here.
              </div>
            )}

            {currentView === "mapbox" && !mapboxApiKey && (
              <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/30 p-6 text-center text-neutral-500">
                Add a Mapbox API key in Settings to preview the Mapbox 3D view.
              </div>
            )}

            {currentView === "osm" && (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 text-center text-neutral-400">
                OpenStreetMap view would be implemented here.
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
        <h2 className="mb-3 text-lg font-medium">Recent Samples</h2>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-neutral-400">
              <tr>
                <th className="p-2 text-left">Time</th>
                <th className="p-2 text-right">Power</th>
                <th className="p-2 text-right">Cadence</th>
                <th className="p-2 text-right">Speed</th>
                <th className="p-2 text-right">Distance</th>
                <th className="p-2 text-right">HR</th>
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
    </div>
  );

  const renderWorkouts = () => (
    <div data-testid="screen-workouts" className="mt-6">
      <WorkoutPanel
        workouts={workouts}
        activeWorkout={activeWorkout}
        currentInterval={currentInterval}
        intervalTime={intervalTime}
        onStartWorkout={startWorkout}
        onStopWorkout={stopWorkout}
      />
    </div>
  );

  const renderAnalysis = () => (
    <div data-testid="screen-analysis" className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
        <h2 className="mb-3 text-lg font-medium">Power Analysis</h2>
        <div className="h-64">Analysis chart would be implemented here</div>
      </section>
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
        <h2 className="mb-3 text-lg font-medium">Heart Rate Analysis</h2>
        <div className="h-64">Analysis chart would be implemented here</div>
      </section>
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
        <h2 className="mb-3 text-lg font-medium">Cadence Analysis</h2>
        <div className="h-64">Analysis chart would be implemented here</div>
      </section>
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
        <h2 className="mb-3 text-lg font-medium">Speed Analysis</h2>
        <div className="h-64">Analysis chart would be implemented here</div>
      </section>
    </div>
  );

  const renderRoutes = () => (
    <div data-testid="screen-routes" className="mt-6 space-y-6">
      <RouteLoader
        route={route}
        isLoading={isLoading}
        error={error}
        onLoadGPX={loadGPX}
        onResetToDefault={resetToDefault}
      />

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
        <h3 className="mb-3 text-lg font-medium">Current Route Summary</h3>
        <dl className="grid grid-cols-1 gap-y-2 text-sm text-neutral-300 sm:grid-cols-2">
          <div className="flex items-center justify-between">
            <dt className="font-medium text-neutral-200">Name</dt>
            <dd>{route.name ?? "Active route"}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="font-medium text-neutral-200">Distance</dt>
            <dd>{routeStats.totalKm.toFixed(2)} km</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="font-medium text-neutral-200">Points</dt>
            <dd>{routeStats.points}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="font-medium text-neutral-200">Elevation data</dt>
            <dd>{routeStats.hasElevation ? "Available" : "Not available"}</dd>
          </div>
        </dl>
        {lastLoadedFile ? (
          <p className="mt-3 text-xs text-neutral-500">Last loaded file: {lastLoadedFile}</p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
        <h3 className="mb-3 text-lg font-medium">Route Debug Preview</h3>
        <ol className="space-y-2 text-xs text-neutral-400">
          {route.pts.slice(0, 5).map((pt, index) => (
            <li key={`${pt.x}-${pt.y}-${index}`}>
              <span className="font-medium text-neutral-200">Point {index + 1}:</span>{" "}
              x={pt.x.toFixed?.(2) ?? pt.x}, y={pt.y.toFixed?.(2) ?? pt.y}
              {typeof pt.elevation === "number" ? `, elevation=${pt.elevation.toFixed?.(1) ?? pt.elevation}` : ""}
            </li>
          ))}
          {route.pts.length > 5 ? (
            <li className="text-neutral-500">…and {route.pts.length - 5} more points</li>
          ) : null}
        </ol>
      </section>
    </div>
  );

  const renderSettings = () => (
    <div data-testid="screen-settings" className="mt-6 space-y-6">
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
        <h2 className="mb-4 text-lg font-medium">API Keys</h2>
        <div className="space-y-4">
          <label className="block space-y-2 text-sm">
            <span className="text-neutral-300">Google Maps API key</span>
            <input
              type="text"
              value={googleMapsApiKey}
              onChange={(event) => setGoogleMapsApiKey(event.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 focus:border-emerald-500 focus:outline-none"
              placeholder="Paste your key to enable Street View"
            />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="text-neutral-300">Mapbox access token</span>
            <input
              type="text"
              value={mapboxApiKey}
              onChange={(event) => setMapboxApiKey(event.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 focus:border-emerald-500 focus:outline-none"
              placeholder="Add a token to enable Mapbox 3D"
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
        <h2 className="mb-3 text-lg font-medium">Mapbox Options</h2>
        <div className="space-y-3 text-sm text-neutral-300">
          <label className="flex items-center justify-between gap-4">
            <span>Show buildings</span>
            <input
              type="checkbox"
              checked={mapboxSettings.showBuildings}
              onChange={(event) =>
                setMapboxSettings((prev) => ({ ...prev, showBuildings: event.target.checked }))
              }
            />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span>Show traffic</span>
            <input
              type="checkbox"
              checked={mapboxSettings.showTraffic}
              onChange={(event) =>
                setMapboxSettings((prev) => ({ ...prev, showTraffic: event.target.checked }))
              }
            />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span>Enable 3D mode</span>
            <input
              type="checkbox"
              checked={mapboxSettings.show3D}
              onChange={(event) =>
                setMapboxSettings((prev) => ({ ...prev, show3D: event.target.checked }))
              }
            />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 text-sm text-neutral-400">
        <p>More settings coming soon.</p>
      </section>
    </div>
  );

  const renderActiveSection = () => {
    switch (activeTab) {
      case "workouts":
        return renderWorkouts();
      case "analysis":
        return renderAnalysis();
      case "routes":
        return renderRoutes();
      case "settings":
        return renderSettings();
      case "dashboard":
      default:
        return renderDashboard();
    }
  };

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

        <div
          className="mt-4 flex gap-2 border-b border-neutral-800"
          role="tablist"
          aria-label="Main sections"
        >
          {TAB_CONFIG.map((tab, index) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                className={`border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-emerald-400 text-emerald-400"
                    : "border-transparent text-neutral-400 hover:text-neutral-200"
                }`}
                onClick={() => handleTabChange(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                data-testid={`tab-${tab.id}`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            );
          })}
        </div>

        <BluetoothConnectPanel
          env={environment}
          devices={connectedDevices}
          onConnectFTMS={connectFTMS}
          onConnectCPS={connectCPS}
          onConnectHR={connectHR}
          onRefreshEnv={refreshEnvironment}
          onShowFix={() => setShowFix(true)}
        />

        <EnvDiagnostics environment={environment} />

        {renderActiveSection()}

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
            env={environment}
            onClose={() => setShowFix(false)}
            onCopy={handleCopy}
            copied={copied}
            onRefresh={refreshEnvironment}
          />
        )}
      </div>
    </div>
  );
}

export default App;
