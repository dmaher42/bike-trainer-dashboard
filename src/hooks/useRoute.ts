import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Route } from "../types";
import { buildRoute, parseGPX } from "../utils/routeUtils";

export interface UseRouteOptions {
  /** Optional route to use when the hook initialises or resets. */
  defaultRoute?: Route;
}

export interface UseRouteResult {
  route: Route;
  isLoading: boolean;
  error: string | null;
  lastLoadedFile: string | null;
  /**
   * Loads a GPX file and replaces the current route with the parsed result.
   * Resolves with the parsed {@link Route} when successful.
   */
  loadGpxFile: (file: File) => Promise<Route>;
  /** Restores the route state to the configured default. */
  resetRoute: () => void;
}

const FALLBACK_ROUTE = buildRoute(20_000, 400, { name: "Rolling Hills" });
const MAX_GPX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ensureText = (value: string | ArrayBuffer | null): string => {
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new TextDecoder().decode(value);
  }
  return "";
};

export const useRoute = (options: UseRouteOptions = {}): UseRouteResult => {
  const { defaultRoute: providedDefault } = options;

  const defaultRoute = useMemo(() => providedDefault ?? FALLBACK_ROUTE, [providedDefault]);
  const [route, setRoute] = useState<Route>(defaultRoute);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedFile, setLastLoadedFile] = useState<string | null>(null);

  const readerRef = useRef<FileReader | null>(null);

  useEffect(() => {
    setRoute(defaultRoute);
    setLastLoadedFile(null);
  }, [defaultRoute]);

  useEffect(() => {
    return () => {
      const reader = readerRef.current;
      if (reader && reader.readyState === FileReader.LOADING) {
        reader.abort();
      }
    };
  }, []);

  const resetRoute = useCallback(() => {
    const reader = readerRef.current;
    if (reader && reader.readyState === FileReader.LOADING) {
      reader.abort();
    }

    setError(null);
    setIsLoading(false);
    setRoute(defaultRoute);
    setLastLoadedFile(null);
  }, [defaultRoute]);

  const loadGpxFile = useCallback(
    (file: File) =>
      new Promise<Route>((resolve, reject) => {
        if (!(file instanceof File)) {
          const message = "No GPX file provided";
          setError(message);
          reject(new Error(message));
          return;
        }

        setIsLoading(true);
        setError(null);
        setLastLoadedFile(null);

        if (file.size > MAX_GPX_FILE_SIZE) {
          const message = "File too large. Please select a GPX file smaller than 10MB.";
          setError(message);
          setIsLoading(false);
          reject(new Error(message));
          return;
        }

        if (!file.name.toLowerCase().endsWith(".gpx")) {
          const message = "Invalid file type. Please select a GPX file.";
          setError(message);
          setIsLoading(false);
          reject(new Error(message));
          return;
        }

        if (readerRef.current && readerRef.current.readyState === FileReader.LOADING) {
          readerRef.current.abort();
        }

        const reader = new FileReader();
        readerRef.current = reader;

        const clearReader = () => {
          if (readerRef.current === reader) {
            readerRef.current = null;
          }
        };

        reader.onload = () => {
          try {
            const text = ensureText(reader.result);
            if (!text) {
              throw new Error("GPX file is empty or unreadable");
            }

            const parsed = parseGPX(text);
            setRoute(parsed);
            setIsLoading(false);
            setError(null);
            setLastLoadedFile(file.name);
            clearReader();
            resolve(parsed);
          } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to parse GPX file";
            setError(message);
            setIsLoading(false);
            setLastLoadedFile(null);
            clearReader();
            reject(err instanceof Error ? err : new Error(message));
          }
        };

        reader.onerror = () => {
          const message = reader.error?.message ?? "Failed to read GPX file";
          setError(message);
          setIsLoading(false);
          setLastLoadedFile(null);
          clearReader();
          reject(new Error(message));
        };

        reader.onabort = () => {
          const message = "GPX file reading was aborted";
          setError(message);
          setIsLoading(false);
          setLastLoadedFile(null);
          clearReader();
          reject(new Error(message));
        };

        try {
          reader.readAsText(file);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to start reading GPX file";
          setError(message);
          setIsLoading(false);
          setLastLoadedFile(null);
          clearReader();
          reject(err instanceof Error ? err : new Error(message));
        }
      }),
    []
  );

  useEffect(() => {
    if (!error) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setError(null);
    }, 5000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [error]);

  return {
    route,
    isLoading,
    error,
    lastLoadedFile,
    loadGpxFile,
    resetRoute,
  };
};

export default useRoute;
