import React from "react";
import type { BluetoothDevice, EnvironmentInfo } from "../types";

export interface EnvDiagnosticsProps {
  /** Snapshot of the browser environment capabilities */
  environment: EnvironmentInfo;
  /** Connected bluetooth devices to display in diagnostics */
  connectedDevices?: BluetoothDevice[];
  /** Indicates if the app is currently scanning for bluetooth devices */
  isScanning?: boolean;
  /** Optional timestamp of the last successful scan */
  lastScanAt?: Date | null;
  /** Optional error message to surface to the user */
  errorMessage?: string | null;
}

const formatTimestamp = (timestamp?: Date | null): string => {
  if (!timestamp) {
    return "Never";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
};

const EnvDiagnostics: React.FC<EnvDiagnosticsProps> = ({
  environment,
  connectedDevices = [],
  isScanning = false,
  lastScanAt = null,
  errorMessage = null,
}) => {
  const environmentEntries = [
    {
      label: "Bluetooth Supported",
      value: environment.supportsBluetooth ? "Yes" : "No",
    },
    {
      label: "Bluetooth Available",
      value: environment.bluetoothAvailable ? "Available" : "Unavailable",
    },
    {
      label: "Bluetooth Enabled",
      value: environment.bluetoothEnabled ? "Enabled" : "Disabled",
    },
  ];

  const hasError = Boolean(errorMessage);
  const activeDevices = connectedDevices.filter((device) => device.connected);

  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur-sm">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Bluetooth Diagnostics</h2>
          <p className="text-sm text-slate-500">
            Review the current environment support and active bluetooth devices.
          </p>
        </div>
        <div
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
            isScanning
              ? "bg-sky-100 text-sky-700"
              : activeDevices.length > 0
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-500"
          }`}
          aria-live="polite"
        >
          <span className="h-2 w-2 rounded-full bg-current" />
          {isScanning
            ? "Scanning for devices"
            : activeDevices.length > 0
              ? `${activeDevices.length} device${activeDevices.length === 1 ? "" : "s"} connected`
              : "Idle"}
        </div>
      </header>

      {hasError ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
        >
          <h3 className="mb-1 font-semibold">Connection error</h3>
          <p>{errorMessage}</p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {environmentEntries.map((entry) => (
          <dl
            key={entry.label}
            className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm"
          >
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {entry.label}
            </dt>
            <dd className="mt-2 text-lg font-medium text-slate-900">{entry.value}</dd>
          </dl>
        ))}
        <dl className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Last Scan
          </dt>
          <dd className="mt-2 text-lg font-medium text-slate-900">
            {formatTimestamp(lastScanAt)}
          </dd>
        </dl>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Connected devices
        </h3>
        {activeDevices.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {activeDevices.map((device) => (
              <li
                key={device.id}
                className="flex flex-col gap-1 rounded-xl border border-emerald-100 bg-emerald-50/80 p-4 text-sm text-emerald-800"
              >
                <span className="font-semibold text-emerald-900">{device.name || "Unnamed"}</span>
                <span className="text-xs uppercase tracking-wide text-emerald-700">
                  ID: {device.id}
                </span>
                <span className="text-xs font-medium uppercase tracking-wide text-emerald-600">
                  Status: Connected
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
            No active bluetooth connections detected.
          </p>
        )}
      </div>
    </section>
  );
};

export default EnvDiagnostics;
