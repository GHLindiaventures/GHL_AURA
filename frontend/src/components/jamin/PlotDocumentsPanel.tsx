import React, { useCallback, useEffect, useState } from 'react';
import { Share2, Eye, ChevronDown, ChevronUp, FolderOpen } from 'lucide-react';
import {
  documentPackService,
  PlotDocumentShare,
  PLOT_DOC_CATEGORIES,
  PLOT_DOC_ENTITY,
  VERIFICATION_STATUSES,
  VERIFICATION_STATUS_STYLE,
  buildShareLink,
} from '../../services/documentPackService';
import { LegalDocumentsManager } from './LegalDocumentsManager';

const formatDateTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : '—';

export const VerificationChip: React.FC<{ status: string; small?: boolean }> = ({ status, small }) => {
  const s = VERIFICATION_STATUS_STYLE[status] || VERIFICATION_STATUS_STYLE.Shared;
  return (
    <span style={{ fontSize: small ? 10.5 : 11.5, fontWeight: 700, padding: small ? '1px 6px' : '2px 8px', borderRadius: 999, background: s.bg, color: s.fg, whiteSpace: 'nowrap' }}>
      {status}
    </span>
  );
};

interface PlotDocumentsPanelProps {
  plotId: string | number;
  plotNumber: string;
  canManage: boolean;
  /** Bumped by the parent after a new share so the history reloads. */
  refreshKey?: number;
  onShareClick: () => void;
  onSharesChanged?: () => void;
}

export const PlotDocumentsPanel: React.FC<PlotDocumentsPanelProps> = ({ plotId, plotNumber, canManage, refreshKey, onShareClick, onSharesChanged }) => {
  const [shares, setShares] = useState<PlotDocumentShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPlotDocs, setShowPlotDocs] = useState(false);
  const [editing, setEditing] = useState<{ id: number; status: string; note: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setShares(await documentPackService.getShares({ plotId }));
    } catch {
      setShares([]);
    } finally {
      setLoading(false);
    }
  }, [plotId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const saveStatus = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await documentPackService.updateStatus(editing.id, editing.status, editing.note);
      setEditing(null);
      await load();
      onSharesChanged?.();
    } catch (err: any) {
      alert(err?.message || 'Could not update status');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--border-base)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <FolderOpen size={16} color="var(--primary-600)" /> Legal Documents &amp; Verification
        </div>
        <button className="btn btn-primary btn-sm" onClick={onShareClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Share2 size={14} /> Share Documents
        </button>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading share history…</div>
      ) : shares.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Documents have not been shared for {plotNumber} yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {shares.map(s => (
            <div key={s.id} style={{ border: '1px solid var(--border-base)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <strong>{s.recipientName}</strong> <span style={{ color: 'var(--text-muted)' }}>({s.recipientPhone})</span>
                  <span style={{ color: 'var(--text-muted)' }}> · via {s.channel}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {s.isExpired && s.status !== 'Revoked' && <VerificationChip status="Link expired" small />}
                  <VerificationChip status={s.status} />
                </div>
              </div>
              <div style={{ color: 'var(--text-secondary)' }}>
                {s.documentCount} doc{s.documentCount === 1 ? '' : 's'}{s.includeCostSheet ? ' + cost sheet' : ''} · shared {formatDateTime(s.sharedAt)} by {s.sharedByName} · valid till {formatDateTime(s.expiresAt)}
              </div>
              <div style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Eye size={13} />
                {s.viewCount > 0 ? `Opened ${s.viewCount} time${s.viewCount === 1 ? '' : 's'} · last ${formatDateTime(s.lastViewedAt)}` : 'Not opened yet'}
              </div>
              {s.statusNote && (
                <div style={{ background: 'var(--bg-surface-hover, rgba(148,163,184,0.1))', padding: '6px 8px', borderRadius: 6 }}>
                  <strong>Note:</strong> {s.statusNote}{s.statusUpdatedByName ? ` — ${s.statusUpdatedByName}` : ''}
                </div>
              )}

              {editing?.id === s.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <select className="form-select" aria-label="Verification status" value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })}>
                    {VERIFICATION_STATUSES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <input
                    className="form-input"
                    aria-label="Status note"
                    placeholder="e.g. Lawyer asked for 30-year EC"
                    value={editing.note}
                    onChange={e => setEditing({ ...editing, note: e.target.value })}
                  />
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
                    <button className="btn btn-primary btn-sm" onClick={saveStatus} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={async () => { try { await navigator.clipboard.writeText(buildShareLink(s)); } catch { /* ignore */ } }}
                    disabled={s.status === 'Revoked' || s.isExpired}
                  >
                    Copy link
                  </button>
                  {canManage && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: '#dc2626' }}
                      onClick={async () => {
                        if (!window.confirm(`Delete this share with ${s.recipientName}? The link will stop working.`)) return;
                        try { await documentPackService.deleteShare(s.id); await load(); onSharesChanged?.(); }
                        catch (err: any) { alert(err?.message || 'Could not delete the share'); }
                      }}
                    >
                      Delete
                    </button>
                  )}
                  <button className="btn btn-secondary btn-sm" onClick={() => setEditing({ id: s.id, status: s.status, note: '' })}>
                    Update verification
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setShowPlotDocs(v => !v)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, paddingLeft: 0 }}
        >
          {showPlotDocs ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {canManage ? `Manage ${plotNumber} documents (sketch, patta, EC…)` : `${plotNumber} documents`}
        </button>
        {showPlotDocs && (
          <div style={{ marginTop: 8 }}>
            <LegalDocumentsManager
              entityType={PLOT_DOC_ENTITY}
              entityId={plotId}
              categories={PLOT_DOC_CATEGORIES}
              canManage={canManage}
              emptyHint={`No plot-specific documents for ${plotNumber}. Project legal documents are managed on the Projects page.`}
            />
          </div>
        )}
      </div>
    </div>
  );
};
