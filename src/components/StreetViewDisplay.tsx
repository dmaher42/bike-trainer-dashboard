import React, { useEffect, useRef, useState, useCallback } from "react";
import { Route, RoutePoint } from "../types";
import { GoogleMapsManager } from "../utils/googleMapsUtils";
import { LoadingSpinner } from "./LoadingStates";

interface StreetViewDisplayProps {
  route: Route;
  currentPosition: number; // 0-1 fraction along the route
  isRiding: boolean;
  apiKey: string;
  onLocationUpdate?: (location: string) => void;
  onError?: (error: string) => void;
}

export const StreetViewDisplay: React.FC<StreetViewDisplayProps> = ({
  route,
  currentPosition,
  isRiding,
  apiKey,
  onLocationUpdate,
  onError,
}) => {
  const streetViewRef = useRef<HTMLDivElement>(null);
  const panoramaRef = useRef<google.maps.StreetViewPanorama | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<string>('');
  const [mapsManager, setMapsManager] = useState<GoogleMapsManager | null>(null);
  const [routeLatLngs, setRouteLatLngs] = useState<google.maps.LatLng[]>([]);
  const [retryCount, setRetryCount] = useState(0);
  const [imageCache, setImageCache] = useState<Map<string, string>>(new Map());

  // Initialize Google Maps
  useEffect(() => {
    const initializeMaps = async () => {
      try {
        const manager = GoogleMapsManager.getInstance({ apiKey });
        setMapsManager(manager);
        
        await manager.loadGoogleMaps();
        setIsLoading(false);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load Google Maps';
        setError(errorMessage);
        setIsLoading(false);
        onError?.(errorMessage);
      }
    };

    initializeMaps();
  }, [apiKey, onError]);

  // Convert route points to LatLng objects
  useEffect(() => {
    if (!mapsManager || !mapsManager.isLoaded()) return;

    const convertRoutePoints = async () => {
      try {
        // For now, we'll use dummy coordinates. In a real implementation,
        // you would convert your route points to real lat/lng coordinates
        const latLngs = route.pts.map((point, index) => {
          // Create a sample route around San Francisco
          const baseLat = 37.7749;
          const baseLng = -122.4194;
          
          // Create a loop route
          const angle = (index / route.pts.length) * 2 * Math.PI;
          const radius = 0.01; // About 1km radius
          
          const lat = baseLat + radius * Math.cos(angle);
          const lng = baseLng + radius * Math.sin(angle);
          
          return new google.maps.LatLng(lat, lng);
        });

        setRouteLatLngs(latLngs);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to convert route points';
        setError(errorMessage);
        onError?.(errorMessage);
      }
    };

    convertRoutePoints();
  }, [mapsManager, route, onError]);

  // Initialize Street View panorama
  useEffect(() => {
    if (!streetViewRef.current || !mapsManager || !mapsManager.isLoaded() || routeLatLngs.length === 0) {
      return;
    }

    try {
      // Create or update panorama
      if (!panoramaRef.current) {
        panoramaRef.current = new google.maps.StreetViewPanorama(streetViewRef.current, {
          position: routeLatLngs[0],
          pov: {
            heading: 0,
            pitch: 0,
            zoom: 1,
          },
          visible: true,
          addressControl: false,
          linksControl: false,
          panControl: false,
          zoomControl: false,
          fullscreenControl: false,
          motionTracking: false,
          motionTrackingControl: false,
        });
      }

      // Update location when position changes
      const updateStreetViewPosition = async () => {
        if (!panoramaRef.current || routeLatLngs.length === 0) return;

        const index = Math.floor(currentPosition * (routeLatLngs.length - 1));
        const position = routeLatLngs[index];

        // Calculate heading based on next point
        let heading = 0;
        if (index < routeLatLngs.length - 1) {
          const nextPoint = routeLatLngs[index + 1];
          heading = google.maps.geometry.spherical.computeHeading(position, nextPoint);
        }

        // Update panorama
        panoramaRef.current.setPosition(position);
        panoramaRef.current.setPov({
          heading,
          pitch: 0,
          zoom: 1,
        });

        // Get current location name
        try {
          const location = await mapsManager.reverseGeocode(position);
          setCurrentLocation(location);
          onLocationUpdate?.(location);
        } catch (err) {
          console.warn('Failed to get location name:', err);
        }
      };

      updateStreetViewPosition();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize Street View';
      setError(errorMessage);
      onError?.(errorMessage);
    }
  }, [mapsManager, routeLatLngs, currentPosition, onLocationUpdate, onError]);

  // Auto-advance position when riding
  useEffect(() => {
    if (!isRiding || !panoramaRef.current) return;

    const interval = setInterval(() => {
      // This would be controlled by your actual riding position
      // For now, we'll just update the POV slightly
      const pov = panoramaRef.current?.getPov();
      if (pov) {
        panoramaRef.current?.setPov({
          ...pov,
          heading: pov.heading + 0.5, // Slowly rotate view
        });
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isRiding]);

  // Retry mechanism for failed loads
  const retryLoad = useCallback(() => {
    setRetryCount(prev => prev + 1);
    setIsLoading(true);
    setError(null);
    
    // Re-initialize maps manager
    const initializeMaps = async () => {
      try {
        const manager = GoogleMapsManager.getInstance({ apiKey });
        setMapsManager(manager);
        
        await manager.loadGoogleMaps();
        setIsLoading(false);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load Google Maps';
        setError(errorMessage);
        setIsLoading(false);
        onError?.(errorMessage);
      }
    };

    initializeMaps();
  }, [apiKey, onError]);

  return (
    <div className="glass-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-dark-200">Street View</h3>
        {currentLocation && (
          <div className="text-sm text-dark-400 max-w-xs truncate">
            {currentLocation}
          </div>
        )}
      </div>

      <div className="relative w-full aspect-video bg-dark-900 rounded-xl overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-900/80 z-10">
            <div className="text-center">
              <LoadingSpinner size="md" />
              <p className="text-sm text-dark-400 mt-2">Loading Street View...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-dark-900/80 z-10">
            <div className="text-center p-4 max-w-md">
              <div className="text-danger-400 mb-2">
                <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h4 className="text-sm font-medium text-danger-400">Street View Error</h4>
              <p className="text-xs text-dark-400 mt-1">{error}</p>
              
              {retryCount < 3 && (
                <button
                  onClick={retryLoad}
                  className="mt-2 px-3 py-1 rounded-lg bg-danger-500/20 text-danger-400 text-xs hover:bg-danger-500/30 transition-colors"
                >
                  Retry ({3 - retryCount} attempts left)
                </button>
              )}
            </div>
          </div>
        )}

        <div
          ref={streetViewRef}
          className="w-full h-full"
          style={{ display: isLoading || error ? 'none' : 'block' }}
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isRiding ? 'bg-success-400 animate-pulse' : 'bg-dark-600'}`} />
          <span className="text-dark-400">
            {isRiding ? 'Riding' : 'Paused'}
          </span>
        </div>
        
        <div className="text-dark-400">
          Position: {Math.round(currentPosition * 100)}%
        </div>
      </div>
    </div>
  );
};
