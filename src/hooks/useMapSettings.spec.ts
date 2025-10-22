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

type UseMapSettings = typeof import("./useMapSettings").useMapSettings;
let useMapSettings: UseMapSettings;

const flushEffects = () => {
  const pending = effectHandlers.slice();
  effectHandlers = [];
  pending.forEach((effect) => effect());
};

const renderHook = (): ReturnType<UseMapSettings> => {
  stateCursor = 0;
  effectHandlers = [];
  const state = useMapSettings();
  flushEffects();
  rerender = () => {
    renderHook();
  };
  return state;
};

describe("useMapSettings", () => {
  let originalWindow: typeof globalThis.window | undefined;

  beforeAll(async () => {
    ({ useMapSettings } = await import("./useMapSettings"));
  });

  beforeEach(() => {
    originalWindow = (globalThis as { window?: typeof window }).window;
    (globalThis as { window?: typeof window }).window = undefined;
    stateCursor = 0;
    stateSlots.length = 0;
    effectHandlers = [];
  });

  const setWindowStorage = (storage: Storage) => {
    (globalThis as { window?: typeof window }).window = { localStorage: storage } as unknown as typeof window;
  };

  it("defaults to 2000ms when storage is empty", () => {
    const getItem = vi.fn(() => null);
    const storage = {
      getItem,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    } as unknown as Storage;

    setWindowStorage(storage);

    const state = renderHook();

    expect(state.streetViewUpdateMs).toBe(2000);
    expect(getItem).toHaveBeenCalledWith("streetViewUpdateMs");
  });

  it("clamps update interval between 500 and 10000", () => {
    const getItem = vi.fn((key: string) => {
      if (key === "streetViewUpdateMs") {
        return "50"; // Should clamp to minimum.
      }
      if (key === "streetViewPointsPerStep") {
        return "0"; // Should clamp to at least 1.
      }
      return null;
    });
    const setItem = vi.fn();
    const removeItem = vi.fn();

    setWindowStorage({ getItem, setItem, removeItem } as unknown as Storage);

    let state = renderHook();

    expect(state.streetViewUpdateMs).toBe(500);
    expect(state.streetViewPointsPerStep).toBe(1);

    state.setStreetViewUpdateMs(12000);
    flushEffects();
    state = renderHook();

    expect(state.streetViewUpdateMs).toBe(10000);
    expect(setItem).toHaveBeenCalledWith("streetViewUpdateMs", "10000");

    state.setStreetViewPointsPerStep(0);
    flushEffects();
    state = renderHook();

    expect(state.streetViewPointsPerStep).toBe(1);
    expect(setItem).toHaveBeenCalledWith("streetViewPointsPerStep", "1");
  });

  it("persists changes to storage and rehydrates values", () => {
    const store = new Map<string, string>();
    const getItem = vi.fn((key: string) => store.get(key) ?? null);
    const setItem = vi.fn((key: string, value: string) => {
      store.set(key, value);
    });
    const removeItem = vi.fn((key: string) => {
      store.delete(key);
    });

    setWindowStorage({ getItem, setItem, removeItem } as unknown as Storage);

    let state = renderHook();

    state.setStreetViewUpdateMs(2600);
    state.setUsePointStep(true);
    state.setStreetViewPointsPerStep(5);
    flushEffects();
    state = renderHook();

    expect(setItem).toHaveBeenCalledWith("streetViewUpdateMs", "2600");
    expect(setItem).toHaveBeenCalledWith("streetViewPointsPerStep", "5");
    expect(setItem).toHaveBeenCalledWith("streetViewUsePointStep", "1");
    expect(removeItem).toHaveBeenCalledWith("streetViewUsePointStep");

    // Re-render to simulate fresh hook usage with stored values.
    stateCursor = 0;
    stateSlots.length = 0;
    effectHandlers = [];
    state = renderHook();

    expect(state.streetViewUpdateMs).toBe(2600);
    expect(state.usePointStep).toBe(true);
    expect(state.streetViewPointsPerStep).toBe(5);
  });

  afterEach(() => {
    if (originalWindow) {
      (globalThis as { window?: typeof window }).window = originalWindow;
    } else {
      delete (globalThis as { window?: typeof window }).window;
    }
  });
});
