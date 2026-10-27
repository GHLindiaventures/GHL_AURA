import React from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { Modal } from './Modal';

export interface SlotConflictData {
  contactName?: string;
  conflictTime?: string;
  agentName?: string;
  suggestedTime?: string;
  suggestedDateIso?: string;
  suggestedTimeValue?: string;
}

export interface SlotConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  conflictData: SlotConflictData | null;
  onUseSuggestedSlot?: (suggestedSlot: string) => void;
  title?: string;
  subtitle?: string;
  maxWidth?: number | string;
  contactLabel?: string;
  scheduledTimeLabel?: string;
  conflictMessage?: string;
  adviceTitle?: string;
  adviceText?: React.ReactNode;
  suggestedButtonText?: string;
}

export const SlotConflictModal: React.FC<SlotConflictModalProps> = ({
  isOpen,
  onClose,
  conflictData,
  onUseSuggestedSlot,
  title = 'Time Slot Already Booked',
  subtitle = 'Schedule Spacing & Conflict Warning',
  maxWidth = 490,
  contactLabel = 'Contact:',
  scheduledTimeLabel = 'Scheduled Time:',
  conflictMessage = 'You already have a scheduled follow-up near this time:',
  adviceTitle = 'Scheduling Buffer Advice',
  adviceText = (
    <>
      To avoid overlapping appointments and ensure sufficient time for each call,{' '}
      <strong>please schedule your follow-up at least 15–20 minutes after your existing appointment.</strong>
    </>
  ),
  suggestedButtonText = 'Use Suggested (+20m)',
}) => {
  if (!conflictData && !isOpen) return null;

  const suggestedSlot = conflictData?.suggestedDateIso || conflictData?.suggestedTimeValue;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      maxWidth={maxWidth}
      footer={
        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            style={{ flex: 1 }}
          >
            Choose Another Time
          </button>
          {suggestedSlot && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (suggestedSlot && onUseSuggestedSlot) {
                  onUseSuggestedSlot(suggestedSlot);
                }
                onClose();
              }}
              style={{ flex: 1.2 }}
            >
              {suggestedButtonText}
            </button>
          )}
        </div>
      }
    >
      <div style={{ textAlign: 'center', padding: '10px 4px' }}>
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.1)',
            color: '#dc2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 26,
            margin: '0 auto 14px',
          }}
        >
          <AlertTriangle size={28} color="#dc2626" />
        </div>
        <h4
          style={{
            margin: '0 0 8px',
            fontSize: '1.05rem',
            fontWeight: 600,
            color: 'var(--text-primary, #0f172a)',
          }}
        >
          {title}
        </h4>
        <p
          style={{
            margin: '0 0 14px',
            color: 'var(--text-secondary, #64748b)',
            fontSize: '0.9rem',
            lineHeight: 1.5,
          }}
        >
          {conflictMessage}
        </p>
        <div
          style={{
            background: 'var(--bg-surface-hover, #f8fafc)',
            border: '1px solid var(--border-base, #e2e8f0)',
            borderRadius: 8,
            padding: '12px 16px',
            marginBottom: 14,
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary, #64748b)' }}>{contactLabel}</span>
            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary, #1e293b)' }}>
              {conflictData?.contactName}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary, #64748b)' }}>{scheduledTimeLabel}</span>
            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#ef4444' }}>
              {conflictData?.conflictTime}
            </span>
          </div>
        </div>

        {/* Meaningful scheduling advice box */}
        <div
          style={{
            background: 'rgba(59, 130, 246, 0.08)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            borderRadius: 8,
            padding: '12px 14px',
            marginBottom: 14,
            textAlign: 'left',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              marginBottom: 4,
              color: '#2563eb',
              fontWeight: 600,
              fontSize: '0.85rem',
            }}
          >
            <Clock size={15} />
            {adviceTitle}
          </div>
          <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-primary, #334155)', lineHeight: 1.5 }}>
            {adviceText}
          </p>
        </div>

        {conflictData?.suggestedTime && (
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: 8,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: '0.82rem', color: '#059669', fontWeight: 600 }}>Suggested Next Slot:</span>
            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#059669' }}>
              {conflictData.suggestedTime}
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
};
