import React, { useMemo, useId } from "react";

type MetricsChartDatum = {
  /** Timestamp or index value representing the X-axis position. */
  timestamp?: Date | string | number;
  /** Numeric value to plot on the chart. */
  value: number | null | undefined;
};

type MetricsChartProps = {
  /** Data points rendered on the line chart. */
  data: MetricsChartDatum[];
  /** Accessible label announced by screen readers. */
  ariaLabel?: string;
  /** Optional caption displayed beneath the chart. */
  caption?: string;
  /** Stroke color for the line. */
  color?: string;
};

type NormalizedPoint = {
  x: number;
  y: number;
};

const getTimestamp = (datum: MetricsChartDatum, index: number): number => {
  if (datum.timestamp === undefined || datum.timestamp === null) {
    return index;
  }

  if (datum.timestamp instanceof Date) {
    return datum.timestamp.getTime();
  }

  if (typeof datum.timestamp === "number") {
    return datum.timestamp;
  }

  const parsed = Date.parse(datum.timestamp);
  return Number.isFinite(parsed) ? parsed : index;
};

const normalizePoints = (data: MetricsChartDatum[]): NormalizedPoint[] => {
  const processed = data
    .map((datum, index) => {
      const numericValue =
        typeof datum.value === "number" && Number.isFinite(datum.value)
          ? datum.value
          : null;

      if (numericValue === null) {
        return null;
      }

      const x = getTimestamp(datum, index);

      return { x, y: numericValue };
    })
    .filter((value): value is { x: number; y: number } => value !== null);

  if (processed.length === 0) {
    return [];
  }

  const xs = processed.map((point) => point.x);
  const ys = processed.map((point) => point.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const xRange = maxX - minX || 1;
  const yPadding = (maxY - minY) * 0.1 || 1;
  const adjustedMinY = minY - yPadding;
  const adjustedMaxY = maxY + yPadding;
  const yRange = adjustedMaxY - adjustedMinY || 1;

  return processed.map((point) => ({
    x: ((point.x - minX) / xRange) * 100,
    y: 100 - ((point.y - adjustedMinY) / yRange) * 100,
  }));
};

const MetricsChart: React.FC<MetricsChartProps> = ({
  data,
  ariaLabel = "Metrics line chart",
  caption,
  color = "#2563eb",
}) => {
  const points = useMemo(() => normalizePoints(data), [data]);
  const rawGradientId = useId();
  const gradientId = `metrics-chart-gradient-${rawGradientId.replace(/:/g, "")}`;

  if (points.length === 0) {
    return (
      <section
        className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm text-slate-500 shadow-sm"
        aria-label={ariaLabel}
      >
        <svg
          className="h-12 w-12 text-slate-300"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 19H20" />
          <path d="M8 15L11 11 14 14 20 6" />
          <path d="M16 6H20V10" />
        </svg>
        <p>No metrics available yet. Add data to visualize trends.</p>
      </section>
    );
  }

  const pathDefinition = points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x},${point.y}`)
    .join(" ");

  const areaPath = `${pathDefinition} L ${points[points.length - 1].x},100 L ${points[0].x},100 Z`;

  return (
    <figure className="flex w-full flex-col gap-4">
      <div
        className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm"
        aria-label={ariaLabel}
        role="img"
      >
        <svg
          className="h-64 w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {[20, 40, 60, 80].map((y) => (
            <line
              key={`grid-${y}`}
              x1="0"
              y1={y}
              x2="100"
              y2={y}
              stroke="currentColor"
              strokeWidth={0.25}
              className="text-slate-200"
              strokeDasharray="2 2"
            />
          ))}

          <path
            d={areaPath}
            fill={`url(#${gradientId})`}
            className="transition-opacity duration-300"
          />

          <path
            d={pathDefinition}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {points.map((point, index) => (
            <circle
              key={`point-${index}`}
              cx={point.x}
              cy={point.y}
              r={1.75}
              fill={color}
              stroke="white"
              strokeWidth={0.5}
            />
          ))}
        </svg>
      </div>
      {caption ? (
        <figcaption className="text-center text-sm text-slate-500">{caption}</figcaption>
      ) : null}
    </figure>
  );
};

export default MetricsChart;
