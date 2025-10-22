import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_MAP_SETTINGS,
  STREET_VIEW_MAX_UPDATE_MS,
  STREET_VIEW_MIN_POINTS_STEP,
  STREET_VIEW_MIN_UPDATE_MS,
} from "../types/settings";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type NullableStorage = StorageLike | null;

const STORAGE_KEYS = {
  updateMs: "streetViewUpdateMs",
  usePointStep: "streetViewUsePointStep",
  pointsPerStep: "streetViewPointsPerStep",
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

  return {
    streetViewUpdateMs,
    setStreetViewUpdateMs,
    usePointStep,
    setUsePointStep,
    streetViewPointsPerStep,
    setStreetViewPointsPerStep,
  } as const;
};

export default useMapSettings;
