// Google Maps API utility functions
export interface GoogleMapsConfig {
  apiKey: string;
  mapId?: string;
}

export interface StreetViewConfig {
  position: google.maps.LatLng;
  pov: google.maps.StreetViewPov;
  zoom?: number;
}

export class GoogleMapsManager {
  private static instance: GoogleMapsManager;
  private mapsLoaded = false;
  private apiKey: string;
  private mapId?: string;
  private loadPromise: Promise<void> | null = null;

  private constructor(config: GoogleMapsConfig) {
    this.apiKey = config.apiKey;
    this.mapId = config.mapId;
  }

  static getInstance(config?: GoogleMapsConfig): GoogleMapsManager {
    if (!GoogleMapsManager.instance) {
      if (!config) {
        throw new Error('GoogleMapsManager requires config on first instantiation');
      }
      GoogleMapsManager.instance = new GoogleMapsManager(config);
    }
    return GoogleMapsManager.instance;
  }

  async loadGoogleMaps(): Promise<void> {
    if (this.mapsLoaded) return;

    if (this.loadPromise) {
      return this.loadPromise;
    }

    this.loadPromise = new Promise((resolve, reject) => {
      const existingAuthFailure = window.gm_authFailure;

      const cleanup = () => {
        if (window.gm_authFailure === authFailureHandler) {
          if (existingAuthFailure) {
            window.gm_authFailure = existingAuthFailure;
          } else {
            delete window.gm_authFailure;
          }
        }
      };

      const handleError = (message: string) => {
        cleanup();
        this.loadPromise = null;
        reject(new Error(message));
      };

      const authFailureHandler = () => {
        existingAuthFailure?.();
        handleError(
          `Google Maps authentication failed. Please verify that "${window.location.origin}" is included in your API key restrictions.`,
        );
      };

      const finalizeLoad = () => {
        cleanup();
        this.mapsLoaded = true;
        resolve();
      };

      // Check if already loaded
      if (window.google && window.google.maps) {
        finalizeLoad();
        return;
      }

      const existingCallback = window.initGoogleMaps;
      window.initGoogleMaps = () => {
        existingCallback?.();
        finalizeLoad();
      };

      window.gm_authFailure = authFailureHandler;

      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[data-google-maps-loader="true"]'
      );

      if (existingScript) {
        return;
      }

      // Create script element
      const script = document.createElement('script');
      script.async = true;
      script.defer = true;
      script.dataset.googleMapsLoader = 'true';

      // Build API URL
      const params = new URLSearchParams({
        key: this.apiKey,
        libraries: 'geometry',
        callback: 'initGoogleMaps',
        loading: 'async',
        v: 'weekly',
      });

      if (this.mapId) {
        params.append('map_id', this.mapId);
      }

      script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;

      // Handle errors
      script.onerror = () => {
        handleError('Failed to load Google Maps API');
      };

      // Add to document
      document.head.appendChild(script);
    }).finally(() => {
      if (!this.mapsLoaded) {
        this.loadPromise = null;
      }
    });

    return this.loadPromise;
  }

  isLoaded(): boolean {
    return this.mapsLoaded;
  }

  geocodeAddress(address: string): Promise<google.maps.LatLng> {
    return new Promise((resolve, reject) => {
      if (!this.mapsLoaded) {
        reject(new Error('Google Maps not loaded'));
        return;
      }

      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ address }, (results, status) => {
        if (status === google.maps.GeocoderStatus.OK && results[0]) {
          resolve(results[0].geometry.location);
        } else {
          reject(new Error(`Geocoding failed: ${status}`));
        }
      });
    });
  }

  reverseGeocode(position: google.maps.LatLng): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.mapsLoaded) {
        reject(new Error('Google Maps not loaded'));
        return;
      }

      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: position }, (results, status) => {
        if (status === google.maps.GeocoderStatus.OK && results[0]) {
          resolve(results[0].formatted_address);
        } else {
          reject(new Error(`Reverse geocoding failed: ${status}`));
        }
      });
    });
  }

  calculateDistance(from: google.maps.LatLng, to: google.maps.LatLng): number {
    if (!this.mapsLoaded) {
      throw new Error('Google Maps not loaded');
    }
    return google.maps.geometry.spherical.computeDistanceBetween(from, to);
  }

  interpolateAlongPath(path: google.maps.LatLng[], fraction: number): google.maps.LatLng {
    if (!this.mapsLoaded) {
      throw new Error('Google Maps not loaded');
    }
    return google.maps.geometry.spherical.interpolate(path[0], path[path.length - 1], fraction);
  }
}

declare const google: any;

// Type declarations for global window object
declare global {
  interface Window {
    initGoogleMaps: () => void;
    google: typeof google;
    gm_authFailure?: () => void;
  }
}

export {};
