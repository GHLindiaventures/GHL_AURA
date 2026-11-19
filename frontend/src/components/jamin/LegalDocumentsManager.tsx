import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Upload, Trash2, Download, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { documentPackService, LegalDocument, toRelativeFileUrl } from '../../services/documentPackService';

interface LegalDocumentsManagerProps {
  entityType: string;
  entityId: string | number;
  categories: string[];
  /** Categories that should be present — shown as a checklist. */
  requiredCategories?: string[];
  canManage: boolean;
  emptyHint?: string;
  onChange?: (docs: LegalDocument[]) => void;
}

const ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp';

export const LegalDocumentsManager: React.FC<LegalDocumentsManagerProps> = ({
  entityType,
  entityId,
  categories,
  requiredCategories = [],
  canManage,
  emptyHint,
  onChange,
}) => {
  const [docs, setDocs] = useState<LegalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState(categories[0] || 'Other');
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await documentPackService.listDocuments(entityType, entityId);
      setDocs(list);
      onChange?.(list);
    } catch (err: any) {
      setError(err?.message || 'Could not load documents.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  useEffect(() => { load(); }, [load]);

  const presentCategories = useMemo(() => new Set(docs.map(d => d.category)), [docs]);
  const missing = requiredCategories.filter(c => !presentCategories.has(c));

  const grouped = useMemo(() => {
    const order = new Map(categories.map((c, i) => [c, i]));
    return [...docs].sort((a, b) => (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99));
  }, [docs, categories]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 25 * 1024 * 1024) throw new Error(`"${file.name}" is larger than 25 MB.`);
        await documentPackService.uploadDocument(entityType, entityId, category, file);
      }
      await load();
    } catch (err: any) {
      setError(err?.message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleDelete = async (doc: LegalDocument) => {
    if (!window.confirm(`Delete "${doc.name}"? Customers who already received a pack will no longer be able to download it.`)) return;
    setDeletingId(doc.id);
    try {
      await documentPackService.deleteDocument(doc.id);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Delete failed.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {requiredCategories.length > 0 && (
        <div
          style={{
            padding: '10px 12px', borderRadius: 8, fontSize: 12.5,
            background: missing.length ? 'rgba(245, 158, 11, 0.10)' : 'rgba(16, 185, 129, 0.10)',
            border: `1px solid ${missing.length ? 'rgba(245, 158, 11, 0.35)' : 'rgba(16, 185, 129, 0.35)'}`,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, color: missing.length ? '#b45309' : '#047857' }}>
            {missing.length ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
            {missing.length ? `${missing.length} key document${missing.length === 1 ? '' : 's'} missing` : 'All key documents uploaded'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {requiredCategories.map(c => (
              <span
                key={c}
                style={{
                  padding: '2px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 600,
                  background: presentCategories.has(c) ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.18)',
                  color: presentCategories.has(c) ? '#047857' : 'var(--text-secondary)',
                }}
              >
                {presentCategories.has(c) ? '✓' : '○'} {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {canManage && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="form-select"
            aria-label="Document category"
            value={category}
            onChange={e => setCategory(e.target.value)}
            style={{ flex: '1 1 220px', minWidth: 200 }}
          >
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input
            ref={fileRef}
            type="file"
            multiple
            accept={ACCEPT}
            style={{ display: 'none' }}
            onChange={e => handleFiles(e.target.files)}
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {uploading ? <RefreshCw size={14} className="spin" /> : <Upload size={14} />}
            {uploading ? 'Uploading…' : 'Upload'}
          </button>
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12.5, color: '#dc2626', background: 'rgba(239,68,68,0.08)', padding: '8px 10px', borderRadius: 6 }}>{error}</div>
      )}

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', padding: '8px 0' }}>Loading documents…</div>
      ) : grouped.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '12px', textAlign: 'center', border: '1px dashed var(--border-base)', borderRadius: 8 }}>
          {emptyHint || 'No documents uploaded yet.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {grouped.map(doc => {
            const href = toRelativeFileUrl(doc.fileUrl);
            return (
              <div
                key={doc.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                  border: '1px solid var(--border-base)', borderRadius: 8, background: 'var(--bg-surface)',
                }}
              >
                <FileText size={16} color="var(--primary-600)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.name}>
                    {doc.name}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                    {doc.category} · {doc.size} · {doc.uploadedAt}
                  </div>
                </div>
                {href && (
                  <a className="btn btn-ghost btn-sm" href={href} target="_blank" rel="noreferrer" title="Download" aria-label={`Download ${doc.name}`}>
                    <Download size={14} />
                  </a>
                )}
                {canManage && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    title="Delete"
                    aria-label={`Delete ${doc.name}`}
                    disabled={deletingId === doc.id}
                    onClick={() => handleDelete(doc)}
                    style={{ color: '#dc2626' }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
