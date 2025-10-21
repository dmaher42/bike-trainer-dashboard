import React from "react";

type ViewOption = "street" | "map" | "virtual";

interface ViewToggleProps {
  currentView: ViewOption;
  onViewChange: (view: ViewOption) => void;
  disabled?: boolean;
}

const VIEW_LABELS: Record<ViewOption, string> = {
  street: "Street View",
  map: "Map View",
  virtual: "Virtual View",
};

export const ViewToggle: React.FC<ViewToggleProps> = ({
  currentView,
  onViewChange,
  disabled = false,
}) => {
  return (
    <div className="inline-flex items-center rounded-full bg-dark-900/80 p-2 shadow-inner">
      {(Object.keys(VIEW_LABELS) as ViewOption[]).map((view) => {
        const isActive = currentView === view;
        const isDisabled = disabled && view !== "virtual";

        return (
          <button
            key={view}
            type="button"
            onClick={() => onViewChange(view)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
              isActive
                ? "bg-primary-500 text-white shadow-lg"
                : "text-dark-300 hover:bg-dark-800 hover:text-dark-50"
            } ${isDisabled ? "opacity-50 cursor-not-allowed" : ""}`}
            disabled={isDisabled}
          >
            {VIEW_LABELS[view]}
          </button>
        );
      })}
    </div>
  );
};

export default ViewToggle;
