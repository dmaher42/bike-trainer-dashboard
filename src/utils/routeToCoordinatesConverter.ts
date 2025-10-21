import type { Route, RoutePoint } from "../types";
import { GoogleMapsManager } from "./googleMapsUtils";

export interface CoordinateMapping {
  virtualPoint: RoutePoint;
  realCoordinates: {
    lat: number;
    lng: number;
  };
}

export class RouteToCoordinatesConverter {
  private readonly mapsManager: GoogleMapsManager;

  constructor(apiKey: string) {
    this.mapsManager = GoogleMapsManager.getInstance({ apiKey });
  }

  async convertVirtualRouteToReal(
    virtualRoute: Route,
    centerAddress: string,
    radiusKm: number = 1,
  ): Promise<Route> {
    if (!virtualRoute.pts.length) {
      throw new Error("Virtual route must contain at least one point");
    }

    await this.mapsManager.loadGoogleMaps();

    const center = await this.mapsManager.geocodeAddress(centerAddress);

    const realPoints: RoutePoint[] = virtualRoute.pts.map((point) => {
      const angle = (point.x - 0.5) * 2 * Math.PI;
      const distance = point.y * radiusKm;

      const latRadians = (center.lat() * Math.PI) / 180;
      const latOffset = (distance * Math.cos(angle)) / 111.32;
      const lngOffset =
        (distance * Math.sin(angle)) / (111.32 * Math.cos(latRadians));

      return {
        ...point,
        lat: center.lat() + latOffset,
        lng: center.lng() + lngOffset,
      };
    });

    const cum: number[] = new Array(realPoints.length).fill(0);
    for (let i = 1; i < realPoints.length; i += 1) {
      const from = new google.maps.LatLng(
        realPoints[i - 1].lat!,
        realPoints[i - 1].lng!,
      );
      const to = new google.maps.LatLng(realPoints[i].lat!, realPoints[i].lng!);
      const segmentDistanceKm =
        this.mapsManager.calculateDistance(from, to) / 1000;
      cum[i] = cum[i - 1] + segmentDistanceKm;
    }

    return {
      pts: realPoints,
      cum,
      total: cum[cum.length - 1],
      name: virtualRoute.name,
    };
  }

  async findNearbyStreetView(
    position: { lat: number; lng: number },
    radiusMeters: number = 50,
  ): Promise<{ lat: number; lng: number } | null> {
    await this.mapsManager.loadGoogleMaps();

    const svService = new google.maps.StreetViewService();
    const latLng = new google.maps.LatLng(position.lat, position.lng);

    return new Promise((resolve) => {
      svService.getPanorama(
        {
          location: latLng,
          radius: radiusMeters,
          source: google.maps.StreetViewSource.OUTDOOR,
        },
        (data, status) => {
          if (status === google.maps.StreetViewStatus.OK && data) {
            resolve({
              lat: data.location.latLng?.lat() ?? position.lat,
              lng: data.location.latLng?.lng() ?? position.lng,
            });
            return;
          }

          resolve(null);
        },
      );
    });
  }
}
