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
