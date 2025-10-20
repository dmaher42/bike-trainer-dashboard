import React, { useMemo, useState } from 'react';
import { BluetoothDevice, EnvironmentInfo } from '../types';
import { LoadingSpinner } from './LoadingStates';

type DeviceKey = 'ftms' | 'cps' | 'hr';

type DeviceMap = Partial<Record<DeviceKey, BluetoothDevice>>;

type DeviceState = {
  key: DeviceKey;
  name: string;
  description: string;
  icon: string;
  color: 'primary' | 'warning' | 'danger';
  connect: () => void;
  isConnecting: boolean;
  device?: BluetoothDevice;
};

interface BluetoothConnectPanelProps {
  env: EnvironmentInfo;
  devices: DeviceMap;
  status?: string;
  onConnectFTMS: () => void;
  onConnectCPS: () => void;
  onConnectHR: () => void;
  onRefreshEnv: () => void;
  onShowFix: () => void;
  onDisconnectDevice?: (key: DeviceKey) => void;
  onDisconnectAll?: () => void;
  isConnecting?: Partial<Record<DeviceKey, boolean>>;
}

const getStatusBadge = (device: BluetoothDevice | undefined, isConnecting: boolean) => {
  if (isConnecting) {
    return (
      <div className="flex items-center gap-2 text-xs text-primary-400">
        <LoadingSpinner size="sm" />
        Connecting...
      </div>
    );
  }

  if (device?.connected) {
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

export const BluetoothConnectPanel: React.FC<BluetoothConnectPanelProps> = ({
  env,
  devices,
  status,
  onConnectFTMS,
  onConnectCPS,
  onConnectHR,
  onRefreshEnv,
  onShowFix,
  onDisconnectDevice,
  onDisconnectAll,
  isConnecting = {},
}) => {
  const [expandedDevice, setExpandedDevice] = useState<DeviceKey | null>(null);

  const deviceStates = useMemo<DeviceState[]>(
    () => [
      {
        key: 'ftms',
        name: 'Smart Trainer',
        description: 'Controls resistance and provides power/cadence/speed data',
        icon: '🚴',
        color: 'primary',
        connect: onConnectFTMS,
        isConnecting: Boolean(isConnecting.ftms),
        device: devices.ftms,
      },
      {
        key: 'cps',
        name: 'Power Meter',
        description: 'Provides accurate power and cadence data',
        icon: '⚡',
        color: 'warning',
        connect: onConnectCPS,
        isConnecting: Boolean(isConnecting.cps),
        device: devices.cps,
      },
      {
        key: 'hr',
        name: 'Heart Rate Monitor',
        description: 'Provides real-time heart rate data',
        icon: '❤️',
        color: 'danger',
        connect: onConnectHR,
        isConnecting: Boolean(isConnecting.hr),
        device: devices.hr,
      },
    ],
    [devices, isConnecting, onConnectCPS, onConnectFTMS, onConnectHR],
  );

  const canUseBluetooth = env.canUse ?? false;

  const handleDisconnectAll = () => {
    if (onDisconnectAll) {
      onDisconnectAll();
      return;
    }

    if (!onDisconnectDevice) {
      return;
    }

    (Object.keys(devices) as DeviceKey[]).forEach((key) => {
      const device = devices[key];
      if (device?.connected) {
        onDisconnectDevice(key);
      }
    });
  };

  return (
    <div className="glass-card p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-dark-200">Device Connections</h3>
          <p className="text-sm text-dark-400 mt-1">
            Connect your Bluetooth devices to start tracking metrics
          </p>
        </div>

        {!canUseBluetooth && (
          <button onClick={onShowFix} className="btn-warning text-sm">
            Fix Bluetooth
          </button>
        )}
      </div>

      <div className="space-y-4">
        {deviceStates.map((deviceState) => (
          <div
            key={deviceState.key}
            className={`glass-card-hover p-4 cursor-pointer transition-all duration-200 ${
              expandedDevice === deviceState.key ? 'ring-2 ring-primary-500/50' : ''
            }`}
            onClick={() =>
              setExpandedDevice(
                expandedDevice === deviceState.key ? null : deviceState.key,
              )
            }
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-3xl">{deviceState.icon}</div>
                <div>
                  <h4 className="font-medium text-dark-200">{deviceState.name}</h4>
                  <p className="text-sm text-dark-400">{deviceState.description}</p>
                  {deviceState.device?.name && (
                    <p className="text-xs text-dark-500 mt-1">
                      Device: {deviceState.device.name}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {getStatusBadge(deviceState.device, deviceState.isConnecting)}
                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!deviceState.device?.connected && !deviceState.isConnecting) {
                      deviceState.connect();
                    }
                  }}
                  disabled={!canUseBluetooth || deviceState.device?.connected || deviceState.isConnecting}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    deviceState.device?.connected
                      ? 'bg-success-500/20 text-success-400 border border-success-500/30'
                      : deviceState.isConnecting
                        ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                        : canUseBluetooth
                          ? `btn-${deviceState.color}`
                          : 'bg-dark-800 text-dark-500 cursor-not-allowed'
                  }`}
                >
                  {deviceState.device?.connected
                    ? 'Connected'
                    : deviceState.isConnecting
                      ? 'Connecting...'
                      : !canUseBluetooth
                        ? 'Unavailable'
                        : 'Connect'}
                </button>
              </div>
            </div>

            {expandedDevice === deviceState.key && (
              <div className="mt-4 pt-4 border-t border-glass-border space-y-3 animate-slide-down">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-dark-500">Status:</span>
                    <span className="ml-2 text-dark-300">
                      {deviceState.device?.connected ? 'Connected' : 'Disconnected'}
                    </span>
                  </div>
                  <div>
                    <span className="text-dark-500">Type:</span>
                    <span className="ml-2 text-dark-300 capitalize">
                      {deviceState.key.replace(/([A-Z])/g, ' $1').trim()}
                    </span>
                  </div>
                  {deviceState.device?.id && (
                    <div className="col-span-2">
                      <span className="text-dark-500">Device ID:</span>
                      <span className="ml-2 text-dark-300 font-mono text-xs">
                        {deviceState.device.id}
                      </span>
                    </div>
                  )}
                </div>

                {deviceState.device?.connected && (
                  <div className="flex items-center gap-2 text-xs text-success-400">
                    <div className="w-2 h-2 rounded-full bg-success-400 animate-pulse" />
                    Device is actively transmitting data
                  </div>
                )}

                {deviceState.device?.connected && onDisconnectDevice && (
                  <button
                    type="button"
                    className="btn-secondary text-xs text-danger-400 hover:text-danger-300"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDisconnectDevice(deviceState.key);
                    }}
                  >
                    Disconnect Device
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {status && (
        <div className="p-4 bg-dark-800/50 border border-dark-700 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-primary-400 animate-pulse" />
            <span className="text-sm text-dark-300">{status}</span>
          </div>
        </div>
      )}

      {!canUseBluetooth && (
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

        {Object.values(devices).some((device) => device?.connected) && (
          <button
            onClick={handleDisconnectAll}
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
