export const StreetViewLoader: React.FC<{ message?: string }> = ({ 
  message = "Loading Street View..." 
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-6">
      <LoadingSpinner size="lg" />
      <p className="text-sm text-dark-400 mt-2">{message}</p>
    </div>
  );
};

export const StreetViewError: React.FC<{ 
  error: string; 
  onRetry?: () => void;
  retryCount?: number;
}> = ({ error, onRetry, retryCount = 0 }) => {
  return (
    <div className="flex flex-col items-center justify-center p-6">
      <div className="text-danger-400 mb-4">
        <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-danger-400 mb-2">Street View Error</h3>
      <p className="text-sm text-dark-400 text-center mb-4">{error}</p>
      
      {onRetry && retryCount < 3 && (
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded-lg bg-danger-500/20 text-danger-400 hover:bg-danger-500/30 transition-colors"
        >
          Retry ({3 - retryCount} attempts left)
        </button>
      )}
    </div>
  );
};

export const StreetViewPlaceholder: React.FC<{
  onAddApiKey: () => void;
}> = ({ onAddApiKey }) => {
  return (
    <div className="flex flex-col items-center justify-center p-8">
      <div className="text-6xl mb-4">🏙️</div>
      <h3 className="text-xl font-medium text-dark-200 mb-2">Street View Unavailable</h3>
      <p className="text-dark-400 text-center mb-6">
        Add your Google Maps API key to enable Street View functionality
      </p>
      <button
        onClick={onAddApiKey}
        className="btn-primary"
      >
        Add API Key
      </button>
    </div>
  );
};
