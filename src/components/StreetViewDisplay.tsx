import React, { useEffect, useRef } from "react";
import { Loader } from "@googlemaps/js-api-loader";

type Props = {
  /** Lat/Lng you want to show. Can be a GPX sample or current route point */
  lat: number;
  lng: number;
  /** Optional: meters to search for a nearby pano if none at the exact point */
  snapRadiusMeters?: number;
  /** Optional: POV adjustments */
  heading?: number;
  pitch?: number;
  /** Optional: Google Maps API key (or load via env) */
  apiKey?: string;
  /** Optional: extra className for sizing (ensure height!) */
  className?: string;
};

const StreetViewDisplay: React.FC<Props> = ({
  lat,
  lng,
  snapRadiusMeters = 75,
  heading = 0,
  pitch = 0,
  apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string,
  className = "",
}) => {
  const panoRef = useRef<HTMLDivElement | null>(null);
  const panoInstanceRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const svsRef = useRef<google.maps.StreetViewService | null>(null);
  const loaderRef = useRef<Loader | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    if (!apiKey) {
      console.error("StreetView: Missing Google Maps API key");
      return;
    }

    if (!loaderRef.current) {
      loaderRef.current = new Loader({
        apiKey,
        version: "weekly",
        libraries: ["geometry"],
      });
    }

    (async () => {
      try {
        const google = await loaderRef.current!.load();

        if (cancelledRef.current || !panoRef.current) return;

        // Init Street View service once
        if (!svsRef.current) {
          svsRef.current = new google.maps.StreetViewService();
        }

        const initOrUpdatePano = (position: google.maps.LatLngLiteral) => {
          if (!panoRef.current) return;

          if (!panoInstanceRef.current) {
            panoInstanceRef.current = new google.maps.StreetViewPanorama(
              panoRef.current,
              {
                position,
                pov: { heading, pitch },
                visible: true,
              },
            );
          } else {
            panoInstanceRef.current.setPosition(position);
            panoInstanceRef.current.setPov({ heading, pitch });
            panoInstanceRef.current.setVisible(true);
          }
        };

        // Snap to nearest panorama within radius
        const trySnap = async () =>
          new Promise<google.maps.StreetViewLocation | null>((resolve) => {
            svsRef.current!.getPanorama(
              {
                location: { lat, lng },
                radius: snapRadiusMeters,
                preference: google.maps.StreetViewPreference.NEAREST,
                source: google.maps.StreetViewSource.OUTDOOR, // prefer outdoor
              },
              (data, status) => {
                if (
                  status === google.maps.StreetViewStatus.OK &&
                  data?.location
                ) {
                  resolve(data.location);
                } else {
                  resolve(null);
                }
              },
            );
          });

        const snapped = await trySnap();

        if (cancelledRef.current) return;

        if (snapped) {
          initOrUpdatePano({ lat: snapped.latLng!.lat(), lng: snapped.latLng!.lng() });
        } else {
          // Fallback to requested point (may be black if truly no coverage)
          console.warn(
            "StreetView: no pano found within radius; using raw position",
          );
          initOrUpdatePano({ lat, lng });
        }
      } catch (err) {
        console.error("StreetView init error:", err);
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
    };
  }, [apiKey, lat, lng, heading, pitch, snapRadiusMeters]);

  return (
    <div
      className={className}
      style={{
        width: "100%",
        height: "100%", // IMPORTANT: ensure parent gives this a real height!
        position: "relative",
      }}
      ref={panoRef}
    />
  );
};

export default StreetViewDisplay;

