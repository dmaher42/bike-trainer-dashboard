// Utilities to compute stable forward headings from a polyline
export type LatLng = { y: number; x: number }; // y=lat, x=lon

function toRad(d: number) {
  return (d * Math.PI) / 180;
}
function toDeg(r: number) {
  return (r * 180) / Math.PI;
}

function bearing(a: LatLng, b: LatLng): number {
  const phi1 = toRad(a.y);
  const phi2 = toRad(b.y);
  const dLon = toRad(b.x - a.x);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  const br = Math.atan2(y, x);
  const deg = (toDeg(br) + 360) % 360;
  return deg;
}

function norm(deg: number) {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

function shortestDelta(a: number, b: number) {
  const d = ((b - a + 540) % 360) - 180;
  return d;
}

/**
 * Compute a stable forward heading for each vertex:
 *  - forward lookahead to reduce zig-zag
 *  - rolling median to suppress local outliers
 *  - clamp per-step turns (spike rejection)
 */
export function computeStableHeadings(
  pts: LatLng[],
  options?: { lookahead?: number; medianWindow?: number; maxTurnDeg?: number },
): number[] {
  const n = pts.length;
  if (n === 0) return [];
  const LOOKAHEAD = options?.lookahead ?? 5; // points
  const WIN = options?.medianWindow ?? 7; // odd number recommended
  const MAX_TURN = options?.maxTurnDeg ?? 45; // reject >45° step turns

  // 1) forward lookahead bearings
  const raw: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    const j = Math.min(n - 1, i + LOOKAHEAD);
    raw[i] = i === j ? (i > 0 ? raw[i - 1] : 0) : bearing(pts[i], pts[j]);
  }

  // 2) rolling median (circular)
  const med: number[] = new Array(n).fill(0);
  const half = Math.floor(WIN / 2);
  for (let i = 0; i < n; i++) {
    const w: number[] = [];
    for (let k = i - half; k <= i + half; k++) {
      const idx = Math.min(n - 1, Math.max(0, k));
      w.push(raw[idx]);
    }
    // median on circular data: map to deltas around center to avoid wrap
    const c = raw[i];
    const deltas = w.map((v) => shortestDelta(c, v));
    deltas.sort((a, b) => a - b);
    const mDelta = deltas[Math.floor(deltas.length / 2)];
    med[i] = norm(c + mDelta);
  }

  // 3) spike rejection / per-step clamp
  const stable: number[] = new Array(n).fill(0);
  stable[0] = med[0];
  for (let i = 1; i < n; i++) {
    const prev = stable[i - 1];
    const target = med[i];
    const d = shortestDelta(prev, target);
    const clamped = Math.max(-MAX_TURN, Math.min(MAX_TURN, d));
    stable[i] = norm(prev + clamped);
  }
  return stable;
}
