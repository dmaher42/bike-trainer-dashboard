export interface BluetoothDevice {
  id: string;
  name: string;
  connected: boolean;
}

export interface Metrics {
  power: number;
  cadence: number;
  speed: number;
  distance: number;
  hr: number;
}

export interface Sample extends Metrics {
  timestamp: number;
  elapsed: number;
}

export interface RoutePoint {
  x: number;
  y: number;
  elevation?: number;
}

export interface Route {
  pts: RoutePoint[];
  cum: number[];
  total: number;
  name?: string;
}

export interface EnvironmentInfo {
  supportsBluetooth: boolean;
  bluetoothAvailable: boolean;
  bluetoothEnabled: boolean;
}

export interface WorkoutInterval {
  duration: number;
  targetPower: number;
}

export interface WorkoutPlan {
  id: string;
  name: string;
  intervals: WorkoutInterval[];
}

export interface MetricProps {
  label: string;
  value: number | string;
  unit?: string;
}
