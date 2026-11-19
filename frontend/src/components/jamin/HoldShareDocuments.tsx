import React, { useEffect, useState } from 'react';
import { MessageCircle, Mail, MessageSquareText, FileText } from 'lucide-react';
import { documentPackService, buildShareLink, type PackDocument } from '../../services/documentPackService';
import { toast } from '../../context/ToastContext';

interface HoldShareDocumentsProps {
  plotId: string | number;
  plotNumber: string;
  projectName?: string;
  leadId?: string | number | null;
  recipientName: string;
  recipientPhone: string;
  recipientEmail?: string;
  /** The hold's expiry (local date-time input value). The link stays valid until then. */
  holdExpiry: string;
}

type Channel = 'whatsapp' | 'email' | 'sms';

const toWhatsAppNumber = (phone: string) => {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
};
const fmt = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

/**
 * Inside the hold form: share the uploaded legal documents (and cost sheet) with the lead by
 * WhatsApp, e-mail or SMS. Each click creates a tracked share link, then opens the chosen app with the message ready.
 */
export const HoldShareDocuments: React.FC<HoldShareDocumentsProps> = ({
  plotId, plotNumber, projectName, leadId, recipientName, recipientPhone, recipientEmail, holdExpiry,
}) => {
  const [docs, setDocs] = useState<PackDocument[] | null>(null);
  const [busy, setBusy] = useState<Channel | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setDocs(null);
    documentPackService.getPackDocuments(plotId).then(d => { if (!cancelled) setDocs(d); }).catch(() => { if (!cancelled) setDocs([]); });
    return () => { cancelled = true; };
  }, [plotId]);

  const share = async (channel: Channel) => {
    setError('');
    if (!recipientName.trim() || !recipientPhone.trim()) { setError('Select the lead first, so their name and phone are filled in.'); return; }
    if (channel === 'email' && !(recipientEmail || '').trim()) { setError('This lead has no email address.'); return; }
    const exp = holdExpiry ? new Date(holdExpiry) : null;
    if (!exp || Number.isNaN(exp.getTime()) || exp.getTime() <= Date.now() + 5 * 60000) { setError('Set the hold expiry first (it must be in the future); the link stays valid until then.'); return; }

    // Open the WhatsApp tab inside the click so pop-up blockers allow it.
    const waWindow = channel === 'whatsapp' ? window.open('about:blank', '_blank') : null;
    setBusy(channel);
    try {
      const created = await documentPackService.createShare({
        plotId: Number(plotId),
        leadId: leadId ? Number(leadId) : undefined,
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone.trim(),
        recipientEmail: (recipientEmail || '').trim() || undefined,
        channel,
        documentIds: (docs ?? []).map(d => d.id),
        includeCostSheet: true,
        expiresAt: exp.toISOString(),
      });
      const link = buildShareLink(created);
      const text = [
        `Hello ${recipientName.trim() || 'Sir/Madam'},`,
        '',
        `Thank you for your interest in ${plotNumber}${projectName ? ` at ${projectName}` : ''}. Here are the legal documents and cost sheet for your verification:`,
        link,
        '',
        `This link is valid until ${fmt(created.expiresAt)}. You can share it with your lawyer or bank.`,
        '',
        '— Jamin Bazaar',
      ].join('\n');

      if (channel === 'whatsapp') {
        const url = `https://wa.me/${toWhatsAppNumber(recipientPhone)}?text=${encodeURIComponent(text)}`;
        if (waWindow) waWindow.location.href = url; else window.open(url, '_blank');
      } else if (channel === 'email') {
        const subject = `Legal documents — ${plotNumber}${projectName ? `, ${projectName}` : ''}`;
        window.location.href = `mailto:${encodeURIComponent((recipientEmail || '').trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
      } else {
        window.location.href = `sms:${(recipientPhone || '').replace(/\s/g, '')}?body=${encodeURIComponent(text)}`;
      }
      toast.success('Document link ready to send.');
    } catch (err: any) {
      waWindow?.close();
      setError(err?.message || 'Could not create the share link.');
    } finally {
      setBusy(null);
    }
  };

  const count = docs?.length;
  const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, justifyContent: 'center' };

  return (
    <div style={{ border: '1px solid var(--border-base, #e2e8f0)', borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>
        <FileText size={15} color="var(--primary-600)" /> Share uploaded documents with this lead
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
        {docs === null
          ? 'Checking the uploaded documents…'
          : count === 0
            ? 'No legal documents are uploaded for this project / plot yet. The link will carry the cost sheet only. Upload documents from the plot details first.'
            : `${count} uploaded document${count === 1 ? '' : 's'} and the cost sheet will be shared. The link is valid until the hold expiry.`}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-primary btn-sm" style={btn} onClick={() => share('whatsapp')} disabled={!!busy}>
          <MessageCircle size={14} /> {busy === 'whatsapp' ? 'Preparing…' : 'WhatsApp'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" style={btn} onClick={() => share('email')} disabled={!!busy}>
          <Mail size={14} /> {busy === 'email' ? 'Preparing…' : 'Email'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" style={btn} onClick={() => share('sms')} disabled={!!busy}>
          <MessageSquareText size={14} /> {busy === 'sms' ? 'Preparing…' : 'Message'}
        </button>
      </div>
      {error && <div role="alert" style={{ marginTop: 8, fontSize: 12.5, color: '#b91c1c' }}>{error}</div>}
    </div>
  );
};
