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
      let script: HTMLScriptElement | null = null;
      const existingAuthFailure = window.gm_authFailure;
      const existingCallback = window.initGoogleMaps;

      const restoreHandlers = () => {
        if (window.gm_authFailure === authFailureHandler) {
          if (existingAuthFailure) {
            window.gm_authFailure = existingAuthFailure;
          } else {
            delete window.gm_authFailure;
          }
        }

        if (window.initGoogleMaps === initCallback) {
          if (existingCallback) {
            window.initGoogleMaps = existingCallback;
          } else {
            delete window.initGoogleMaps;
          }
        }
      };

      const finalizeLoad = () => {
        if (this.mapsLoaded) {
          restoreHandlers();
          resolve();
          return;
        }

        if (script) {
          script.dataset.googleMapsLoaderStatus = 'loaded';
        }

        this.mapsLoaded = true;
        restoreHandlers();
        resolve();
      };

      const handleError = (message: string) => {
        if (script) {
          script.dataset.googleMapsLoaderStatus = 'error';
          script.remove();
          script = null;
        }

        restoreHandlers();
        this.loadPromise = null;

        if ('google' in window) {
          // Remove the partial Google namespace so we can retry with a new key
          delete (window as typeof window & { google?: any }).google;
        }

        reject(new Error(message));
      };

      const authFailureHandler = () => {
        existingAuthFailure?.();

        const origin = window.location.origin;
        const pathPrefix = window.location.pathname.replace(/[^/]*$/, '');
        const refererSuggestion = `${origin}${pathPrefix}*`;

        handleError(
          `Google Maps authentication failed. Please verify that "${origin}" or "${refererSuggestion}" is included in your API key restrictions.`,
        );
      };

      const initCallback = () => {
        existingCallback?.();
        finalizeLoad();
      };

      const hasLoadedGoogleMaps =
        typeof window.google?.maps?.StreetViewPanorama === 'function';

      if (hasLoadedGoogleMaps) {
        finalizeLoad();
        return;
      }

      const existingScriptElement = document.querySelector<HTMLScriptElement>(
        'script[data-google-maps-loader="true"]',
      );

      if (existingScriptElement) {
        const { googleMapsLoaderStatus } = existingScriptElement.dataset;

        if (googleMapsLoaderStatus === 'loaded') {
          script = existingScriptElement;
          finalizeLoad();
          return;
        }

        if (googleMapsLoaderStatus === 'loading') {
          script = existingScriptElement;
          window.initGoogleMaps = initCallback;
          window.gm_authFailure = authFailureHandler;
          return;
        }

        existingScriptElement.remove();
      }

      script = document.createElement('script');
      script.async = true;
      script.defer = true;
      script.dataset.googleMapsLoader = 'true';
      script.dataset.googleMapsLoaderStatus = 'loading';
      script.dataset.googleMapsLoaderKey = this.apiKey;

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

      window.initGoogleMaps = initCallback;
      window.gm_authFailure = authFailureHandler;

      script.onerror = () => {
        handleError('Failed to load Google Maps API');
      };

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

// Type declarations for global window object
declare global {
  interface Window {
    initGoogleMaps: () => void;
    google?: any;
    gm_authFailure?: () => void;
  }
}
