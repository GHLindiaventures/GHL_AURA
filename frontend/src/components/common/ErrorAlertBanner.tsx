import React from 'react';
import { AlertCircle } from 'lucide-react';

export interface ErrorAlertBannerProps {
  message?: string | null;
  onRetry?: () => void;
  showIcon?: boolean;
  style?: React.CSSProperties;
  className?: string;
  retryButtonClassName?: string;
}

export const ErrorAlertBanner: React.FC<ErrorAlertBannerProps> = ({
  message,
  onRetry,
  showIcon = false,
  style,
  className = 'alert-banner error',
  retryButtonClassName = 'btn btn-secondary btn-sm',
}) => {
  if (!message) return null;

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        marginBottom: '16px',
        borderRadius: '8px',
        background: 'rgba(239, 68, 68, 0.1)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        color: '#ef4444',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {showIcon && <AlertCircle size={16} />}
        <span>{message}</span>
      </div>
      {onRetry && (
        <button
          type="button"
          className={retryButtonClassName}
          onClick={onRetry}
          style={{ borderColor: '#ef4444', color: '#ef4444' }}
        >
          Retry
        </button>
      )}
    </div>
  );
};
