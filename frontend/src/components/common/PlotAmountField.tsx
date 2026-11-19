import React from 'react';
import { calculatePlotAmount } from '../../utils/plotUtils';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

interface PlotAmountFieldProps {
  /** The selected plot (rate, area and price come from its stored data). */
  plot: any | null | undefined;
  /** The agreement value currently in the form (editable). */
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  id?: string;
}

/**
 * Agreement value for a booking: the amount is calculated from the selected plot's rate x area,
 * stays editable, and the original calculated amount and the final (edited) amount are shown separately.
 */
export const PlotAmountField: React.FC<PlotAmountFieldProps> = ({ plot, value, onChange, id }) => {
  const calc = plot ? calculatePlotAmount(plot) : null;
  const calculated = calc?.amount ?? 0;
  const edited = calculated > 0 && value !== undefined && Math.round(value) !== Math.round(calculated);
  const diff = edited && value !== undefined ? value - calculated : 0;
  const pct = edited && calculated > 0 ? (diff / calculated) * 100 : 0;

  return (
    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
      <label className="form-label" htmlFor={id}>Agreement value *</label>

      <div
        style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '10px 12px', marginBottom: 8,
          borderRadius: 8, background: 'var(--bg-surface-hover, rgba(100,116,139,0.08))', fontSize: 12.5,
        }}
      >
        <div>
          <div style={{ color: 'var(--text-secondary)' }}>Calculated amount (rate × area)</div>
          <div style={{ fontWeight: 800, fontSize: 15 }}>{calculated > 0 ? inr(calculated) : '—'}</div>
          {calc && calc.rate > 0 && calc.area > 0 && (
            <div style={{ color: 'var(--text-secondary)' }}>
              {inr(calc.rate)}/sq.ft × {calc.area.toLocaleString('en-IN')} sq.ft
            </div>
          )}
        </div>
        <div>
          <div style={{ color: 'var(--text-secondary)' }}>Final amount</div>
          <div style={{ fontWeight: 800, fontSize: 15, color: edited ? '#b45309' : undefined }}>
            {value !== undefined && value > 0 ? inr(value) : '—'}
          </div>
          {edited && (
            <div style={{ color: diff < 0 ? '#b91c1c' : '#047857' }}>
              {diff < 0 ? 'Reduced' : 'Increased'} by {inr(Math.abs(diff))} ({Math.abs(pct).toFixed(1)}%)
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          id={id}
          type="number"
          className="form-input"
          min={0}
          value={value ?? ''}
          onChange={e => onChange(e.target.value ? Number(e.target.value) : undefined)}
          style={{ flex: 1 }}
        />
        {edited && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(calculated)}>
            Reset to calculated
          </button>
        )}
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 4 }}>
        Filled in automatically from the plot&apos;s rate and area. You can change it if the agreed price is different; the original calculated amount is saved with the booking.
      </div>
    </div>
  );
};
