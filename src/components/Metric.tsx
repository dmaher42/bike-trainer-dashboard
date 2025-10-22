import React from "react";
import { MetricProps as BaseMetricProps } from "../types";

export type MetricProps = Omit<BaseMetricProps, "value"> & {
  /** Measured value which may be numeric or preformatted text. */
  value?: BaseMetricProps["value"] | null;
  /** Optional target used to compute achievement state. */
  target?: number;
  /** Number of decimal places to display for numeric values. */
  precision?: number;
};

const numberFormatter = (precision: number) =>
  new Intl.NumberFormat(undefined, {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });

const formatValue = (
  value: MetricProps["value"],
  precision: number,
): string => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return numberFormatter(precision).format(value);
  }

  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  return "--";
};

const formatTarget = (target?: number, precision = 0): string | null => {
  if (typeof target === "number" && Number.isFinite(target)) {
    return numberFormatter(precision).format(target);
  }

  return null;
};

const Metric: React.FC<MetricProps> = ({
  label,
  value = null,
  unit,
  target,
  precision = 0,
}) => {
  const numericValue = typeof value === "number" && Number.isFinite(value) ? value : null;
  const formattedValue = formatValue(value, precision);
  const hasTarget = typeof target === "number" && Number.isFinite(target);
  const formattedTarget = hasTarget ? formatTarget(target, precision) : null;

  const containerClasses = hasTarget
    ? "grid grid-cols-1 gap-3 md:grid-cols-[1fr_10.5rem] md:items-center"
    : "flex flex-col gap-3";

  const renderTargetDetails = () => {
    if (!hasTarget || formattedTarget === null) {
      return null;
    }

    const isOnTarget = numericValue !== null ? numericValue >= (target as number) : null;
    const indicatorClasses = isOnTarget === null
      ? "bg-slate-300 text-slate-600"
      : isOnTarget
        ? "bg-emerald-100 text-emerald-700"
        : "bg-amber-100 text-amber-700";

    const indicatorIcon = isOnTarget === null
      ? (
          <svg
            className="h-3 w-3"
            viewBox="0 0 8 8"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="4" cy="4" r="3" />
          </svg>
        )
      : isOnTarget
        ? (
            <svg
              className="h-3 w-3"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3.5 8.5 6.5 11.5 12.5 4.5" />
            </svg>
          )
        : (
            <svg
              className="h-3 w-3"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 4 12 12" />
              <path d="M12 4 4 12" />
            </svg>
          );

    return (
      <div className="flex flex-col items-start gap-1 text-xs sm:text-sm md:items-end">
        <span
          className={`flex items-center gap-1 rounded-full px-2 py-1 font-medium whitespace-nowrap ${indicatorClasses}`}
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/60 p-0.5 text-inherit">
            {indicatorIcon}
          </span>
          {isOnTarget === null
            ? "No target"
            : isOnTarget
              ? "On target"
              : "Below target"}
        </span>
        <span className="text-slate-500 whitespace-nowrap">Target: {formattedTarget}</span>
      </div>
    );
  };

  return (
    <section
      aria-label={`${label} metric`}
      className="
        rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur-sm transition-colors
        sm:p-5
        min-h-[96px]
      "
    >
      <div className={containerClasses}>
        <div className="flex flex-col gap-1 text-left">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {label}
          </span>
          <div
            className="
              flex flex-wrap items-baseline gap-1
              text-3xl sm:text-4xl font-bold text-slate-900 tabular-nums
            "
          >
            <span>{formattedValue}</span>
            {unit ? (
              <span className="text-base font-medium text-slate-500 sm:text-lg">{unit}</span>
            ) : null}
          </div>
        </div>
        {renderTargetDetails()}
      </div>
    </section>
  );
};

export { Metric };

export default Metric;
