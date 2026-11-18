import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Kanban as KanbanIcon, User, Calendar, Clock, Phone, Mail, MapPin, Plus, RefreshCw, Briefcase } from 'lucide-react';
import { Lead, Followup, SiteVisit } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { getLeads, getFollowups, saveLead as apiSaveLead } from '../../services/ghlApiService';
import { jaminApiService } from '../../services/jaminApiService';
import { adminUserService } from '../../services/adminUserService';
import { Drawer } from '../common/Drawer';
import './AdminKanbanBoard.css';

/**
 * Jamin Bazaar — Company Admin pipeline.
 * Mirrors the GHL admin pipeline board, but Jamin has only the Sales Executive role,
 * so there is no role toggle. Filters: Person (sales executive) + Date range.
 * Columns: Leads → Follow Up → Site Visit → Interested → Not Interested.
 */

type JaminStageId = 'leads' | 'follow-up' | 'site-visit' | 'interested' | 'not-interested';
type DatePreset = 'all' | 'today' | 'this_week' | 'this_month' | 'custom';

interface JaminStageDef {
  id: JaminStageId;
  name: string;
  description: string;
  color: string;
}

const JAMIN_ADMIN_STAGES: JaminStageDef[] = [
  { id: 'leads', name: 'Leads', description: 'New leads assigned to sales executives', color: '#3b82f6' },
  { id: 'follow-up', name: 'Follow Up', description: 'Callbacks and scheduled follow-ups in progress', color: '#f59e0b' },
  { id: 'site-visit', name: 'Site Visit', description: 'Site visits requested, scheduled or completed', color: '#8b5cf6' },
  { id: 'interested', name: 'Interested', description: 'High-intent buyers ready for plot booking', color: '#10b981' },
  { id: 'not-interested', name: 'Not Interested', description: 'Leads disqualified or closed as lost', color: '#ef4444' },
];

const NOT_INTERESTED_STATUSES = ['not interested', 'junk', 'wrong number', 'lost'];
const FOLLOWUP_STATUSES = ['follow-up required', 'callback', 'no response', 'contacted'];
const INACTIVE_VISIT_STATUSES = ['cancelled', 'canceled'];

interface JaminCard {
  id: string;
  stageId: JaminStageId;
  kind: 'lead' | 'followup' | 'site-visit';
  leadId?: string;
  title: string;
  phone: string;
  email: string;
  location?: string;
  assignedPersonId: string;
  assignedPersonName: string;
  stageEnteredAt: string;
  createdAt: string;
  lastActivityDate: string;
  amount?: string;
  detail?: string;
}

const phoneKey = (p?: string) => (p || '').replace(/\D/g, '').slice(-10);

interface JaminAdminKanbanBoardProps {
  onOpenQuickCreate?: (type: 'lead' | 'followup' | 'deal' | 'visit' | 'consultation') => void;
}

