import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader } from "@googlemaps/js-api-loader";

type StreetViewStatus =
  | "idle"
  | "loading"
  | "ready"
  | "no-coverage"
  | "error";

type Props = {
  /** Latitude to display */
  lat: number;
  /** Longitude to display ("lng" preferred but "lon" supported for compatibility) */
  lng?: number;
  lon?: number;
  /** Optional: meters to search for a nearby pano if none at the exact point */
  snapRadiusMeters?: number;
  /** Optional: POV adjustments */
  heading?: number;
  pitch?: number;
  /** Optional: Google Maps API key (or load via env) */
  apiKey?: string;
  /** Optional: extra className for sizing (ensure height!) */
  className?: string;
  /** Optional callback invoked when imagery cannot be loaded */
  onError?: (message: string) => void;
};

export const StreetViewDisplay: React.FC<Props> = ({
  lat,
  lng,
  lon,
  snapRadiusMeters = 75,
  heading = 0,
  pitch = 0,
  apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string,
  className = "",
  onError,
}) => {
  const panoRef = useRef<HTMLDivElement | null>(null);
  const fallbackMapRef = useRef<HTMLDivElement | null>(null);
  const panoInstanceRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const fallbackMapInstanceRef = useRef<google.maps.Map | null>(null);
  const svsRef = useRef<google.maps.StreetViewService | null>(null);
  const loaderRef = useRef<Loader | null>(null);
  const cancelledRef = useRef(false);
  const lastNotifiedMessageRef = useRef<string | null>(null);

  const [status, setStatus] = useState<StreetViewStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const teardownFallbackMap = useCallback(() => {
    if (fallbackMapInstanceRef.current) {
      fallbackMapInstanceRef.current = null;
    }
    if (fallbackMapRef.current) {
      fallbackMapRef.current.innerHTML = "";
    }
  }, []);

  const ensureFallbackMap = useCallback(
    (googleMaps: typeof google, position: google.maps.LatLngLiteral) => {
      if (!fallbackMapRef.current) {
        console.debug("StreetView: Fallback map container not available");
        return;
      }

      if (!fallbackMapInstanceRef.current) {
        fallbackMapInstanceRef.current = new googleMaps.maps.Map(
          fallbackMapRef.current,
          {
            center: position,
            zoom: 17,
            mapTypeId: googleMaps.maps.MapTypeId.SATELLITE,
            disableDefaultUI: true,
          },
        );
      } else {
        fallbackMapInstanceRef.current.setOptions({
          center: position,
          zoom: 17,
          mapTypeId: googleMaps.maps.MapTypeId.SATELLITE,
        });
      }
    },
    [],
  );

  useEffect(() => {
    cancelledRef.current = false;
    lastNotifiedMessageRef.current = null;

    const notify = (message: string) => {
      if (lastNotifiedMessageRef.current !== message) {
        lastNotifiedMessageRef.current = message;
        onError?.(message);
      }
    };

    const updateStatus = (nextStatus: StreetViewStatus, message?: string | null) => {
      if (cancelledRef.current) {
        return;
      }
      setStatus(nextStatus);
      setStatusMessage(message ?? null);
      if (!message && nextStatus === "ready") {
        lastNotifiedMessageRef.current = null;
      }
    };

    const clearStreetViewInstance = () => {
      if (panoInstanceRef.current) {
        panoInstanceRef.current.setVisible(false);
      }
    };

    const resolvedLng = Number.isFinite(lng)
      ? Number(lng)
      : Number.isFinite(lon)
      ? Number(lon)
      : NaN;
    const resolvedLat = Number(lat);

    console.debug("StreetView: Incoming coordinates", {
      provided: { lat, lng, lon },
      resolved: { lat: resolvedLat, lng: resolvedLng },
    });

    if (!apiKey) {
      const message = "Street View requires a Google Maps API key.";
      console.error("StreetView: Missing Google Maps API key");
      updateStatus("error", message);
      notify(message);
      teardownFallbackMap();
      clearStreetViewInstance();
      return;
    }

    if (!Number.isFinite(resolvedLat) || !Number.isFinite(resolvedLng)) {
      const message =
        "Invalid coordinates provided for Street View (expected numeric latitude/longitude).";
      console.error("StreetView: Non-numeric coordinates", {
        lat,
        lng,
        lon,
      });
      updateStatus("error", message);
      notify(message);
      teardownFallbackMap();
      clearStreetViewInstance();
      return;
    }

    if (Math.abs(resolvedLat) > 90 || Math.abs(resolvedLng) > 180) {
      const message =
        "Coordinates received are outside the valid latitude/longitude range.";
      console.error("StreetView: Coordinates out of bounds", {
        lat: resolvedLat,
        lng: resolvedLng,
      });
      updateStatus("error", message);
      notify(message);
      teardownFallbackMap();
      clearStreetViewInstance();
      return;
    }

    const position: google.maps.LatLngLiteral = {
      lat: resolvedLat,
      lng: resolvedLng,
    };

    const validRadius = Number.isFinite(snapRadiusMeters) && snapRadiusMeters > 0
      ? snapRadiusMeters
      : 75;

    if (validRadius !== snapRadiusMeters) {
      console.warn("StreetView: Invalid snap radius supplied; falling back to default", {
        requested: snapRadiusMeters,
        using: validRadius,
      });
    }

    updateStatus("loading", "Loading Street View imagery…");
    teardownFallbackMap();

    if (!loaderRef.current) {
      loaderRef.current = new Loader({
        apiKey,
        version: "weekly",
        libraries: ["geometry"],
      });
    }

    (async () => {
      try {
        const googleMaps = await loaderRef.current!.load();

        if (cancelledRef.current || !panoRef.current) {
          return;
        }

        if (!svsRef.current) {
          svsRef.current = new googleMaps.maps.StreetViewService();
        }

        const initOrUpdatePano = (panoPosition: google.maps.LatLngLiteral) => {
          if (!panoRef.current) {
            return;
          }

          if (!panoInstanceRef.current) {
            panoInstanceRef.current = new googleMaps.maps.StreetViewPanorama(
              panoRef.current,
              {
                position: panoPosition,
                pov: { heading, pitch },
                visible: true,
              },
            );
          } else {
            panoInstanceRef.current.setPosition(panoPosition);
            panoInstanceRef.current.setPov({ heading, pitch });
            panoInstanceRef.current.setVisible(true);
          }
        };

        console.debug("StreetView: Searching for nearby panorama", {
          position,
          radius: validRadius,
        });

        const snapped = await new Promise<google.maps.StreetViewLocation | null>((resolve) => {
          svsRef.current!.getPanorama(
            {
              location: position,
              radius: validRadius,
              preference: googleMaps.maps.StreetViewPreference.NEAREST,
              source: googleMaps.maps.StreetViewSource.OUTDOOR,
            },
            (data, statusResult) => {
              if (statusResult === googleMaps.maps.StreetViewStatus.OK && data?.location) {
                resolve(data.location);
              } else {
                resolve(null);
              }
            },
          );
        });

        if (cancelledRef.current) {
          return;
        }

        if (snapped?.latLng) {
          const snappedPosition = {
            lat: snapped.latLng.lat(),
            lng: snapped.latLng.lng(),
          };

          console.debug("StreetView: Using snapped panorama", {
            original: position,
            snapped: snappedPosition,
            panoId: snapped.pano,
          });

          initOrUpdatePano(snappedPosition);
          updateStatus("ready");
          return;
        }

        console.warn("StreetView: No panorama found within radius", {
          position,
          radius: validRadius,
        });

        clearStreetViewInstance();
        ensureFallbackMap(googleMaps, position);
        const fallbackMessage =
          "Street View imagery is not available near this section of the route. Showing satellite view instead.";
        updateStatus("no-coverage", fallbackMessage);
        notify(fallbackMessage);
      } catch (err) {
        console.error("StreetView: Failed to initialise", err);
        const errorMessage =
          err instanceof Error
            ? `Unable to load Street View: ${err.message}`
            : "Unable to load Street View imagery.";
        notify(errorMessage);
        updateStatus("error", errorMessage);
        teardownFallbackMap();
        clearStreetViewInstance();
      }
    })();

    return () => {
      cancelledRef.current = true;
      // Clean up pano instance to avoid StrictMode double mounts weirdness
      if (panoInstanceRef.current) {
        // No explicit destroy API; clear the node instead
        panoInstanceRef.current.setVisible(false);
        panoInstanceRef.current = null;
      }
      teardownFallbackMap();
    };
  }, [
    apiKey,
    lat,
    lng,
    lon,
    heading,
    pitch,
    snapRadiusMeters,
    ensureFallbackMap,
    onError,
    teardownFallbackMap,
  ]);

  const showStreetView = status !== "no-coverage" && status !== "error";
  const showFallback = status === "no-coverage";

  return (
    <div
      className={className}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
      }}
    >
      <div
        ref={panoRef}
        style={{
          position: "absolute",
          inset: 0,
          display: showStreetView ? "block" : "none",
        }}
      />

      <div
        ref={fallbackMapRef}
        style={{
          position: "absolute",
          inset: 0,
          display: showFallback ? "block" : "none",
        }}
      />

      {statusMessage && (
        <div
          style={{
            position: "absolute",
            top: "0.75rem",
            left: "50%",
            transform: "translateX(-50%)",
            pointerEvents: "none",
            zIndex: 2,
            maxWidth: "90%",
          }}
          role="status"
          aria-live="polite"
          aria-busy={status === "loading"}
        >
          <div
            style={{
              backgroundColor: "rgba(15, 23, 42, 0.8)",
              color: "#f8fafc",
              padding: "0.5rem 0.75rem",
              borderRadius: "0.75rem",
              textAlign: "center",
              fontSize: "0.875rem",
              boxShadow: "0 10px 30px rgba(15, 23, 42, 0.35)",
              backdropFilter: "blur(6px)",
            }}
          >
            {statusMessage}
          </div>
        </div>
      )}
    </div>
  );
};

export default StreetViewDisplay;


