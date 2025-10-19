import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BluetoothDevice as AppBluetoothDevice, EnvironmentInfo } from '../types';

type DeviceKind = 'ftms' | 'cps' | 'hr';

type ConnectionStatus = 'idle' | 'requesting' | 'connecting' | 'connected' | 'error';

type StatusMap = Record<DeviceKind, ConnectionStatus>;

type ErrorMap = Partial<Record<DeviceKind, string>>;

interface UseBluetoothResult {
  environment: EnvironmentInfo;
  statuses: StatusMap;
  errors: ErrorMap;
  connectedDevices: Partial<Record<DeviceKind, AppBluetoothDevice>>;
  refreshEnvironment: () => Promise<void>;
  connectFTMS: () => Promise<void>;
  connectCPS: () => Promise<void>;
  connectHR: () => Promise<void>;
  disconnect: (kind: DeviceKind) => void;
}

interface CleanupOptions {
  resetStatus?: boolean;
  clearError?: boolean;
}

const SERVICE_UUIDS: Record<DeviceKind, BluetoothServiceUUID> = {
  ftms: 0x1826,
  cps: 0x1818,
  hr: 0x180d,
};

const DEFAULT_ENVIRONMENT: EnvironmentInfo = {
  supportsBluetooth: false,
  bluetoothAvailable: false,
  bluetoothEnabled: false,
};

const INITIAL_STATUSES: StatusMap = {
  ftms: 'idle',
  cps: 'idle',
  hr: 'idle',
};

const createAppDevice = (device: globalThis.BluetoothDevice): AppBluetoothDevice => ({
  id: device.id,
  name: device.name ?? 'Unknown device',
  connected: device.gatt?.connected ?? false,
});

const isNavigatorWithBluetooth = (
  value: Navigator | undefined,
): value is Navigator & { bluetooth: Bluetooth } =>
  typeof value !== 'undefined' && typeof value.bluetooth !== 'undefined';

const isFunction = <T extends (...args: never[]) => unknown>(value: unknown): value is T =>
  typeof value === 'function';

