import React from 'react';
import { BluetoothDevice, EnvironmentInfo } from '../types';

interface ModernHeaderProps {
  env: EnvironmentInfo;
  devices: Partial<Record<string, BluetoothDevice>>;
  sim: boolean;
  onSimToggle: (enabled: boolean) => void;
}

export const ModernHeader: React.FC<ModernHeaderProps> = ({
  env,
  devices,
  sim,
  onSimToggle,
}) => {
  const bluetoothStatus = env.canUse
    ? { text: "Bluetooth Ready", type: "success" as const }
    : { text: "Simulator Mode", type: "warning" as const };

  return (
    <header className="relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary-900/20 via-transparent to-success-900/20" />
      
      <div className="relative max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Title section */}
          <div className="space-y-2">
            <h1 className="text-4xl lg:text-5xl font-bold font-display bg-gradient-to-r from-primary-400 via-primary-500 to-success-400 bg-clip-text text-transparent animate-pulse-slow">
              Bike Trainer Dashboard
            </h1>
            <p className="text-dark-400 text-lg max-w-2xl">
              Connect your smart trainer and track your performance with real-time metrics and interactive routes.
            </p>
          </div>

          {/* Status section */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            {/* Bluetooth status */}
            <div className={`status-badge ${bluetoothStatus.type}`}>
              <div className={`w-2 h-2 rounded-full ${bluetoothStatus.type === 'success' ? 'bg-success-400 animate-pulse' : 'bg-warning-400'}`} />
              {bluetoothStatus.text}
            </div>

            {/* Simulator toggle */}
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={sim}
                  onChange={(e) => onSimToggle(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-14 h-7 bg-dark-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-primary-600"></div>
              </div>
              <span className="text-dark-300 font-medium group-hover:text-dark-200 transition-colors">
                Simulator
              </span>
            </label>
          </div>
        </div>

        {/* Connected devices */}
        <div className="mt-6 flex flex-wrap gap-3">
          {Object.entries(devices).map(([key, device]) => (
            device.connected && (
              <div key={key} className="status-badge success animate-slide-up">
                <div className="w-2 h-2 rounded-full bg-success-400 animate-pulse" />
                {device.name}
              </div>
            )
          ))}
        </div>
      </div>
    </header>
  );
};
