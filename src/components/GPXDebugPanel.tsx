import React from "react";

import type { Route } from "../types";

interface GPXDebugPanelProps {
  route: Route;
  error: string | null;
  onClearError: () => void;
}

export const GPXDebugPanel: React.FC<GPXDebugPanelProps> = ({
  route,
  error,
  onClearError,
}) => {
  return (
    <div className="glass-card p-4 space-y-4">
      <h3 className="text-sm font-medium text-dark-300">GPX Debug Information</h3>

      {error ? (
        <div className="p-3 bg-danger-500/10 border border-danger-500/20 rounded-xl">
          <div className="flex items-start justify-between">
            <div>
              <h4 className="text-sm font-medium text-danger-400">Error</h4>
              <p className="text-xs text-dark-400 mt-1">{error}</p>
            </div>
            <button
              onClick={onClearError}
              className="text-xs text-danger-400 hover:text-danger-300"
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 text-xs">
        <div>
          <span className="text-dark-500">Route Name:</span>
          <span className="ml-2 text-dark-300">{route.name ?? "None"}</span>
        </div>
        <div>
          <span className="text-dark-500">Points:</span>
          <span className="ml-2 text-dark-300">{route.pts.length}</span>
        </div>
        <div>
          <span className="text-dark-500">Total Distance:</span>
          <span className="ml-2 text-dark-300">{route.total.toFixed(4)}</span>
        </div>
        <div>
          <span className="text-dark-500">Has Elevation:</span>
          <span className="ml-2 text-dark-300">
            {route.pts.some((point) => point.elevation !== undefined) ? "Yes" : "No"}
          </span>
        </div>
      </div>

      {route.pts.length > 0 ? (
        <div>
          <h4 className="text-sm font-medium text-dark-300 mb-2">First 3 Points:</h4>
          <div className="space-y-1">
            {route.pts.slice(0, 3).map((point, index) => (
              <div key={index} className="text-xs text-dark-400">
                Point {index + 1}: x={point.x.toFixed(4)}, y={point.y.toFixed(4)}
                {point.elevation !== undefined
                  ? `, ele=${point.elevation.toFixed(1)}m`
                  : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default GPXDebugPanel;
