export interface MapSettings {
  streetViewUpdateMs: number;
  usePointStep?: boolean;
  streetViewPointsPerStep?: number;
}

export const DEFAULT_MAP_SETTINGS: Required<MapSettings> = {
  streetViewUpdateMs: 2000,
  usePointStep: false,
  streetViewPointsPerStep: 3,
};

export const STREET_VIEW_MIN_UPDATE_MS = 500;
export const STREET_VIEW_MAX_UPDATE_MS = 10000;
export const STREET_VIEW_MIN_POINTS_STEP = 1;
