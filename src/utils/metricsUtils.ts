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

export function speedFromPower(w: number): number {
  if (!Number.isFinite(w) || w <= 0) {
    return 0;
  }

  return Math.max(0, 10 + 0.02 * (w - 150));
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