export const JaminAdminKanbanBoard: React.FC<JaminAdminKanbanBoardProps> = ({ onOpenQuickCreate }) => {
  const { tenant, user } = useAuth();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [siteVisits, setSiteVisits] = useState<SiteVisit[]>([]);
  const [salesUsers, setSalesUsers] = useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [selectedPerson, setSelectedPerson] = useState<string>('All');
  const [datePreset, setDatePreset] = useState<DatePreset>('all');
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split('T')[0];
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [selectedCard, setSelectedCard] = useState<JaminCard | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // ── Sales executives (person filter) ──────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    (async () => {
      const map = new Map<string, { id: string; name: string }>();
      try {
        const users = await adminUserService.getUsers(tenant?.id || '2');
        (users || []).forEach(u => {
          if ((u.role?.code || '').toLowerCase() === 'sales_executive' && u.name) {
            map.set(String(u.id), { id: String(u.id), name: u.name });
          }
        });
      } catch (e) {
        console.warn('[JaminAdminKanbanBoard] Failed to load users:', e);
      }
      if (map.size === 0) {
        try {
          const agents = await jaminApiService.getAgents();
          agents.forEach(a => map.set(String(a.id), { id: String(a.id), name: a.name }));
        } catch { /* ignore */ }
      }
      if (mounted) setSalesUsers(Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)));
    })();
    return () => { mounted = false; };
  }, [tenant?.id]);

  // ── Pipeline data ─────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoadError(null);
    try {
      const [allLeads, allFollowups, visits] = await Promise.all([
        getLeads(tenant?.id, 'all').catch(err => {
          console.warn('[JaminAdminKanbanBoard] leads failed', err);
          return [] as Lead[];
        }),
        getFollowups(tenant?.id).catch(() => [] as Followup[]),
        jaminApiService.getSiteVisits(true).catch(() => [] as SiteVisit[]),
      ]);
      setLeads(allLeads || []);
      setFollowups(allFollowups || []);
      setSiteVisits(visits || []);
    } catch (err: any) {
      console.error('[JaminAdminKanbanBoard] Failed to load pipeline', err);
      setLoadError(err?.message || 'Failed to load pipeline data.');
    } finally {
      setIsLoading(false);
    }
  }, [tenant?.id]);

  useEffect(() => {
    loadData();
    let t: any;
    const onUpdate = () => {
      clearTimeout(t);
      t = setTimeout(loadData, 300);
    };
    window.addEventListener('nexus_storage_updated', onUpdate);
    return () => {
      clearTimeout(t);
      window.removeEventListener('nexus_storage_updated', onUpdate);
    };
  }, [loadData]);

  // ── Build cards ───────────────────────────────────────────────────────────
  const resolvePerson = useCallback((id?: string | number, name?: string) => {
    if (id !== undefined && id !== null && String(id) !== '' && String(id) !== '0') {
      const found = salesUsers.find(u => String(u.id) === String(id));
      if (found) return found;
    }
    if (name) {
      const found = salesUsers.find(u => u.name.toLowerCase() === name.toLowerCase());
      if (found) return found;
      return { id: String(id || name), name };
    }
    return { id: '', name: 'Unassigned' };
  }, [salesUsers]);

  const cards = useMemo<JaminCard[]>(() => {
    const nowIso = new Date().toISOString();
    const result: JaminCard[] = [];

    const pendingFollowups = followups.filter(f => (f.status || 'Pending') === 'Pending');
    const activeVisits = siteVisits.filter(v => !INACTIVE_VISIT_STATUSES.includes(String(v.status || '').toLowerCase()));

    const visitByLeadId = new Map<string, SiteVisit>();
    const visitByPhone = new Map<string, SiteVisit>();
    activeVisits.forEach(v => {
      if (v.leadId) visitByLeadId.set(String(v.leadId), v);
      const pk = phoneKey(v.customerPhone || v.leadPhone);
      if (pk) visitByPhone.set(pk, v);
    });
    const fuByContactId = new Map<string, Followup>();
    const fuByPhone = new Map<string, Followup>();
    pendingFollowups.forEach(f => {
      if (f.contactId) fuByContactId.set(String(f.contactId), f);
      const pk = phoneKey(f.contactPhone);
      if (pk) fuByPhone.set(pk, f);
    });

    const usedVisitIds = new Set<string>();
    const usedFollowupIds = new Set<string>();
    const seenLeadPhones = new Set<string>();

    leads.forEach(l => {
      const status = String(l.status || 'New').trim().toLowerCase();
      if (status === 'converted') return;
      const pk = phoneKey(l.phone);
      if (pk) {
        if (seenLeadPhones.has(pk)) return;
        seenLeadPhones.add(pk);
      }

      const visit = visitByLeadId.get(String(l.id)) || (pk ? visitByPhone.get(pk) : undefined);
      const fu = fuByContactId.get(String(l.id)) || (pk ? fuByPhone.get(pk) : undefined);

      let stageId: JaminStageId = 'leads';
      let stageEnteredAt = l.createdAt || nowIso;
      let detail: string | undefined;
      if (NOT_INTERESTED_STATUSES.includes(status)) {
        stageId = 'not-interested';
        stageEnteredAt = l.updatedAt || stageEnteredAt;
      } else if (status === 'interested') {
        stageId = 'interested';
        stageEnteredAt = l.updatedAt || stageEnteredAt;
      } else if (visit || status.includes('site visit')) {
        stageId = 'site-visit';
        stageEnteredAt = visit?.scheduledAt || visit?.createdAt || l.updatedAt || stageEnteredAt;
        if (visit) {
          detail = `${visit.projectName || 'Site visit'} • ${visit.status}${visit.scheduledAt ? ` • ${new Date(visit.scheduledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}`;
        }
      } else if (fu || FOLLOWUP_STATUSES.includes(status)) {
        stageId = 'follow-up';
        stageEnteredAt = fu?.scheduledAt || l.updatedAt || stageEnteredAt;
        if (fu?.scheduledAt) {
          detail = `Follow-up • ${new Date(fu.scheduledAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
        }
      }
      if (visit) usedVisitIds.add(String(visit.id));
      if (fu) usedFollowupIds.add(String(fu.id));

      const person = resolvePerson(l.assignedAgentId, l.assignedAgentName);
      result.push({
        id: `lead-${l.id}`,
        kind: 'lead',
        leadId: String(l.id),
        stageId,
        title: l.name,
        phone: l.phone || '',
        email: l.email || '',
        location: l.location,
        assignedPersonId: person.id,
        assignedPersonName: person.name,
        stageEnteredAt,
        createdAt: l.createdAt || nowIso,
        lastActivityDate: l.updatedAt || l.createdAt || nowIso,
        amount: l.customFields?.budgetRange || (l as any).budgetRange || l.customFields?.investmentCapacity || undefined,
        detail,
      });
    });

    // Site visits not linked to any lead on the board (e.g. customer visits)
    activeVisits.forEach(v => {
      if (usedVisitIds.has(String(v.id))) return;
      const pk = phoneKey(v.customerPhone || v.leadPhone);
      if (pk && seenLeadPhones.has(pk)) return;
      const person = resolvePerson(v.assignedAgentId, v.assignedAgentName);
      result.push({
        id: `sv-${v.id}`,
        kind: 'site-visit',
        stageId: 'site-visit',
        title: v.customerName || v.leadName || 'Site Visit',
        phone: v.customerPhone || v.leadPhone || '',
        email: '',
        assignedPersonId: person.id,
        assignedPersonName: person.name,
        stageEnteredAt: v.scheduledAt || v.createdAt || nowIso,
        createdAt: v.createdAt || v.scheduledAt || nowIso,
        lastActivityDate: v.scheduledAt || v.createdAt || nowIso,
        detail: `${v.projectName || 'Site visit'} • ${v.status}`,
      });
    });

    // Pending follow-ups not linked to a lead on the board
    pendingFollowups.forEach(f => {
      if (usedFollowupIds.has(String(f.id))) return;
      const pk = phoneKey(f.contactPhone);
      if (pk && seenLeadPhones.has(pk)) return;
      const person = resolvePerson(f.assignedAgentId, f.assignedAgentName);
      result.push({
        id: `fu-${f.id}`,
        kind: 'followup',
        stageId: 'follow-up',
        title: f.contactName || 'Follow-up',
        phone: f.contactPhone || '',
        email: '',
        assignedPersonId: person.id,
        assignedPersonName: person.name,
        stageEnteredAt: f.scheduledAt || nowIso,
        createdAt: (f as any).createdAt || f.scheduledAt || nowIso,
        lastActivityDate: (f as any).updatedAt || f.scheduledAt || nowIso,
        detail: f.scheduledAt
          ? `Follow-up • ${new Date(f.scheduledAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
          : undefined,
      });
    });

    return result;
  }, [leads, followups, siteVisits, resolvePerson]);

  // ── Filters ───────────────────────────────────────────────────────────────
  const isDateInFilter = (iso: string): boolean => {
    if (datePreset === 'all') return true;
    if (!iso) return true;
    const target = new Date(iso).getTime();
    if (Number.isNaN(target)) return true;
    const now = new Date();
    if (datePreset === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      return target >= start && target < start + 86400000;
    }
    if (datePreset === 'this_week') return target >= now.getTime() - 7 * 86400000;
    if (datePreset === 'this_month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      return target >= monthStart;
    }
    if (datePreset === 'custom') {
      const start = customStartDate ? new Date(`${customStartDate}T00:00:00`).getTime() : 0;
      const end = customEndDate ? new Date(`${customEndDate}T23:59:59`).getTime() : Infinity;
      return target >= start && target <= end;
    }
    return true;
  };

  const filteredCards = useMemo(() => cards.filter(c => {
    if (selectedPerson !== 'All') {
      if (c.assignedPersonName.toLowerCase() !== selectedPerson.toLowerCase() && c.assignedPersonId !== selectedPerson) return false;
    }
    return isDateInFilter(c.lastActivityDate || c.createdAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [cards, selectedPerson, datePreset, customStartDate, customEndDate]);

  const personOptions = useMemo(() => {
    const map = new Map<string, string>();
    salesUsers.forEach(u => map.set(u.name.toLowerCase(), u.name));
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
  }, [salesUsers]);

  // ── Stage moves (lead cards only) ─────────────────────────────────────────
  const STATUS_FOR_STAGE: Partial<Record<JaminStageId, string>> = {
    leads: 'New',
    'follow-up': 'Follow-up Required',
    interested: 'Interested',
    'not-interested': 'Not Interested',
  };

  const moveCard = async (card: JaminCard, target: JaminStageId) => {
    if (card.stageId === target) return;
    if (card.kind !== 'lead' || !card.leadId) {
      showToast('Only lead records can be moved. Manage follow-ups and site visits from their own pages.');
      return;
    }
    if (target === 'site-visit') {
      showToast('Schedule the site visit from the Site Visits page — the lead will move here automatically.');
      return;
    }
    const lead = leads.find(l => String(l.id) === card.leadId);
    const newStatus = STATUS_FOR_STAGE[target];
    if (!lead || !newStatus) return;
    setIsMoving(true);
    try {
      await apiSaveLead({ ...lead, status: newStatus as Lead['status'] });
      setLeads(prev => prev.map(l => (String(l.id) === card.leadId ? { ...l, status: newStatus as Lead['status'], updatedAt: new Date().toISOString() } : l)));
      setSelectedCard(prev => (prev && prev.id === card.id ? { ...prev, stageId: target } : prev));
      showToast(`✓ "${card.title}" moved to ${JAMIN_ADMIN_STAGES.find(s => s.id === target)?.name}`);
      loadData();
    } catch (err: any) {
      console.error('[JaminAdminKanbanBoard] stage update failed', err);
      showToast(`❌ Could not move lead: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsMoving(false);
    }
  };

  const getDaysInStage = (card: JaminCard) => {
    const time = new Date(card.stageEnteredAt || card.createdAt).getTime();
    if (Number.isNaN(time)) return 0;
    return Math.max(0, Math.floor((Date.now() - time) / 86400000));
  };

  const handleDrop = async (e: React.DragEvent, target: JaminStageId) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    const card = cards.find(c => c.id === id);
    if (card) await moveCard(card, target);
  };

  return (
    <div className="admin-kanban-wrapper">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1 className="page-title">
            <KanbanIcon size={24} color="var(--primary-600)" /> {tenant?.name || 'Jamin Bazaar'} Sales Pipeline
          </h1>
          <p className="page-subtitle">
            Track every lead across your sales executives — from first contact to site visit and final decision.
          </p>
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <div className="admin-kanban-filterbar">
        <div className="admin-kanban-filter-group">
          <div className="kanban-filter-item">
            <label htmlFor="jamin-kanban-person" className="kanban-filter-label">
              <User size={14} color="var(--text-muted)" />
              Person:
            </label>
            <select
              id="jamin-kanban-person"
              name="person"
              className="kanban-filter-select"
              value={selectedPerson}
              onChange={e => setSelectedPerson(e.target.value)}
            >
              <option value="All">All Sales Executives</option>
              {personOptions.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
              <option value="Unassigned">Unassigned</option>
            </select>
          </div>

          <div className="kanban-filter-item">
            <label htmlFor="jamin-kanban-date" className="kanban-filter-label">
              <Calendar size={14} color="var(--text-muted)" />
              Date Range:
            </label>
            <select
              id="jamin-kanban-date"
              name="dateRangePreset"
              className="kanban-filter-select"
              value={datePreset}
              onChange={e => setDatePreset(e.target.value as DatePreset)}
            >
              <option value="all">All Records</option>
              <option value="today">Today</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="custom">Custom Date Range</option>
            </select>
          </div>

          {datePreset === 'custom' && (
            <div className="kanban-date-custom-inputs">
              <input
                type="date"
                className="kanban-date-input"
                value={customStartDate}
                onChange={e => setCustomStartDate(e.target.value)}
                aria-label="Start Date"
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>to</span>
              <input
                type="date"
                className="kanban-date-input"
                value={customEndDate}
                onChange={e => setCustomEndDate(e.target.value)}
                aria-label="End Date"
              />
            </div>
          )}
        </div>

        <div className="admin-kanban-meta-group">
          <span className="pipeline-role-tag tag-sales-exec">
            <Briefcase size={13} /> Sales Executive Pipeline
          </span>
          <span className="pipeline-total-badge">
            Total Records: <strong>{filteredCards.length}</strong>
          </span>
          <button className="btn btn-secondary btn-sm" onClick={() => { setIsLoading(true); loadData(); }} title="Refresh pipeline">
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          </button>
          {onOpenQuickCreate && (
            <button className="btn btn-primary btn-sm" onClick={() => onOpenQuickCreate('lead')}>
              <Plus size={14} /> New Lead
            </button>
          )}
        </div>
      </div>

      {loadError && (
        <div style={{ padding: '10px 14px', marginBottom: 12, borderRadius: 8, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 13 }}>
          {loadError}
        </div>
      )}

      {/* ── Board ─────────────────────────────────────────────────────────── */}
      <div className="admin-kanban-board">
        {JAMIN_ADMIN_STAGES.map(stage => {
          const stageCards = filteredCards.filter(c => c.stageId === stage.id);
          return (
            <div
              key={stage.id}
              className="admin-kanban-column"
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
              onDrop={e => handleDrop(e, stage.id)}
            >
              <div className="admin-kanban-column-header">
                <div>
                  <div className="column-header-title-group">
                    <span className="column-stage-dot" style={{ backgroundColor: stage.color }} />
                    <span className="column-stage-title">{stage.name}</span>
                    <span className="column-stage-count">{stageCards.length}</span>
                  </div>
                  <div className="column-stage-desc" title={stage.description}>{stage.description}</div>
                </div>
              </div>

              <div className="admin-kanban-cards-list">
                {isLoading && cards.length === 0 ? (
                  <div className="admin-kanban-empty-column">Loading…</div>
                ) : stageCards.length === 0 ? (
                  <div className="admin-kanban-empty-column">No records in this stage</div>
                ) : (
                  stageCards.map(card => {
                    const days = getDaysInStage(card);
                    return (
                      <div
                        key={card.id}
                        className="admin-kanban-card"
                        draggable={card.kind === 'lead'}
                        onDragStart={e => {
                          e.dataTransfer.setData('text/plain', card.id);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onClick={() => setSelectedCard(card)}
                      >
                        <div className="admin-card-header">
                          <span className="admin-card-name">{card.title}</span>
                        </div>
                        {(card.phone || card.email) && (
                          <div className="admin-card-contact">
                            {card.phone && (
                              <span className="admin-card-contact-row">
                                <Phone size={12} color="var(--text-muted)" /> {card.phone}
                              </span>
                            )}
                            {card.email && (
                              <span className="admin-card-contact-row">
                                <Mail size={12} color="var(--text-muted)" /> {card.email}
                              </span>
                            )}
                          </div>
                        )}
                        <div className="admin-card-meta-row">
                          <span className="admin-card-assigned-tag">
                            <User size={12} color="var(--primary-600)" />
                            {card.assignedPersonName}
                          </span>
                          <span className="admin-card-duration-tag">
                            <Clock size={11} />
                            {days === 0 ? 'Today' : `${days}d in stage`}
                          </span>
                        </div>
                        {card.detail && (
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>{card.detail}</div>
                        )}
                        {card.amount && (
                          <div className="admin-card-footer">
                            <span className="admin-card-amount">{card.amount}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Card detail drawer ────────────────────────────────────────────── */}
      <Drawer
        isOpen={!!selectedCard}
        onClose={() => setSelectedCard(null)}
        title={selectedCard?.title || 'Pipeline Record'}
        subtitle={selectedCard ? `Sales Executive Pipeline • ${JAMIN_ADMIN_STAGES.find(s => s.id === selectedCard.stageId)?.name}` : undefined}
        width={480}
      >
        {selectedCard && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              {selectedCard.phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Phone size={14} /> {selectedCard.phone}</div>
              )}
              {selectedCard.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Mail size={14} /> {selectedCard.email}</div>
              )}
              {selectedCard.location && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><MapPin size={14} /> {selectedCard.location}</div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <User size={14} /> Sales Executive: <strong>{selectedCard.assignedPersonName}</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={14} /> {getDaysInStage(selectedCard) === 0 ? 'Entered stage today' : `${getDaysInStage(selectedCard)} days in stage`}
              </div>
              {selectedCard.amount && <div>Budget Range: <strong>{selectedCard.amount}</strong></div>}
              {selectedCard.detail && <div style={{ color: 'var(--text-secondary)' }}>{selectedCard.detail}</div>}
            </div>

            {selectedCard.kind === 'lead' ? (
              <div className="form-group">
                <label htmlFor="jamin-kanban-move" className="form-label">Move to stage</label>
                <select
                  id="jamin-kanban-move"
                  className="form-select"
                  value={selectedCard.stageId}
                  disabled={isMoving}
                  onChange={e => moveCard(selectedCard, e.target.value as JaminStageId)}
                >
                  {JAMIN_ADMIN_STAGES.map(s => (
                    <option key={s.id} value={s.id} disabled={s.id === 'site-visit' && selectedCard.stageId !== 'site-visit'}>
                      {s.name}{s.id === 'site-visit' && selectedCard.stageId !== 'site-visit' ? ' (schedule from Site Visits)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                This {selectedCard.kind === 'site-visit' ? 'site visit' : 'follow-up'} is managed from its own page.
              </div>
            )}
          </div>
        )}
      </Drawer>

      {toast && (
        <div
          style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999, padding: '12px 18px', borderRadius: 8,
            background: 'var(--bg-surface)', border: '1px solid var(--border-base)', boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            color: 'var(--text-primary)', fontSize: 13, maxWidth: 420,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
};
