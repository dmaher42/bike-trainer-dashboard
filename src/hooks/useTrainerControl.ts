import { useCallback, useRef } from 'react';

import { UUIDS, toUuid16 } from '../utils/bluetoothUtils';

export function useTrainerControl(device: BluetoothDevice | null) {
  const controlCharacteristic =
    useRef<BluetoothRemoteGATTCharacteristic | null>(null);

  const setTargetPower = useCallback(
    async (powerWatts: number) => {
      if (!device?.connected || !controlCharacteristic.current) return;

      try {
        // FTMS Set Target Power command
        const buffer = new ArrayBuffer(3);
        const view = new DataView(buffer);
        view.setUint8(0, 0x05); // Set Target Power opcode
        view.setUint16(1, powerWatts, true); // Power value (little endian)

        await controlCharacteristic.current.writeValue(buffer);
      } catch (error) {
        console.error('Failed to set target power:', error);
      }
    },
    [device],
  );

  const setResistance = useCallback(
    async (resistanceLevel: number) => {
      if (!device?.connected || !controlCharacteristic.current) return;

      try {
        // FTMS Set Resistance Level command
        const buffer = new ArrayBuffer(2);
        const view = new DataView(buffer);
        view.setUint8(0, 0x04); // Set Resistance Level opcode
        view.setUint8(1, Math.max(0, Math.min(100, resistanceLevel))); // Resistance 0-100

        await controlCharacteristic.current.writeValue(buffer);
      } catch (error) {
        console.error('Failed to set resistance:', error);
      }
    },
    [device],
  );

  const initializeControl = useCallback(async (device: BluetoothDevice) => {
    try {
      // Get the control characteristic for FTMS
      const server = (device as any).gatt?.server;
      if (!server) return;

      const service = await server.getPrimaryService(UUIDS.FTMS);
      controlCharacteristic.current = await service.getCharacteristic(
        toUuid16(0x2ad9),
      ); // Fitness Machine Control Point
    } catch (error) {
      console.error('Failed to initialize trainer control:', error);
    }
  }, []);

  return {
    setTargetPower,
    setResistance,
    initializeControl,
  };
}
