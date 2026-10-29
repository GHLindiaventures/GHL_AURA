import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { isToastError } from '../../pages/KYC/helpers/kycHelpers';

export interface KycToastProps {
  message: string | null;
}

export const KycToast: React.FC<KycToastProps> = ({ message }) => {
  if (!message) return null;
  const isErr = isToastError(message);

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        backgroundColor: isErr ? '#dc2626' : '#059669',
        color: '#ffffff',
        padding: '12px 20px',
        borderRadius: 8,
        border: isErr ? '1px solid #ef4444' : '1px solid #10b981',
        boxShadow: isErr
          ? '0 6px 20px rgba(220, 38, 38, 0.45)'
          : '0 6px 20px rgba(5, 150, 105, 0.35)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 14,
        fontWeight: 600,
        maxWidth: 500,
      }}
    >
      {isErr ? <AlertCircle size={18} color="#ffffff" /> : <CheckCircle size={18} color="#ffffff" />}
      <span>{message}</span>
    </div>
  );
};
