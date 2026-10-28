import React from 'react';

export interface LeadContactDetailsCardProps {
  phone: string;
  email?: string;
  location?: string;
  callsCount: number;
}

export const LeadContactDetailsCard: React.FC<LeadContactDetailsCardProps> = ({
  phone,
  email,
  location,
  callsCount,
}) => (
  <div className="card">
    <h4 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12, fontWeight: 700 }}>
      Contact Details
    </h4>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Phone:</span>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{phone}</div>
      </div>
      <div>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Email:</span>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{email || '—'}</div>
      </div>
      <div>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Location:</span>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{location || '—'}</div>
      </div>
      <div>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Total Calls:</span>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{callsCount}</div>
      </div>
    </div>
  </div>
);
