import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BluetoothDevice as AppBluetoothDevice, EnvironmentInfo } from '../types';
import { UUIDS, checkPolicyAllowed } from '../utils/bluetoothUtils';
import { speedFromPower } from '../utils/metricsUtils';
import { useDeviceConnection } from './useDeviceConnection';
import type { ConnectionState } from './useDeviceConnection';

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
  connectionState: ConnectionState;
  getConnectionTime: (deviceType: DeviceKind) => string | null;
}

interface CleanupOptions {
  resetStatus?: boolean;
  clearError?: boolean;
}

export const SERVICE_UUIDS: Record<DeviceKind, BluetoothServiceUUID> = {
  ftms: 0x1826,
  cps: 0x1818,
  hr: 0x180d,
};

const DEFAULT_ENVIRONMENT: EnvironmentInfo = {
  isTopLevel: null,
  isSecure: null,
  hasBT: null,
  policy: null,
  availability: null,
  canUse: null,
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

const recalculateCanUse = (info: EnvironmentInfo): boolean | null => {
  if (info.policy === false || info.isSecure === false || info.hasBT === false) {
    return false;
  }

  if (!info.supportsBluetooth) {
    return info.hasBT === null ? info.canUse : false;
  }

  if (
    info.availability === false ||
    info.bluetoothAvailable === false ||
    info.bluetoothEnabled === false
  ) {
    return false;
  }

  if (
    info.policy === null ||
    info.isSecure === null ||
    info.hasBT === null ||
    info.availability === null
  ) {
    return info.canUse;
  }

  return true;
};

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

  const { connectionState, startConnection, endConnection, getConnectionTime } = useDeviceConnection();

  const deviceRefs = useRef<Partial<Record<DeviceKind, globalThis.BluetoothDevice>>>({});
  const disconnectListeners = useRef<Partial<Record<DeviceKind, EventListener>>>({});
  const characteristicRefs = useRef<
    Partial<Record<DeviceKind, BluetoothRemoteGATTCharacteristic>>
  >({});
  const notificationListeners = useRef<Partial<Record<DeviceKind, EventListener>>>({});
  const cpsCrankDataRef = useRef<{ revolutions: number; eventTime: number } | null>(null);

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
    const hasNavigator = typeof navigator !== 'undefined';
    const supportsBluetooth = isNavigatorWithBluetooth(nav);
    const policyAllowed = checkPolicyAllowed();
    const isTopLevel =
      typeof window === 'undefined'
        ? null
        : typeof window.top !== 'undefined'
          ? window.top === window.self
          : null;
    const isSecure = typeof window === 'undefined' ? null : window.isSecureContext ?? null;

    let bluetoothAvailable = false;
    let bluetoothEnabled = false;

    if (supportsBluetooth && nav) {
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

    const availability = supportsBluetooth
      ? bluetoothAvailable
      : hasNavigator
        ? false
        : null;
    const hasBT = hasNavigator ? supportsBluetooth : null;

    const baseEnvironment: EnvironmentInfo = {
      isTopLevel,
      isSecure,
      hasBT,
      policy: typeof document === 'undefined' ? null : policyAllowed,
      availability,
      canUse: null,
      supportsBluetooth,
      bluetoothAvailable,
      bluetoothEnabled,
    };

    setEnvironment({ ...baseEnvironment, canUse: recalculateCanUse(baseEnvironment) });
  }, []);

  const cleanupDevice = useCallback((kind: DeviceKind, options: CleanupOptions = {}) => {
    const { resetStatus = true, clearError: shouldClearError = true } = options;
    const device = deviceRefs.current[kind];
    const listener = disconnectListeners.current[kind];
    const characteristic = characteristicRefs.current[kind];
    const notificationListener = notificationListeners.current[kind];

    if (kind === 'cps') {
      const cpsCharacteristic = characteristicRefs.current.cps;
      const cpsListener = notificationListeners.current.cps;
      if (cpsCharacteristic && cpsListener) {
        try {
          cpsCharacteristic.removeEventListener('characteristicvaluechanged', cpsListener);
        } catch (error) {
          console.warn('Failed to remove characteristic listener', error);
        }
      }
    }

    if (characteristic) {
      if (notificationListener && kind !== 'cps') {
        try {
          characteristic.removeEventListener('characteristicvaluechanged', notificationListener);
        } catch (error) {
          console.warn('Failed to remove characteristic listener', error);
        }
      }

      try {
        const stopResult = characteristic.stopNotifications();
        if (stopResult instanceof Promise) {
          void stopResult.catch((error) => {
            console.warn('Failed to stop notifications', error);
          });
        }
      } catch (error) {
        console.warn('Failed to stop notifications', error);
      }
    }

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

    deviceRefs.current[kind] = undefined;
    disconnectListeners.current[kind] = undefined;

    if (kind === 'cps') {
      notificationListeners.current.cps = undefined;
      characteristicRefs.current.cps = undefined;
      cpsCrankDataRef.current = null;
    } else {
      characteristicRefs.current[kind] = undefined;
      notificationListeners.current[kind] = undefined;
    }

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

      startConnection(kind);
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
        setEnvironment((prev) => {
          const next: EnvironmentInfo = {
            ...prev,
            bluetoothAvailable: true,
            bluetoothEnabled: true,
            availability: true,
          };
          return { ...next, canUse: recalculateCanUse(next) };
        });
        setConnectedDevices((prev) => ({ ...prev, [kind]: createAppDevice(device) }));
        endConnection(kind, true);
      } catch (error) {
        console.error('Failed to connect to device', error);
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to connect to device.';
        setError(kind, errorMessage);
        updateStatus(kind, 'error');
        endConnection(kind, false, errorMessage);
        cleanupDevice(kind, { resetStatus: false, clearError: false });
      }
    },
    [
      clearError,
      cleanupDevice,
      endConnection,
      handleDisconnection,
      setError,
      startConnection,
      updateStatus,
    ],
  );

  const disconnect = useCallback(
    (kind: DeviceKind) => {
      cleanupDevice(kind);
    },
    [cleanupDevice],
  );

  const connectFTMS = useCallback(async () => {
    const nav = typeof navigator === 'undefined' ? undefined : navigator;
    if (!isNavigatorWithBluetooth(nav)) {
      setError('ftms', 'This environment does not support Web Bluetooth.');
      updateStatus('ftms', 'error');
      return;
    }

    startConnection('ftms');
    updateStatus('ftms', 'requesting');
    clearError('ftms');

    const { bluetooth } = nav;

    try {
      const device = await bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUIDS.ftms] }],
        optionalServices: [SERVICE_UUIDS.ftms],
      });

      updateStatus('ftms', 'connecting');

      deviceRefs.current.ftms = device;

      const onDisconnected = handleDisconnection('ftms');
      device.addEventListener('gattserverdisconnected', onDisconnected);
      disconnectListeners.current.ftms = onDisconnected;

      if (!device.gatt) {
        throw new Error('Device does not support GATT.');
      }

      const server = await device.gatt.connect();
      if (!server.connected) {
        throw new Error('Failed to establish a GATT connection.');
      }

      const service = await server.getPrimaryService(SERVICE_UUIDS.ftms);
      const characteristic = await service.getCharacteristic(UUIDS.INDOOR_BIKE_DATA);

      const handleNotification: EventListener = (event) => {
        const target = event.target as BluetoothRemoteGATTCharacteristic | null;
        const value = target?.value;
        if (!value) {
          return;
        }

        let offset = 0;
        const flags = value.getUint16(offset, true);
        offset += 2;

        let speedKph = 0;
        let cadence = 0;
        let power = 0;

        if (flags & 0x0001) {
          const speedHundredths = value.getUint16(offset, true);
          offset += 2;
          speedKph = (speedHundredths / 100) * 3.6;
        }

        if (flags & 0x0004) {
          const cadenceHalf = value.getUint16(offset, true);
          offset += 2;
          cadence = cadenceHalf / 2;
        }

        if (flags & 0x0040) {
          power = value.getInt16(offset, true);
          offset += 2;
        }

        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(
            new CustomEvent('ftms-data', {
              detail: {
                speed: speedKph,
                cadence,
                power,
              },
            }),
          );
        }
      };

      characteristic.addEventListener('characteristicvaluechanged', handleNotification);
      notificationListeners.current.ftms = handleNotification;
      characteristicRefs.current.ftms = characteristic;

      await characteristic.startNotifications();

      updateStatus('ftms', 'connected');
      setEnvironment((prev) => {
        const next: EnvironmentInfo = {
          ...prev,
          bluetoothAvailable: true,
          bluetoothEnabled: true,
          availability: true,
        };
        return { ...next, canUse: recalculateCanUse(next) };
      });
      setConnectedDevices((prev) => ({ ...prev, ftms: createAppDevice(device) }));
      endConnection('ftms', true);
    } catch (error) {
      console.error('Failed to connect to FTMS device', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to connect to device.';
      setError('ftms', errorMessage);
      updateStatus('ftms', 'error');
      endConnection('ftms', false, errorMessage);
      cleanupDevice('ftms', { resetStatus: false, clearError: false });
    }
  }, [
    clearError,
    cleanupDevice,
    endConnection,
    handleDisconnection,
    setError,
    startConnection,
    updateStatus,
    setEnvironment,
  ]);
  const connectCPS = useCallback(async () => {
    const nav = typeof navigator === 'undefined' ? undefined : navigator;
    if (!isNavigatorWithBluetooth(nav)) {
      setError('cps', 'This environment does not support Web Bluetooth.');
      updateStatus('cps', 'error');
      return;
    }

    startConnection('cps');
    updateStatus('cps', 'requesting');
    clearError('cps');

    try {
      const device = await nav.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUIDS.cps] }],
        optionalServices: [SERVICE_UUIDS.cps],
      });

      updateStatus('cps', 'connecting');
      deviceRefs.current.cps = device;

      const onDisconnected = handleDisconnection('cps');
      device.addEventListener('gattserverdisconnected', onDisconnected);
      disconnectListeners.current.cps = onDisconnected;

      if (!device.gatt) {
        throw new Error('Device does not support GATT.');
      }

      const server = await device.gatt.connect();
      if (!server.connected) {
        throw new Error('Failed to establish a GATT connection.');
      }

      const service = await server.getPrimaryService(SERVICE_UUIDS.cps);
      const characteristic = await service.getCharacteristic(UUIDS.CYCLING_POWER_MEASUREMENT);

      const handleNotification: EventListener = (event) => {
        const ch = event.target as BluetoothRemoteGATTCharacteristic | null;
        const value = ch?.value;
        if (!value) {
          return;
        }

        let offset = 0;
        const flags = value.getUint16(offset, true);
        offset += 2;
        const power = value.getInt16(offset, true);
        offset += 2;

        if (flags & 0x0001) {
          offset += 1;
        }

        if (flags & 0x0004) {
          offset += 2;
        }

        if (flags & 0x0010) {
          offset += 6;
        }

        let cadence: number | undefined;
        if (flags & 0x0020) {
          if (value.byteLength >= offset + 4) {
            const previous = cpsCrankDataRef.current;
            const revolutions = value.getUint16(offset, true);
            offset += 2;
            const eventTime = value.getUint16(offset, true);
            offset += 2;

            if (previous) {
              const revolutionDelta =
                revolutions >= previous.revolutions
                  ? revolutions - previous.revolutions
                  : revolutions + 0x10000 - previous.revolutions;
              const timeDeltaTicks =
                eventTime >= previous.eventTime
                  ? eventTime - previous.eventTime
                  : eventTime + 0x10000 - previous.eventTime;

              if (timeDeltaTicks > 0 && revolutionDelta >= 0) {
                const timeSeconds = timeDeltaTicks / 1024;
                const cadenceRpm = (revolutionDelta / timeSeconds) * 60;
                if (Number.isFinite(cadenceRpm)) {
                  cadence = cadenceRpm;
                }
              }
            }

            cpsCrankDataRef.current = { revolutions, eventTime };
          }
        } else {
          cpsCrankDataRef.current = null;
        }

        const speed = speedFromPower(power);

        if (typeof window !== 'undefined') {
          const detail: { power: number; cadence?: number; speed?: number } = { power };
          if (typeof cadence === 'number') {
            detail.cadence = cadence;
          }
          if (typeof speed === 'number') {
            detail.speed = speed;
          }

          window.dispatchEvent(new CustomEvent('ftms-data', { detail }));
        }
      };

      characteristic.addEventListener('characteristicvaluechanged', handleNotification);
      notificationListeners.current.cps = handleNotification;
      characteristicRefs.current.cps = characteristic;

      await characteristic.startNotifications();

      updateStatus('cps', 'connected');
      setEnvironment((prev) => {
        const next: EnvironmentInfo = {
          ...prev,
          bluetoothAvailable: true,
          bluetoothEnabled: true,
          availability: true,
        };
        return { ...next, canUse: recalculateCanUse(next) };
      });
      setConnectedDevices((prev) => ({ ...prev, cps: createAppDevice(device) }));
      endConnection('cps', true);
    } catch (error) {
      console.error('Failed to connect to CPS device', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect to device.';
      setError('cps', errorMessage);
      updateStatus('cps', 'error');
      endConnection('cps', false, errorMessage);
      cleanupDevice('cps', { resetStatus: false, clearError: false });
    }
  }, [
    clearError,
    cleanupDevice,
    endConnection,
    handleDisconnection,
    setConnectedDevices,
    setEnvironment,
    setError,
    startConnection,
    updateStatus,
  ]);
  const connectHR = useCallback(async () => {
    const nav = typeof navigator === 'undefined' ? undefined : navigator;
    if (!isNavigatorWithBluetooth(nav)) {
      setError('hr', 'This environment does not support Web Bluetooth.');
      updateStatus('hr', 'error');
      return;
    }

    startConnection('hr');
    updateStatus('hr', 'requesting');
    clearError('hr');

    const { bluetooth } = nav;

    try {
      const device = await bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUIDS.hr] }],
        optionalServices: [SERVICE_UUIDS.hr],
      });

      updateStatus('hr', 'connecting');

      deviceRefs.current.hr = device;

      const onDisconnected = handleDisconnection('hr');
      device.addEventListener('gattserverdisconnected', onDisconnected);
      disconnectListeners.current.hr = onDisconnected;

      if (!device.gatt) {
        throw new Error('Device does not support GATT.');
      }

      const server = await device.gatt.connect();
      if (!server.connected) {
        throw new Error('Failed to establish a GATT connection.');
      }

      const service = await server.getPrimaryService(SERVICE_UUIDS.hr);
      const characteristic = await service.getCharacteristic(UUIDS.HEART_RATE_MEASUREMENT);

      const handleNotification: EventListener = (event) => {
        const target = event.target as BluetoothRemoteGATTCharacteristic | null;
        const value = target?.value;
        if (!value) {
          return;
        }

        let offset = 0;
        const flags = value.getUint8(offset);
        offset += 1;
        const is16Bit = (flags & 0x01) !== 0;
        const heartRate = is16Bit ? value.getUint16(offset, true) : value.getUint8(offset);

        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          window.dispatchEvent(
            new CustomEvent('hr-data', {
              detail: { hr: heartRate },
            }),
          );
        }
      };

      characteristic.addEventListener('characteristicvaluechanged', handleNotification);
      notificationListeners.current.hr = handleNotification;
      characteristicRefs.current.hr = characteristic;

      await characteristic.startNotifications();

      updateStatus('hr', 'connected');
      setEnvironment((prev) => {
        const next: EnvironmentInfo = {
          ...prev,
          bluetoothAvailable: true,
          bluetoothEnabled: true,
          availability: true,
        };
        return { ...next, canUse: recalculateCanUse(next) };
      });
      setConnectedDevices((prev) => ({ ...prev, hr: createAppDevice(device) }));
      endConnection('hr', true);
    } catch (error) {
      console.error('Failed to connect to HR device', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to connect to device.';
      setError('hr', errorMessage);
      updateStatus('hr', 'error');
      endConnection('hr', false, errorMessage);
      cleanupDevice('hr', { resetStatus: false, clearError: false });
    }
  }, [
    clearError,
    cleanupDevice,
    endConnection,
    handleDisconnection,
    setError,
    startConnection,
    updateStatus,
    setEnvironment,
  ]);

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
      connectionState,
      getConnectionTime,
    }),
    [
      connectCPS,
      connectFTMS,
      connectHR,
      connectedDevices,
      connectionState,
      disconnect,
      environment,
      errors,
      getConnectionTime,
      refreshEnvironment,
      statuses,
    ],
  );
};

export default useBluetooth;