export const useBluetooth = (): UseBluetoothResult => {
  const [environment, setEnvironment] = useState<EnvironmentInfo>(DEFAULT_ENVIRONMENT);
  const [statuses, setStatuses] = useState<StatusMap>(INITIAL_STATUSES);
  const [errors, setErrors] = useState<ErrorMap>({});
  const [connectedDevices, setConnectedDevices] = useState<
    Partial<Record<DeviceKind, AppBluetoothDevice>>
  >({});

  const deviceRefs = useRef<Partial<Record<DeviceKind, globalThis.BluetoothDevice>>>({});
  const disconnectListeners = useRef<Partial<Record<DeviceKind, EventListener>>>({});

  const updateStatus = useCallback((kind: DeviceKind, status: ConnectionStatus) => {
    setStatuses((prev) => ({ ...prev, [kind]: status }));
  }, []);

  const clearError = useCallback((kind: DeviceKind) => {
    setErrors((prev) => {
      if (!(kind in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[kind];
      return next;
    });
  }, []);

  const setError = useCallback((kind: DeviceKind, message: string) => {
    setErrors((prev) => ({ ...prev, [kind]: message }));
  }, []);

  const refreshEnvironment = useCallback(async () => {
    const nav = typeof navigator === 'undefined' ? undefined : navigator;
    const supportsBluetooth = isNavigatorWithBluetooth(nav);

    let bluetoothAvailable = false;
    let bluetoothEnabled = false;

    if (supportsBluetooth) {
      const { bluetooth } = nav;
      if (isFunction(bluetooth.getAvailability)) {
        try {
          bluetoothAvailable = await bluetooth.getAvailability();
        } catch (error) {
          console.warn('Failed to determine bluetooth availability', error);
          bluetoothAvailable = true;
        }
      } else {
        bluetoothAvailable = true;
      }

      bluetoothEnabled = bluetoothAvailable;
    }

    setEnvironment({ supportsBluetooth, bluetoothAvailable, bluetoothEnabled });
  }, []);

  const cleanupDevice = useCallback((kind: DeviceKind, options: CleanupOptions = {}) => {
    const { resetStatus = true, clearError: shouldClearError = true } = options;
    const device = deviceRefs.current[kind];
    const listener = disconnectListeners.current[kind];

    if (device && listener) {
      device.removeEventListener('gattserverdisconnected', listener);
    }

    if (device?.gatt?.connected) {
      try {
        device.gatt.disconnect();
      } catch (error) {
        console.warn('Failed to disconnect device', error);
      }
    }

    delete deviceRefs.current[kind];
    delete disconnectListeners.current[kind];

    setConnectedDevices((prev) => {
      if (!(kind in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[kind];
      return next;
    });

    if (resetStatus) {
      updateStatus(kind, 'idle');
    }

    if (shouldClearError) {
      clearError(kind);
    }
  }, [clearError, updateStatus]);

  const handleDisconnection = useCallback(
    (kind: DeviceKind) => () => {
      cleanupDevice(kind);
    },
    [cleanupDevice],
  );

  const connectDevice = useCallback(
    async (kind: DeviceKind) => {
      const nav = typeof navigator === 'undefined' ? undefined : navigator;
      if (!isNavigatorWithBluetooth(nav)) {
        setError(kind, 'This environment does not support Web Bluetooth.');
        updateStatus(kind, 'error');
        return;
      }

      updateStatus(kind, 'requesting');
      clearError(kind);

      const { bluetooth } = nav;

      try {
        const device = await bluetooth.requestDevice({
          filters: [{ services: [SERVICE_UUIDS[kind]] }],
          optionalServices: [SERVICE_UUIDS[kind]],
        });

        updateStatus(kind, 'connecting');

        deviceRefs.current[kind] = device;

        const onDisconnected = handleDisconnection(kind);
        device.addEventListener('gattserverdisconnected', onDisconnected);
        disconnectListeners.current[kind] = onDisconnected;

        if (!device.gatt) {
          throw new Error('Device does not support GATT.');
        }

        const server = await device.gatt.connect();
        if (!server.connected) {
          throw new Error('Failed to establish a GATT connection.');
        }

        updateStatus(kind, 'connected');
        setEnvironment((prev) => ({ ...prev, bluetoothEnabled: true }));
        setConnectedDevices((prev) => ({ ...prev, [kind]: createAppDevice(device) }));
      } catch (error) {
        console.error('Failed to connect to device', error);
        setError(kind, error instanceof Error ? error.message : 'Failed to connect to device.');
        updateStatus(kind, 'error');
        cleanupDevice(kind, { resetStatus: false, clearError: false });
      }
    },
    [clearError, cleanupDevice, handleDisconnection, setError, updateStatus],
  );

  const disconnect = useCallback(
    (kind: DeviceKind) => {
      cleanupDevice(kind);
    },
    [cleanupDevice],
  );

  const connectFTMS = useCallback(() => connectDevice('ftms'), [connectDevice]);
  const connectCPS = useCallback(() => connectDevice('cps'), [connectDevice]);
  const connectHR = useCallback(() => connectDevice('hr'), [connectDevice]);

  useEffect(() => {
    void refreshEnvironment();
  }, [refreshEnvironment]);

  useEffect(() => {
    return () => {
      (Object.keys(SERVICE_UUIDS) as DeviceKind[]).forEach((kind) => {
        cleanupDevice(kind);
      });
    };
  }, [cleanupDevice]);

  return useMemo(
    () => ({
      environment,
      statuses,
      errors,
      connectedDevices,
      refreshEnvironment,
      connectFTMS,
      connectCPS,
      connectHR,
      disconnect,
    }),
    [connectCPS, connectFTMS, connectHR, connectedDevices, disconnect, environment, errors, refreshEnvironment, statuses],
  );
};

export default useBluetooth;
