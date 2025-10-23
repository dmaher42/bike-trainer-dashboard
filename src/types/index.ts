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

export interface Sample {
  ts: number;
  elapsed: number;
  power: number;
  cadence: number;
  speed: number;
  distance: number;
  hr: number;
}

export interface RoutePoint {
  x: number;
  y: number;
  elevation?: number;
  lat?: number;
  lon?: number;
  lng?: number;
}

export interface Route {
  pts: RoutePoint[];
  cum: number[];
  total: number;
  name?: string;
  bounds?: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  headings?: number[];
}

export interface EnvironmentInfo {
  isTopLevel: boolean | null;
  isSecure: boolean | null;
  hasBT: boolean | null;
  policy: boolean | null;
  availability: boolean | null;
  canUse: boolean | null;
  supportsBluetooth: boolean;
  bluetoothAvailable: boolean;
  bluetoothEnabled: boolean;
}

export interface WorkoutPlan {
  id: string;
  name: string;
  intervals: {
    duration: number;
    power: number;
    cadence?: number;
  }[];
}

export interface MetricProps {
  label: string;
  value?: number;
  unit?: string;
  target?: number;
  precision?: number;
  priority?: "high" | "medium" | "low";
}
