import React from 'react';
import { BluetoothDevice, EnvironmentInfo } from '../types';
import { LoadingSpinner } from './LoadingStates';

interface BluetoothStatusDisplayProps {
  env: EnvironmentInfo;
  devices: Record<string, BluetoothDevice>;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

type StatusBadge = {
  text: string;
  type: 'success' | 'warning' | 'danger';
  description: string;
  icon: string;
};

const formatKey = (key: string) => key.replace(/([A-Z])/g, ' $1').trim();

const getStatusBadge = (
  env: EnvironmentInfo,
  devices: Record<string, BluetoothDevice>,
): StatusBadge => {
  if (!env.canUse) {
    return {
      text: 'Bluetooth Unavailable',
      type: 'danger',
      description: 'Bluetooth is not available in this environment',
      icon: '🚫',
    };
  }

  const connectedCount = Object.values(devices).filter((device) => device.connected).length;
  const totalCount = Object.keys(devices).length;

  if (connectedCount === 0) {
    return {
      text: 'No Devices Connected',
      type: 'warning',
      description: 'Connect your devices to start tracking metrics',
      icon: '📡',
    };
  }

  if (connectedCount === totalCount && totalCount > 0) {
    return {
      text: 'All Devices Connected',
      type: 'success',
      description: `${connectedCount} device${connectedCount > 1 ? 's' : ''} ready`,
      icon: '✅',
    };
  }

  return {
    text: 'Partially Connected',
    type: 'warning',
    description: `${connectedCount} of ${totalCount} devices connected`,
    icon: '⚠️',
  };
};

const getIndicatorClass = (value: boolean | null) => {
  if (value === true) return 'bg-success-400';
  if (value === false) return 'bg-danger-400';
  return 'bg-warning-400';
};

const getIndicatorLabel = (value: boolean | null, trueLabel: string, falseLabel: string) => {
  if (value === true) return trueLabel;
  if (value === false) return falseLabel;
  return 'Unknown';
};

export const BluetoothStatusDisplay: React.FC<BluetoothStatusDisplayProps> = ({
  env,
  devices,
  onRefresh,
  isRefreshing = false,
}) => {
  const status = React.useMemo(() => getStatusBadge(env, devices), [env, devices]);
  const connectedDevices = React.useMemo(
    () => Object.entries(devices).filter(([, device]) => device.connected),
    [devices],
  );
  const availableDevices = React.useMemo(
    () => Object.entries(devices).filter(([, device]) => !device.connected),
    [devices],
  );

  return (
    <div className="glass-card p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full ${
              status.type === 'success'
                ? 'bg-success-400 animate-pulse'
                : status.type === 'warning'
                  ? 'bg-warning-400'
                  : 'bg-danger-400'
            }`}
          />
          <h3 className="text-lg font-semibold text-dark-200">Bluetooth Status</h3>
        </div>

        <button onClick={onRefresh} disabled={isRefreshing} className="btn-secondary p-2 disabled:opacity-50">
          {isRefreshing ? (
            <LoadingSpinner size="sm" />
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          )}
        </button>
      </div>

      <div className={`status-badge ${status.type} p-4`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{status.icon}</span>
          <div>
            <div className="font-medium text-dark-200">{status.text}</div>
            <div className="text-sm text-dark-400">{status.description}</div>
          </div>
        </div>
      </div>

      {connectedDevices.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-dark-400 uppercase tracking-wider">
            Connected Devices ({connectedDevices.length})
          </h4>
          <div className="space-y-2">
            {connectedDevices.map(([key, device]) => (
              <div
                key={key}
                className="flex items-center justify-between p-3 bg-success-500/10 border border-success-500/20 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-success-400 animate-pulse" />
                  <div>
                    <div className="font-medium text-dark-200">{device.name}</div>
                    <div className="text-xs text-dark-500 capitalize">{formatKey(key)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-success-400 animate-pulse" />
                  <span className="text-xs text-success-400 font-medium">Connected</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {availableDevices.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-dark-400 uppercase tracking-wider">
            Available Devices ({availableDevices.length})
          </h4>
          <div className="space-y-2">
            {availableDevices.map(([key, device]) => (
              <div key={key} className="flex items-center justify-between p-3 bg-dark-800/50 border border-dark-700 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-dark-600" />
                  <div>
                    <div className="font-medium text-dark-300">{device.name || `${key} Device`}</div>
                    <div className="text-xs text-dark-500 capitalize">{formatKey(key)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-warning-400" />
                  <span className="text-xs text-warning-400 font-medium">Disconnected</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${getIndicatorClass(env.isSecure)}`} />
          <span className="text-dark-400">Secure: {getIndicatorLabel(env.isSecure, 'Yes', 'No')}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${getIndicatorClass(env.hasBT)}`} />
          <span className="text-dark-400">BT Available: {getIndicatorLabel(env.hasBT, 'Yes', 'No')}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${getIndicatorClass(env.policy)}`} />
          <span className="text-dark-400">
            Policy: {getIndicatorLabel(env.policy, 'Allowed', 'Blocked')}
          </span>
        </div>
      </div>
    </div>
  );
};

