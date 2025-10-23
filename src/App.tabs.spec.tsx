/* @vitest-environment node */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveActiveView } from "./App";

import App from "./App";

vi.mock("./hooks/useWorkout", () => ({
  useWorkout: () => ({
    isActive: false,
    elapsed: 0,
    intervalElapsed: 0,
    currentIntervalIndex: 0,
    currentInterval: null,
    targetPower: 0,
    targetCadence: 0,
    totalDuration: 0,
    progress: 0,
    start: vi.fn(() => true),
    stop: vi.fn(() => true),
    reset: vi.fn(),
    setPlan: vi.fn(),
  }),
}));

type LocationStub = {
  get hash(): string;
  set hash(value: string);
};

type StorageStub = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type WindowStub = {
  location: LocationStub;
  addEventListener: () => void;
  removeEventListener: () => void;
  localStorage?: StorageStub;
};

type WindowOptions = {
  localStorage?: StorageStub;
};

const withWindowHash = (
  hash: string | null,
  render: () => string,
  options: WindowOptions = {},
): string => {
  const originalWindow = (globalThis as { window?: WindowStub }).window;
  const originalLocation = (globalThis as { location?: WindowStub["location"] }).location;

  if (hash === null) {
    delete (globalThis as { window?: WindowStub }).window;
    delete (globalThis as { location?: WindowStub["location"] }).location;
  } else {
    let currentHash = hash;
    const stubWindow: WindowStub = {
      location: {
        get hash() {
          return currentHash;
        },
        set hash(value: string) {
          currentHash = value;
        },
      } as unknown as LocationStub,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    } as WindowStub;

    if (options.localStorage) {
      stubWindow.localStorage = options.localStorage;
    }

    (globalThis as { window?: WindowStub }).window = stubWindow;
    (globalThis as { location?: WindowStub["location"] }).location = stubWindow.location;
  }

  try {
    return render();
  } finally {
    if (originalWindow) {
      (globalThis as { window?: WindowStub }).window = originalWindow;
    } else {
      delete (globalThis as { window?: WindowStub }).window;
    }

    if (originalLocation) {
      (globalThis as { location?: WindowStub["location"] }).location = originalLocation;
    } else {
      delete (globalThis as { location?: WindowStub["location"] }).location;
    }
  }
};

describe("App tab hydration", () => {
  it("renders the dashboard when no hash is present", () => {
    const markup = withWindowHash(null, () => renderToStaticMarkup(<App />));
    expect(markup).toContain('data-testid="screen-dashboard"');
    expect(markup).not.toContain('data-testid="screen-workouts"');
  });

  it("disables Street View and Mapbox when API keys are missing", () => {
    const markup = withWindowHash("#dashboard", () => renderToStaticMarkup(<App />));

    expect(markup).toContain(
      "Add a Google Maps API key in Settings to enable Street View.",
    );
    expect(markup).toContain("Add a Mapbox token in Settings to enable Mapbox 3D.");
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*><span>🏙️<\/span>Street<\/button>/);
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*><span>🗺️<\/span>Mapbox 3D<\/button>/);
  });

  const scenarios: Array<{ hash: string; testId: string }> = [
    { hash: "#dashboard", testId: "screen-dashboard" },
    { hash: "#workouts", testId: "screen-workouts" },
    { hash: "#analysis", testId: "screen-analysis" },
    { hash: "#routes", testId: "screen-routes" },
    { hash: "#settings", testId: "screen-settings" },
  ];

  scenarios.forEach(({ hash, testId }) => {
    it(`renders the ${testId} when hash is ${hash}`, () => {
      const markup = withWindowHash(hash, () => renderToStaticMarkup(<App />));
      expect(markup).toContain(`data-testid="${testId}"`);
    });
  });

  it("disables Mapbox view and guides the user when no token is set", () => {
    const markup = withWindowHash("#dashboard", () => renderToStaticMarkup(<App />));

    expect(markup).toContain("Add a Mapbox token in Settings to enable Mapbox 3D.");
    expect(markup).toMatch(/<button[^>]*disabled[^>]*>[\s\S]*Mapbox 3D/i);
  });

  it("prefills API keys from localStorage on the settings screen", () => {
    const getItem = vi.fn((key: string) => {
      if (key === "googleMapsApiKey") {
        return "stored-google";
      }

      if (key === "mapboxApiKey") {
        return "stored-mapbox";
      }

      return null;
    });

    const markup = withWindowHash(
      "#settings",
      () => renderToStaticMarkup(<App />),
      {
        localStorage: {
          getItem,
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
      },
    );

    expect(getItem).toHaveBeenCalledWith("googleMapsApiKey");
    expect(getItem).toHaveBeenCalledWith("mapboxApiKey");
    expect(markup).toContain('value="stored-google"');
    expect(markup).toContain('value="stored-mapbox"');
  });

  it("falls back to an enabled view when the current view is disabled", () => {
    expect(resolveActiveView("mapbox", { mapbox: true })).toBe("virtual");
    expect(resolveActiveView("street", { street: true, mapbox: true })).toBe("virtual");
    expect(resolveActiveView("mapbox", { mapbox: true, street: true })).toBe("virtual");
    expect(resolveActiveView("osm", {})).toBe("osm");
  });
});
