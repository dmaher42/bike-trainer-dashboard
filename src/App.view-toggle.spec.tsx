/* @vitest-environment node */

import { describe, expect, it } from "vitest";

import { getFallbackView } from "./App";
import type { ViewOption } from "./components/ViewToggle";

describe("getFallbackView", () => {
  it("returns the current view when it is enabled", () => {
    expect(getFallbackView("virtual", {})).toBe("virtual");
  });

  it("falls back to the default view when the current view is disabled", () => {
    expect(getFallbackView("mapbox", { mapbox: true })).toBe("virtual");
  });

  it("selects the first available provider when multiple are disabled", () => {
    const disabled: Partial<Record<ViewOption, boolean>> = {
      virtual: true,
      street: true,
      mapbox: true,
    };

    expect(getFallbackView("mapbox", disabled, "osm")).toBe("osm");
  });
});
