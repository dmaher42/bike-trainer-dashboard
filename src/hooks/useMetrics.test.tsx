/* @vitest-environment jsdom */

import { act } from "react-dom/test-utils";
import { createRoot, Root } from "react-dom/client";
import * as React from "react";
import type { SpyInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Metrics } from "../types";
import useMetrics from "./useMetrics";

describe("useMetrics", () => {
  let container: HTMLDivElement;
  let root: Root;
  let useStateSpy: SpyInstance;
  let metricsSetterCalls: number;

  const isMetricsInitializer = (value: unknown): value is Metrics => {
    return (
      typeof value === "object" &&
      value !== null &&
      "power" in value &&
      "cadence" in value &&
      "speed" in value &&
      "distance" in value &&
      "hr" in value
    );
  };

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    metricsSetterCalls = 0;

    const actualUseState = React.useState.bind(React) as typeof React.useState;
    let metricsSetter: React.Dispatch<React.SetStateAction<Metrics>> | null = null;

    useStateSpy = vi.spyOn(React, "useState");
    useStateSpy.mockImplementation(<S>(initial: S | (() => S)) => {
      const result = actualUseState(initial);

      if (isMetricsInitializer(initial)) {
        if (metricsSetter) {
          return [result[0], metricsSetter] as typeof result;
        }

        const originalSetter = result[1] as React.Dispatch<React.SetStateAction<Metrics>>;
        const wrappedSetter: typeof originalSetter = (value) => {
          metricsSetterCalls += 1;
          return originalSetter(value);
        };
        metricsSetter = wrappedSetter;
        return [result[0], wrappedSetter] as typeof result;
      }

      return result;
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    useStateSpy.mockRestore();
    container.remove();
  });

  it("does not reapply identical FTMS updates", async () => {
    const detail = {
      source: "ftms" as const,
      power: 215,
      cadence: 88,
      speed: 32.5,
    };

    const TestComponent = () => {
      useMetrics(false, false);
      return null;
    };

    await act(async () => {
      root.render(<TestComponent />);
    });

    expect(metricsSetterCalls).toBe(0);

    await act(async () => {
      window.dispatchEvent(new CustomEvent("ftms-data", { detail }));
    });

    expect(metricsSetterCalls).toBe(1);

    await act(async () => {
      window.dispatchEvent(new CustomEvent("ftms-data", { detail: { ...detail } }));
    });

    expect(metricsSetterCalls).toBe(1);
  });
});

