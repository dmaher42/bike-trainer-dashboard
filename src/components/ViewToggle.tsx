import React from 'react';

export type ViewMode = 'street' | 'map' | 'virtual';

interface ViewToggleProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  disabled?: boolean;
}

const views: Array<{ id: ViewMode; label: string; icon: string }> = [
  { id: 'street', label: 'Street View', icon: '🏙️' },
  { id: 'map', label: 'Map View', icon: '🗺️' },
  { id: 'virtual', label: 'Virtual Map', icon: '🚴' },
];

export const ViewToggle: React.FC<ViewToggleProps> = ({
  currentView,
  onViewChange,
  disabled = false,
}) => {
  return (
    <div className="flex gap-2 p-1 bg-dark-800/50 rounded-xl">
      {views.map((view) => (
        <button
          key={view.id}
          type="button"
          onClick={() => onViewChange(view.id)}
          disabled={disabled}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
            currentView === view.id
              ? 'bg-primary-600 text-white'
              : 'text-dark-400 hover:text-dark-200 hover:bg-dark-700/50'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span>{view.icon}</span>
          <span className="hidden sm:inline">{view.label}</span>
        </button>
      ))}
    </div>
  );
};
