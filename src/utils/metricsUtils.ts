import { Sample } from "../types";

/**
 * Convert a duration in seconds to `HH:MM:SS` format.
 * @param totalSeconds The duration in seconds.
 * @returns The formatted time string.
 */
export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "00:00:00";
  }

  const clampedSeconds = Math.floor(totalSeconds);
  const hours = Math.floor(clampedSeconds / 3600);
  const minutes = Math.floor((clampedSeconds % 3600) / 60);
  const seconds = clampedSeconds % 60;

  const hourStr = hours.toString().padStart(2, "0");
  const minuteStr = minutes.toString().padStart(2, "0");
  const secondStr = seconds.toString().padStart(2, "0");

  return `${hourStr}:${minuteStr}:${secondStr}`;
}

const GRAVITY = 9.80665;

export interface SpeedEstimationOptions {
  /** Combined rider and bike mass in kilograms. */
  massKg?: number;
  /** Rolling resistance coefficient. */
  crr?: number;
  /** Effective frontal area (CdA). */
  cda?: number;
  /** Air density in kg/m^3. */
  airDensity?: number;
  /** Road grade expressed as a decimal (e.g. 0.05 for 5%). */
  grade?: number;
  /** Fraction of power lost to drivetrain inefficiencies. */
  drivetrainLoss?: number;
  /** Binary search tolerance in watts. */
  tolerance?: number;
  /** Maximum binary search iterations. */
  maxIterations?: number;
}

/**
 * Estimate cycling speed on a steady grade from rider power.
 * The implementation uses a simple resistive force model that
 * accounts for rolling resistance, aerodynamic drag, and gravity.
 *
 * @param powerWatts Rider power in watts.
 * @param options Optional physical constants for the estimate.
 * @returns Estimated speed in kilometres per hour.
 */
export function speedFromPower(
  powerWatts: number,
  options: SpeedEstimationOptions = {}
): number {
  if (!Number.isFinite(powerWatts) || powerWatts <= 0) {
    return 0;
  }

  const {
    massKg = 85,
    crr = 0.005,
    cda = 0.32,
    airDensity = 1.225,
    grade = 0,
    drivetrainLoss = 0.03,
    tolerance = 0.1,
    maxIterations = 60,
  } = options;

  const netPower = powerWatts * (1 - Math.max(0, Math.min(drivetrainLoss, 0.2)));
  const gradeAngle = Math.atan(grade);
  const cosTheta = Math.cos(gradeAngle);
  const sinTheta = Math.sin(gradeAngle);

  const rollingForce = massKg * GRAVITY * crr * cosTheta;
  const gravityForce = massKg * GRAVITY * sinTheta;

  let low = 0;
  let high = 30; // 108 km/h upper bound
  let mid = (low + high) / 2;

  for (let i = 0; i < maxIterations; i += 1) {
    mid = (low + high) / 2;
    const aeroPower = 0.5 * airDensity * cda * mid ** 3;
    const resistivePower = (rollingForce + gravityForce) * mid + aeroPower;

    if (Math.abs(resistivePower - netPower) <= tolerance) {
      break;
    }

    if (resistivePower > netPower) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return mid * 3.6;
}

/**
 * Export an array of ride samples to a CSV file and trigger a download.
 *
 * @param samples Recorded ride samples.
 * @param filename The desired filename for the export.
 */
export function downloadCSV(samples: Sample[], filename = "ride-data.csv"): void {
  if (typeof window === "undefined" || !samples || samples.length === 0) {
    return;
  }

  const headers: (keyof Sample)[] = [
    "timestamp",
    "elapsed",
    "power",
    "cadence",
    "speed",
    "distance",
    "hr",
  ];

  const csvRows = [headers.join(",")];

  samples.forEach((sample) => {
    const row = headers
      .map((key) => {
        const value = sample[key];
        if (typeof value === "string") {
          const escaped = value.replace(/"/g, '""');
          return `"${escaped}"`;
        }
        return String(value ?? "");
      })
      .join(",");

    csvRows.push(row);
  });

  const csvContent = csvRows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}
