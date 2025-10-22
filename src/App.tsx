import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { BluetoothDevice, Metrics, Sample } from "./types";
import { useBluetooth } from "./hooks/useBluetooth";
import { useMetrics } from "./hooks/useMetrics";
import { useRoute } from "./hooks/useRoute";
import { useWorkout } from "./hooks/useWorkout";
import { downloadCSV } from "./utils/metricsUtils";
import { Metric } from "./components/Metric";
import VirtualMap from "./components/VirtualMap";
import MapboxDisplay from "./components/MapboxDisplay";
import { StreetViewDisplay } from "./components/StreetViewDisplay";
import WorkoutPanel from "./components/WorkoutPanel";
import EnvDiagnostics from "./components/EnvDiagnostics";
import BluetoothConnectPanel from "./components/BluetoothConnectPanel";
import RouteLoader from "./components/RouteLoader";
import FixBluetoothModal from "./components/FixBluetoothModal";
import ViewToggle, { ViewOption } from "./components/ViewToggle";
import ApiKeyField from "./components/settings/ApiKeyField";
import StreetViewSettings from "./components/settings/StreetViewSettings";
import { useApiKeys } from "./hooks/useApiKeys";
import { useMapSettings } from "./hooks/useMapSettings";

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

const VIEW_ORDER: ViewOption[] = ["virtual", "street", "mapbox", "osm"];

const DEVICE_LABELS: Record<"ftms" | "cps" | "hr", string> = {
  ftms: "FTMS Trainer",
  cps: "Power & Cadence",
  hr: "Heart Rate",
};

export const resolveActiveView = (
  currentView: ViewOption,
  disabledViewOptions: Partial<Record<ViewOption, boolean>>,
): ViewOption => {
  if (!disabledViewOptions[currentView]) {
    return currentView;
  }

  const fallbackView = VIEW_ORDER.find((view) => !disabledViewOptions[view]);
  return fallbackView ?? "virtual";
};

const isAppTab = (value: string): value is AppTab =>
  TAB_CONFIG.some((tab) => tab.id === value);

