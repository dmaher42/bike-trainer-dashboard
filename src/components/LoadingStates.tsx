import React from 'react';

export interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  } as const;

  return (
    <div
      className={`loading-spinner ${sizeClasses[size]} ${className}`.trim()}
      role="status"
      aria-label="Loading"
    >
      <style jsx>{`
        .loading-spinner {
          border: 2px solid rgba(59, 130, 246, 0.2);
          border-top: 2px solid #3b82f6;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
};

export interface SkeletonCardProps {
  lines?: number;
  className?: string;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
  lines = 3,
  className = '',
}) => {
  return (
    <div className={`glass-card p-6 space-y-3 ${className}`.trim()}>
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className="space-y-2">
          <div className="h-4 bg-neutral-700 rounded animate-pulse" />
          {index < lines - 1 && (
            <div className="h-3 bg-neutral-700 rounded animate-pulse" />
          )}
        </div>
      ))}
    </div>
  );
};

export const PulseLoader: React.FC = () => {
  return (
    <div className="flex space-x-2">
      <div className="w-3 h-3 bg-primary-500 rounded-full animate-pulse" />
      <div className="w-3 h-3 bg-primary-500 rounded-full animate-pulse delay-75" />
      <div className="w-3 h-3 bg-primary-500 rounded-full animate-pulse delay-150" />
    </div>
  );
};

// Street View specific loading states
export interface StreetViewLoaderProps {
  message?: string;
  subMessage?: string;
}

export const StreetViewLoader: React.FC<StreetViewLoaderProps> = ({
  message = 'Loading Street View...',
  subMessage = 'Please wait while we load the view',
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-6">
      <div className="relative">
        <LoadingSpinner size="lg" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 border-4 border-primary-500/30 rounded-full animate-pulse" />
        </div>
      </div>
      <p className="text-sm text-neutral-400 mt-4">{message}</p>
      <p className="text-xs text-neutral-500">{subMessage}</p>
    </div>
  );
};

export interface StreetViewErrorProps {
  error: string;
  onRetry?: () => void;
  retryCount?: number;
  onDismiss?: () => void;
}

export const StreetViewError: React.FC<StreetViewErrorProps> = ({
  error,
  onRetry,
  retryCount = 0,
  onDismiss,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-6 max-w-md">
      <div className="text-danger-400 mb-4">
        <svg
          className="w-12 h-12 mx-auto"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-danger-400 mb-2">Street View Error</h3>
      <p className="text-sm text-neutral-400 text-center mb-4">{error}</p>

      <div className="flex gap-2 justify-center">
        {onRetry && retryCount < 3 && (
          <button
            onClick={onRetry}
            className="px-4 py-2 rounded-lg bg-danger-500/20 text-danger-400 hover:bg-danger-500/30 transition-colors"
          >
            Retry ({3 - retryCount} attempts left)
          </button>
        )}

        {onDismiss && (
          <button
            onClick={onDismiss}
            className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 transition-colors"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
};

export interface StreetViewPlaceholderProps {
  onAddApiKey: () => void;
  title?: string;
  description?: string;
}

export const StreetViewPlaceholder: React.FC<StreetViewPlaceholderProps> = ({
  onAddApiKey,
  title = 'Street View Unavailable',
  description = 'Add your Google Maps API key to enable Street View functionality',
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8">
      <div className="text-6xl mb-4">🏙️</div>
      <h3 className="text-xl font-medium text-neutral-200 mb-2">{title}</h3>
      <p className="text-neutral-400 text-center mb-6">{description}</p>
      <button onClick={onAddApiKey} className="btn-primary">
        Add API Key
      </button>
    </div>
  );
};

export interface ConnectionLoaderProps {
  deviceType: string;
  message?: string;
}

export const ConnectionLoader: React.FC<ConnectionLoaderProps> = ({
  deviceType,
  message = 'Connecting...',
}) => {
  return (
    <div className="flex items-center gap-3 p-3 bg-primary-500/10 border border-primary-500/20 rounded-xl">
      <LoadingSpinner size="sm" />
      <div className="text-sm text-primary-400">Connecting to {deviceType}...</div>
    </div>
  );
};

export interface ConnectionSuccessProps {
  deviceName: string;
  onDisconnect?: () => void;
}

export const ConnectionSuccess: React.FC<ConnectionSuccessProps> = ({
  deviceName,
  onDisconnect,
}) => {
  return (
    <div className="flex items-center justify-between p-3 bg-success-500/10 border border-success-500/20 rounded-xl animate-slide-up">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-success-400 animate-pulse" />
        <div className="text-sm text-success-400">Connected to {deviceName}</div>
      </div>
      {onDisconnect && (
        <button
          onClick={onDisconnect}
          className="text-xs text-success-400 hover:text-success-300 underline"
        >
          Disconnect
        </button>
      )}
    </div>
  );
};

export interface ConnectionErrorProps {
  error: string;
  deviceType: string;
  onRetry?: () => void;
}

export const ConnectionError: React.FC<ConnectionErrorProps> = ({
  error,
  deviceType,
  onRetry,
}) => {
  return (
    <div className="flex items-center justify-between p-3 bg-danger-500/10 border border-danger-500/20 rounded-xl">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-danger-400" />
        <div className="text-sm text-danger-400">{deviceType} connection failed</div>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs text-danger-400 hover:text-danger-300 underline"
        >
          Retry
        </button>
      )}
    </div>
  );
};

// Enhanced loading states for different contexts
export interface MapLoadingProps {
  message?: string;
  height?: string;
}

export const MapLoading: React.FC<MapLoadingProps> = ({
  message = 'Loading map...',
  height = '400px',
}) => {
  return (
    <div className="flex flex-col items-center justify-center" style={{ height }}>
      <LoadingSpinner size="lg" />
      <p className="text-sm text-neutral-400 mt-2">{message}</p>
    </div>
  );
};

export interface DataLoadingProps {
  message?: string;
  height?: string;
}

export const DataLoading: React.FC<DataLoadingProps> = ({
  message = 'Loading data...',
  height = '200px',
}) => {
  return (
    <div className="flex flex-col items-center justify-center space-y-2" style={{ height }}>
      <div className="flex space-x-2">
        <LoadingSpinner size="sm" />
        <PulseLoader />
      </div>
      <p className="text-sm text-neutral-400">{message}</p>
    </div>
  );
};

// Full screen loading overlay
export interface LoadingOverlayProps {
  isLoading: boolean;
  message?: string;
  children?: React.ReactNode;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isLoading,
  message = 'Loading...',
  children,
}) => {
  if (!isLoading) return <>{children}</>;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="glass-card p-6 max-w-md w-full mx-4">
        <div className="flex flex-col items-center space-y-4">
          <LoadingSpinner size="lg" />
          <p className="text-sm text-neutral-400">{message}</p>
        </div>
      </div>
    </div>
  );
};

// Progress indicator for long-running operations
export interface ProgressLoaderProps {
  progress: number; // 0-100
  message?: string;
  showPercentage?: boolean;
}

export const ProgressLoader: React.FC<ProgressLoaderProps> = ({
  progress,
  message = 'Loading...',
  showPercentage = true,
}) => {
  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between text-sm text-neutral-400">
        <span>{message}</span>
        {showPercentage && <span>{progress}%</span>}
      </div>
      <div className="w-full bg-neutral-700 rounded-full h-2">
        <div
          className="bg-primary-500 h-2 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
};

// Animated loading dots for better UX
export interface DotsLoaderProps {
  dotCount?: number;
  color?: string;
}

export const DotsLoader: React.FC<DotsLoaderProps> = ({
  dotCount = 3,
  color = 'primary',
}) => {
  const colorClasses = {
    primary: 'bg-primary-500',
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    danger: 'bg-danger-500',
    dark: 'bg-dark-500',
  } as const;

  const resolvedColorClass =
    colorClasses[color as keyof typeof colorClasses] ?? color;

  return (
    <div className="flex space-x-1">
      {Array.from({ length: dotCount }).map((_, index) => (
        <div
          key={index}
          className={`w-2 h-2 rounded-full ${resolvedColorClass} animate-pulse`}
          style={{ animationDelay: `${index * 0.2}s` }}
        />
      ))}
    </div>
  );
};
