import React, { useEffect, useMemo, useState } from 'react';
import { MessageCircle, Mail, Link2, AlertTriangle, CheckCircle2, FileText, Copy } from 'lucide-react';
import { Modal } from '../common/Modal';
import {
  documentPackService,
  PackDocument,
  PlotDocumentShare,
  REQUIRED_PROJECT_DOC_CATEGORIES,
  buildShareLink,
} from '../../services/documentPackService';

export interface ShareDocumentsTarget {
  plotId: string | number;
  plotNumber: string;
  projectName?: string;
  holdExpiresAt?: string | null;
  recipientName?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  leadId?: string | number | null;
  customerId?: string | number | null;
}

interface ShareDocumentsModalProps {
  isOpen: boolean;
  target: ShareDocumentsTarget | null;
  onClose: () => void;
  onShared?: (share: PlotDocumentShare) => void;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const toLocalDateTimeInput = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

/** Digits only, with India country code when a 10-digit mobile is given (for wa.me links). */
const toWhatsAppNumber = (phone: string) => {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `91${digits}`;
  return digits;
};

export const ShareDocumentsModal: React.FC<ShareDocumentsModalProps> = ({ isOpen, target, onClose, onShared }) => {
  const [docs, setDocs] = useState<PackDocument[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [includeCostSheet, setIncludeCostSheet] = useState(true);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [submitting, setSubmitting] = useState<'whatsapp' | 'email' | 'link' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<PlotDocumentShare | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen || !target) return;
    setName(target.recipientName || '');
    setPhone(target.recipientPhone || '');
    setEmail(target.recipientEmail || '');
    setNote('');
    setIncludeCostSheet(true);
    setError(null);
    setCreated(null);
    setCopied(false);
    const holdExp = target.holdExpiresAt ? new Date(target.holdExpiresAt) : null;
    const defaultExp = holdExp && holdExp.getTime() > Date.now() ? holdExp : new Date(Date.now() + 7 * 86400000);
    setExpiresAt(toLocalDateTimeInput(defaultExp));

    let cancelled = false;
    setLoadingDocs(true);
    documentPackService.getPackDocuments(target.plotId)
      .then(list => {
        if (cancelled) return;
        setDocs(list);
        setSelectedIds(new Set(list.map(d => d.id)));
      })
      .catch(() => { if (!cancelled) setDocs([]); })
      .finally(() => { if (!cancelled) setLoadingDocs(false); });
    return () => { cancelled = true; };
  }, [isOpen, target]);

  const projectDocs = docs.filter(d => d.scope === 'project');
  const plotDocs = docs.filter(d => d.scope === 'plot');
  const selectedCategories = useMemo(
    () => new Set(docs.filter(d => selectedIds.has(d.id)).map(d => d.category)),
    [docs, selectedIds]
  );
  const missingRequired = REQUIRED_PROJECT_DOC_CATEGORIES.filter(c => !selectedCategories.has(c));

  const toggle = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const buildMessage = (link: string, expIso: string) => {
    const lines = [
      `Hello ${name.trim() || 'Sir/Madam'},`,
      '',
      `Thank you for choosing ${target?.plotNumber}${target?.projectName ? ` at ${target.projectName}` : ''}. As requested, here are the legal documents${includeCostSheet ? ' and cost sheet' : ''} for your verification:`,
      link,
      '',
      `This link is valid until ${formatDateTime(expIso)}. You can share it with your lawyer or bank for verification.`,
    ];
    if (note.trim()) lines.push('', note.trim());
    lines.push('', '— Jamin Bazaar');
    return lines.join('\n');
  };

  const handleShare = async (channel: 'whatsapp' | 'email' | 'link') => {
    if (!target) return;
    setError(null);
    if (!name.trim() || !phone.trim()) { setError('Customer name and phone are required.'); return; }
    if (channel === 'email' && !email.trim()) { setError('Enter the customer email to share by email.'); return; }
    if (selectedIds.size === 0 && !includeCostSheet) { setError('Select at least one document or include the cost sheet.'); return; }
    const exp = expiresAt ? new Date(expiresAt) : null;
    if (!exp || Number.isNaN(exp.getTime()) || exp.getTime() <= Date.now() + 5 * 60000) { setError('Link expiry must be in the future.'); return; }

    // Open the WhatsApp tab synchronously (inside the click) so pop-up blockers allow it.
    const waWindow = channel === 'whatsapp' ? window.open('about:blank', '_blank') : null;

    setSubmitting(channel);
    try {
      const share = await documentPackService.createShare({
        plotId: Number(target.plotId),
        leadId: target.leadId ? Number(target.leadId) : undefined,
        customerId: target.customerId ? Number(target.customerId) : undefined,
        recipientName: name.trim(),
        recipientPhone: phone.trim(),
        recipientEmail: email.trim() || undefined,
        channel,
        documentIds: Array.from(selectedIds),
        includeCostSheet,
        message: note.trim() || undefined,
        expiresAt: exp.toISOString(),
      });
      const link = buildShareLink(share);
      const text = buildMessage(link, share.expiresAt);
      if (channel === 'whatsapp') {
        const url = `https://wa.me/${toWhatsAppNumber(phone)}?text=${encodeURIComponent(text)}`;
        if (waWindow) waWindow.location.href = url; else window.open(url, '_blank');
      } else if (channel === 'email') {
        const subject = `Legal documents — ${target.plotNumber}${target.projectName ? `, ${target.projectName}` : ''}`;
        window.location.href = `mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
      } else {
        try { await navigator.clipboard.writeText(link); setCopied(true); } catch { /* clipboard blocked — link is shown below */ }
      }
      setCreated(share);
      onShared?.(share);
    } catch (err: any) {
      waWindow?.close();
      setError(err?.message || 'Could not share the document pack.');
    } finally {
      setSubmitting(null);
    }
  };

  const renderDocRow = (d: PackDocument) => (
    <label
      key={d.id}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
        border: '1px solid var(--border-base)', background: selectedIds.has(d.id) ? 'rgba(16, 185, 129, 0.06)' : 'var(--bg-surface)',
      }}
    >
      <input type="checkbox" checked={selectedIds.has(d.id)} onChange={() => toggle(d.id)} />
      <FileText size={15} color="var(--primary-600)" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{d.category} · {d.size}</div>
      </div>
    </label>
  );

  const createdLink = created ? buildShareLink(created) : '';

  return (
    <Modal
      isOpen={isOpen && !!target}
      onClose={onClose}
      title={`Share Documents — ${target?.plotNumber || ''}`}
      subtitle="Send the legal document pack to the customer for verification (lawyer / bank)"
      maxWidth={640}
      footer={
        created ? (
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={onClose} disabled={!!submitting}>Cancel</button>
            <button
              className="btn btn-secondary"
              onClick={() => handleShare('link')}
              disabled={!!submitting}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Link2 size={14} /> {submitting === 'link' ? 'Creating…' : 'Copy Link'}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => handleShare('email')}
              disabled={!!submitting}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Mail size={14} /> {submitting === 'email' ? 'Preparing…' : 'Email'}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => handleShare('whatsapp')}
              disabled={!!submitting}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <MessageCircle size={14} /> {submitting === 'whatsapp' ? 'Opening…' : 'Send on WhatsApp'}
            </button>
          </>
        )
      }
    >
      {created ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#047857', fontWeight: 700 }}>
            <CheckCircle2 size={18} /> Document pack shared with {created.recipientName}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {created.documentCount} document{created.documentCount === 1 ? '' : 's'}{created.includeCostSheet ? ' + cost sheet' : ''} · link valid until <strong>{formatDateTime(created.expiresAt)}</strong>.
            {' '}You'll see here when the customer opens it.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="form-input" readOnly value={createdLink} aria-label="Share link" onFocus={e => e.currentTarget.select()} />
            <button
              className="btn btn-secondary"
              onClick={async () => { try { await navigator.clipboard.writeText(createdLink); setCopied(true); } catch { /* ignore */ } }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
            >
              <Copy size={14} /> {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label htmlFor="share-docs-name" className="form-label">Customer Name *</label>
              <input id="share-docs-name" className="form-input" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label htmlFor="share-docs-phone" className="form-label">WhatsApp / Phone *</label>
              <input id="share-docs-phone" className="form-input" value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label htmlFor="share-docs-email" className="form-label">Email (for email sharing)</label>
              <input id="share-docs-email" type="email" className="form-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="customer@example.com" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label htmlFor="share-docs-expiry" className="form-label">Link Valid Until *</label>
              <input id="share-docs-expiry" type="datetime-local" className="form-input" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span className="form-label" style={{ margin: 0 }}>Documents to share</span>
              {docs.length > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setSelectedIds(selectedIds.size === docs.length ? new Set() : new Set(docs.map(d => d.id)))}
                >
                  {selectedIds.size === docs.length ? 'Clear all' : 'Select all'}
                </button>
              )}
            </div>
            {loadingDocs ? (
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading documents…</div>
            ) : docs.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 12, border: '1px dashed var(--border-base)', borderRadius: 8 }}>
                No documents uploaded for this project or plot yet. An admin can upload them from <strong>Projects → Legal Documents</strong> and the plot details.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 260, overflowY: 'auto' }}>
                {projectDocs.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Layout / Project documents</div>
                    {projectDocs.map(renderDocRow)}
                  </div>
                )}
                {plotDocs.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{target?.plotNumber} documents</div>
                    {plotDocs.map(renderDocRow)}
                  </div>
                )}
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={includeCostSheet} onChange={e => setIncludeCostSheet(e.target.checked)} />
              Include cost sheet (plot price, price per sq.ft, indicative stamp duty &amp; registration)
            </label>
          </div>

          {!loadingDocs && missingRequired.length > 0 && (
            <div style={{ display: 'flex', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(245, 158, 11, 0.10)', border: '1px solid rgba(245, 158, 11, 0.35)', fontSize: 12.5, color: '#92400e' }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Pack is incomplete — buyers' lawyers and banks usually ask for: <strong>{missingRequired.join(', ')}</strong>.</span>
            </div>
          )}

          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="share-docs-note" className="form-label">Personal note (optional)</label>
            <textarea id="share-docs-note" className="form-textarea" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Please share with your lawyer; call me for any queries." />
          </div>

          {error && <div style={{ fontSize: 12.5, color: '#dc2626' }}>{error}</div>}
        </div>
      )}
    </Modal>
  );
};
