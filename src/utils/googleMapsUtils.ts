export interface GoogleMapsManagerOptions {
  apiKey: string;
}

const GOOGLE_MAPS_SCRIPT_ID = "google-maps-script";

export class GoogleMapsManager {
  private static instance: GoogleMapsManager | null = null;

  private scriptLoadingPromise: Promise<void> | null = null;

  private constructor(private readonly options: GoogleMapsManagerOptions) {}

  static getInstance(options: GoogleMapsManagerOptions): GoogleMapsManager {
    if (!GoogleMapsManager.instance) {
      GoogleMapsManager.instance = new GoogleMapsManager(options);
      return GoogleMapsManager.instance;
    }

    if (GoogleMapsManager.instance.options.apiKey !== options.apiKey) {
      GoogleMapsManager.instance = new GoogleMapsManager(options);
    }

    return GoogleMapsManager.instance;
  }

  async loadGoogleMaps(): Promise<void> {
    if (typeof window === "undefined") {
      return;
    }

    if (this.isLoaded()) {
      return;
    }

    if (this.scriptLoadingPromise) {
      return this.scriptLoadingPromise;
    }

    const existingScript = document.getElementById(
      GOOGLE_MAPS_SCRIPT_ID,
    ) as HTMLScriptElement | null;

    if (existingScript) {
      this.scriptLoadingPromise = new Promise((resolve, reject) => {
        const handleLoad = () => {
          existingScript.removeEventListener("load", handleLoad);
          existingScript.removeEventListener("error", handleError);
          resolve();
        };

        const handleError = () => {
          existingScript.removeEventListener("load", handleLoad);
          existingScript.removeEventListener("error", handleError);
          this.scriptLoadingPromise = null;
          reject(new Error("Failed to load Google Maps"));
        };

        if (this.isLoaded()) {
          resolve();
          return;
        }

        existingScript.addEventListener("load", handleLoad);
        existingScript.addEventListener("error", handleError);
      });

      return this.scriptLoadingPromise;
    }

    this.scriptLoadingPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.id = GOOGLE_MAPS_SCRIPT_ID;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${this.options.apiKey}&libraries=geometry`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        script.onload = null;
        script.onerror = null;
        resolve();
      };
      script.onerror = () => {
        script.onload = null;
        script.onerror = null;
        this.scriptLoadingPromise = null;
        reject(new Error("Failed to load Google Maps"));
      };

      document.head.appendChild(script);
    });

    return this.scriptLoadingPromise;
  }

  isLoaded(): boolean {
    if (typeof window === "undefined") {
      return false;
    }

    return Boolean(window.google?.maps?.StreetViewPanorama);
  }

  async reverseGeocode(
    location: google.maps.LatLng | google.maps.LatLngLiteral,
  ): Promise<string> {
    if (!this.isLoaded()) {
      throw new Error("Google Maps has not finished loading");
    }

    return new Promise((resolve, reject) => {
      const geocoder = new google.maps.Geocoder();

      geocoder.geocode({ location }, (results, status) => {
        if (status !== google.maps.GeocoderStatus.OK || !results?.length) {
          reject(new Error("Unable to determine location name"));
          return;
        }

        resolve(results[0]?.formatted_address ?? "");
      });
    });
  }

  async geocodeAddress(address: string): Promise<google.maps.LatLng> {
    if (!this.isLoaded()) {
      throw new Error("Google Maps has not finished loading");
    }

    return new Promise((resolve, reject) => {
      const geocoder = new google.maps.Geocoder();

      geocoder.geocode({ address }, (results, status) => {
        if (status !== google.maps.GeocoderStatus.OK || !results?.length) {
          reject(new Error("Unable to determine coordinates for the given address"));
          return;
        }

        const location = results[0]?.geometry?.location;
        if (!location) {
          reject(new Error("Unable to determine coordinates for the given address"));
          return;
        }

        resolve(location);
      });
    });
  }

  calculateDistance(
    from: google.maps.LatLng | google.maps.LatLngLiteral,
    to: google.maps.LatLng | google.maps.LatLngLiteral,
  ): number {
    if (!this.isLoaded()) {
      throw new Error("Google Maps has not finished loading");
    }

    if (!google.maps.geometry?.spherical) {
      throw new Error("Google Maps geometry library is not available");
    }

    return google.maps.geometry.spherical.computeDistanceBetween(
      from as google.maps.LatLng,
      to as google.maps.LatLng,
    );
  }
}
