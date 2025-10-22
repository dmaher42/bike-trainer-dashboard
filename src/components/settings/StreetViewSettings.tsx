import { ChangeEvent } from "react";
import {
  DEFAULT_MAP_SETTINGS,
  STREET_VIEW_MAX_UPDATE_MS,
  STREET_VIEW_MIN_POINTS_STEP,
  STREET_VIEW_MIN_UPDATE_MS,
} from "../../types/settings";
import { useMapSettings } from "../../hooks/useMapSettings";

const parseNumberInput = (event: ChangeEvent<HTMLInputElement>): number | null => {
  const { value } = event.target;
  if (value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const clampPoints = (value: number): number => {
  return Math.max(STREET_VIEW_MIN_POINTS_STEP, Math.trunc(value));
};

export function StreetViewSettings() {
  const {
    streetViewUpdateMs,
    setStreetViewUpdateMs,
    usePointStep,
    setUsePointStep,
    streetViewPointsPerStep,
    setStreetViewPointsPerStep,
    hudPosition,
    setHudPosition,
  } = useMapSettings();

  const handleUpdateMsChange = (event: ChangeEvent<HTMLInputElement>) => {
    const parsed = parseNumberInput(event);
    const next =
      parsed === null
        ? DEFAULT_MAP_SETTINGS.streetViewUpdateMs
        : clamp(parsed, STREET_VIEW_MIN_UPDATE_MS, STREET_VIEW_MAX_UPDATE_MS);
    setStreetViewUpdateMs(next);
  };

  const handlePointsChange = (event: ChangeEvent<HTMLInputElement>) => {
    const parsed = parseNumberInput(event);
    const next = parsed === null ? DEFAULT_MAP_SETTINGS.streetViewPointsPerStep : clampPoints(parsed);
    setStreetViewPointsPerStep(next);
  };

  return (
    <section className="space-y-4 pt-4 border-t border-neutral-800">
      <h3 className="text-sm font-semibold text-neutral-200">Street View</h3>
      <label className="block text-sm text-neutral-300">
        <span className="text-xs text-neutral-400">Update every (ms)</span>
        <input
          type="number"
          min={STREET_VIEW_MIN_UPDATE_MS}
          max={STREET_VIEW_MAX_UPDATE_MS}
          step={100}
          placeholder={String(DEFAULT_MAP_SETTINGS.streetViewUpdateMs)}
          value={streetViewUpdateMs}
          onChange={handleUpdateMsChange}
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        />
        <span className="mt-1 block text-[11px] text-neutral-500">
          Controls how often the panorama advances. Larger = slower.
        </span>
      </label>

      <label className="block text-sm text-neutral-300">
        <span className="text-xs text-neutral-400">HUD position (fullscreen)</span>
        <select
          value={hudPosition}
          onChange={(event) =>
            setHudPosition(
              event.target.value as "top-left" | "top-right" | "bottom-left" | "bottom-right",
            )
          }
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
        >
          <option value="top-left">Top-left</option>
          <option value="top-right">Top-right</option>
          <option value="bottom-left">Bottom-left</option>
          <option value="bottom-right">Bottom-right</option>
        </select>
        <span className="mt-1 block text-[11px] text-neutral-500">
          Choose where the stats HUD appears while in fullscreen.
        </span>
      </label>

      <details className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-3 text-sm text-neutral-300">
        <summary className="cursor-pointer text-xs font-medium text-neutral-200">
          Advanced: step by points
        </summary>
        <div className="mt-3 space-y-3">
          <label className="flex items-center gap-2 text-xs text-neutral-300">
            <input
              type="checkbox"
              checked={usePointStep}
              onChange={(event) => setUsePointStep(event.target.checked)}
              className="h-4 w-4"
            />
            <span>Use points instead of time</span>
          </label>
          <label className="block text-xs text-neutral-300">
            <span className="text-neutral-400">Points per step</span>
            <input
              type="number"
              min={STREET_VIEW_MIN_POINTS_STEP}
              step={1}
              value={streetViewPointsPerStep}
              onChange={handlePointsChange}
              disabled={!usePointStep}
              className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            />
          </label>
        </div>
      </details>

      <p className="text-[11px] text-neutral-500">Changes save automatically.</p>
    </section>
  );
}

export default StreetViewSettings;
