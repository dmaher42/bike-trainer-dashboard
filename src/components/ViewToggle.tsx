import React from "react";

export type ViewOption = "virtual" | "street" | "mapbox" | "osm";

interface ViewToggleProps {
  value: ViewOption;
  onChange: (view: ViewOption) => void;
  disabledOptions?: Partial<Record<ViewOption, boolean>>;
}

const VIEW_OPTIONS: { id: ViewOption; label: string; icon: string }[] = [
  { id: "virtual", label: "Virtual", icon: "🚴" },
  { id: "street", label: "Street", icon: "🏙️" },
  { id: "mapbox", label: "Mapbox 3D", icon: "🗺️" },
  { id: "osm", label: "OpenStreetMap", icon: "🌍" },
];

export const ViewToggle: React.FC<ViewToggleProps> = ({
  value,
  onChange,
  disabledOptions,
}) => {
  return (
    <div className="inline-flex items-center gap-2 rounded-full bg-dark-900/80 p-2 shadow-inner">
      {VIEW_OPTIONS.map((option) => {
        const isActive = value === option.id;
        const isDisabled = Boolean(disabledOptions?.[option.id]);

        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
              isActive
                ? "bg-primary-500 text-white shadow-lg"
                : "text-dark-300 hover:bg-dark-800 hover:text-dark-50"
            } ${isDisabled ? "cursor-not-allowed opacity-50" : ""}`}
            disabled={isDisabled}
          >
            <span>{option.icon}</span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
};

export default ViewToggle;
