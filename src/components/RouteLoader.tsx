import React, { useCallback, useEffect, useId, useRef, useState } from "react";

import type { Route } from "../types";

export interface RouteLoaderProps {
  route: Route;
  isLoading: boolean;
  error: string | null;
  loadGpxFile: (file: File) => Promise<Route>;
  resetRoute: () => void;
}

const RouteLoader: React.FC<RouteLoaderProps> = ({
  route,
  isLoading,
  error,
  loadGpxFile,
  resetRoute,
}) => {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
      setStatusMessage(null);
    }
  }, [error]);

  const clearFileInput = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || isLoading) {
        clearFileInput();
        return;
      }

      setStatusMessage(null);

      try {
        await loadGpxFile(file);
        setStatusMessage(`Loaded route from ${file.name}`);
      } catch (err) {
        setStatusMessage(null);
      } finally {
        clearFileInput();
      }
    },
    [clearFileInput, isLoading, loadGpxFile],
  );

  const handleBrowseClick = useCallback(() => {
    if (isLoading) {
      return;
    }

    fileInputRef.current?.click();
  }, [isLoading]);

  const handleReset = useCallback(() => {
    resetRoute();
    clearFileInput();
    setStatusMessage("Restored default route");
  }, [clearFileInput, resetRoute]);

  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur-sm"
      aria-label="Route loader"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-slate-900">Route</h2>
        <p className="text-sm text-slate-500">
          Load a GPX file to override the current route or restore the default route at any time.
        </p>
        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-700">Current route:</span> {route.name ?? "Unnamed route"}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          id={fileInputId}
          ref={fileInputRef}
          type="file"
          accept=".gpx,application/gpx+xml"
          className="sr-only"
          onChange={handleFileChange}
        />
        <button
          type="button"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:bg-blue-300"
          onClick={handleBrowseClick}
          disabled={isLoading}
        >
          {isLoading ? "Loading..." : "Select GPX file"}
        </button>
        <label htmlFor={fileInputId} className="sr-only">
          Select a GPX file to load a new route
        </label>
        <button
          type="button"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:cursor-not-allowed disabled:opacity-70"
          onClick={handleReset}
          disabled={isLoading}
        >
          Reset to default route
        </button>
      </div>

      <div className="min-h-[1.5rem]" aria-live="polite">
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : statusMessage ? (
          <p className="text-sm text-green-600">{statusMessage}</p>
        ) : null}
      </div>
    </section>
  );
};

export default RouteLoader;
