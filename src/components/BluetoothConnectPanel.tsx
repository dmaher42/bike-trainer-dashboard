import React from "react";
import useBluetooth from "../hooks/useBluetooth";
import { reasonFromEnv } from "../utils/bluetoothUtils";

const DEVICE_LABELS = {
  ftms: "FTMS Trainer",
  cps: "Cycling Power Sensor",
  hr: "Heart Rate Monitor",
} as const;

type DeviceKind = keyof typeof DEVICE_LABELS;

type StatusVariant = {
  label: string;
  badgeClassName: string;
};

const STATUS_VARIANTS: Record<string, StatusVariant> = {
  idle: {
    label: "Idle",
    badgeClassName: "bg-slate-100 text-slate-600",
  },
  requesting: {
    label: "Requesting",
    badgeClassName: "bg-amber-100 text-amber-700",
  },
  connecting: {
    label: "Connecting",
    badgeClassName: "bg-sky-100 text-sky-700",
  },
  connected: {
    label: "Connected",
    badgeClassName: "bg-emerald-100 text-emerald-700",
  },
  error: {
    label: "Error",
    badgeClassName: "bg-rose-100 text-rose-700",
  },
};

const BluetoothConnectPanel: React.FC = () => {
  const {
    environment,
    statuses,
    errors,
    connectedDevices,
    refreshEnvironment,
    connectFTMS,
    connectCPS,
    connectHR,
    disconnect,
  } = useBluetooth();

  const envIssue = reasonFromEnv(environment);
  const needsFix = Boolean(envIssue);

  const connectHandlers: Record<DeviceKind, () => void> = React.useMemo(
    () => ({
      ftms: () => {
        void connectFTMS();
      },
      cps: () => {
        void connectCPS();
      },
      hr: () => {
        void connectHR();
      },
    }),
    [connectCPS, connectFTMS, connectHR],
  );

  const handleFixBluetooth = React.useCallback(() => {
    void refreshEnvironment();
  }, [refreshEnvironment]);

  const handleRecheckEnvironment = React.useCallback(() => {
    void refreshEnvironment();
  }, [refreshEnvironment]);

  const renderDeviceRow = (kind: DeviceKind): React.ReactNode => {
    const statusKey = statuses[kind] ?? "idle";
    const status = STATUS_VARIANTS[statusKey] ?? STATUS_VARIANTS.idle;
    const error = errors[kind];
    const device = connectedDevices[kind];

    const isBusy = statusKey === "requesting" || statusKey === "connecting";
    const isConnected = statusKey === "connected" && Boolean(device);
    const disabled = isBusy || needsFix || !environment.supportsBluetooth;

    return (
      <div
        key={kind}
        className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white/80 p-4 shadow-sm"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {DEVICE_LABELS[kind]}
            </h3>
            {device ? (
              <p className="text-sm text-slate-500">Connected to {device.name}</p>
            ) : (
              <p className="text-sm text-slate-500">No device connected</p>
            )}
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide ${status.badgeClassName}`}
          >
            {status.label}
          </span>
        </div>
        {error ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          {isConnected ? (
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
              onClick={() => disconnect(kind)}
              disabled={isBusy}
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
              onClick={connectHandlers[kind]}
              disabled={disabled}
            >
              {isBusy ? "Connecting…" : "Connect"}
            </button>
          )}
          {isBusy ? (
            <span className="text-xs text-slate-500">Waiting for device…</span>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <section
      className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white/70 p-6 shadow-sm backdrop-blur"
      aria-label="Bluetooth connection panel"
    >
      <header className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-slate-900">Bluetooth Connections</h2>
        <p className="text-sm text-slate-500">
          Pair your smart trainer and sensors using Web Bluetooth.
        </p>
        {envIssue ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            {envIssue}
          </p>
        ) : (
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">
            Environment ready for connections
          </p>
        )}
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {(Object.keys(DEVICE_LABELS) as DeviceKind[]).map((kind) => renderDeviceRow(kind))}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3">
        {needsFix ? (
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            onClick={handleFixBluetooth}
          >
            Fix Bluetooth
          </button>
        ) : (
          <span className="text-sm text-slate-500">Bluetooth looks good.</span>
        )}
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2"
          onClick={handleRecheckEnvironment}
        >
          Re-check Environment
        </button>
      </footer>
    </section>
  );
};

export default BluetoothConnectPanel;
