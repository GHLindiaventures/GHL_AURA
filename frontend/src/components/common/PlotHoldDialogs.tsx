import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { jaminApiService } from '../../services/jaminApiService';
import { toast } from '../../context/ToastContext';
import type { PlotHold } from '../../types';

const MAX_HOLD_DAYS = 30;

/** `<input type="datetime-local">` value (local time) for a Date. */
export const toLocalInput = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fmtDateTime = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const paymentBadge = (status?: string | null) => {
  if (status === 'Verified') return { label: 'Confirmed — payment verified', bg: 'rgba(16,185,129,0.15)', color: '#047857' };
  if (status === 'Pending Verification') return { label: 'Pending verification', bg: 'rgba(245,158,11,0.18)', color: '#b45309' };
  if (status === 'Rejected') return { label: 'Payment rejected — unconfirmed', bg: 'rgba(239,68,68,0.15)', color: '#b91c1c' };
  return { label: 'No payment taken', bg: 'rgba(100,116,139,0.15)', color: '#475569' };
};

export const PaymentBadge: React.FC<{ status?: string | null }> = ({ status }) => {
  const b = paymentBadge(status);
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, background: b.bg, color: b.color }}>
      {b.label}
    </span>
  );
};

interface BaseProps {
  isOpen: boolean;
  onClose: () => void;
  plot: any | null;
}

// ── Extend / change a hold ─────────────────────────────────────────────────

export const ExtendHoldModal: React.FC<BaseProps & { onDone: () => void }> = ({ isOpen, onClose, plot, onDone }) => {
  const [expiry, setExpiry] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !plot) return;
    const base = plot.holdExpiresAt ? new Date(plot.holdExpiresAt) : new Date();
    setExpiry(toLocalInput(new Date(Math.max(base.getTime(), Date.now()) + 2 * 24 * 3600 * 1000)));
    setReason('');
    setError('');
  }, [isOpen, plot?.id]);

  const addDays = (days: number) => {
    const base = plot?.holdExpiresAt ? new Date(plot.holdExpiresAt) : new Date();
    setExpiry(toLocalInput(new Date(base.getTime() + days * 24 * 3600 * 1000)));
  };

  const submit = async () => {
    const when = new Date(expiry);
    if (!expiry || Number.isNaN(when.getTime())) { setError('Choose the new expiry date and time.'); return; }
    if (when.getTime() <= Date.now() + 60_000) { setError('The new expiry must be in the future.'); return; }
    if (when.getTime() > Date.now() + MAX_HOLD_DAYS * 24 * 3600 * 1000) { setError(`A hold cannot run longer than ${MAX_HOLD_DAYS} days from today.`); return; }
    setSaving(true);
    setError('');
    const res = await jaminApiService.extendHold(String(plot.id), { newExpiresAt: when.toISOString(), reason: reason.trim() || undefined });
    setSaving(false);
    if (!res.success) { setError(res.message || 'Could not update the hold.'); return; }
    toast.success(`Hold on ${plot.plotNumber} updated.`);
    onDone();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen && !!plot}
      onClose={onClose}
      title={`Extend / change hold — ${plot?.plotNumber ?? ''}`}
      subtitle={plot?.holdExpiresAt ? `Currently held until ${fmtDateTime(plot.holdExpiresAt)}` : undefined}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save new expiry'}</button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-group">
          <label className="form-label" htmlFor="extend-hold-expiry">New expiry date &amp; time *</label>
          <input id="extend-hold-expiry" type="datetime-local" className="form-input" value={expiry} onChange={e => setExpiry(e.target.value)} />
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {[1, 2, 3, 7].map(d => (
              <button key={d} type="button" className="btn btn-secondary btn-sm" onClick={() => addDays(d)}>+{d} day{d === 1 ? '' : 's'}</button>
            ))}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="extend-hold-reason">Reason</label>
          <input id="extend-hold-reason" type="text" className="form-input" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. customer travelling, waiting for loan approval" />
        </div>
        {error && <div role="alert" style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Only the agent responsible for this hold, or an admin, can change it. The hold is released automatically when this time passes.</div>
      </div>
    </Modal>
  );
};

// ── Verify the hold payment (finance / admin) ──────────────────────────────

