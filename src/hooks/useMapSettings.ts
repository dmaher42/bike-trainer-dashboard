import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_MAP_SETTINGS,
  STREET_VIEW_MAX_PAN_MS,
  STREET_VIEW_MAX_SMOOTH_PAN_MS,
  STREET_VIEW_MAX_STEP_COOLDOWN_MS,
  STREET_VIEW_MAX_UPDATE_MS,
  STREET_VIEW_MIN_PAN_MS,
  STREET_VIEW_MIN_POINTS_STEP,
  STREET_VIEW_MIN_SMOOTH_PAN_MS,
  STREET_VIEW_MIN_STEP_COOLDOWN_MS,
  STREET_VIEW_MIN_UPDATE_MS,
  type HeadingMode,
  type HudPosition,
} from "../types/settings";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type NullableStorage = StorageLike | null;

const STORAGE_KEYS = {
  updateMs: "streetViewUpdateMs",
  usePointStep: "streetViewUsePointStep",
  pointsPerStep: "streetViewPointsPerStep",
  hudPosition: "hudPosition",
  panMs: "streetViewPanMs",
  minStepMs: "streetViewMinStepMs",
  lockForwardHeading: "streetViewLockForwardHeading",
  usePowerToDriveSpeed: "usePowerToDriveSpeed",
  streetViewMetersPerStep: "streetViewMetersPerStep",
  headingMode: "streetViewHeadingMode",
  reverseRoute: "streetViewReverseRoute",
} as const;

const clampNumber = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, Math.trunc(value)));
};

const parseBoolean = (value: string | null): boolean => value === "1";

