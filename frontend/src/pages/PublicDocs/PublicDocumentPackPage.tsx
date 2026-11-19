import React, { useEffect, useRef, useState } from 'react';
import { FileText, Download, MapPin, ShieldCheck, Clock, AlertCircle, Ruler, Compass } from 'lucide-react';
import { documentPackService, PublicDocumentPack, toRelativeFileUrl } from '../../services/documentPackService';

/**
 * Customer-facing document pack (no login). Opened from the WhatsApp / email link the sales team
 * sends while a plot is on hold, so the buyer, their lawyer or their bank can verify the property.
 */
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '—';

const card: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 14,
  padding: 20,
  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
};

export const PublicDocumentPackPage: React.FC = () => {
  const token = window.location.pathname.replace(/^\/docs\//i, '').split(/[/?#]/)[0];
  const [state, setState] = useState<{ loading: boolean; data?: PublicDocumentPack; error?: string }>({ loading: true });

  // Each fetch records a "view" for the sales team — make sure one page open counts once
  // (React StrictMode runs effects twice in development).
  const fetchedRef = useRef(false);

  useEffect(() => {
    document.title = 'Property Documents — Jamin Bazaar';
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    documentPackService.getPublicPack(token).then(res => {
      if (res.ok) setState({ loading: false, data: res.data });
      else setState({ loading: false, error: res.message });
    });
  }, [token]);

  const page: React.CSSProperties = {
    minHeight: '100vh',
    background: '#f8fafc',
    color: '#0f172a',
    fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    padding: '24px 16px 48px',
  };

  if (state.loading) {
    return <div style={{ ...page, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>Loading documents…</div>;
  }

  if (state.error || !state.data) {
    return (
      <div style={{ ...page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ ...card, maxWidth: 440, textAlign: 'center' }}>
          <AlertCircle size={36} color="#dc2626" style={{ marginBottom: 10 }} />
          <h1 style={{ fontSize: 18, margin: '0 0 8px' }}>Link not available</h1>
          <p style={{ margin: 0, color: '#475569', fontSize: 14 }}>{state.error}</p>
        </div>
      </div>
    );
  }

  const d = state.data;
  const projectDocs = d.documents.filter(x => x.scope === 'project');
  const plotDocs = d.documents.filter(x => x.scope === 'plot');

  const renderDoc = (doc: PublicDocumentPack['documents'][number]) => {
    const href = toRelativeFileUrl(doc.fileUrl);
    return (
      <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', border: '1px solid #e2e8f0', borderRadius: 10 }}>
        <FileText size={20} color="#dc2626" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>{doc.category} · {doc.size}</div>
        </div>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderRadius: 8, background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}
          >
            <Download size={14} /> Download
          </a>
        ) : (
          <span style={{ fontSize: 12, color: '#94a3b8' }}>Not available</span>
        )}
      </div>
    );
  };

  return (
    <div style={page}>
      <div style={{ maxWidth: 760, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src="/jamin-logo.png" alt="" style={{ height: 40 }} onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          <div>
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{d.companyName}</div>
            <h1 style={{ fontSize: 22, margin: 0 }}>Property Documents for Verification</h1>
          </div>
        </header>

        <div style={card}>
          <div style={{ fontSize: 14, color: '#334155' }}>
            Dear <strong>{d.recipientName}</strong>, here are the documents for the plot reserved for you. You can share this page with your lawyer or bank.
          </div>
          {d.message && <div style={{ marginTop: 10, fontSize: 14, color: '#334155', whiteSpace: 'pre-wrap' }}>“{d.message}”</div>}
          <div style={{ marginTop: 12, fontSize: 12.5, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock size={13} /> Shared by {d.sharedByName} on {fmt(d.sharedAt)} · Link valid until <strong style={{ color: '#0f172a' }}>{fmt(d.expiresAt)}</strong>
          </div>
        </div>

        <div style={card}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{d.plotNumber}</div>
          <div style={{ fontSize: 14, color: '#475569', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <MapPin size={14} color="#059669" /> {d.projectName}{d.projectLocation ? `, ${d.projectLocation}` : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 14 }}>
            <div><div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}><Ruler size={12} /> Dimensions</div><div style={{ fontWeight: 600 }}>{d.dimensions || '—'}</div></div>
            <div><div style={{ fontSize: 12, color: '#64748b' }}>Area</div><div style={{ fontWeight: 600 }}>{d.areaSqFt ? `${d.areaSqFt.toLocaleString('en-IN')} sq.ft` : '—'}</div></div>
            <div><div style={{ fontSize: 12, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}><Compass size={12} /> Facing</div><div style={{ fontWeight: 600 }}>{d.facing || '—'}</div></div>
            {d.holdExpiresAt && (
              <div><div style={{ fontSize: 12, color: '#64748b' }}>Reserved for you until</div><div style={{ fontWeight: 600, color: '#b45309' }}>{fmt(d.holdExpiresAt)}</div></div>
            )}
          </div>
        </div>

        {d.costSheet && (
          <div style={card}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>Cost Sheet</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <tbody>
                {[
                  ['Plot area', `${d.costSheet.areaSqFt.toLocaleString('en-IN')} sq.ft`],
                  ['Rate per sq.ft', d.costSheet.pricePerSqft > 0 ? inr(d.costSheet.pricePerSqft) : '—'],
                  ['Plot price', inr(d.costSheet.plotPrice)],
                  ['Stamp duty (approx. 7%)', inr(d.costSheet.stampDutyEstimate)],
                  ['Registration fee (approx. 2%)', inr(d.costSheet.registrationFeeEstimate)],
                ].map(([k, v]) => (
                  <tr key={k} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 0', color: '#475569' }}>{k}</td>
                    <td style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600 }}>{v}</td>
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: '10px 0', fontWeight: 700 }}>Estimated total</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: 800, color: '#059669' }}>{inr(d.costSheet.totalEstimate)}</td>
                </tr>
              </tbody>
            </table>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>{d.costSheet.note}</div>
          </div>
        )}

        <div style={card}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={18} color="#059669" /> Legal Documents
          </div>
          {d.documents.length === 0 ? (
            <div style={{ fontSize: 14, color: '#64748b' }}>No documents were attached to this link.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {projectDocs.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Layout / Project</div>
                  {projectDocs.map(renderDoc)}
                </div>
              )}
              {plotDocs.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{d.plotNumber}</div>
                  {plotDocs.map(renderDoc)}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
          For any queries about these documents, please contact {d.sharedByName} at {d.companyName}.
        </div>
      </div>
    </div>
  );
};
