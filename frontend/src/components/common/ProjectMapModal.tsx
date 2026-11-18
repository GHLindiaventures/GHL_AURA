import React, { useEffect, useState } from 'react';
import { X, ExternalLink, Navigation, MapPin } from 'lucide-react';
import './PlotLayoutViewer.css';

interface ProjectMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectName?: string;
  /** Address shown under the title (the project's location text). */
  location?: string;
  /** Place name or exact "lat, lng" saved for the project. Falls back to the project's address. */
  mapQuery?: string | null;
  /** Plot being looked at, shown in the title. */
  plotNumber?: string;
  /** Managers can save an exact location. */
  canEdit?: boolean;
  onSaveQuery?: (query: string) => Promise<boolean>;
}

const COORDS = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

/** Shows where a project is on Google Maps (embedded, no API key needed) with links to open it or get directions. */
export const ProjectMapModal: React.FC<ProjectMapModalProps> = ({
  isOpen, onClose, projectName, location, mapQuery, plotNumber, canEdit, onSaveQuery,
}) => {
  const [satellite, setSatellite] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setSatellite(false);
    setEditing(false);
    setError('');
    setDraft(mapQuery || '');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, mapQuery, onClose]);

  if (!isOpen) return null;

  const query = (mapQuery && mapQuery.trim()) || (location && location.trim()) || projectName || '';
  const exact = COORDS.test(query);
  const enc = encodeURIComponent(query.replace(/\s+/g, ' ').trim());
  const embedSrc = `https://maps.google.com/maps?q=${enc}&z=${exact ? 17 : 14}&t=${satellite ? 'k' : 'm'}&output=embed`;
  const openHref = `https://www.google.com/maps/search/?api=1&query=${enc}`;
  const directionsHref = `https://www.google.com/maps/dir/?api=1&destination=${enc}`;

  const save = async () => {
    if (!onSaveQuery) return;
    const value = draft.trim();
    setSaving(true);
    setError('');
    const ok = await onSaveQuery(value);
    setSaving(false);
    if (ok) setEditing(false);
    else setError('Could not save the location. Please try again.');
  };

  return (
    <div className="plv-overlay" role="dialog" aria-modal="true" aria-label="Project location map">
      <div className="plv-panel">
        <div className="plv-header">
          <div className="plv-title">
            <strong><MapPin size={15} style={{ verticalAlign: '-2px', marginRight: 4 }} />{projectName || 'Project location'}</strong>
            {plotNumber ? <span> · {plotNumber}</span> : null}
            <div className="plv-sub">{location || query}</div>
          </div>
          <div className="plv-actions">
            <button type="button" className="plv-btn" onClick={() => setSatellite(s => !s)} aria-pressed={satellite}>
              {satellite ? 'Map view' : 'Satellite'}
            </button>
            <a className="plv-btn" href={directionsHref} target="_blank" rel="noopener noreferrer">
              <Navigation size={15} /> Directions
            </a>
            <a className="plv-btn plv-btn-primary" href={openHref} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={15} /> Open in Google Maps
            </a>
            <button type="button" className="plv-btn" onClick={onClose} aria-label="Close" title="Close"><X size={16} /></button>
          </div>
        </div>

        <div className="plv-note" style={{ background: 'rgba(59, 130, 246, 0.10)', color: 'var(--text-secondary, #475569)', borderColor: 'rgba(59, 130, 246, 0.25)' }}>
          {exact
            ? 'Pinned at the exact coordinates saved for this project.'
            : 'Pinned from the place name in the layout documents (village or road level), not the exact plot site.'}
          {canEdit ? (
            <>
              {' '}
              <button type="button" className="plv-btn" style={{ padding: '2px 8px', marginLeft: 6 }} onClick={() => setEditing(e => !e)}>
                {editing ? 'Cancel' : 'Set exact location'}
              </button>
            </>
          ) : null}
        </div>

        {editing ? (
          <div style={{ display: 'flex', gap: 8, padding: '8px 16px', alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid var(--border-base, #e2e8f0)' }}>
            <input
              type="text"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder='Coordinates like "11.0183, 77.0012" (from Google Maps) or a place name'
              aria-label="Map location"
              style={{ flex: 1, minWidth: 260, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border-base, #e2e8f0)', background: 'var(--bg-surface, #fff)', color: 'inherit' }}
            />
            <button type="button" className="plv-btn plv-btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            {error ? <span style={{ color: '#b91c1c', fontSize: 12.5 }}>{error}</span> : null}
          </div>
        ) : null}

        <div className="plv-stage" style={{ cursor: 'auto', touchAction: 'auto' }}>
          {query ? (
            <iframe
              key={embedSrc}
              title={`Map of ${projectName || 'the project'}`}
              src={embedSrc}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
              allowFullScreen
            />
          ) : (
            <div className="plv-error">No location is saved for this project yet.</div>
          )}
        </div>
      </div>
    </div>
  );
};
