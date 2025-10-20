import React, { useMemo, useState } from 'react';
import { BluetoothDevice, EnvironmentInfo } from '../types';
import { LoadingSpinner } from './LoadingStates';

type DeviceKind = 'ftms' | 'cps' | 'hr';

const DEVICE_LABELS: Record<DeviceKind, string> = {
  ftms: 'Smart Trainer',
  cps: 'Power Meter',
  hr: 'Heart Rate Monitor',
};

const DEVICE_DESCRIPTIONS: Record<DeviceKind, string> = {
  ftms: 'Controls resistance and provides power/cadence/speed data',
  cps: 'Provides accurate power and cadence data',
  hr: 'Provides real-time heart rate data',
};

const DEVICE_ICONS: Record<DeviceKind, string> = {
  ftms: '🚴',
  cps: '⚡',
  hr: '❤️',
};

const DEVICE_COLORS: Record<DeviceKind, 'primary' | 'warning' | 'danger'> = {
  ftms: 'primary',
  cps: 'warning',
  hr: 'danger',
};

interface BluetoothConnectPanelProps {
  env: EnvironmentInfo;
  devices: Partial<Record<DeviceKind, BluetoothDevice>>;
  status?: string | null;
  onConnectFTMS: () => void;
  onConnectCPS: () => void;
  onConnectHR: () => void;
  onDisconnectDevice: (kind: DeviceKind) => void;
  onDisconnectAll: () => void;
  onRefreshEnv: () => void;
  onShowFix: () => void;
  isConnecting?: Partial<Record<DeviceKind, boolean>>;
  errors?: Partial<Record<DeviceKind, string>>;
}

const isDeviceConnected = (device?: BluetoothDevice): boolean => Boolean(device?.connected);

const formatKey = (key: DeviceKind): string =>
  key.replace(/([A-Z])/g, ' $1').trim().toUpperCase();

