/* @vitest-environment node */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let stateCursor = 0;
const stateSlots: unknown[] = [];
let effectHandlers: Array<() => void> = [];
let rerender: () => void = () => {};

vi.mock("react", async () => {
  return {
    useState: (initializer: unknown) => {
      const index = stateCursor++;
      if (typeof stateSlots[index] === "undefined") {
        stateSlots[index] =
          typeof initializer === "function"
            ? (initializer as () => unknown)()
            : initializer;
      }

      const setState = (value: unknown) => {
        stateSlots[index] =
          typeof value === "function"
            ? (value as (prev: unknown) => unknown)(stateSlots[index])
            : value;
        rerender();
      };

      return [stateSlots[index], setState] as const;
    },
    useEffect: (effect: () => void) => {
      effectHandlers.push(effect);
    },
    useCallback: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
  };
});

type UseApiKeys = typeof import("./useApiKeys").useApiKeys;
let useApiKeys: UseApiKeys;

const flushEffects = () => {
  const pending = effectHandlers.slice();
  effectHandlers = [];
  pending.forEach((effect) => effect());
};

const renderHook = (): ReturnType<UseApiKeys> => {
  stateCursor = 0;
  effectHandlers = [];
  const state = useApiKeys();
  flushEffects();
  rerender = () => {
    renderHook();
  };
  return state;
};

describe("useApiKeys", () => {
  let originalWindow: typeof globalThis.window | undefined;

  beforeAll(async () => {
    ({ useApiKeys } = await import("./useApiKeys"));
  });

  beforeEach(() => {
    originalWindow = (globalThis as { window?: typeof window }).window;
    (globalThis as { window?: typeof window }).window = undefined;
    stateCursor = 0;
    stateSlots.length = 0;
    effectHandlers = [];
  });

  it("initializes state from localStorage when available", () => {
    const getItem = vi.fn((key: string) => {
      if (key === "googleMapsApiKey") {
        return "stored-google";
      }
      if (key === "mapboxApiKey") {
        return "stored-mapbox";
      }
      return null;
    });
    const setItem = vi.fn();
    const removeItem = vi.fn();

    (globalThis as { window?: typeof window }).window = {
      localStorage: { getItem, setItem, removeItem },
    } as unknown as typeof window;

    const state = renderHook();

    expect(getItem).toHaveBeenCalledWith("googleMapsApiKey");
    expect(getItem).toHaveBeenCalledWith("mapboxApiKey");
    expect(state.googleMapsApiKey).toBe("stored-google");
    expect(state.mapboxApiKey).toBe("stored-mapbox");
  });

  it("persists updates and clears keys", () => {
    const getItem = vi.fn(() => "");
    const setItem = vi.fn();
    const removeItem = vi.fn();

    (globalThis as { window?: typeof window }).window = {
      localStorage: { getItem, setItem, removeItem },
    } as unknown as typeof window;

    const state = renderHook();

    state.setGoogleMapsApiKey("new-google");
    state.setMapboxApiKey("new-mapbox");

    expect(setItem).toHaveBeenCalledWith("googleMapsApiKey", "new-google");
    expect(setItem).toHaveBeenCalledWith("mapboxApiKey", "new-mapbox");

    state.clearGoogleMapsApiKey();
    state.clearMapboxApiKey();

    expect(removeItem).toHaveBeenCalledWith("googleMapsApiKey");
    expect(removeItem).toHaveBeenCalledWith("mapboxApiKey");
  });

  afterEach(() => {
    if (originalWindow) {
      (globalThis as { window?: typeof window }).window = originalWindow;
    } else {
      delete (globalThis as { window?: typeof window }).window;
    }
  });
});