const parseNumber = (value: string | null, fallback: number, min: number, max: number): number => {
  if (value === null || value === "") {
    return fallback;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return clampNumber(numeric, min, max);
};

const parsePoints = (value: string | null, fallback: number): number => {
  if (value === null || value === "") {
    return fallback;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(STREET_VIEW_MIN_POINTS_STEP, Math.trunc(numeric));
};

const normalizePanDuration = (value: number): number => {
  if (!Number.isFinite(value)) {
    return STREET_VIEW_MIN_PAN_MS;
  }

  if (value <= STREET_VIEW_MIN_PAN_MS) {
    return STREET_VIEW_MIN_PAN_MS;
  }

  const truncated = Math.trunc(value);
  return Math.min(
    STREET_VIEW_MAX_PAN_MS,
    Math.max(STREET_VIEW_MIN_SMOOTH_PAN_MS, truncated),
  );
};

const getStorage = (): NullableStorage => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const useMapSettings = () => {
  const [streetViewUpdateMs, setStreetViewUpdateMsState] = useState<number>(() => {
    const storage = getStorage();
    return parseNumber(
      storage?.getItem(STORAGE_KEYS.updateMs) ?? null,
      DEFAULT_MAP_SETTINGS.streetViewUpdateMs,
      STREET_VIEW_MIN_UPDATE_MS,
      STREET_VIEW_MAX_UPDATE_MS,
    );
  });

  const [usePointStep, setUsePointStepState] = useState<boolean>(() => {
    const storage = getStorage();
    return parseBoolean(storage?.getItem(STORAGE_KEYS.usePointStep) ?? null);
  });

  const [streetViewPointsPerStep, setStreetViewPointsPerStepState] = useState<number>(() => {
    const storage = getStorage();
    return parsePoints(
      storage?.getItem(STORAGE_KEYS.pointsPerStep) ?? null,
      DEFAULT_MAP_SETTINGS.streetViewPointsPerStep,
    );
  });

  const [hudPosition, setHudPositionState] = useState<HudPosition>(() => {
    const storage = getStorage();
    const raw = storage?.getItem(STORAGE_KEYS.hudPosition) ?? DEFAULT_MAP_SETTINGS.hudPosition;
    return raw === "top-left" || raw === "top-right" || raw === "bottom-left" || raw === "bottom-right"
      ? raw
      : DEFAULT_MAP_SETTINGS.hudPosition;
  });

  const [streetViewPanMs, setStreetViewPanMsState] = useState<number>(() => {
    const storage = getStorage();
    const parsed = parseNumber(
      storage?.getItem(STORAGE_KEYS.panMs) ?? null,
      DEFAULT_MAP_SETTINGS.streetViewPanMs,
      STREET_VIEW_MIN_PAN_MS,
      STREET_VIEW_MAX_SMOOTH_PAN_MS,
    );
    return parsed <= 0 ? 0 : Math.max(STREET_VIEW_MIN_SMOOTH_PAN_MS, parsed);
  });

  const [streetViewMinStepMs, setStreetViewMinStepMsState] = useState<number>(() => {
    const storage = getStorage();
    return parseNumber(
      storage?.getItem(STORAGE_KEYS.minStepMs) ?? null,
      DEFAULT_MAP_SETTINGS.streetViewMinStepMs,
      STREET_VIEW_MIN_STEP_COOLDOWN_MS,
      STREET_VIEW_MAX_STEP_COOLDOWN_MS,
    );
  });

  const [lockForwardHeading, setLockForwardHeadingState] = useState<boolean>(() => {
    const storage = getStorage();
    const raw = storage?.getItem(STORAGE_KEYS.lockForwardHeading);
    return raw === "false" ? false : true;
  });

  const [usePowerToDriveSpeed, setUsePowerToDriveSpeedState] = useState<boolean>(() => {
    const storage = getStorage();
    const raw = storage?.getItem(STORAGE_KEYS.usePowerToDriveSpeed);
    return raw === "false" ? false : true;
  });

  const [streetViewMetersPerStep, setStreetViewMetersPerStepState] = useState<number>(() => {
    const storage = getStorage();
    const raw = storage?.getItem(STORAGE_KEYS.streetViewMetersPerStep) ?? null;
    const numeric = raw ? Number(raw) : DEFAULT_MAP_SETTINGS.streetViewMetersPerStep;
    if (!Number.isFinite(numeric)) {
      return DEFAULT_MAP_SETTINGS.streetViewMetersPerStep;
    }

    const clamped = Math.trunc(numeric);
    return Math.max(3, Math.min(50, clamped));
  });

  const [headingMode, setHeadingModeState] = useState<HeadingMode>(() => {
    const storage = getStorage();
    const raw = storage?.getItem(STORAGE_KEYS.headingMode);
    return raw === "fixed" ? "fixed" : "forward";
  });

  const [reverseRoute, setReverseRouteState] = useState<boolean>(() => {
    const storage = getStorage();
    return storage?.getItem(STORAGE_KEYS.reverseRoute) === "true";
  });

  useEffect(() => {
    const storage = getStorage();
    if (!storage) {
      return;
    }

    try {
      storage.setItem(STORAGE_KEYS.updateMs, String(streetViewUpdateMs));
    } catch {
      // Ignore persistence errors silently.
    }
  }, [streetViewUpdateMs]);

  useEffect(() => {
    const storage = getStorage();
    if (!storage) {
      return;
    }

    try {
      if (usePointStep) {
        storage.setItem(STORAGE_KEYS.usePointStep, "1");
      } else {
        storage.removeItem(STORAGE_KEYS.usePointStep);
      }
    } catch {
      // Ignore persistence errors silently.
    }
  }, [usePointStep]);

  useEffect(() => {
    const storage = getStorage();
    if (!storage) {
      return;
    }

    try {
      storage.setItem(STORAGE_KEYS.pointsPerStep, String(streetViewPointsPerStep));
    } catch {
      // Ignore persistence errors silently.
    }
  }, [streetViewPointsPerStep]);

  useEffect(() => {
    const storage = getStorage();
    if (!storage) {
      return;
    }

    try {
      storage.setItem(STORAGE_KEYS.hudPosition, hudPosition);
    } catch {
      // Ignore persistence errors silently.
    }
  }, [hudPosition]);

  useEffect(() => {
    const storage = getStorage();
    if (!storage) {
      return;
    }

    try {
      storage.setItem(STORAGE_KEYS.panMs, String(streetViewPanMs));
    } catch {
      // Ignore persistence errors silently.
    }
  }, [streetViewPanMs]);

  useEffect(() => {
    const storage = getStorage();
    if (!storage) {
      return;
    }

    try {
      storage.setItem(STORAGE_KEYS.minStepMs, String(streetViewMinStepMs));
    } catch {
      // Ignore persistence errors silently.
    }
  }, [streetViewMinStepMs]);

  useEffect(() => {
    const storage = getStorage();
    if (!storage) {
      return;
    }

    try {
      storage.setItem(STORAGE_KEYS.lockForwardHeading, String(lockForwardHeading));
    } catch {
      // Ignore persistence errors silently.
    }
  }, [lockForwardHeading]);

  useEffect(() => {
    const storage = getStorage();
    if (!storage) {
      return;
    }

    try {
      storage.setItem(
        STORAGE_KEYS.usePowerToDriveSpeed,
        String(usePowerToDriveSpeed),
      );
    } catch {
      // Ignore persistence errors silently.
    }
  }, [usePowerToDriveSpeed]);

  useEffect(() => {
    const storage = getStorage();
    if (!storage) {
      return;
    }

    try {
      storage.setItem(
        STORAGE_KEYS.streetViewMetersPerStep,
        String(streetViewMetersPerStep),
      );
    } catch {
      // Ignore persistence errors silently.
    }
  }, [streetViewMetersPerStep]);

  useEffect(() => {
    const storage = getStorage();
    if (!storage) {
      return;
    }

    try {
      storage.setItem(STORAGE_KEYS.headingMode, headingMode);
    } catch {
      // Ignore persistence errors silently.
    }
  }, [headingMode]);

  useEffect(() => {
    const storage = getStorage();
    if (!storage) {
      return;
    }

    try {
      storage.setItem(STORAGE_KEYS.reverseRoute, String(reverseRoute));
    } catch {
      // Ignore persistence errors silently.
    }
  }, [reverseRoute]);

  const setStreetViewUpdateMs = useCallback((value: number) => {
    setStreetViewUpdateMsState((prev) => {
      const fallback = typeof prev === "number" ? prev : DEFAULT_MAP_SETTINGS.streetViewUpdateMs;
      const numeric = Number.isFinite(value) ? value : fallback;
      return clampNumber(numeric, STREET_VIEW_MIN_UPDATE_MS, STREET_VIEW_MAX_UPDATE_MS);
    });
  }, []);

  const setUsePointStep = useCallback((value: boolean) => {
    setUsePointStepState(Boolean(value));
  }, []);

  const setStreetViewPointsPerStep = useCallback((value: number) => {
    setStreetViewPointsPerStepState((prev) => {
      const fallback = typeof prev === "number" ? prev : DEFAULT_MAP_SETTINGS.streetViewPointsPerStep;
      const numeric = Number.isFinite(value) ? value : fallback;
      return Math.max(STREET_VIEW_MIN_POINTS_STEP, Math.trunc(numeric));
    });
  }, []);

  const setHudPosition = useCallback((value: HudPosition) => {
    setHudPositionState(value);
  }, []);

  const setStreetViewPanMs = useCallback((value: number) => {
    setStreetViewPanMsState((prev) => {
      const fallback = typeof prev === "number" ? prev : DEFAULT_MAP_SETTINGS.streetViewPanMs;
      const numeric = Number.isFinite(value) ? Math.trunc(value) : fallback;
      if (numeric <= 0) {
        return 0;
      }

      const clamped = clampNumber(
        Math.max(STREET_VIEW_MIN_SMOOTH_PAN_MS, numeric),
        STREET_VIEW_MIN_PAN_MS,
        STREET_VIEW_MAX_SMOOTH_PAN_MS,
      );
      return clamped;
    });
  }, []);

  const setStreetViewMinStepMs = useCallback((value: number) => {
    setStreetViewMinStepMsState((prev) => {
      const fallback =
        typeof prev === "number" ? prev : DEFAULT_MAP_SETTINGS.streetViewMinStepMs;
      const numeric = Number.isFinite(value) ? value : fallback;
      return clampNumber(
        numeric,
        STREET_VIEW_MIN_STEP_COOLDOWN_MS,
        STREET_VIEW_MAX_STEP_COOLDOWN_MS,
      );
    });
  }, []);

  const setUsePowerToDriveSpeed = useCallback((value: boolean) => {
    setUsePowerToDriveSpeedState(Boolean(value));
  }, []);

  const setStreetViewMetersPerStep = useCallback((value: number) => {
    setStreetViewMetersPerStepState((prev) => {
      const fallback =
        typeof prev === "number" ? prev : DEFAULT_MAP_SETTINGS.streetViewMetersPerStep;
      const numeric = Number.isFinite(value) ? Math.trunc(value) : fallback;
      const clamped = Math.max(3, Math.min(50, numeric));
      return clamped;
    });
  }, []);

  const setHeadingMode = useCallback((value: HeadingMode) => {
    setHeadingModeState(value === "fixed" ? "fixed" : "forward");
  }, []);

  const setReverseRoute = useCallback((value: boolean) => {
    setReverseRouteState(Boolean(value));
  }, []);

  return {
    streetViewUpdateMs,
    setStreetViewUpdateMs,
    usePointStep,
    setUsePointStep,
    streetViewPointsPerStep,
    setStreetViewPointsPerStep,
    hudPosition,
    setHudPosition,
    streetViewPanMs,
    setStreetViewPanMs,
    streetViewMinStepMs,
    setStreetViewMinStepMs,
    lockForwardHeading,
    setLockForwardHeading: setLockForwardHeadingState,
    usePowerToDriveSpeed,
    setUsePowerToDriveSpeed,
    streetViewMetersPerStep,
    setStreetViewMetersPerStep,
    headingMode,
    setHeadingMode,
    reverseRoute,
    setReverseRoute,
  } as const;
};

export default useMapSettings;
