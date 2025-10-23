export type HudPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type HeadingMode = "forward" | "fixed";

export interface MapSettings {
  streetViewUpdateMs: number;
  usePointStep?: boolean;
  streetViewPointsPerStep?: number;
  hudPosition?: HudPosition;
  streetViewPanMs?: number;
  lockForwardHeading?: boolean;
  usePowerToDriveSpeed?: boolean;
  streetViewMetersPerStep?: number;
  headingMode?: HeadingMode;
}

export const DEFAULT_MAP_SETTINGS: Required<MapSettings> = {
  streetViewUpdateMs: 2000,
  usePointStep: false,
  streetViewPointsPerStep: 3,
  hudPosition: "top-left",
  streetViewPanMs: 0,
  lockForwardHeading: true,
  usePowerToDriveSpeed: true,
  streetViewMetersPerStep: 15,
  headingMode: "forward",
};

export const STREET_VIEW_MIN_UPDATE_MS = 500;
export const STREET_VIEW_MAX_UPDATE_MS = 10000;
export const STREET_VIEW_MIN_POINTS_STEP = 1;
export const STREET_VIEW_MIN_PAN_MS = 0;
export const STREET_VIEW_MAX_PAN_MS = 1500;
