import React, { useState, useEffect, useMemo } from 'react';
import {
  Ticket,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  Plus,
  RefreshCw,
  Building2,
  User,
  Mail,
  ShieldAlert,
  MessageSquare,
  Send,
  Calendar,
  X,
  Radio,
  FileText,
} from 'lucide-react';
import { PlatformTicket, TicketTimelineEvent, Tenant } from '../../../types';
import { superAdminService } from '../../../services/superAdminService';
import { Modal } from '../../../components/common/Modal';
import './PlatformTicketsPage.css';

type StatusFilter = 'all' | 'open' | 'in_progress' | 'escalated' | 'resolved' | 'closed';

export const PlatformTicketsPage: React.FC = () => {
  const [tickets, setTickets] = useState<PlatformTicket[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [successMsg, setSuccessMsg] = useState('');

  // Selected Ticket for Workbench / Drawer Modal
  const [selectedTicket, setSelectedTicket] = useState<PlatformTicket | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [newNoteMessage, setNewNoteMessage] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [resolutionInput, setResolutionInput] = useState('');

  // Log Incident Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formCategory, setFormCategory] = useState('Telephony / Carrier Trunk');
  const [formPriority, setFormPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('high');
  const [formTenantId, setFormTenantId] = useState<string>('all');
  const [formDescription, setFormDescription] = useState('');
  const [formReporterEmail, setFormReporterEmail] = useState('noc@nexussales.internal');

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 4000);
  };

  const loadData = async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const [ticketList, tenantList] = await Promise.all([
        superAdminService.fetchPlatformTicketsApi({
          status: statusFilter !== 'all' ? statusFilter : undefined,
          priority: priorityFilter !== 'all' ? priorityFilter : undefined,
          category: categoryFilter !== 'all' ? categoryFilter : undefined,
          search: searchQuery.trim() || undefined,
        }),
        superAdminService.fetchTenantsFromApi().catch(() => []),
      ]);

      setTickets(ticketList);
      setTenants(tenantList || []);
      if (isManual) {
        showSuccess('Incident tickets and telemetry refreshed.');
      }
    } catch (err: any) {
      console.error('Failed to load tickets:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [statusFilter, priorityFilter, categoryFilter]);

  // Derived KPI metrics
  const kpis = useMemo(() => {
    const total = tickets.length;
    const critical = tickets.filter(t => t.priority === 'critical' || t.priority === 'high').length;
    const inProgress = tickets.filter(t => t.status === 'in_progress' || t.status === 'escalated').length;
    const resolved = tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;
    return { total, critical, inProgress, resolved };
  }, [tickets]);

  // Client-side search filtering
  const filteredTickets = useMemo(() => {
    if (!searchQuery.trim()) return tickets;
    const q = searchQuery.toLowerCase().trim();
    return tickets.filter(
      t =>
        t.ticketNumber.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        (t.tenantName && t.tenantName.toLowerCase().includes(q)) ||
        t.category.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    );
  }, [tickets, searchQuery]);

  // Handlers
  const handleOpenDetail = (ticket: PlatformTicket) => {
    setSelectedTicket(ticket);
    setResolutionInput(ticket.resolutionNotes || '');
    setIsDetailModalOpen(true);
  };

  const handleStatusChange = async (nextStatus: 'open' | 'in_progress' | 'escalated' | 'resolved' | 'closed') => {
    if (!selectedTicket) return;
    setIsUpdatingStatus(true);
    try {
      const updated = await superAdminService.updateTicketStatusApi(
        selectedTicket.id,
        nextStatus,
        `Status transitioned to ${nextStatus.toUpperCase()}`,
        nextStatus === 'resolved' ? resolutionInput || 'Resolved by Super Admin Operations Team' : undefined
      );
      setSelectedTicket(updated);
      setTickets(prev => prev.map(t => (t.id === updated.id ? updated : t)));
      showSuccess(`Ticket ${updated.ticketNumber} marked as ${nextStatus.toUpperCase()}.`);
    } catch (err: any) {
      alert(err.message || 'Failed to update ticket status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handlePriorityChange = async (nextPriority: string) => {
    if (!selectedTicket) return;
    try {
      const updated = await superAdminService.updateTicketPriorityApi(selectedTicket.id, nextPriority);
      setSelectedTicket(updated);
      setTickets(prev => prev.map(t => (t.id === updated.id ? updated : t)));
      showSuccess(`Priority adjusted to ${nextPriority.toUpperCase()}.`);
    } catch (err: any) {
      alert(err.message || 'Failed to update priority');
    }
  };

  const handleAddTimelineNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !newNoteMessage.trim()) return;
    setIsAddingNote(true);
    try {
      const updated = await superAdminService.addTicketNoteApi(selectedTicket.id, newNoteMessage.trim());
      setSelectedTicket(updated);
      setTickets(prev => prev.map(t => (t.id === updated.id ? updated : t)));
      setNewNoteMessage('');
      showSuccess('Operational update appended to investigation timeline.');
    } catch (err: any) {
      alert(err.message || 'Failed to append note');
    } finally {
      setIsAddingNote(false);
    }
  };

  const handleCreateTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formDescription.trim()) return;

    setIsCreating(true);
    try {
      const tenantMatch = formTenantId !== 'all' ? tenants.find(t => String(t.id) === formTenantId) : null;
      const created = await superAdminService.createPlatformTicketApi({
        title: formTitle.trim(),
        description: formDescription.trim(),
        category: formCategory,
        priority: formPriority,
        tenantId: tenantMatch ? Number(tenantMatch.id) : undefined,
        reportedByName: 'NOC Super Admin',
        reportedByEmail: formReporterEmail.trim(),
      });

      setTickets(prev => [created, ...prev]);
      setIsCreateModalOpen(false);
      setFormTitle('');
      setFormDescription('');
      showSuccess(`Incident ticket ${created.ticketNumber} logged and broadcasted to engineering queue.`);
    } catch (err: any) {
      alert(err.message || 'Failed to log incident ticket');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="platform-tickets-page-container">
      {/* Header */}
      <div className="tickets-page-header">
        <div>
          <div className="header-breadcrumbs">
            <span>PLATFORM CONSOLE</span> &gt; <span className="current">INCIDENT & TECHNICAL HELPDESK</span>
          </div>
          <h1 className="page-main-title">Platform Incident & Technical Helpdesk</h1>
          <p className="page-main-desc">
            Cross-tenant issue triaging, SIP carrier trunk outages, Speech AI latency alerts, and SLA resolution tracking.
          </p>
        </div>

        <div className="tickets-header-actions">
          <button
            className="btn btn-ghost"
            onClick={() => loadData(true)}
            disabled={isRefreshing}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            <RefreshCw size={15} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh Telemetry
          </button>
          <button
            className="btn-new-ticket"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus size={16} />
            Log Incident Ticket
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="system-success-alert">
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {/* KPI 4-Grid */}
      <div className="tickets-kpi-grid">
        <div className="ticket-kpi-card active">
          <div className="kpi-header">
            <span className="kpi-title">TOTAL PLATFORM TICKETS</span>
            <Ticket size={18} color="#f59e0b" />
          </div>
          <div className="kpi-val">{kpis.total}</div>
          <div className="kpi-sub">
            <span>Across all active customer tenants</span>
          </div>
        </div>

        <div className="ticket-kpi-card critical">
          <div className="kpi-header">
            <span className="kpi-title">CRITICAL & HIGH OUTAGES</span>
            <ShieldAlert size={18} color="#ef4444" />
          </div>
          <div className="kpi-val" style={{ color: '#ef4444' }}>{kpis.critical}</div>
          <div className="kpi-sub">
            <span>Requiring immediate L3 intervention</span>
          </div>
        </div>

        <div className="ticket-kpi-card progress">
          <div className="kpi-header">
            <span className="kpi-title">ACTIVE INVESTIGATIONS</span>
            <Clock size={18} color="#38bdf8" />
          </div>
          <div className="kpi-val" style={{ color: '#38bdf8' }}>{kpis.inProgress}</div>
          <div className="kpi-sub">
            <span>In Progress or Escalated to Carrier</span>
          </div>
        </div>

        <div className="ticket-kpi-card resolved">
          <div className="kpi-header">
            <span className="kpi-title">RESOLVED / ARCHIVED</span>
            <CheckCircle2 size={18} color="#10b981" />
          </div>
          <div className="kpi-val" style={{ color: '#10b981' }}>{kpis.resolved}</div>
          <div className="kpi-sub">
            <span>Successfully closed with verified SLA</span>
          </div>
        </div>
      </div>

      {/* Filters & Status Tabs */}
      <div className="tickets-filters-bar">
        <div className="filter-row-top">
          <div className="search-box-wrap">
            <Search size={16} />
            <input
              type="text"
              className="tickets-search-input"
              placeholder="Search by ticket #, title, tenant, keyword..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="filter-dropdowns">
            <select
              className="filter-select"
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
            >
              <option value="all">All Priorities</option>
              <option value="critical">Critical (P1)</option>
              <option value="high">High (P2)</option>
              <option value="medium">Medium (P3)</option>
              <option value="low">Low (P4)</option>
            </select>

            <select
              className="filter-select"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
            >
              <option value="all">All Categories</option>
              <option value="Telephony / Carrier Trunk">Telephony / Carrier Trunk</option>
              <option value="Speech AI / Transcription">Speech AI / Transcription</option>
              <option value="Database / Latency">Database / Latency</option>
              <option value="Security & Auth">Security & Auth</option>
              <option value="Tenant Operational">Tenant Operational</option>
            </select>
          </div>
        </div>

        <div className="status-tabs-row">
          {(['all', 'open', 'in_progress', 'escalated', 'resolved', 'closed'] as StatusFilter[]).map(st => {
            const count =
              st === 'all'
                ? tickets.length
                : tickets.filter(t => t.status === st).length;

            return (
              <button
                key={st}
                className={`status-tab-btn ${statusFilter === st ? 'active' : ''}`}
                onClick={() => setStatusFilter(st)}
              >
                <span>{st === 'all' ? 'All Incidents' : st.replace('_', ' ').toUpperCase()}</span>
                <span className="status-count-badge">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tickets Table */}
      <div className="tickets-table-card">
        <div className="table-responsive">
          <table className="tickets-table">
            <thead>
              <tr>
                <th>Ticket ID</th>
                <th>Incident Title & Category</th>
                <th>Affected Tenant</th>
                <th>Priority</th>
                <th>Status</th>
                <th>Submitter / Channel</th>
                <th>Last Update</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && tickets.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px', color: '#38bdf8' }} />
                    <div>Loading incident tickets and operational telemetry...</div>
                  </td>
                </tr>
              ) : filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    <Ticket size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                    <div>No support tickets match the selected filter criteria.</div>
                  </td>
                </tr>
              ) : (
                filteredTickets.map(ticket => (
                  <tr key={ticket.id}>
                    <td>
                      <span className="ticket-number-tag">{ticket.ticketNumber}</span>
                    </td>
                    <td>
                      <span
                        className="ticket-title-link"
                        onClick={() => handleOpenDetail(ticket)}
                      >
                        {ticket.title}
                      </span>
                      <div className="ticket-cat-sub">
                        <span>{ticket.category}</span>
                        {ticket.timeline && ticket.timeline.length > 0 && (
                          <>
                            <span>•</span>
                            <span>{ticket.timeline.length} updates</span>
                          </>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Building2 size={13} style={{ color: '#94a3b8' }} />
                        <span style={{ fontSize: '13px', color: '#e2e8f0', fontWeight: 500 }}>
                          {ticket.tenantName || 'Platform-wide / Global'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`priority-pill ${ticket.priority}`}>
                        {ticket.priority === 'critical' && <AlertTriangle size={11} />}
                        {ticket.priority}
                      </span>
                    </td>
                    <td>
                      <span className={`status-badge-ticket ${ticket.status}`}>
                        {ticket.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '12px', color: '#cbd5e1' }}>{ticket.reportedByName}</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{ticket.reportedByEmail}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                        {new Date(ticket.updatedAt || ticket.createdAt).toLocaleDateString()}
                      </div>
                      <div style={{ fontSize: '10px', color: '#64748b' }}>
                        {new Date(ticket.updatedAt || ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleOpenDetail(ticket)}
                        style={{ fontSize: '12px', color: '#38bdf8' }}
                      >
                        Triage & Investigate
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TICKET DETAILS & TRIAGE MODAL */}
      {/* ========================================================================= */}
      {isDetailModalOpen && selectedTicket && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          title={`Incident Workbench — ${selectedTicket.ticketNumber}`}
          size="lg"
        >
          <div className="ticket-drawer-content">
            {/* Header Meta Box */}
            <div className="drawer-header-meta">
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                  {selectedTicket.title}
                </h3>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>Tenant: <strong>{selectedTicket.tenantName || 'Global Platform'}</strong></span>
                  <span>•</span>
                  <span>Category: <strong>{selectedTicket.category}</strong></span>
                  <span>•</span>
                  <span>Logged: {new Date(selectedTicket.createdAt).toLocaleString()}</span>
                </div>
              </div>

              <div className="drawer-controls-bar">
                <select
                  className="filter-select"
                  value={selectedTicket.priority}
                  onChange={e => handlePriorityChange(e.target.value)}
                >
                  <option value="critical">Critical (P1)</option>
                  <option value="high">High (P2)</option>
                  <option value="medium">Medium (P3)</option>
                  <option value="low">Low (P4)</option>
                </select>

                <select
                  className="filter-select"
                  value={selectedTicket.status}
                  onChange={e => handleStatusChange(e.target.value as any)}
                  disabled={isUpdatingStatus}
                >
                  <option value="open">Open (Unassigned)</option>
                  <option value="in_progress">In Progress (Active)</option>
                  <option value="escalated">Escalated (Carrier L3)</option>
                  <option value="resolved">Resolved (Completed)</option>
                  <option value="closed">Closed (Archived)</option>
                </select>
              </div>
            </div>

            {/* Description & Technical Findings */}
            <div className="ticket-detail-box">
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                Incident Synopsis & Technical Impact
              </span>
              <p style={{ margin: 0, fontSize: '13px', color: '#cbd5e1', lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                {selectedTicket.description}
              </p>
            </div>

            {/* Resolution Section if Resolved */}
            {selectedTicket.status === 'resolved' && (
              <div style={{ background: 'rgba(52, 211, 153, 0.1)', border: '1px solid rgba(52, 211, 153, 0.3)', borderRadius: '10px', padding: '14px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#34d399', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={13} /> Resolution Notes & Post-Mortem Summary
                </span>
                <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#e2e8f0' }}>
                  {selectedTicket.resolutionNotes || 'Operational resolution verified.'}
                </p>
              </div>
            )}

            {/* Timeline Events / Updates Feed */}
            <div>
              <h4 style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MessageSquare size={14} style={{ color: '#38bdf8' }} />
                Investigation Activity & Carrier Timeline ({selectedTicket.timeline ? selectedTicket.timeline.length : 0})
              </h4>

              <div className="ticket-timeline-stream">
                {!selectedTicket.timeline || selectedTicket.timeline.length === 0 ? (
                  <div style={{ fontSize: '12px', color: '#64748b', textAlign: 'center', padding: '16px' }}>
                    No investigation notes recorded yet. Post a status note below.
                  </div>
                ) : (
                  selectedTicket.timeline.map((ev, idx) => (
                    <div
                      key={ev.id || idx}
                      className={`timeline-event-card ${ev.type === 'status_change' ? 'status-event' : ''}`}
                    >
                      <div className="timeline-author-row">
                        <span style={{ fontWeight: 600, color: '#38bdf8' }}>{ev.authorName || 'Platform Operations'}</span>
                        <span>{new Date(ev.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="timeline-msg">{ev.message}</div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Add Timeline Note Form */}
            <form onSubmit={handleAddTimelineNote} className="note-input-wrap">
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1' }}>
                Post Operational Note / Engineering Diagnostic Update
              </label>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  className="form-control"
                  placeholder="e.g. Tata Teleservices confirmed trunk saturation in Bangalore zone. Failover activated."
                  value={newNoteMessage}
                  onChange={e => setNewNoteMessage(e.target.value)}
                  disabled={isAddingNote}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!newNoteMessage.trim() || isAddingNote}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
                >
                  <Send size={14} />
                  {isAddingNote ? 'Posting...' : 'Post Note'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* LOG NEW INCIDENT MODAL */}
      {/* ========================================================================= */}
      {isCreateModalOpen && (
        <Modal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          title="🚨 Log Platform Incident / Carrier Ticket"
          size="md"
        >
          <form onSubmit={handleCreateTicketSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label required">Incident Title</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. SIP Trunk Handshake Failure on Airtel Secondary DID Gateway"
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                required
              />
            </div>

            <div className="form-grid-two">
              <div className="form-group">
                <label className="form-label">Category</label>
                <select
                  className="form-control"
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value)}
                >
                  <option value="Telephony / Carrier Trunk">Telephony / Carrier Trunk</option>
                  <option value="Speech AI / Transcription">Speech AI / Transcription</option>
                  <option value="Database / Latency">Database / Latency</option>
                  <option value="Security & Auth">Security & Auth</option>
                  <option value="Tenant Operational">Tenant Operational</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Priority Level</label>
                <select
                  className="form-control"
                  value={formPriority}
                  onChange={e => setFormPriority(e.target.value as any)}
                >
                  <option value="critical">Critical (Immediate Outage / P1)</option>
                  <option value="high">High (Degraded Performance / P2)</option>
                  <option value="medium">Medium (Standard Issue / P3)</option>
                  <option value="low">Low (Cosmetic / P4)</option>
                </select>
              </div>
            </div>

            <div className="form-grid-two">
              <div className="form-group">
                <label className="form-label">Impacted Tenant (Company)</label>
                <select
                  className="form-control"
                  value={formTenantId}
                  onChange={e => setFormTenantId(e.target.value)}
                >
                  <option value="all">Platform-wide / Global Infrastructure</option>
                  {tenants.map(t => (
                    <option key={t.id} value={String(t.id)}>
                      {t.name} ({t.slug})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Reporter Contact Email</label>
                <input
                  type="email"
                  className="form-control"
                  value={formReporterEmail}
                  onChange={e => setFormReporterEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label required">Detailed Incident Description & Technical Logs</label>
              <textarea
                className="form-control"
                rows={4}
                placeholder="Include error codes (e.g. SIP 503 Service Unavailable), caller numbers, affected timestamps, and symptoms."
                value={formDescription}
                onChange={e => setFormDescription(e.target.value)}
                required
              />
            </div>

            <div className="modal-actions-footer">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setIsCreateModalOpen(false)}
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!formTitle.trim() || !formDescription.trim() || isCreating}
              >
                {isCreating ? 'Logging Incident...' : 'Submit Incident Ticket'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
