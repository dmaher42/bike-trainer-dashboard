/* @vitest-environment node */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import App from "./App";

vi.mock("./hooks/useWorkout", () => ({
  useWorkout: () => ({
    workouts: [
      {
        id: "sample",
        name: "Sample Workout",
        intervals: [{ duration: 300, targetPower: 0.6 }],
      },
    ],
    activeWorkout: null,
    currentInterval: null,
    intervalTime: 0,
    targetPower: 0,
    targetCadence: 0,
    startWorkout: vi.fn(),
    stopWorkout: vi.fn(),
  }),
}));

type LocationStub = {
  get hash(): string;
  set hash(value: string);
};

type WindowStub = {
  location: LocationStub;
  addEventListener: () => void;
  removeEventListener: () => void;
};

const withWindowHash = (hash: string | null, render: () => string): string => {
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
});