export const VerifyHoldPaymentModal: React.FC<BaseProps & { onDone: () => void }> = ({ isOpen, onClose, plot, onDone }) => {
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [hold, setHold] = useState<PlotHold | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen || !plot) return;
    setNotes(''); setError(''); setHold(null);
    jaminApiService.getHoldHistory(String(plot.id)).then(h => setHold(h.find(x => x.status === 'Active') ?? null));
  }, [isOpen, plot?.id]);

  const decide = async (approve: boolean) => {
    if (!approve && !notes.trim()) { setError('Add a note explaining why the payment is rejected.'); return; }
    setSaving(true); setError('');
    const res = await jaminApiService.verifyHoldPayment(String(plot.id), approve, notes.trim() || undefined);
    setSaving(false);
    if (!res.success) { setError(res.message || 'Could not record the decision.'); return; }
    toast.success(approve ? 'Hold payment verified — hold confirmed.' : 'Hold payment rejected.');
    onDone();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen && !!plot}
      onClose={onClose}
      title={`Verify hold payment — ${plot?.plotNumber ?? ''}`}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-secondary" style={{ color: '#b91c1c' }} onClick={() => decide(false)} disabled={saving}>Reject</button>
          <button type="button" className="btn btn-primary" onClick={() => decide(true)} disabled={saving}>Verify &amp; confirm hold</button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {hold ? (
          <div className="plot-hold-detail-box">
            <div>Held for: <strong>{hold.customerName}</strong> ({hold.customerPhone})</div>
            <div>Amount: <strong>₹{Number(hold.amount).toLocaleString('en-IN')}</strong></div>
            <div>Mode: <strong>{hold.paymentMode || '—'}</strong> · Reference: <strong>{hold.paymentReference || '—'}</strong></div>
            <div>Paid on: <strong>{fmtDateTime(hold.paymentDate)}</strong> · Recorded by: <strong>{hold.agentName || '—'}</strong></div>
            {hold.paymentProofUrl && <div>Proof: <a href={hold.paymentProofUrl} target="_blank" rel="noreferrer">open</a></div>}
          </div>
        ) : (
          <div style={{ color: 'var(--text-secondary)' }}>Loading payment details…</div>
        )}
        <div className="form-group">
          <label className="form-label" htmlFor="verify-hold-notes">Notes</label>
          <input id="verify-hold-notes" type="text" className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Receipt number, bank reference check, or reason for rejection" />
        </div>
        {error && <div role="alert" style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>A hold is only confirmed once its payment is verified. A rejected payment leaves the hold unconfirmed and it expires on schedule.</div>
      </div>
    </Modal>
  );
};

// ── Hold history & payment details ─────────────────────────────────────────

export const HoldHistoryModal: React.FC<BaseProps> = ({ isOpen, onClose, plot }) => {
  const [holds, setHolds] = useState<PlotHold[] | null>(null);

  useEffect(() => {
    if (!isOpen || !plot) return;
    setHolds(null);
    jaminApiService.getHoldHistory(String(plot.id)).then(setHolds);
  }, [isOpen, plot?.id]);

  return (
    <Modal isOpen={isOpen && !!plot} onClose={onClose} title={`Hold history — ${plot?.plotNumber ?? ''}`} maxWidth={720}
      footer={<button type="button" className="btn btn-secondary" onClick={onClose}>Close</button>}>
      {holds === null ? (
        <div style={{ color: 'var(--text-secondary)' }}>Loading…</div>
      ) : holds.length === 0 ? (
        <div style={{ color: 'var(--text-secondary)' }}>This plot has no recorded holds yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {holds.map(h => (
            <div key={h.id} style={{ border: '1px solid var(--border-base, #e2e8f0)', borderRadius: 10, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <strong>{h.customerName} <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>· {h.customerPhone}</span></strong>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{h.status}</span>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', display: 'grid', gap: 2 }}>
                <div>Agent: {h.agentName || '—'} · {fmtDateTime(h.holdStartAt)} → {fmtDateTime(h.expiresAt)}{h.extensionCount > 0 ? ` · extended ${h.extensionCount}×` : ''}</div>
                {h.reason && <div>Reason: {h.reason}</div>}
                <div>
                  Payment: {h.amount > 0 ? `₹${Number(h.amount).toLocaleString('en-IN')} via ${h.paymentMode || '—'} (ref ${h.paymentReference || '—'})` : 'none'} <PaymentBadge status={h.paymentStatus} />
                  {h.verifiedByName ? ` · ${h.paymentStatus === 'Rejected' ? 'rejected' : 'verified'} by ${h.verifiedByName}` : ''}
                </div>
              </div>
              <ol style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 12.5 }}>
                {h.events.map(e => (
                  <li key={e.id} style={{ marginBottom: 3 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{fmtDateTime(e.createdAt)} — </span>{e.description}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};
