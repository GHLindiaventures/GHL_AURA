import React, { useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { StatusChip } from './StatusChip';
import { jaminApiService } from '../../services/jaminApiService';

export interface BookingContact {
  /** Lead / customer id as stored on the follow-up ("12", "lead-12", ...). */
  id?: string;
  name: string;
  phone: string;
  type?: string;
}

export interface BookingSelection {
  /** First plot (kept for single-plot callers); `plotIds` holds every plot to book, in order. */
  plotId: string;
  plotIds: string[];
  projectId: string;
  leadId?: string;
  customerId?: string;
  name: string;
  phone: string;
}

interface FollowupBookingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  contact: BookingContact | null;
  onProceed: (selection: BookingSelection) => void;
}

const VISITED_STATUSES = ['Visited', 'Completed'];
const phoneKey = (p?: string) => (p || '').replace(/\D/g, '').slice(-10);
const digitsOf = (id?: string) => (id || '').replace(/\D/g, '');
const formatInr = (n?: number) => (n && n > 0 ? `₹${Number(n).toLocaleString('en-IN')}` : '—');

/**
 * Booking from a follow-up: shows the plots this customer visited (so one can be booked),
 * or — if they have not visited — asks for the project (location) and the plot.
 */
export const FollowupBookingDialog: React.FC<FollowupBookingDialogProps> = ({ isOpen, onClose, contact, onProceed }) => {
  const [loading, setLoading] = useState(false);
  const [plots, setPlots] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [chosenPlotIds, setChosenPlotIds] = useState<string[]>([]);
  const [manual, setManual] = useState(false);
  const [projectId, setProjectId] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setChosenPlotIds([]);
    setManual(false);
    setProjectId('');
    Promise.all([
      jaminApiService.getSiteVisits(true).catch(() => []),
      jaminApiService.getPlots().catch(() => []),
      jaminApiService.getProjects().catch(() => []),
    ]).then(([v, pl, pr]) => {
      if (cancelled) return;
      setVisits(v as any[]);
      setPlots(pl as any[]);
      setProjects(pr as any[]);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, contact?.id, contact?.phone]);

  /** This customer's visited visits (matched by lead / customer id or by phone). */
  const visitedVisits = useMemo(() => {
    if (!contact) return [];
    const id = digitsOf(contact.id);
    const key = phoneKey(contact.phone);
    return visits.filter(v => {
      if (!VISITED_STATUSES.includes(v.status)) return false;
      if (id && contact.type !== 'customer' && String(v.leadId || '').replace(/\D/g, '') === id) return true;
      if (id && contact.type === 'customer' && String(v.customerId || '').replace(/\D/g, '') === id) return true;
      return key.length >= 10 && phoneKey(v.customerPhone) === key;
    });
  }, [visits, contact]);

  /** Plots from those visits, with their current details and availability. */
  const visitedPlots = useMemo(() => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const v of visitedVisits) {
      const ids: string[] = (v.plots && v.plots.length > 0) ? v.plots.map((p: any) => String(p.plotId)) : (v.plotId ? [String(v.plotId)] : []);
      for (const id of ids) {
        if (seen.has(id)) continue;
        const plot = plots.find(p => String(p.id) === id);
        if (plot) { seen.add(id); out.push({ ...plot, visitedOn: v.scheduledAt }); }
      }
    }
    return out;
  }, [visitedVisits, plots]);

  // A general project tour visited a project but no plot: remember which project to pre-select.
  const visitedProjectId = useMemo(() => {
    const v = visitedVisits.find(x => x.projectId);
    return v ? String(v.projectId) : '';
  }, [visitedVisits]);

  const isBookable = (plot: any) => {
    if (plot.status === 'Available') return true;
    return plot.status === 'Hold' && phoneKey(plot.heldByCustomerPhone) !== '' && phoneKey(plot.heldByCustomerPhone) === phoneKey(contact?.phone);
  };

  useEffect(() => {
    if (!isOpen || loading) return;
    // One visited plot that can be booked: pre-select it. Visited a project only: pre-select that project.
    const bookable = visitedPlots.filter(isBookable);
    if (visitedPlots.length > 0 && bookable.length === 1) setChosenPlotIds([String(bookable[0].id)]);
    if (visitedPlots.length === 0 && visitedVisits.length > 0) setProjectId(visitedProjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, loading, visitedPlots.length, visitedVisits.length]);

  const showVisited = visitedPlots.length > 0 && !manual;
  const projectAvailableCount = projectId ? plots.filter(p => String(p.projectId) === projectId && isBookable(p)).length : 0;
  const chosenPlots = chosenPlotIds.map(id => plots.find(p => String(p.id) === id)).filter((p): p is any => !!p && isBookable(p));
  const canContinue = chosenPlots.length > 0;

  const toggleChosen = (id: string) =>
    setChosenPlotIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

  const contactIds = () => {
    const visit = visitedVisits.find(v => v.leadId || v.customerId);
    const id = digitsOf(contact?.id);
    return {
      leadId: visit?.leadId ? String(visit.leadId) : (contact?.type !== 'customer' && id ? id : undefined),
      customerId: visit?.customerId ? String(visit.customerId) : (contact?.type === 'customer' && id ? id : undefined),
    };
  };

  /** No visited plot: open Plot Inventory for this project so several plots can be picked there. */
  const chooseInInventory = () => {
    if (!contact || !projectId) return;
    const ids = contactIds();
    try {
      sessionStorage.setItem('site_visit_plot_pick', JSON.stringify({
        projectId,
        selectedPlotIds: [],
        mode: 'followup',
        phone: contact.phone,
        buyerCustomerId: ids.customerId || '',
        contact: { name: contact.name, phone: contact.phone, leadId: ids.leadId, customerId: ids.customerId },
        savedAt: Date.now(),
      }));
    } catch { /* storage unavailable: Plot Inventory still opens, just not in pick mode */ }
    onClose();
    window.dispatchEvent(new CustomEvent('nexus_navigate', { detail: 'plots' }));
  };

  const proceed = () => {
    if (!contact || chosenPlots.length === 0) return;
    onProceed({
      plotId: String(chosenPlots[0].id),
      plotIds: chosenPlots.map(p => String(p.id)),
      projectId: String(chosenPlots[0].projectId),
      ...contactIds(),
      name: contact.name,
      phone: contact.phone,
    });
  };

  const cardStyle = (selected: boolean, disabled: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, textAlign: 'left',
    padding: '10px 12px', borderRadius: 10, width: '100%', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
    border: `2px solid ${selected ? '#10b981' : 'var(--border-base, #e2e8f0)'}`,
    background: selected ? 'rgba(16, 185, 129, 0.10)' : 'var(--bg-surface, #fff)', color: 'inherit',
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Book a plot for ${contact?.name || 'this customer'}`}
      subtitle={contact?.phone}
      maxWidth={640}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={proceed} disabled={!canContinue || loading} style={showVisited ? undefined : { display: 'none' }}>
            {chosenPlots.length > 1 ? `Continue to booking (${chosenPlots.length} plots)` : 'Continue to booking'}
          </button>
        </>
      }
    >
      {loading ? (
        <div style={{ padding: 16, color: 'var(--text-secondary, #64748b)' }}>Checking this customer's site visits…</div>
      ) : showVisited ? (
        <div>
          <p style={{ marginTop: 0 }}>
            <strong>{contact?.name} has visited these plots.</strong> Select every plot they want to book.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visitedPlots.map(pl => {
              const ok = isBookable(pl);
              const project = projects.find(p => String(p.id) === String(pl.projectId));
              const details = [
                pl.facing ? `${pl.facing} facing` : null,
                pl.areaSqFt ? `${Number(pl.areaSqFt).toLocaleString('en-IN')} sq ft` : null,
                formatInr(pl.price) !== '—' ? formatInr(pl.price) : null,
              ].filter(Boolean).join(' · ');
              return (
                <button
                  type="button"
                  key={pl.id}
                  disabled={!ok}
                  aria-pressed={chosenPlotIds.includes(String(pl.id))}
                  onClick={() => toggleChosen(String(pl.id))}
                  style={cardStyle(chosenPlotIds.includes(String(pl.id)), !ok)}
                >
                  <span>
                    <strong>{pl.plotNumber}</strong>
                    <span style={{ color: 'var(--text-secondary, #64748b)' }}> · {project?.name || 'Project'}</span>
                    <div style={{ fontSize: 12.5, color: 'var(--text-secondary, #64748b)', marginTop: 2 }}>
                      {details || 'Details not available'}{pl.visitedOn ? ` · visited ${pl.visitedOn}` : ''}
                    </div>
                  </span>
                  <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <StatusChip status={pl.status} size="sm" />
                    {!ok ? <span style={{ fontSize: 11.5, color: '#b45309' }}>Not available to book</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={() => { setManual(true); setChosenPlotIds([]); setProjectId(visitedProjectId); }}>
            Book different plots instead
          </button>
        </div>
      ) : (
        <div>
          <p style={{ marginTop: 0 }}>
            {manual
              ? 'Choose the project (location) and the plot to book.'
              : visitedVisits.length > 0
                ? `${contact?.name} visited the project but no specific plot was recorded. Which plot do they want to book?`
                : `${contact?.name} has not visited a site yet. Which plot and location do they want to book?`}
          </p>
          <div className="form-group">
            <label htmlFor="fbd-project" className="form-label">Project / location *</label>
            <select
              id="fbd-project"
              className="form-select"
              value={projectId}
              onChange={e => { setProjectId(e.target.value); setChosenPlotIds([]); }}
            >
              <option value="">-- Select project --</option>
              {projects.map(p => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}{p.location ? ` — ${p.location}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Plots *</label>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={chooseInInventory}
              disabled={!projectId || projectAvailableCount === 0}
            >
              Choose plots in Plot Inventory →
            </button>
            <p style={{ fontSize: 12, marginTop: 4, color: projectId && projectAvailableCount === 0 ? '#b45309' : 'var(--text-secondary, #64748b)' }}>
              {!projectId
                ? 'Select a project first.'
                : projectAvailableCount === 0
                  ? 'No plots are available to book in this project.'
                  : `${projectAvailableCount} plot${projectAvailableCount === 1 ? '' : 's'} available. Opens Plot Inventory so you can filter and select one or more plots to book.`}
            </p>
          </div>
          {visitedPlots.length > 0 ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setManual(false); setChosenPlotIds([]); }}>
              ← Back to the plots they visited
            </button>
          ) : null}
        </div>
      )}
    </Modal>
  );
};
