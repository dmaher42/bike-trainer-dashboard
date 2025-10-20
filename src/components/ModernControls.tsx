import React from 'react';

interface ModernControlsProps {
  rideOn: boolean;
  onStartRide: () => void;
  onStopRide: () => void;
  onResetRide: () => void;
  onExportCSV: () => void;
  samples: any[];
}

export const ModernControls: React.FC<ModernControlsProps> = ({
  rideOn,
  onStartRide,
  onStopRide,
  onResetRide,
  onExportCSV,
  samples,
}) => {
  return (
    <div className="flex flex-wrap gap-4">
      {!rideOn ? (
        <button
          onClick={onStartRide}
          className="btn-success group relative overflow-hidden"
        >
          <span className="relative z-10 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Start Ride
          </span>
          <div className="absolute inset-0 bg-gradient-to-r from-success-600 to-success-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
        </button>
      ) : (
        <button
          onClick={onStopRide}
          className="btn-warning group relative overflow-hidden"
        >
          <span className="relative z-10 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Pause
          </span>
          <div className="absolute inset-0 bg-gradient-to-r from-warning-600 to-warning-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
        </button>
      )}

      <button
        onClick={onResetRide}
        className="btn-secondary group relative overflow-hidden"
      >
        <span className="relative z-10 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Reset
        </span>
      </button>

      <button
        onClick={onExportCSV}
        disabled={samples.length === 0}
        className="btn-secondary group relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="relative z-10 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Export CSV
        </span>
      </button>
    </div>
  );
};
