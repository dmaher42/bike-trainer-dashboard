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
}

export interface Route {
  pts: RoutePoint[];
  cum: number[];
  total: number;
  name?: string;
}

export interface EnvironmentInfo {
  isTopLevel: boolean | null;
  isSecure: boolean | null;
  hasBT: boolean | null;
  policy: boolean | null;
  availability: boolean | null;
  canUse: boolean | null;
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
  value?: number | string | null;
  unit?: string;
  target?: number;
}