export const BluetoothConnectPanel: React.FC<BluetoothConnectPanelProps> = ({
  env,
  devices,
  status,
  onConnectFTMS,
  onConnectCPS,
  onConnectHR,
  onDisconnectDevice,
  onDisconnectAll,
  onRefreshEnv,
  onShowFix,
  isConnecting = {},
  errors = {},
}) => {
  const [expandedDevice, setExpandedDevice] = useState<DeviceKind | null>(null);

  const canUseBluetooth = env.canUse !== false;

  const deviceTypes = useMemo(
    () =>
      (['ftms', 'cps', 'hr'] as DeviceKind[]).map((key) => ({
        key,
        name: DEVICE_LABELS[key],
        description: DEVICE_DESCRIPTIONS[key],
        icon: DEVICE_ICONS[key],
        color: DEVICE_COLORS[key],
        connect:
          key === 'ftms' ? onConnectFTMS : key === 'cps' ? onConnectCPS : onConnectHR,
        isConnecting: Boolean(isConnecting[key]),
        device: devices[key],
        error: errors[key],
      })),
    [devices, errors, isConnecting, onConnectCPS, onConnectFTMS, onConnectHR],
  );

  const getStatusBadge = (device: BluetoothDevice | undefined, connecting: boolean) => {
    if (connecting) {
      return (
        <div className="flex items-center gap-2 text-xs text-primary-400">
          <LoadingSpinner size="sm" />
          Connecting...
        </div>
      );
    }

    if (isDeviceConnected(device)) {
      return (
        <div className="flex items-center gap-2 text-xs text-success-400">
          <div className="w-2 h-2 rounded-full bg-success-400 animate-pulse" />
          Connected
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 text-xs text-dark-500">
        <div className="w-2 h-2 rounded-full bg-dark-600" />
        Disconnected
      </div>
    );
  };

  return (
    <div className="glass-card p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-dark-200">Device Connections</h3>
          <p className="text-sm text-dark-400 mt-1">Connect your Bluetooth devices to start tracking metrics</p>
        </div>

        {env.canUse === false && (
          <button onClick={onShowFix} className="btn-warning text-sm">
            Fix Bluetooth
          </button>
        )}
      </div>

      <div className="space-y-4">
        {deviceTypes.map((deviceType) => {
          const connected = isDeviceConnected(deviceType.device);
          const shouldDisable = deviceType.isConnecting || (!connected && !canUseBluetooth);

          return (
            <div
              key={deviceType.key}
              className={`glass-card-hover p-4 cursor-pointer transition-all duration-200 ${
                expandedDevice === deviceType.key ? 'ring-2 ring-primary-500/50' : ''
              }`}
              onClick={() =>
                setExpandedDevice((current) => (current === deviceType.key ? null : deviceType.key))
              }
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="text-3xl">{deviceType.icon}</div>
                  <div>
                    <h4 className="font-medium text-dark-200">{deviceType.name}</h4>
                    <p className="text-sm text-dark-400">{deviceType.description}</p>
                    {deviceType.device?.name && (
                      <p className="text-xs text-dark-500 mt-1">Device: {deviceType.device.name}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {getStatusBadge(deviceType.device, deviceType.isConnecting)}
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      if (connected) {
                        onDisconnectDevice(deviceType.key);
                        return;
                      }

                      if (!deviceType.isConnecting && canUseBluetooth) {
                        deviceType.connect();
                      }
                    }}
                    disabled={shouldDisable}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                      connected
                        ? 'bg-danger-500/20 text-danger-400 border border-danger-500/30 hover:bg-danger-500/30'
                        : deviceType.isConnecting
                          ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                          : canUseBluetooth
                            ? `btn-${deviceType.color}`
                            : 'bg-dark-800 text-dark-500 cursor-not-allowed'
                    }`}
                  >
                    {connected
                      ? 'Disconnect'
                      : deviceType.isConnecting
                        ? 'Connecting...'
                        : canUseBluetooth
                          ? 'Connect'
                          : 'Unavailable'}
                  </button>
                </div>
              </div>

              {expandedDevice === deviceType.key && (
                <div className="mt-4 pt-4 border-t border-glass-border space-y-3 animate-slide-down">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-dark-500">Status:</span>
                      <span className="ml-2 text-dark-300">{connected ? 'Connected' : 'Disconnected'}</span>
                    </div>
                    <div>
                      <span className="text-dark-500">Type:</span>
                      <span className="ml-2 text-dark-300 capitalize">{formatKey(deviceType.key)}</span>
                    </div>
                    {deviceType.device?.id && (
                      <div className="col-span-2">
                        <span className="text-dark-500">Device ID:</span>
                        <span className="ml-2 text-dark-300 font-mono text-xs">{deviceType.device.id}</span>
                      </div>
                    )}
                  </div>

                  {deviceType.error && (
                    <p className="text-xs text-danger-400 bg-danger-500/10 border border-danger-500/30 rounded-lg p-3">
                      {deviceType.error}
                    </p>
                  )}

                  {connected && (
                    <div className="flex items-center gap-2 text-xs text-success-400">
                      <div className="w-2 h-2 rounded-full bg-success-400 animate-pulse" />
                      Device is actively transmitting data
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {status && (
        <div className="p-4 bg-dark-800/50 border border-dark-700 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-primary-400 animate-pulse" />
            <span className="text-sm text-dark-300">{status}</span>
          </div>
        </div>
      )}

      {env.canUse === false && (
        <div className="p-4 bg-warning-500/10 border border-warning-500/20 rounded-xl">
          <div className="flex items-start gap-3">
            <span className="text-warning-400 text-xl">⚠️</span>
            <div>
              <h4 className="font-medium text-warning-400">Bluetooth Not Available</h4>
              <p className="text-sm text-dark-400 mt-1">
                Your browser or environment doesn't support Bluetooth connections. Try using Chrome/Edge on desktop or check your
                connection settings.
              </p>
              <button
                onClick={onShowFix}
                className="mt-2 text-sm text-warning-400 hover:text-warning-300 underline"
              >
                Learn how to fix this
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <button onClick={onRefreshEnv} className="btn-secondary text-sm">
          Refresh Connections
        </button>

        {deviceTypes.some(({ device }) => isDeviceConnected(device)) && (
          <button
            onClick={onDisconnectAll}
            className="btn-secondary text-sm text-danger-400 hover:text-danger-300"
          >
            Disconnect All
          </button>
        )}
      </div>
    </div>
  );
};

export default BluetoothConnectPanel;
