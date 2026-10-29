import React from 'react';
import { UserCheck, CheckCircle, Clock, Send } from 'lucide-react';

export interface KycStatusPillProps {
  status: string;
  titleOverride?: string;
}

export const KycStatusPill: React.FC<KycStatusPillProps> = ({ status, titleOverride }) => {
  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 10px',
    borderRadius: 6,
    whiteSpace: 'nowrap',
  };

  if (status === 'Assisted KYC – Submitted for Verification') {
    return (
      <span
        style={{
          ...baseStyle,
          backgroundColor: 'rgba(16, 185, 129, 0.12)',
          color: '#059669',
          border: '1px solid rgba(16, 185, 129, 0.35)',
        }}
        title={titleOverride || 'Assisted KYC submitted — awaiting IRM verification'}
      >
        <UserCheck size={12} /> Assisted Submitted
      </span>
    );
  }

  if (
    status === 'Submitted' ||
    status === 'Under Verification' ||
    status === 'Completed'
  ) {
    return (
      <span
        style={{
          ...baseStyle,
          backgroundColor: 'rgba(99, 102, 241, 0.10)',
          color: '#6366f1',
          border: '1px solid rgba(99, 102, 241, 0.25)',
        }}
        title={titleOverride || 'Customer has submitted KYC form — awaiting IRM review'}
      >
        <CheckCircle size={12} /> KYC Submitted
      </span>
    );
  }

  if (status === 'Assisted Draft') {
    return (
      <span
        style={{
          ...baseStyle,
          backgroundColor: 'rgba(245, 158, 11, 0.10)',
          color: '#d97706',
          border: '1px solid rgba(245, 158, 11, 0.25)',
        }}
        title={titleOverride || 'Assisted KYC is in draft state'}
      >
        <Clock size={12} /> Assisted Draft
      </span>
    );
  }

  if (['Link Sent', 'In Progress', 'Needs Correction', 'Rejected'].includes(status)) {
    return (
      <span
        style={{
          ...baseStyle,
          backgroundColor: 'rgba(59, 130, 246, 0.10)',
          color: '#2563eb',
          border: '1px solid rgba(59, 130, 246, 0.25)',
        }}
        title={titleOverride || `Status: ${status}`}
      >
        <Send size={12} /> {status === 'Link Sent' ? 'Link Sent' : status}
      </span>
    );
  }

  return (
    <span
      style={{
        ...baseStyle,
        fontWeight: 500,
        backgroundColor: 'rgba(107, 114, 128, 0.10)',
        color: '#6b7280',
        border: '1px solid rgba(107, 114, 128, 0.20)',
      }}
    >
      Pending Submission
    </span>
  );
};

