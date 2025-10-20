import { useState, useEffect, useCallback } from 'react';
import { Sample } from '../types';

interface RideRecord {
  id: string;
  date: string;
  duration: number;
  distance: number;
  avgPower: number;
  maxPower: number;
  avgHeartRate: number;
  maxHeartRate: number;
  samples: Sample[];
}

export function useRideHistory() {
  const [rideHistory, setRideHistory] = useState<RideRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load ride history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('bike-trainer-ride-history');
      if (saved) {
        const parsed = JSON.parse(saved);
        setRideHistory(parsed);
      }
    } catch (error) {
      console.error('Failed to load ride history:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveRide = useCallback((samples: Sample[], duration: number, distance: number) => {
    if (samples.length === 0) return;

    const powers = samples.map(s => s.power).filter(p => p > 0);
    const heartRates = samples.map(s => s.hr).filter(hr => hr > 0);

    const rideRecord: RideRecord = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      duration,
      distance,
      avgPower: powers.length > 0 ? powers.reduce((a, b) => a + b, 0) / powers.length : 0,
      maxPower: powers.length > 0 ? Math.max(...powers) : 0,
      avgHeartRate: heartRates.length > 0 ? heartRates.reduce((a, b) => a + b, 0) / heartRates.length : 0,
      maxHeartRate: heartRates.length > 0 ? Math.max(...heartRates) : 0,
      samples,
    };

    setRideHistory(prev => [rideRecord, ...prev].slice(0, 50)); // Keep last 50 rides

    try {
      localStorage.setItem('bike-trainer-ride-history', JSON.stringify([rideRecord, ...rideHistory].slice(0, 50)));
    } catch (error) {
      console.error('Failed to save ride:', error);
    }
  }, [rideHistory]);

  const deleteRide = useCallback((rideId: string) => {
    setRideHistory(prev => prev.filter(ride => ride.id !== rideId));
    
    try {
      const updated = rideHistory.filter(ride => ride.id !== rideId);
      localStorage.setItem('bike-trainer-ride-history', JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to delete ride:', error);
    }
  }, [rideHistory]);

  const clearHistory = useCallback(() => {
    setRideHistory([]);
    try {
      localStorage.removeItem('bike-trainer-ride-history');
    } catch (error) {
      console.error('Failed to clear ride history:', error);
    }
  }, []);

  return {
    rideHistory,
    saveRide,
    deleteRide,
    clearHistory,
    isLoading,
  };
}
