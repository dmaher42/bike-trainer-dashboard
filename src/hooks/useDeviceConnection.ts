import { useState, useCallback } from 'react';

export interface ConnectionState {
  isConnecting: {
    ftms?: boolean;
    cps?: boolean;
    hr?: boolean;
  };
  lastConnected: {
    ftms?: number;
    cps?: number;
    hr?: number;
  };
  connectionHistory: Array<{
    deviceType: string;
    timestamp: number;
    success: boolean;
    error?: string;
  }>;
}

export function useDeviceConnection() {
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnecting: {},
    lastConnected: {},
    connectionHistory: [],
  });

  const startConnection = useCallback((deviceType: 'ftms' | 'cps' | 'hr') => {
    setConnectionState(prev => ({
      ...prev,
      isConnecting: {
        ...prev.isConnecting,
        [deviceType]: true,
      },
    }));
  }, []);

  const endConnection = useCallback((
    deviceType: 'ftms' | 'cps' | 'hr',
    success: boolean,
    error?: string,
  ) => {
    setConnectionState(prev => ({
      ...prev,
      isConnecting: {
        ...prev.isConnecting,
        [deviceType]: false,
      },
      lastConnected: success
        ? {
            ...prev.lastConnected,
            [deviceType]: Date.now(),
          }
        : prev.lastConnected,
      connectionHistory: [
        ...prev.connectionHistory.slice(-9),
        {
          deviceType,
          timestamp: Date.now(),
          success,
          error,
        },
      ],
    }));
  }, []);

  const getConnectionTime = useCallback(
    (deviceType: 'ftms' | 'cps' | 'hr') => {
      const lastConnected = connectionState.lastConnected[deviceType];
      if (!lastConnected) return null;

      const now = Date.now();
      const diff = now - lastConnected;

      if (diff < 60000) return `${Math.floor(diff / 1000)}s`;
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
      return `${Math.floor(diff / 3600000)}h`;
    },
    [connectionState.lastConnected],
  );

  const clearHistory = useCallback(() => {
    setConnectionState(prev => ({
      ...prev,
      connectionHistory: [],
    }));
  }, []);

  return {
    connectionState,
    startConnection,
    endConnection,
    getConnectionTime,
    clearHistory,
  };
}
