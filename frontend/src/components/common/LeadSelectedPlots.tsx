import React, { useEffect, useState } from 'react';
import { Map as MapIcon } from 'lucide-react';
import { jaminApiService, type LeadPlotSelection } from '../../services/jaminApiService';

interface LeadSelectedPlotsProps {
  leadId: string | number;
}

const formatInr = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(2).replace(/\.?0+$/, '')} Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(2).replace(/\.?0+$/, '')} L`;
  return `₹${value.toLocaleString('en-IN')}`;
};

const describe = (s: LeadPlotSelection): { label: string; tone: 'amber' | 'green' | 'blue' } => {
  if (s.source === 'Hold') {
    const until = s.holdExpiresAt ? new Date(s.holdExpiresAt) : null;
    const date = until && !Number.isNaN(until.getTime()) ? until.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : null;
    return { label: date ? `On hold until ${date}` : 'On hold', tone: 'amber' };
  }
  if (s.source === 'Booking') return { label: `Booking: ${s.sourceStatus}`, tone: 'green' };
  return { label: `Site visit: ${s.sourceStatus}`, tone: 'blue' };
};

const TONES = {
  amber: { bg: 'rgba(245, 158, 11, 0.14)', fg: '#b45309' },
  green: { bg: 'rgba(16, 185, 129, 0.14)', fg: '#047857' },
  blue: { bg: 'rgba(59, 130, 246, 0.14)', fg: '#1d4ed8' },
};

/** Jamin only: plots this lead has selected (held for them, booked, or planned for a site visit). */
export const LeadSelectedPlots: React.FC<LeadSelectedPlotsProps> = ({ leadId }) => {
  const [items, setItems] = useState<LeadPlotSelection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    jaminApiService
      .getPlotsForLead(leadId)
      .then(list => {
        if (!cancelled) setItems(list);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  return (
    <div className="card lead-custom-card" aria-label="Selected plots">
      <h4 className="lead-custom-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <MapIcon size={16} /> Selected Plot{items.length === 1 ? '' : 's'}
      </h4>

      {loading ? (
        <div className="lead-user-message-empty">Loading…</div>
      ) : items.length === 0 ? (
        <div className="lead-user-message-empty">No plot selected yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map(s => {
            const tone = describe(s);
            const colors = TONES[tone.tone];
            return (
              <div
                key={`${s.source}-${s.plotId}-${s.selectedAt ?? ''}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: '10px 12px',
                  border: '1px solid var(--border-base, #e2e8f0)',
                  borderRadius: 8,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {s.plotNumber}
                    {s.projectName ? <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}> · {s.projectName}</span> : null}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {s.facing || '—'} facing · {s.areaSqFt ? `${s.areaSqFt.toLocaleString('en-IN')} sq ft` : '—'} · {formatInr(s.price)}
                  </div>
                </div>
                <span
                  style={{
                    flexShrink: 0,
                    padding: '3px 10px',
                    borderRadius: 999,
                    fontSize: 11.5,
                    fontWeight: 600,
                    background: colors.bg,
                    color: colors.fg,
                  }}
                >
                  {tone.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
