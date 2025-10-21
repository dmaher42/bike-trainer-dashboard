import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import type { Route } from "../types";
import { LoadingSpinner } from "./LoadingStates";

export interface RouteLoaderProps {
  route: Route;
  isLoading: boolean;
  error: string | null;
  onLoadGPX: (file: File) => Promise<Route>;
  onResetToDefault: () => void;
}

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

const RouteLoader: React.FC<RouteLoaderProps> = ({
  route,
  isLoading,
  error,
  onLoadGPX,
  onResetToDefault,
}) => {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);

  useEffect(() => {
    if (error) {
      setStatusMessage(null);
      setLocalError(null);
    }
  }, [error]);

  const clearFileInput = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const validateFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".gpx")) {
      setLocalError("Unsupported file type. Please choose a .gpx file.");
      return false;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setLocalError("File is too large. Please upload a GPX file smaller than 10MB.");
      return false;
    }

    return true;
  }, []);

  const processFile = useCallback(
    async (file: File) => {
      if (isLoading) {
        return;
      }

      setStatusMessage(null);
      setLocalError(null);

      if (!validateFile(file)) {
        clearFileInput();
        return;
      }

      setLoadedFileName(file.name);

      try {
        await onLoadGPX(file);
        setStatusMessage(`Loaded route from ${file.name}`);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to load the selected GPX file.";
        setLocalError(message);
        setLoadedFileName(null);
      } finally {
        clearFileInput();
      }
    },
    [clearFileInput, isLoading, onLoadGPX, validateFile],
  );

  const handleFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      await processFile(file);
    },
    [processFile],
  );

  const handleBrowseClick = useCallback(() => {
    if (isLoading) {
      return;
    }

    fileInputRef.current?.click();
  }, [isLoading]);

  const handleReset = useCallback(() => {
    onResetToDefault();
    clearFileInput();
    setLoadedFileName(null);
    setLocalError(null);
    setStatusMessage("Restored default route");
  }, [clearFileInput, onResetToDefault]);

  const handleDrag = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.type === "dragenter" || event.type === "dragover") {
      setDragActive(true);
    } else if (event.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setDragActive(false);

      const file = event.dataTransfer.files?.[0];
      if (!file) {
        return;
      }

      void processFile(file);
    },
    [processFile],
  );

  const activeError = useMemo(() => localError ?? error, [error, localError]);
  const successMessage = !activeError && !isLoading ? statusMessage : null;

  return (
    <section className="glass-card space-y-4 p-6" aria-label="Route loader">
      <header className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-50">Route</h2>
          {route.name ? (
            <span className="inline-flex items-center gap-2 rounded-full bg-success-500/10 px-3 py-1 text-xs font-medium text-success-300">
              <span className="h-2 w-2 rounded-full bg-success-400" />
              {route.name}
            </span>
          ) : null}
        </div>
        <p className="text-sm text-slate-300">
          Load a GPX file to override the current route or restore the default route at any time.
        </p>
        <p className="text-sm text-slate-400">
          <span className="font-medium text-slate-200">Current route:</span> {route.name ?? "Unnamed route"}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
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
          className="btn-primary relative inline-flex items-center gap-2"
          onClick={handleBrowseClick}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <LoadingSpinner size="sm" />
              Loading...
            </>
          ) : (
            <>
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              Select GPX file
            </>
          )}
        </button>
        <label htmlFor={fileInputId} className="sr-only">
          Select a GPX file to load a new route
        </label>
        <button
          type="button"
          className="btn-secondary"
          onClick={handleReset}
          disabled={isLoading}
        >
          Reset to default route
        </button>
      </div>

      <div
        className={`relative rounded-2xl border-2 border-dashed p-6 transition-all duration-200 ${
          dragActive ? "border-primary-500 bg-primary-500/10" : "border-white/10 bg-white/5 hover:border-white/20"
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="text-center">
          <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <div className="mt-4 space-y-2">
            <p className="text-sm text-slate-300">
              Drag and drop your GPX file here, or
              <button
                type="button"
                onClick={handleBrowseClick}
                className="ml-1 text-primary-300 underline transition hover:text-primary-200"
                disabled={isLoading}
              >
                browse
              </button>
            </p>
            <p className="text-xs text-slate-400">Supports GPX format files up to 10MB.</p>
            {loadedFileName ? (
              <p className="text-xs text-slate-300">
                Selected file: <span className="font-medium text-slate-100">{loadedFileName}</span>
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="space-y-3" aria-live="polite">
        {activeError ? (
          <div className="flex items-start gap-3 rounded-xl border border-danger-500/20 bg-danger-500/10 p-4" role="alert">
            <svg className="mt-0.5 h-5 w-5 text-danger-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <h3 className="text-sm font-semibold text-danger-200">Failed to load GPX file</h3>
              <p className="mt-1 text-xs text-slate-300">{activeError}</p>
            </div>
          </div>
        ) : null}

        {successMessage ? (
          <div className="flex items-start gap-3 rounded-xl border border-success-500/20 bg-success-500/10 p-4">
            <svg className="mt-0.5 h-5 w-5 text-success-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <h3 className="text-sm font-semibold text-success-200">Route loaded successfully</h3>
              <p className="mt-1 text-xs text-slate-300">{successMessage}</p>
            </div>
          </div>
        ) : null}

        {!activeError && !isLoading && route.pts.length > 0 ? (
          <div className="flex items-start gap-3 rounded-xl border border-primary-500/20 bg-primary-500/10 p-4">
            <svg className="mt-0.5 h-5 w-5 text-primary-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 6v6l4 2"
              />
            </svg>
            <div>
              <h3 className="text-sm font-semibold text-primary-200">Route details</h3>
              <p className="mt-1 text-xs text-slate-300">
                {route.pts.length} waypoints • {route.total.toFixed(2)} total distance
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default RouteLoader;
