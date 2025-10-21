import React, { useId, useState } from "react";

type ApiKeyFieldProps = {
  label: string;
  description?: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  saved?: boolean;
  error?: string;
  initiallyRevealed?: boolean;
  "data-testid"?: string;
};

export const ApiKeyField: React.FC<ApiKeyFieldProps> = ({
  label,
  description,
  value,
  placeholder,
  onChange,
  saved = false,
  error,
  initiallyRevealed = false,
  "data-testid": dataTestId,
}) => {
  const inputId = useId();
  const descriptionId = description ? `${inputId}-description` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const statusId = saved && !error ? `${inputId}-status` : undefined;
  const [revealed, setRevealed] = useState(initiallyRevealed);

  const toggleLabel = revealed ? "Hide API key" : "Show API key";

  return (
    <div className="space-y-2 text-sm" data-testid={dataTestId}>
      <div className="flex items-start justify-between gap-3">
        <label htmlFor={inputId} className="font-medium text-neutral-200">
          {label}
        </label>
        {error ? (
          <span
            id={errorId}
            role="alert"
            className="text-xs font-medium text-rose-400"
            data-testid="api-key-status"
          >
            {error}
          </span>
        ) : saved ? (
          <span
            id={statusId}
            role="status"
            className="text-xs font-medium text-emerald-400"
            data-testid="api-key-status"
            aria-live="polite"
          >
            Saved
          </span>
        ) : null}
      </div>
      {description ? (
        <p id={descriptionId} className="text-xs text-neutral-400">
          {description}
        </p>
      ) : null}
      <div className="relative">
        <input
          id={inputId}
          type={revealed ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-describedby={[descriptionId, errorId, statusId].filter(Boolean).join(" ") || undefined}
          aria-invalid={Boolean(error) || undefined}
          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-neutral-100 placeholder-neutral-500 focus-visible:border-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setRevealed((prev) => !prev)}
          aria-label={toggleLabel}
          aria-pressed={revealed}
          className="absolute inset-y-0 right-2 flex items-center rounded-md px-2 text-lg text-neutral-400 transition-colors hover:text-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
          data-testid="api-key-toggle"
        >
          <span aria-hidden="true">{revealed ? "🙈" : "👁️"}</span>
        </button>
      </div>
    </div>
  );
};

export default ApiKeyField;
