import { describe, expect, it } from "vitest";

import { formatTime, speedFromPower } from "./metricsUtils";

describe("formatTime", () => {
  it("returns zeros for non-positive values", () => {
    expect(formatTime(-5)).toBe("00:00:00");
    expect(formatTime(NaN)).toBe("00:00:00");
  });

  it("formats hours, minutes, and seconds", () => {
    expect(formatTime(3_661)).toBe("01:01:01");
  });
});

describe("speedFromPower", () => {
  it("returns 0 for invalid inputs", () => {
    expect(speedFromPower(-10)).toBe(0);
  });

  it("estimates higher speeds for higher power", () => {
    const easyPace = speedFromPower(150);
    const thresholdPace = speedFromPower(300);

    expect(easyPace).toBeGreaterThan(0);
    expect(thresholdPace).toBeGreaterThan(easyPace);
  });
});