export const getFallbackView = (
  currentView: ViewOption,
  disabledOptions: Partial<Record<ViewOption, boolean>>,
  defaultView: ViewOption = "virtual",
): ViewOption => {
  if (!disabledOptions[currentView]) {
    return currentView;
  }

  const fallbackOrder: ViewOption[] = ["virtual", "street", "mapbox", "osm"];

  for (const option of fallbackOrder) {
    if (!disabledOptions[option]) {
      return option;
    }
  }

  return defaultView;
};

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

  const { googleMapsApiKey, mapboxApiKey, setGoogleMapsApiKey, setMapboxApiKey } = useApiKeys();
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
  const { hudPosition, usePowerToDriveSpeed } = useMapSettings();

  const hudPosClasses =
    hudPosition === "top-left"
      ? "left-4 top-4"
      : hudPosition === "top-right"
        ? "right-4 top-4"
        : hudPosition === "bottom-left"
          ? "left-4 bottom-4"
          : "right-4 bottom-4";

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
  const mapboxDisabled = !mapboxApiKey;

  const disabledViewOptions = useMemo(() => {
    const options: Partial<Record<ViewOption, boolean>> = {};

    if (streetViewDisabled) {
      options.street = true;
    }

    if (mapboxDisabled) {
      options.mapbox = true;
    }

    return options;
  }, [streetViewDisabled, mapboxDisabled]);

  const activeView = useMemo(
    () => resolveActiveView(currentView, disabledViewOptions),
    [currentView, disabledViewOptions],
  );

  useEffect(() => {
    if (activeView !== currentView) {
      setCurrentView(activeView);
    }
  }, [activeView, currentView]);

  const {
    environment,
    connectedDevices,
    statuses,
    errors,
    refreshEnvironment,
    connectFTMS,
    connectCPS,
    connectHR,
    disconnect,
    connectionState,
  } = useBluetooth();

  const isConnectingMap = useMemo(
    () => ({
      ftms: statuses.ftms === "connecting" || statuses.ftms === "requesting",
      cps: statuses.cps === "connecting" || statuses.cps === "requesting",
      hr: statuses.hr === "connecting" || statuses.hr === "requesting",
    }),
    [statuses.cps, statuses.ftms, statuses.hr],
  );

  const connectionStatusText = useMemo(() => {
    const activeKeys = (Object.keys(statuses) as Array<"ftms" | "cps" | "hr">).filter(
      (key) => statuses[key] === "connecting" || statuses[key] === "requesting",
    );
    if (activeKeys.length > 0) {
      const label = activeKeys.map((key) => DEVICE_LABELS[key]).join(", ");
      return `Connecting to ${label}...`;
    }

    const errorEntry = (Object.keys(errors) as Array<"ftms" | "cps" | "hr">).find((key) => {
      const message = errors[key];
      return typeof message === "string" && message.length > 0;
    });

    if (errorEntry) {
      return `${DEVICE_LABELS[errorEntry]} error: ${errors[errorEntry]}`;
    }

    const connectedCount = (Object.keys(connectedDevices) as Array<"ftms" | "cps" | "hr">).filter(
      (key) => connectedDevices[key]?.connected,
    ).length;

    if (connectedCount > 0) {
      return `${connectedCount} device${connectedCount === 1 ? "" : "s"} connected`;
    }

    return undefined;
  }, [connectedDevices, errors, statuses]);

  const disconnectAll = useCallback(() => {
    (["ftms", "cps", "hr"] as const).forEach((key) => {
      disconnect(key);
    });
  }, [disconnect]);

  const diagnosticsConnectedDevices = useMemo(
    () => Object.values(connectedDevices).filter((device): device is BluetoothDevice => Boolean(device)),
    [connectedDevices],
  );

  const diagnosticsIsScanning = useMemo(
    () =>
      Object.values(statuses).some((status) => status === "connecting" || status === "requesting"),
    [statuses],
  );

  const diagnosticsLastScanAt = useMemo(() => {
    const history = connectionState.connectionHistory;
    if (!history.length) {
      return null;
    }

    const lastAttempt = history[history.length - 1];
    return new Date(lastAttempt.timestamp);
  }, [connectionState.connectionHistory]);

  const diagnosticsErrorMessage = useMemo(
    () => Object.values(errors).find((message) => typeof message === "string" && message.length > 0) ?? null,
    [errors],
  );
  
  const { metrics, samples, elapsed, startRide, stopRide, resetRide } = useMetrics(sim, rideOn, {
    usePowerToDriveSpeed,
  });
  
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

  const viewRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const enterFullscreen = useCallback(async () => {
    if (!viewRef.current) {
      return;
    }

    try {
      await viewRef.current.requestFullscreen?.();
    } catch {
      // no-op
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen?.();
      }
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "f") {
        return;
      }

      if (isFullscreen) {
        void exitFullscreen();
      } else {
        void enterFullscreen();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enterFullscreen, exitFullscreen, isFullscreen]);
  
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

  const renderDashboard = () => {
    return (
      <div
        data-testid="screen-dashboard"
        className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]"
      >
        <section className="order-1 space-y-4 lg:order-2">
          <div className="flex flex-col items-center gap-2">
            <ViewToggle
              value={activeView}
              onChange={setCurrentView}
              disabledOptions={Object.keys(disabledViewOptions).length ? disabledViewOptions : undefined}
            />
            {(streetViewDisabled || mapboxDisabled) && (
              <div className="text-center text-xs text-neutral-400">
                <div className="space-y-1">
                  {streetViewDisabled && (
                    <p>Add a Google Maps API key in Settings to enable Street View.</p>
                  )}
                  {mapboxDisabled && <p>Add a Mapbox token in Settings to enable Mapbox 3D.</p>}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/50 px-3 py-2">
            <div className="truncate text-sm text-neutral-400">{route.name ?? "Active route"}</div>
            <div className="flex items-center gap-2">
              {!rideOn ? (
                <button
                  onClick={handleStartRide}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 hover:bg-emerald-500"
                >
                  Start
                </button>
              ) : (
                <button
                  onClick={handleStopRide}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 hover:bg-amber-500"
                >
                  Pause
                </button>
              )}
              <button
                onClick={handleResetRide}
                className="rounded-lg bg-neutral-800 px-3 py-1.5 hover:bg-neutral-700"
              >
                Reset
              </button>
              <button
                onClick={() => downloadCSV(`ride-${new Date().toISOString()}.csv`, samples)}
                className="rounded-lg bg-neutral-800 px-3 py-1.5 hover:bg-neutral-700"
              >
                Export
              </button>
              <button
                type="button"
                onClick={isFullscreen ? exitFullscreen : enterFullscreen}
                className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
              >
                {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              </button>
            </div>
          </div>

          <div ref={viewRef} className="relative">
            <h3 className="sr-only">{VIEW_TITLES[activeView]}</h3>
            {activeView === "virtual" && <VirtualMap route={route} metrics={metrics} showRouteInfo />}
            {activeView === "street" && (
              <StreetViewDisplay
                route={route}
                distance={metrics.distance}
                routeTotal={route.total}
                isRiding={rideOn}
                apiKey={googleMapsApiKey}
                onError={(message) => console.error(message)}
              />
            )}
            {activeView === "mapbox" && mapboxApiKey && (
              <div className="relative h-[60vh] min-h-[360px] overflow-hidden rounded-2xl border border-neutral-800">
                <MapboxDisplay
                  accessToken={mapboxApiKey}
                  route={route}
                  options={{
                    showBuildings: mapboxSettings.showBuildings,
                    showTraffic: mapboxSettings.showTraffic,
                    show3D: mapboxSettings.show3D,
                  }}
                />
              </div>
            )}
            {activeView === "mapbox" && !mapboxApiKey && (
              <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-900/30 p-6 text-center text-neutral-500">
                Add a Mapbox token in Settings to enable Mapbox 3D.
              </div>
            )}
            {activeView === "osm" && (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4 text-center text-neutral-400">
                OpenStreetMap view would be implemented here.
              </div>
            )}

            {isFullscreen && (
              <div
                className={`pointer-events-none absolute ${hudPosClasses} z-50 grid grid-cols-3 gap-2 rounded-xl bg-neutral-900/70 p-3 backdrop-blur`}
                role="status"
                aria-live="polite"
              >
                <HudStat label="Power" value={metrics.power} unit="W" />
                <HudStat label="Cadence" value={metrics.cadence} unit="rpm" />
                <HudStat label="Speed" value={metrics.speed} unit="kph" />
                <HudStat label="Distance" value={metrics.distance} unit="km" />
                <HudStat label="Heart" value={metrics.hr} unit="bpm" />
                <HudStat label="Elapsed" value={elapsed} />
              </div>
            )}
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
        </section>

        <aside className="order-2 space-y-6 self-start lg:order-1 lg:sticky lg:top-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-[minmax(0,1fr)] text-center">
            {/* Top row - Priority live metrics */}
            <Metric label="Power" value={metrics.power} unit="W" target={targetPower} />
            <Metric label="Cadence" value={metrics.cadence} unit="rpm" target={targetCadence} />
            <Metric label="Heart Rate" value={metrics.hr} unit="bpm" />

            {/* Bottom row - Secondary metrics */}
            <Metric label="Speed" value={metrics.speed} unit="kph" />
            <Metric label="Distance" value={metrics.distance} unit="km" />
            <Metric label="Elapsed" value={elapsed} unit="" />
          </div>

          <div className="flex flex-wrap gap-2">
            {!rideOn ? (
              <button onClick={handleStartRide} className="rounded-xl bg-emerald-600 px-4 py-2 hover:bg-emerald-500">
                Start
              </button>
            ) : (
              <button onClick={handleStopRide} className="rounded-xl bg-amber-600 px-4 py-2 hover:bg-amber-500">
                Pause
              </button>
            )}
            <button onClick={handleResetRide} className="rounded-xl bg-neutral-800 px-4 py-2 hover:bg-neutral-700">
              Reset
            </button>
            <button
              onClick={() => downloadCSV(`ride-${new Date().toISOString()}.csv`, samples)}
              className="rounded-xl bg-neutral-800 px-4 py-2 hover:bg-neutral-700"
            >
              Export
            </button>
          </div>

          <a
            href="#settings"
            className="block text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
          >
            Manage Bluetooth in Settings →
          </a>
        </aside>
      </div>
    );
  };
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
          <ApiKeyField
            label="Google Maps API key"
            description="Paste your key to enable Street View"
            value={googleMapsApiKey}
            onChange={setGoogleMapsApiKey}
            placeholder="Paste your key to enable Street View"
            saved={Boolean(googleMapsApiKey)}
            data-testid="google-api-field"
          />
          <ApiKeyField
            label="Mapbox access token"
            description="Add a token to enable Mapbox 3D"
            value={mapboxApiKey}
            onChange={setMapboxApiKey}
            placeholder="Add a token to enable Mapbox 3D"
            saved={Boolean(mapboxApiKey)}
            data-testid="mapbox-api-field"
          />
          <StreetViewSettings />
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

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
        <h2 className="mb-3 text-lg font-medium">Device Connections</h2>
        <BluetoothConnectPanel
          env={environment}
          devices={connectedDevices}
          status={connectionStatusText}
          onConnectFTMS={connectFTMS}
          onConnectCPS={connectCPS}
          onConnectHR={connectHR}
          onRefreshEnv={refreshEnvironment}
          onShowFix={() => setShowFix(true)}
          onDisconnectDevice={disconnect}
          onDisconnectAll={disconnectAll}
          isConnecting={isConnectingMap}
        />
      </section>

      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-4">
        <EnvDiagnostics
          environment={environment}
          connectedDevices={diagnosticsConnectedDevices}
          isScanning={diagnosticsIsScanning}
          lastScanAt={diagnosticsLastScanAt}
          errorMessage={diagnosticsErrorMessage}
        />
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

function HudStat({
  label,
  value,
  unit = "",
}: {
  label: string;
  value?: number | string;
  unit?: string;
}) {
  const isMissing = value == null || (typeof value === "number" && Number.isNaN(value));
  const display =
    isMissing
      ? "—"
      : typeof value === "number"
        ? value.toFixed?.(unit ? 0 : 0) ?? String(value)
        : String(value);

  return (
    <div className="pointer-events-none min-w-[90px] rounded-lg border border-neutral-800 bg-neutral-950/60 px-2 py-1.5 text-xs text-neutral-200">
      <div className="text-[10px] uppercase tracking-wide text-neutral-400">{label}</div>
      <div className="font-semibold">
        {display} {unit}
      </div>
    </div>
  );
}
