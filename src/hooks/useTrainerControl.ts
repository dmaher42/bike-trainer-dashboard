import { useCallback, useEffect, useRef } from "react";

import type { BluetoothDevice as AppBluetoothDevice } from "../types";

const FTMS_SERVICE_UUID: BluetoothServiceUUID = 0x1826;
const TARGET_POWER_CHARACTERISTIC_UUID: BluetoothCharacteristicUUID = 0x2ad7;

const toUint16LittleEndian = (value: number): Uint8Array => {
  const buffer = new ArrayBuffer(2);
  const view = new DataView(buffer);
  view.setUint16(0, value, true);
  return new Uint8Array(buffer);
};

const clampPower = (watts: number): number => {
  if (!Number.isFinite(watts)) {
    return 0;
  }

  return Math.min(2000, Math.max(0, Math.round(watts)));
};

const isNavigatorWithBluetooth = (
  value: Navigator | undefined,
): value is Navigator & { bluetooth: Bluetooth } =>
  typeof value !== "undefined" && typeof value.bluetooth !== "undefined";

const writeCharacteristic = async (
  characteristic: BluetoothRemoteGATTCharacteristic,
  payload: Uint8Array,
) => {
  if ("writeValueWithoutResponse" in characteristic) {
    try {
      await characteristic.writeValueWithoutResponse(payload);
      return;
    } catch (error) {
      console.warn("Failed to writeValueWithoutResponse, retrying with writeValue", error);
    }
  }

  await characteristic.writeValue(payload);
};

const findMatchingDevice = async (
  deviceId: string,
): Promise<BluetoothDevice | null> => {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  if (!isNavigatorWithBluetooth(nav)) {
    return null;
  }

  if (!("getDevices" in nav.bluetooth) || typeof nav.bluetooth.getDevices !== "function") {
    return null;
  }

  try {
    const devices = await nav.bluetooth.getDevices();
    return devices.find((device) => device.id === deviceId) ?? null;
  } catch (error) {
    console.warn("Failed to enumerate Bluetooth devices", error);
    return null;
  }
};

export const useTrainerControl = (
  ftmsDevice?: AppBluetoothDevice | null,
): {
  initializeControl: (device: AppBluetoothDevice) => Promise<void>;
  setTargetPower: (targetPower: number) => Promise<void>;
} => {
  const deviceRef = useRef<BluetoothDevice | null>(null);
  const characteristicRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null);

  useEffect(() => {
    if (!ftmsDevice?.connected) {
      deviceRef.current = null;
      characteristicRef.current = null;
    }
  }, [ftmsDevice?.connected]);

  const initializeControl = useCallback(
    async (device: AppBluetoothDevice) => {
      if (!device?.id) {
        return;
      }

      const existing = deviceRef.current;
      if (existing?.id === device.id && characteristicRef.current) {
        return;
      }

      const browserDevice = await findMatchingDevice(device.id);
      if (!browserDevice) {
        console.warn("Unable to locate FTMS device for trainer control", device.id);
        return;
      }

      if (!browserDevice.gatt) {
        console.warn("Connected FTMS device does not expose a GATT server", browserDevice.id);
        return;
      }

      let gattServer = browserDevice.gatt;
      if (!browserDevice.gatt.connected) {
        try {
          gattServer = await browserDevice.gatt.connect();
        } catch (error) {
          console.error("Failed to connect to FTMS GATT server", error);
          return;
        }
      }

      try {
        const service = await gattServer.getPrimaryService(FTMS_SERVICE_UUID);
        const characteristic = await service.getCharacteristic(
          TARGET_POWER_CHARACTERISTIC_UUID,
        );
        deviceRef.current = browserDevice;
        characteristicRef.current = characteristic;
      } catch (error) {
        console.error("Failed to initialise trainer control", error);
      }
    },
    [],
  );

  const setTargetPower = useCallback(async (targetPower: number) => {
    const characteristic = characteristicRef.current;
    if (!characteristic) {
      return;
    }

    const payload = toUint16LittleEndian(clampPower(targetPower));

    try {
      await writeCharacteristic(characteristic, payload);
    } catch (error) {
      console.error("Failed to set trainer target power", error);
    }
  }, []);

  return {
    initializeControl,
    setTargetPower,
  };
};

export default useTrainerControl;
