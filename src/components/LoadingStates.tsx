import React from 'react';

export const LoadingSpinner: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({
  size = 'md',
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  } as const;

  return <div className={`loading-spinner ${sizeClasses[size]}`} />;
};

export const SkeletonCard: React.FC = () => {
  return (
    <div className="glass-card p-6 space-y-4">
      <div className="h-4 bg-dark-700 rounded animate-pulse" />
      <div className="h-8 bg-dark-700 rounded animate-pulse" />
      <div className="h-2 bg-dark-700 rounded animate-pulse" />
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

export const ConnectionLoader: React.FC<{ deviceType: string }> = ({
  deviceType,
}) => {
  return (
    <div className="flex items-center gap-3 p-3 bg-primary-500/10 border border-primary-500/20 rounded-xl">
      <LoadingSpinner size="sm" />
      <div className="text-sm text-primary-400">Connecting to {deviceType}...</div>
    </div>
  );
};

export const ConnectionSuccess: React.FC<{ deviceName: string }> = ({
  deviceName,
}) => {
  return (
    <div className="flex items-center gap-3 p-3 bg-success-500/10 border border-success-500/20 rounded-xl animate-slide-up">
      <div className="w-2 h-2 rounded-full bg-success-400 animate-pulse" />
      <div className="text-sm text-success-400">Connected to {deviceName}</div>
    </div>
  );
};

export const ConnectionError: React.FC<{
  error: string;
  onRetry?: () => void;
}> = ({
  error,
  onRetry,
}) => {
  return (
    <div className="flex items-center justify-between p-3 bg-danger-500/10 border border-danger-500/20 rounded-xl">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-danger-400" />
        <div className="text-sm text-danger-400">{error}</div>
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
