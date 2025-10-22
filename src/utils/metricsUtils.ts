export function formatTime(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec <= 0) {
    return "00:00:00";
  }

  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = Math.floor(totalSec % 60);
  return [h, m, s]
    .map((n) => n.toString().padStart(2, "0"))
    .join(":");
}

export function computeVirtualSpeedKph(powerW: number, grade = 0): number {
  if (!Number.isFinite(powerW) || powerW <= 0) {
    return 0;
  }

  const base = Math.cbrt(Math.max(0, powerW));
  const k = 1.7;
  const gradePenalty = 1 - 0.06 * grade;
  const modifier = Math.max(0.3, Math.min(1.2, gradePenalty));
  const v = k * base * modifier;

  return Math.max(0, Math.min(60, v));
}

export function speedFromPower(w: number): number {
  return computeVirtualSpeedKph(w);
}

export function downloadCSV(filename: string, rows: any[]): void {
  const header = [
    "timestamp", "elapsed_s", "power_w", "cadence_rpm", 
    "speed_kph", "distance_km", "heart_bpm"
  ].join(",");
  
  const csv = [header].concat(
    rows.map((r) => [
      new Date(r.ts).toISOString(),
      r.elapsed.toFixed(1),
      r.power?.toFixed?.(0) ?? "",
      r.cadence?.toFixed?.(0) ?? "",
      r.speed?.toFixed?.(2) ?? "",
      r.distance?.toFixed?.(3) ?? "",
      r.hr ?? ""
    ].join(","))
  );
  
  const blob = new Blob([csv.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
