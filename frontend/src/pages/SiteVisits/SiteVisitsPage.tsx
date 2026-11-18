import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, Plus, CheckCircle2, Phone, RefreshCw, Lock, Edit, Trash2 } from 'lucide-react';
import { SiteVisit, Lead, Customer } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useCall } from '../../context/CallContext';
import { DataTable, Column, RowAction } from '../../components/common/DataTable';
import { FilterBar } from '../../components/common/FilterBar';
import { StatusChip } from '../../components/common/StatusChip';
import { Modal } from '../../components/common/Modal';
import { Drawer } from '../../components/common/Drawer';
import { canPlaceCalls } from '../../utils/agentRoleUtils';
import { jaminApiService } from '../../services/jaminApiService';
import { storageService } from '../../services/storageService';
import { getCustomers } from '../../services/ghlApiService';
import { apiClient } from '../../services/apiClient';
import { toast } from '../../context/ToastContext';
import { SITE_VISIT_TIME_SLOTS, formatSiteVisitSchedule } from '../../constants/siteVisit';
import './SiteVisitsPage.css';

const TIME_SLOTS = SITE_VISIT_TIME_SLOTS;

/** Plot numbers on a visit (a customer can see several); empty for a General Project Tour. */
const visitPlotNumbers = (sv: SiteVisit): string[] => {
  const fromList = (sv.plots || []).map(p => p.plotNumber).filter(Boolean);
  if (fromList.length > 0) return fromList;
  return sv.plotNumber && sv.plotNumber !== 'Layout Tour' ? [sv.plotNumber] : [];
};
const visitPlotLabel = (sv: SiteVisit): string => {
  const nums = visitPlotNumbers(sv);
  if (nums.length === 0) return 'General Project Tour';
  return nums.length === 1 ? nums[0] : `${nums.length} plots: ${nums.join(', ')}`;
};

export const SiteVisitsPage: React.FC = () => {
  const { tenant, user } = useAuth();
  const { initiateCall } = useCall();
  const roleCode = String(user?.role?.code || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const canAssignSiteVisits = ['super_admin', 'company_admin', 'admin'].includes(
    roleCode,
  );

  const [siteVisits, setSiteVisits] = useState<SiteVisit[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [plots, setPlots] = useState<any[]>([]);
  const [filteredPlots, setFilteredPlots] = useState<any[]>([]);
  const [agents, setAgents] = useState<Array<{ id: number; name: string; email: string }>>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);

  // Filters for Status and Visitor Source
  const [statusFilter, setStatusFilter] = useState('All');
  const [visitorFilter, setVisitorFilter] = useState('All');

  // Unified Manage Site Visit modal state (Status change, Reschedule, Complete, Cancel)
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [managingVisit, setManagingVisit] = useState<SiteVisit | null>(null);
  const [manageStatus, setManageStatus] = useState<string>('');
  const [manageVisitDate, setManageVisitDate] = useState('');
  const [manageVisitTimeSlot, setManageVisitTimeSlot] = useState<string>(TIME_SLOTS[0]);
  const [manageProjectId, setManageProjectId] = useState<string>('');
  const [managePlotIds, setManagePlotIds] = useState<string[]>([]);
  const [manageHostAgentId, setManageHostAgentId] = useState<number>(0);
  const [manageHostAgentName, setManageHostAgentName] = useState('');
  const [manageNote, setManageNote] = useState('');
  const [isSubmittingManage, setIsSubmittingManage] = useState(false);

  // Form state
  const [visitorType, setVisitorType] = useState<'lead' | 'customer' | 'new'>('lead');
  const [selectedLeadId, setSelectedLeadId] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [hostAgentId, setHostAgentId] = useState<number>(0);
  const [hostAgentName, setHostAgentName] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedPlotIds, setSelectedPlotIds] = useState<string[]>([]);

  const getTomorrowDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };
  const [visitDate, setVisitDate] = useState(getTomorrowDate);
  const [visitTimeSlot, setVisitTimeSlot] = useState<string>(TIME_SLOTS[0]);
  const [notes, setNotes] = useState('');

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const tenantId = user?.companyId ? String(user.companyId) : 't-jamin-02';
      const [visitsResult, projs, allPlots, agentList, leadsResult, custList] = await Promise.all([
        jaminApiService.getSiteVisits(true)
          .then(data => ({ data, error: '' }))
          .catch(() => ({ data: null as SiteVisit[] | null, error: 'Site visits could not be loaded from the server.' })),
        jaminApiService.getProjects().catch(() => []),
        jaminApiService.getPlots().catch(() => []),
        jaminApiService.getAgents().catch(() => []),
        jaminApiService.getLeads(true)
          .then(data => ({ data, error: '' }))
          .catch(() => ({ data: null as Lead[] | null, error: 'Leads could not be loaded from the server.' })),
        jaminApiService.getCustomers().catch(() => getCustomers(tenantId).catch(() => [])),
      ]);

      // Only overwrite site visits if fresh response succeeded, preserving valid state on failure
      if (visitsResult.data !== null) {
        setSiteVisits(visitsResult.data);
      }
      const aggregatedError = visitsResult.error || leadsResult.error || '';
      setLoadError(aggregatedError);

      if (projs) setProjects(projs);
      if (allPlots) setPlots(allPlots);
      if (agentList && agentList.length > 0) {
        setAgents(agentList);
      }

      const normPhone = (p?: string) => (p || '').replace(/\D/g, '').slice(-10);

      // 1. Deduplicate Customers by phone and name strictly from DB API
      const combinedCustomers = (custList || []) as Customer[];
      const seenCustomerPhones = new Set<string>();
      const seenCustomerNames = new Set<string>();
      const dedupedCustomers: Customer[] = [];

      for (const c of combinedCustomers) {
        if (!c.name) continue; // keep customers without a phone; only exact duplicates (same id or phone) are dropped
        const phoneKey = normPhone(c.phone);
        const nameKey = c.name.trim().toLowerCase();
        if (phoneKey && seenCustomerPhones.has(phoneKey)) continue;
        if (phoneKey) seenCustomerPhones.add(phoneKey);
        if (nameKey) seenCustomerNames.add(nameKey);
        dedupedCustomers.push(c);
      }
      setCustomers(dedupedCustomers);

      // 2. Deduplicate Leads from authoritative API, excluding "Converted" and existing Customers
      if (leadsResult.data !== null) {
        const leadList = leadsResult.data;
        const seenLeadPhones = new Set<string>();
        const seenLeadNames = new Set<string>();
        const dedupedLeads: Lead[] = [];

        for (const l of leadList) {
          if (!l.name || !l.phone) continue;
          // If someone is Converted, they are a customer, not a lead
          if (l.status === 'Converted') continue;

          const phoneKey = normPhone(l.phone);
          const nameKey = l.name.trim().toLowerCase();

          // If this person already exists in Customers, do not show in Leads dropdown
          if (phoneKey && seenCustomerPhones.has(phoneKey)) continue;

          // Deduplicate among leads
          if (phoneKey && seenLeadPhones.has(phoneKey)) continue;

          if (phoneKey) seenLeadPhones.add(phoneKey);
          if (nameKey) seenLeadNames.add(nameKey);
          dedupedLeads.push(l);
        }
        setLeads(dedupedLeads);
      }
    } catch (err) {
      console.error('Failed to load site visit data', err);
      setSiteVisits(prev => (prev.length > 0 ? prev : []));
      setLoadError('Site visits could not be loaded from the server.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.companyId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // When selectedProjectId changes, filter plots to strictly Available plots
  useEffect(() => {
    if (selectedProjectId) {
      setFilteredPlots(plots.filter(p => String(p.projectId) === selectedProjectId && p.status === 'Available'));
    } else {
      setFilteredPlots([]);
    }
    // Keep the chosen plot only while it still belongs to the selected project.
    setSelectedPlotIds(prev => {
      const next = prev.filter(id => plots.some(p => String(p.id) === id && String(p.projectId) === selectedProjectId));
      return next.length === prev.length ? prev : next;
    });
  }, [selectedProjectId, plots]);

  // ── Plot picking happens in Plot Inventory ─────────────────────────────────
  // The form is saved, the rep picks a plot on the Plot Inventory page, and comes back to a restored form.
  const DRAFT_KEY = 'site_visit_draft';
  const PICK_KEY = 'site_visit_plot_pick';
  const SELECTION_KEY = 'site_visit_plot_selection';

  const handlePickPlotFromInventory = () => {
    if (!selectedProjectId) return;
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          visitorType, selectedLeadId, selectedCustomerId, customerName, customerPhone,
          hostAgentId, hostAgentName, selectedProjectId, selectedPlotIds, visitDate, visitTimeSlot, notes,
        }),
      );
      sessionStorage.setItem(PICK_KEY, JSON.stringify({ projectId: selectedProjectId, selectedPlotIds }));
    } catch {
      /* storage unavailable: the plot page still opens, the form just starts empty on return */
    }
    setIsScheduleModalOpen(false);
    window.dispatchEvent(new CustomEvent('nexus_navigate', { detail: 'plots' }));
  };

  const restoredDraftRef = React.useRef(false);
  useEffect(() => {
    if (isLoading || restoredDraftRef.current) return;
    let raw: string | null = null;
    try { raw = sessionStorage.getItem(DRAFT_KEY); } catch { /* ignore */ }
    if (!raw) return;
    restoredDraftRef.current = true;
    try {
      const d = JSON.parse(raw);
      // A draft left behind (the rep wandered off from Plot Inventory) is dropped after 20 minutes instead of popping up later.
      if (!d.savedAt || Date.now() - d.savedAt > 20 * 60 * 1000) return;
      setVisitorType(d.visitorType || 'lead');
      setSelectedLeadId(d.selectedLeadId || '');
      setSelectedCustomerId(d.selectedCustomerId || '');
      setCustomerName(d.customerName || '');
      setCustomerPhone(d.customerPhone || '');
      setHostAgentId(Number(d.hostAgentId) || 0);
      setHostAgentName(d.hostAgentName || '');
      setSelectedProjectId(d.selectedProjectId || '');
      setVisitDate(d.visitDate || getTomorrowDate());
      setVisitTimeSlot(d.visitTimeSlot || TIME_SLOTS[0]);
      setNotes(d.notes || '');

      const sel = sessionStorage.getItem(SELECTION_KEY);
      if (sel) {
        const s = JSON.parse(sel);
        // Coming back from Plot Inventory: the picked plots replace whatever was chosen before.
        if (Array.isArray(s?.plotIds)) {
          setSelectedProjectId(String(s.projectId || d.selectedProjectId || ''));
          setSelectedPlotIds(s.plotIds.map((id: unknown) => String(id)));
        }
      } else if (Array.isArray(d.selectedPlotIds)) {
        setSelectedPlotIds(d.selectedPlotIds.map((id: unknown) => String(id)));
      }
      setIsScheduleModalOpen(true);
    } catch {
      /* corrupt draft: ignore */
    } finally {
      try {
        sessionStorage.removeItem(DRAFT_KEY);
        sessionStorage.removeItem(PICK_KEY);
        sessionStorage.removeItem(SELECTION_KEY);
      } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // ── Visitor Type & Record Selection ────────────────────────────────────────
  // A customer can have only one open visit: spot it as soon as they are picked, and offer to reschedule it instead.
  const CLOSED_VISIT_STATUSES = ['Cancelled', 'No-show', 'Visited', 'Completed'];
  const phoneKeyOf = (p?: string) => (p || '').replace(/\D/g, '').slice(-10);
  const existingOpenVisit = useMemo(() => {
    if (!isScheduleModalOpen) return null;
    const key = phoneKeyOf(customerPhone);
    return siteVisits.find(sv => {
      if (CLOSED_VISIT_STATUSES.includes(sv.status)) return false;
      if (visitorType === 'lead' && selectedLeadId && String(sv.leadId) === String(selectedLeadId)) return true;
      if (visitorType === 'customer' && selectedCustomerId && String(sv.customerId) === String(selectedCustomerId)) return true;
      return key.length >= 10 && phoneKeyOf(sv.customerPhone) === key;
    }) ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isScheduleModalOpen, siteVisits, visitorType, selectedLeadId, selectedCustomerId, customerPhone]);

  // One combined picker: the value encodes the kind and id ("lead:12", "customer:5", "new").
  const visitorSelectValue =
    visitorType === 'new'
      ? 'new'
      : selectedLeadId
        ? `lead:${selectedLeadId}`
        : selectedCustomerId
          ? `customer:${selectedCustomerId}`
          : '';

  const handleVisitorSelect = (value: string) => {
    if (value === 'new') {
      handleVisitorTypeChange('new');
      return;
    }
    const sep = value.indexOf(':');
    const kind = sep > 0 ? value.slice(0, sep) : '';
    const id = sep > 0 ? value.slice(sep + 1) : '';
    if (kind === 'lead') {
      setVisitorType('lead');
      setSelectedCustomerId('');
      handleLeadSelect(id);
    } else if (kind === 'customer') {
      setVisitorType('customer');
      setSelectedLeadId('');
      handleCustomerSelect(id);
    } else {
      handleVisitorTypeChange('lead'); // nothing chosen: clear everything
    }
  };

  const handleVisitorTypeChange = (type: 'lead' | 'customer' | 'new') => {
    setVisitorType(type);
    setSelectedLeadId('');
    setSelectedCustomerId('');
    setCustomerName('');
    setCustomerPhone(type === 'new' ? '+91 ' : '');
  };

  const handleLeadSelect = (leadId: string) => {
    setSelectedLeadId(leadId);
    const lead = leads.find(l => l.id === leadId);
    if (lead) {
      setCustomerName(lead.name);
      setCustomerPhone(lead.phone);
    } else {
      setCustomerName('');
      setCustomerPhone('');
    }
  };

  const handleCustomerSelect = (custId: string) => {
    setSelectedCustomerId(custId);
    const cust = customers.find(c => c.id === custId);
    if (cust) {
      setCustomerName(cust.name);
      setCustomerPhone(cust.phone);
    } else {
      setCustomerName('');
      setCustomerPhone('');
    }
  };

  // ── Modal open / reset ─────────────────────────────────────────────────────
  const handleOpenScheduleModal = () => {
    setVisitorType('lead');
    setSelectedLeadId('');
    setSelectedCustomerId('');
    setCustomerName('');
    setCustomerPhone('');
    // An agent follows the visit up themselves by default (and can hand it to a colleague); admins pick one.
    const defaultAgent = canAssignSiteVisits
      ? agents[0]
      : agents.find(agent => String(agent.id) === String(user?.id));
    setHostAgentId(defaultAgent ? defaultAgent.id : Number(user?.id) || 0);
    setHostAgentName(defaultAgent ? defaultAgent.name : (user?.name || 'Agent'));
    setSelectedProjectId(projects.length > 0 ? String(projects[0].id) : '');
    setSelectedPlotIds([]);
    setVisitDate(getTomorrowDate());
    setVisitTimeSlot(TIME_SLOTS[0]);
    setNotes('');
    setIsScheduleModalOpen(true);
  };

  // ── Schedule submit ────────────────────────────────────────────────────────
  const handleScheduleVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim() || existingOpenVisit) return;

    if (visitorType === 'lead' && !selectedLeadId) {
      alert('Please select a lead from the dropdown.');
      return;
    }
    if (visitorType === 'customer' && !selectedCustomerId) {
      alert('Please select a customer from the dropdown.');
      return;
    }

    const dateFormatted = formatSiteVisitSchedule(visitDate, visitTimeSlot);

    const project = projects.find((p: any) => String(p.id) === selectedProjectId);


    const contactType = visitorType === 'customer' ? 'customer' : 'lead';
    const cleanLeadId = visitorType === 'lead' && selectedLeadId ? selectedLeadId : undefined;
    const cleanCustomerId = visitorType === 'customer' && selectedCustomerId ? selectedCustomerId : undefined;
    const tenantId = user?.companyId ? String(user.companyId) : 't-jamin-02';

    setIsSubmitting(true);
    try {
      const payload = {
        leadId: cleanLeadId ? (Number(cleanLeadId.replace(/\D/g, '')) || Number(cleanLeadId) || undefined) : undefined,
        customerId: cleanCustomerId ? (Number(cleanCustomerId.replace(/\D/g, '')) || Number(cleanCustomerId) || undefined) : undefined,
        contactType,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        projectId: selectedProjectId ? Number(selectedProjectId) : undefined,
        plotIds: selectedPlotIds.map(Number).filter(n => Number.isInteger(n) && n > 0),
        projectName: project?.name ?? '',
        scheduledAt: dateFormatted,
        visitorNote: notes.trim() || undefined,
        assignedAgentId: hostAgentId,
        assignedAgentName: hostAgentName,
      };

      const created = await jaminApiService.scheduleSiteVisit(payload);
      if (!created) {
        throw new Error('The site visit could not be saved. Please try again.');
      }

      // The server is the single source of truth: it saves the visit, updates the lead status and notifies the follow-up agent.

      window.dispatchEvent(new Event('nexus_storage_updated'));
      setIsScheduleModalOpen(false);
      await loadAll();
    } catch (err) {
      // e.g. the customer already has an open visit (the server says which): show its message.
      toast.error(err instanceof Error && err.message ? err.message : "The site visit could not be saved. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Unified Manage Site Visit Handlers ─────────────────────────────────────
  const handleOpenManageModal = (sv: SiteVisit, presetStatus?: string) => {
    setManagingVisit(sv);

    let parsedDate = '';
    let parsedSlot: string = TIME_SLOTS[0];

    if (sv.scheduledAt) {
      const parts = sv.scheduledAt.split(/[·•]/).map(s => s.trim());
      if (parts[0] && /^\d{4}-\d{2}-\d{2}$/.test(parts[0])) {
        parsedDate = parts[0];
      } else if (parts[0]) {
        const d = new Date(parts[0]);
        if (!Number.isNaN(d.getTime())) {
          parsedDate = d.toISOString().split('T')[0];
        }
      }

      const rest = parts.slice(1).join(' ');
      const matched = TIME_SLOTS.find(slot =>
        rest.toLowerCase().includes(slot.toLowerCase().split(/[·•]/)[0].trim().toLowerCase())
      );
      if (matched) {
        parsedSlot = matched;
      }
    }

    if (!parsedDate) {
      parsedDate = new Date().toISOString().split('T')[0];
    }

    setManageVisitDate(parsedDate);
    setManageVisitTimeSlot(parsedSlot);

    const projId = sv.projectId ? String(sv.projectId) : '';
    setManageProjectId(projId);

    // Every plot on the visit (older visits only carry the single plotId).
    const currentPlotIds = (sv.plots && sv.plots.length > 0)
      ? sv.plots.map(p => String(p.plotId))
      : (sv.plotId ? [String(sv.plotId)] : []);
    setManagePlotIds(currentPlotIds);
    const agId = Number(sv.assignedAgentId) || 0;
    setManageHostAgentId(agId);
    setManageHostAgentName(sv.assignedAgentName || '');

    // Opened from "Edit / reschedule" the status starts on Rescheduled; otherwise the rep chooses one.
    setManageStatus(presetStatus ?? "");

    setManageNote(sv.outcomeNotes || sv.visitorNote || '');
    setIsManageModalOpen(true);
  };

  // Auto-open target site visit if redirected from Leads 360 drawer
  useEffect(() => {
    const targetId = sessionStorage.getItem('target_site_visit_id');
    if (targetId && siteVisits.length > 0) {
      sessionStorage.removeItem('target_site_visit_id');
      sessionStorage.removeItem('target_site_visit_lead');
      const found = siteVisits.find(v => v.id === targetId || String(v.id) === String(targetId));
      if (found) {
        handleOpenManageModal(found);
      }
    }
  }, [siteVisits]);

  const handleManageProjectChange = (projId: string) => {
    setManageProjectId(projId);
    // Plots belong to a project: keep only the ones that are in the newly chosen project.
    setManagePlotIds(prev => prev.filter(id => plots.some(p => String(p.id) === id && String(p.projectId) === String(projId))));
  };

  // ── Editing the plots of an existing visit also goes through Plot Inventory ──
  const MANAGE_DRAFT_KEY = 'site_visit_manage_draft';

  const handlePickPlotsForManage = () => {
    const projectId = manageProjectId || (managingVisit?.projectId ? String(managingVisit.projectId) : '');
    if (!managingVisit || !projectId) return;
    try {
      sessionStorage.setItem(
        MANAGE_DRAFT_KEY,
        JSON.stringify({
          savedAt: Date.now(),
          visitId: managingVisit.id, manageStatus, manageVisitDate, manageVisitTimeSlot,
          manageProjectId: projectId, managePlotIds, manageHostAgentId, manageHostAgentName, manageNote,
        }),
      );
      sessionStorage.setItem(PICK_KEY, JSON.stringify({ projectId, selectedPlotIds: managePlotIds }));
    } catch {
      /* storage unavailable: Plot Inventory still opens, the dialog just reopens without the edits */
    }
    setIsManageModalOpen(false);
    window.dispatchEvent(new CustomEvent('nexus_navigate', { detail: 'plots' }));
  };

  const restoredManageRef = React.useRef(false);
  useEffect(() => {
    if (isLoading || restoredManageRef.current) return;
    let raw: string | null = null;
    try { raw = sessionStorage.getItem(MANAGE_DRAFT_KEY); } catch { /* ignore */ }
    if (!raw) return;
    restoredManageRef.current = true;
    try {
      const d = JSON.parse(raw);
      // A draft left behind (the rep wandered off from Plot Inventory) is dropped after 20 minutes instead of popping up later.
      if (!d.savedAt || Date.now() - d.savedAt > 20 * 60 * 1000) return;
      const visit = siteVisits.find(v => String(v.id) === String(d.visitId));
      if (visit) {
        handleOpenManageModal(visit, d.manageStatus || 'Rescheduled');
        setManageVisitDate(d.manageVisitDate || manageVisitDate);
        setManageVisitTimeSlot(d.manageVisitTimeSlot || TIME_SLOTS[0]);
        setManageProjectId(String(d.manageProjectId || ''));
        setManageHostAgentId(Number(d.manageHostAgentId) || 0);
        setManageHostAgentName(d.manageHostAgentName || '');
        setManageNote(d.manageNote || '');
        setManagePlotIds(Array.isArray(d.managePlotIds) ? d.managePlotIds.map((id: unknown) => String(id)) : []);
        const sel = sessionStorage.getItem(SELECTION_KEY);
        if (sel) {
          const s = JSON.parse(sel);
          if (Array.isArray(s?.plotIds)) {
            setManageProjectId(String(s.projectId || d.manageProjectId || ''));
            setManagePlotIds(s.plotIds.map((id: unknown) => String(id)));
          }
        }
      }
    } catch {
      /* corrupt draft: ignore */
    } finally {
      try {
        sessionStorage.removeItem(MANAGE_DRAFT_KEY);
        sessionStorage.removeItem(PICK_KEY);
        sessionStorage.removeItem(SELECTION_KEY);
      } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const handleSaveManageVisit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!managingVisit || !manageStatus) return;

    const oldVisit = managingVisit;
    const trimmedNote = manageNote.trim();
    const isRescheduled = manageStatus === 'Rescheduled';

    let formattedSlot = managingVisit.scheduledAt;
    if (isRescheduled) {
      formattedSlot = formatSiteVisitSchedule(manageVisitDate, manageVisitTimeSlot);
    }

    const project = projects.find(p => String(p.id) === String(manageProjectId));
    const originalPlotIds = (oldVisit.plots && oldVisit.plots.length > 0)
      ? oldVisit.plots.map(p => String(p.plotId))
      : (oldVisit.plotId ? [String(oldVisit.plotId)] : []);
    const plotsChanged = isRescheduled &&
      [...managePlotIds].sort().join(',') !== [...originalPlotIds].sort().join(',');
    const chosenPlots = managePlotIds
      .map(id => plots.find((p: any) => String(p.id) === id))
      .filter(Boolean) as any[];

    const updatedVisit: SiteVisit = {
      ...managingVisit,
      status: manageStatus as any,
      scheduledAt: formattedSlot,
      projectId: isRescheduled ? (manageProjectId || managingVisit.projectId) : managingVisit.projectId,
      projectName: isRescheduled ? (project?.name || managingVisit.projectName) : managingVisit.projectName,
      plotId: plotsChanged ? (chosenPlots[0] ? String(chosenPlots[0].id) : undefined) : managingVisit.plotId,
      plotNumber: plotsChanged ? chosenPlots.map(p => p.plotNumber).join(', ') : managingVisit.plotNumber,
      plots: plotsChanged ? chosenPlots.map(p => ({ plotId: String(p.id), plotNumber: p.plotNumber })) : managingVisit.plots,
      assignedAgentId: isRescheduled ? String(manageHostAgentId || managingVisit.assignedAgentId) : managingVisit.assignedAgentId,
      assignedAgentName: isRescheduled ? (manageHostAgentName || managingVisit.assignedAgentName) : managingVisit.assignedAgentName,
      visitorNote: trimmedNote,
      outcomeNotes: trimmedNote,
    };

    // ── 1. INSTANT 0ms OPTIMISTIC UI UPDATE ────────────────────────────────────
    setSiteVisits(prev => prev.map(sv => String(sv.id) === String(updatedVisit.id) ? updatedVisit : sv));
    setIsManageModalOpen(false);
    setManagingVisit(null);
    toast.success(`✓ Site visit updated to "${manageStatus}"!`);

    // ── 2. BACKGROUND SERVER SYNC (Non-blocking) ──────────────────────────────
    try {
      const payload: any = {
        status: manageStatus,
        visitorNote: trimmedNote,
        outcomeNotes: trimmedNote,
      };

      if (isRescheduled) {
        payload.scheduledAt = formattedSlot;
        if (manageProjectId) payload.projectId = Number(manageProjectId);
        if (project?.name) payload.projectName = project.name;
        // The plots are replaced only when the rep changed them, so an untouched visit keeps exactly the plots it has.
        if (plotsChanged) payload.plotIds = managePlotIds.map(Number).filter(n => Number.isInteger(n) && n > 0);
        if (manageHostAgentId) payload.assignedAgentId = manageHostAgentId;
        if (manageHostAgentName) payload.assignedAgentName = manageHostAgentName;
      }

      const updated = await jaminApiService.updateSiteVisit(oldVisit.id, payload);
      if (!updated) {
        throw new Error('Server update failed');
      }

      // Lead status / follow-ups are updated by the server; reload so the row shows the server's assignment details.
      void loadAll();
      storageService.addAuditLog({
        id: `aud-${Date.now()}`,
        timestamp: new Date().toISOString(),
        actorName: user?.name || 'Agent',
        actorEmail: user?.email || 'agent@jaminbazaar.com',
        action: isRescheduled ? 'SITE_VISIT_RESCHEDULED' : `SITE_VISIT_${manageStatus.toUpperCase()}`,
        entityType: 'SiteVisit',
        entityId: String(oldVisit.id),
        companyId: tenant?.id,
        companyName: tenant?.name,
        details: isRescheduled
          ? `Rescheduled visit for ${oldVisit.customerName} to ${formattedSlot}. Note: ${trimmedNote}`
          : `Updated visit status to ${manageStatus} for ${oldVisit.customerName}. Note: ${trimmedNote}`,
      });

      window.dispatchEvent(new Event('nexus_storage_updated'));
    } catch (err: any) {
      console.error('Failed to update visit on backend:', err);
      // Revert optimistic update on error
      setSiteVisits(prev => prev.map(sv => String(sv.id) === String(oldVisit.id) ? oldVisit : sv));
      const msg = err?.response?.data?.message || err?.message || 'Failed to update visit on server. Reverted.';
      toast.error(msg);
    }
  };

  const handleConfirmVisit = async (sv: SiteVisit) => {
    await jaminApiService.confirmSiteVisit(sv.id);
    await loadAll();
  };

  // ── Visit detail card: set the status and remarks ──────────────────────────
  const VISIT_STATUS_CHOICES = ['Pending', 'Visited', 'Revisit'];
  const [detailVisit, setDetailVisit] = useState<SiteVisit | null>(null);
  const [detailStatus, setDetailStatus] = useState<string>('Pending');
  const [detailRemarks, setDetailRemarks] = useState('');
  const [isSavingDetail, setIsSavingDetail] = useState(false);
  // ── Remove a site visit (asks first) ──────────────────────────────────────
  const [visitToRemove, setVisitToRemove] = useState<SiteVisit | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const handleConfirmRemove = async () => {
    if (!visitToRemove) return;
    setIsRemoving(true);
    try {
      const result = await jaminApiService.removeSiteVisit(visitToRemove.id);
      if (!result.success) throw new Error(result.message || 'remove failed');
      toast.success(`Site visit for ${visitToRemove.customerName} removed.`);
      setSiteVisits(prev => prev.filter(v => String(v.id) !== String(visitToRemove.id)));
      if (detailVisit && String(detailVisit.id) === String(visitToRemove.id)) setDetailVisit(null);
      setVisitToRemove(null);
      void loadAll(); // the lead's status may have changed too
    } catch (err) {
      toast.error(err instanceof Error && err.message ? `Could not remove: ${err.message}` : 'Could not remove the site visit. Please try again.');
    } finally {
      setIsRemoving(false);
    }
  };


  // The follow-up agent, the agent who assigned it, and admins can update it; everyone else only sees it.
  const canUpdateVisit = (sv: SiteVisit) =>
    canAssignSiteVisits ||
    (!!user?.id && (String(sv.assignedAgentId) === String(user.id) || String(sv.assignedById) === String(user.id)));

  const openVisitDetail = (sv: SiteVisit) => {
    setDetailVisit(sv);
    setDetailStatus(sv.status || 'Pending');
    setDetailRemarks(sv.outcomeNotes || '');
  };

  const [isReassigning, setIsReassigning] = useState(false);

  /** Hand the follow-up to another agent. The server saves it and notifies them (customer details + who assigned it). */
  const handleReassign = async (newAgentId: string) => {
    if (!detailVisit || !newAgentId || newAgentId === String(detailVisit.assignedAgentId)) return;
    const agent = agents.find(a => String(a.id) === newAgentId);
    if (!agent) return;

    setIsReassigning(true);
    try {
      const result = await jaminApiService.updateSiteVisitDetailed(detailVisit.id, {
        assignedAgentId: agent.id,
        assignedAgentName: agent.name,
      });
      if (!result.success) throw new Error(result.message || 'reassign failed');

      const mine = String(agent.id) === String(user?.id);
      setDetailVisit(prev => prev ? {
        ...prev,
        assignedAgentId: String(agent.id),
        assignedAgentName: agent.name,
        assignedById: user?.id ? String(user.id) : prev.assignedById,
        assignedByName: user?.name || prev.assignedByName,
      } : prev);
      toast.success(mine ? 'Assigned to you.' : `Assigned to ${agent.name}. They have been notified.`);
      void loadAll();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? `Could not assign: ${err.message}` : 'Could not assign the follow-up agent. Please try again.');
    } finally {
      setIsReassigning(false);
    }
  };

  const handleSaveDetail = async () => {
    if (!detailVisit) return;
    const remarks = detailRemarks.trim();
    if (detailStatus !== 'Pending' && VISIT_STATUS_CHOICES.includes(detailStatus) && !remarks) {
      toast.error('Enter remarks before saving a Visited or Revisit status.');
      return;
    }
    setIsSavingDetail(true);
    try {
      const result = await jaminApiService.updateSiteVisitDetailed(detailVisit.id, { status: detailStatus, outcomeNotes: remarks });
      if (!result.success) throw new Error(result.message || 'save failed');
      toast.success(`Site visit saved as ${detailStatus}.`);
      setDetailVisit(null);
      await loadAll();
    } catch (err) {
      toast.error(err instanceof Error && err.message ? `Could not save: ${err.message}` : 'Could not save the status and remarks. Please try again.');
    } finally {
      setIsSavingDetail(false);
    }
  };

  // ── Table columns ──────────────────────────────────────────────────────────
  const columns: Column<SiteVisit>[] = [
    {
      key: 'scheduledAt',
      header: 'Scheduled Slot',
      sortable: true,
      render: sv => (
        <div className="sitevisit-slot-title">{sv.scheduledAt}</div>
      ),
    },
    {
      key: 'customerName',
      header: 'Client Details',
      sortable: true,
      render: sv => (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="sitevisit-client-name">{sv.customerName}</span>
            {sv.contactType && (
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 7px',
                  borderRadius: '10px',
                  background: sv.contactType === 'lead' ? '#eff6ff' : '#ecfdf5',
                  color: sv.contactType === 'lead' ? '#2563eb' : '#059669',
                  border: `1px solid ${sv.contactType === 'lead' ? '#bfdbfe' : '#a7f3d0'}`,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {sv.contactType}
              </span>
            )}
          </div>
          <div className="sitevisit-client-phone">{sv.customerPhone || '—'}</div>
          {sv.customerEmail ? (
            <div className="sitevisit-client-phone" style={{ opacity: 0.8 }}>{sv.customerEmail}</div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'projectName',
      header: 'Project & Plot',
      sortable: true,
      render: sv => (
        <div>
          <div className="sitevisit-project-name">{sv.projectName}</div>
          {visitPlotNumbers(sv).length > 1 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }} title={visitPlotLabel(sv)}>
              {visitPlotNumbers(sv).slice(0, 3).map(n => (
                <span
                  key={n}
                  style={{ fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 999, background: 'rgba(16, 185, 129, 0.12)', color: '#047857' }}
                >
                  {n}
                </span>
              ))}
              {visitPlotNumbers(sv).length > 3 ? (
                <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 8px', borderRadius: 999, background: 'rgba(148, 163, 184, 0.18)', color: '#475569' }}>
                  +{visitPlotNumbers(sv).length - 3} more
                </span>
              ) : null}
            </div>
          ) : (
            <div className="sitevisit-plot-target">
              {visitPlotLabel(sv)}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'assignedAgentName',
      header: 'Follow-up Agent',
      sortable: true,
      render: sv => {
        const agent = sv.assignedAgentName || 'Unassigned';
        const selfTaken = !!sv.assignedById && sv.assignedById === sv.assignedAgentId;
        const assigner = !selfTaken ? sv.assignedByName : '';
        const isMe = !!user?.id && String(sv.assignedAgentId) === String(user.id);
        return (
          <div>
            <span className="sitevisit-agent-name">
              {agent}
              {isMe ? <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#047857' }}>(you)</span> : null}
            </span>
            {assigner ? (
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary, #64748b)', marginTop: 2 }}>
                Assigned by {assigner}
              </div>
            ) : selfTaken ? (
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary, #64748b)', marginTop: 2 }}>
                Self-assigned
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status & Remarks',
      sortable: true,
      render: sv => {
        const remarks = sv.outcomeNotes || '';
        const setByOther = !!sv.statusUpdatedByName && String(sv.statusUpdatedById) !== String(user?.id);
        return (
          <div className="sitevisit-status-cell">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <StatusChip status={sv.status} size="sm" />
            </div>

            {remarks ? (
              <div className="sitevisit-note-text" title={remarks}>
                "{remarks}"
              </div>
            ) : (
              <div style={{ fontSize: 11.5, color: 'var(--text-secondary, #64748b)', marginTop: 2 }}>No remarks yet</div>
            )}
            {setByOther ? (
              <div style={{ fontSize: 11, color: 'var(--text-secondary, #64748b)', marginTop: 2 }}>
                Updated by {sv.statusUpdatedByName}
              </div>
            ) : null}
          </div>
        );
      },
    },
  ];

  const rowActions: RowAction<SiteVisit>[] = [
    ...(canPlaceCalls(user)
      ? [
          {
            label: 'Call Client',
            icon: <Phone size={14} color="#059669" style={{ marginRight: 6 }} />,
            onClick: (sv: SiteVisit) =>
              initiateCall(
                sv.customerName || sv.leadName || 'Client',
                sv.customerPhone || sv.leadPhone || '',
                sv.contactType === 'customer' || sv.customerId ? 'customer' : 'lead',
                sv.customerId ? String(sv.customerId) : sv.leadId ? String(sv.leadId) : undefined
              ),
          },
        ]
      : []),
    {
      label: 'Confirm Visit',
      icon: <CheckCircle2 size={14} color="#059669" style={{ marginRight: 6 }} />,
      hidden: sv => sv.status !== 'Requested',
      onClick: sv => handleConfirmVisit(sv),
    },
    {
      label: 'Reschedule / Edit Plots',
      icon: <Calendar size={14} color="#4f46e5" style={{ marginRight: 6 }} />,
      hidden: sv => CLOSED_VISIT_STATUSES.includes(sv.status),
      onClick: sv => handleOpenManageModal(sv, 'Rescheduled'),
    },
    {
      label: 'Update Status / Reschedule',
      icon: <Edit size={14} color="#4f46e5" style={{ marginRight: 6 }} />,
      onClick: sv => handleOpenManageModal(sv),
    },
    {
      label: 'Remove',
      icon: <Trash2 size={14} color="#dc2626" style={{ marginRight: 6 }} />,
      danger: true,
      hidden: sv => !canUpdateVisit(sv),
      onClick: sv => setVisitToRemove(sv),
    },
  ];

  const filteredSiteVisits = useMemo(() => {
    return siteVisits.filter(sv => {
      if (statusFilter !== 'All') {
        const s = (sv.status || '').toLowerCase().trim();
        if (s !== statusFilter.toLowerCase().trim()) return false;
      }
      if (visitorFilter !== 'All') {
        const ct = (sv.contactType || (sv.customerId ? 'customer' : 'lead')).toLowerCase().trim();
        if (ct !== visitorFilter.toLowerCase().trim()) return false;
      }
      return true;
    });
  }, [siteVisits, statusFilter, visitorFilter]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="sitevisits-page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <Calendar size={24} color="#dc2626" /> Site Visits Log & Scheduling
          </h1>
          <p className="page-subtitle">
            Coordinate customer site walkthroughs — linked to real Projects and Plots for live count tracking.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={loadAll} title="Refresh">
            <RefreshCw size={15} />
          </button>
          <button className="btn btn-primary" onClick={handleOpenScheduleModal}>
            <Plus size={15} /> Schedule Site Visit
          </button>
        </div>
      </div>

      {loadError && (
        <div
          className="card text-center site-visits-error-banner"
          role="alert"
          style={{
            padding: '12px 16px',
            marginBottom: '16px',
            background: 'var(--danger-50, #fef2f2)',
            border: '1px solid var(--danger-200, #fecaca)',
            color: 'var(--danger-700, #b91c1c)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
          }}
        >
          <span>{loadError}</span>
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={() => void loadAll()}
            style={{ fontWeight: 600, cursor: 'pointer' }}
          >
            Retry
          </button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={filteredSiteVisits}
        loading={isLoading}
        keyExtractor={sv => sv.id}
        rowActions={rowActions}
        onRowClick={openVisitDetail}
        searchPlaceholder="Search visits by customer, project, or plot..."
        filtersNode={
          <FilterBar
            filters={[
              {
                key: 'status',
                label: 'Status',
                allLabel: 'All Visit Statuses',
                value: statusFilter,
                onChange: setStatusFilter,
                options: [
                  { value: 'Scheduled', label: 'Scheduled' },
                  { value: 'Completed', label: 'Completed' },
                  { value: 'Rescheduled', label: 'Rescheduled' },
                  { value: 'Cancelled', label: 'Cancelled' },
                  { value: 'Pending', label: 'Pending' },
                  { value: 'Visited', label: 'Visited' },
                  { value: 'Revisit', label: 'Revisit' },
                  { value: 'No-show', label: 'No-show' },
                ],
              },
              {
                key: 'visitor',
                label: 'Visitor Source',
                allLabel: 'All Visitors',
                value: visitorFilter,
                onChange: setVisitorFilter,
                options: [
                  { value: 'lead', label: 'Leads' },
                  { value: 'customer', label: 'Customers' },
                ],
              },
            ]}
            onClearAll={() => {
              setStatusFilter('All');
              setVisitorFilter('All');
            }}
          />
        }
      />

      {/* ── Visit detail card (customer, follow-up agent, status & remarks) ─── */}
      <Drawer
        isOpen={!!detailVisit}
        onClose={() => setDetailVisit(null)}
        title={detailVisit?.customerName || 'Site visit'}
        subtitle="Site visit details"
        size="md"
        footer={
          detailVisit && canUpdateVisit(detailVisit) ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDetailVisit(null)} disabled={isSavingDetail}>
                Close
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={isSavingDetail}
                onClick={() => setVisitToRemove(detailVisit)}
                style={{ color: '#b91c1c', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Trash2 size={14} /> Remove
              </button>
              {!CLOSED_VISIT_STATUSES.includes(detailVisit.status) && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={isSavingDetail}
                  onClick={() => {
                    const sv = detailVisit;
                    setDetailVisit(null);
                    handleOpenManageModal(sv, 'Rescheduled');
                  }}
                >
                  Reschedule / edit plots
                </button>
              )}
              <button type="button" className="btn btn-primary" onClick={handleSaveDetail} disabled={isSavingDetail}>
                {isSavingDetail ? 'Saving…' : 'Save status & remarks'}
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={() => setDetailVisit(null)}>Close</button>
          )
        }
      >
        {detailVisit && (() => {
          const sv = detailVisit;
          const selfTaken = !!sv.assignedById && sv.assignedById === sv.assignedAgentId;
          const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--text-secondary, #64748b)', marginBottom: 2 };
          const card: React.CSSProperties = { border: '1px solid var(--border-base, #e2e8f0)', borderRadius: 10, padding: 14, marginBottom: 14 };
          const statusOptions = VISIT_STATUS_CHOICES.includes(sv.status) ? VISIT_STATUS_CHOICES : [sv.status, ...VISIT_STATUS_CHOICES];
          return (
            <div>
              {/* Customer card */}
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <strong style={{ fontSize: 16 }}>{sv.customerName}</strong>
                  {sv.contactType ? (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, textTransform: 'uppercase', background: sv.contactType === 'lead' ? '#eff6ff' : '#ecfdf5', color: sv.contactType === 'lead' ? '#2563eb' : '#059669' }}>
                      {sv.contactType}
                    </span>
                  ) : null}
                </div>
                <div style={{ fontSize: 14 }}>{sv.customerPhone || '—'}</div>
                {sv.customerEmail ? <div style={{ fontSize: 13, color: 'var(--text-secondary, #64748b)' }}>{sv.customerEmail}</div> : null}
                {canPlaceCalls(user) && sv.customerPhone ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() =>
                      initiateCall(
                        sv.customerName || 'Client',
                        sv.customerPhone || '',
                        sv.contactType === 'customer' || sv.customerId ? 'customer' : 'lead',
                        sv.customerId ? String(sv.customerId) : sv.leadId ? String(sv.leadId) : undefined,
                      )
                    }
                  >
                    <Phone size={14} /> Call
                  </button>
                ) : null}
              </div>

              {/* Visit: project, every plot with its details, slot */}
              <div style={card}>
                <div style={label}>Project</div>
                <div style={{ fontWeight: 600, marginBottom: 12 }}>{sv.projectName || '—'}</div>

                {(() => {
                  // Prefer the visit's own plot list; older visits only carry the single plotId / plotNumber.
                  const source = (sv.plots && sv.plots.length > 0)
                    ? sv.plots.map(p => ({ id: p.plotId, number: p.plotNumber }))
                    : visitPlotNumbers(sv).map(number => ({ id: sv.plotId, number }));
                  const visitPlots = source.map(({ id, number }) => ({
                    number,
                    inventory: id !== undefined ? plots.find((p: any) => String(p.id) === String(id)) : undefined,
                  }));
                  return (
                    <>
                      <div style={label}>{visitPlots.length > 1 ? `Plots (${visitPlots.length})` : 'Plot'}</div>
                      {visitPlots.length === 0 ? (
                        <div style={{ marginBottom: 12 }}>General Project Tour — no specific plot</div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                          {visitPlots.map(({ number, inventory }) => {
                            const details = inventory
                              ? [
                                  inventory.facing ? `${inventory.facing} facing` : null,
                                  inventory.areaSqFt ? `${Number(inventory.areaSqFt).toLocaleString('en-IN')} sq ft` : null,
                                  inventory.dimensions ? `${inventory.dimensions} ft` : null,
                                  inventory.price ? `₹${Number(inventory.price).toLocaleString('en-IN')}` : null,
                                ].filter(Boolean).join(' · ')
                              : '';
                            return (
                              <div
                                key={number}
                                style={{
                                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10,
                                  padding: '8px 12px', borderRadius: 8, background: 'var(--bg-subtle, rgba(148,163,184,0.10))',
                                }}
                              >
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{number}</div>
                                  {details ? <div style={{ fontSize: 12, color: 'var(--text-secondary, #64748b)', marginTop: 2 }}>{details}</div> : null}
                                </div>
                                {inventory?.status ? <StatusChip status={inventory.status} size="sm" /> : null}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}

                <div style={label}>Scheduled slot</div>
                <div style={{ marginBottom: sv.visitorNote ? 12 : 0 }}>{sv.scheduledAt || '—'}</div>
                {sv.visitorNote ? (
                  <>
                    <div style={label}>Visit notes</div>
                    <div>{sv.visitorNote}</div>
                  </>
                ) : null}
              </div>

              {/* Follow-up agent: pick a colleague to hand it to; they are notified straight away */}
              <div style={card}>
                <label htmlFor="sitevisit-detail-agent" style={{ ...label, display: 'block' }}>Follow-up agent</label>
                {canUpdateVisit(sv) ? (
                  <>
                    <select
                      id="sitevisit-detail-agent"
                      className="form-select"
                      value={sv.assignedAgentId ? String(sv.assignedAgentId) : ''}
                      disabled={isReassigning}
                      onChange={e => handleReassign(e.target.value)}
                    >
                      {!sv.assignedAgentId || !agents.some(a => String(a.id) === String(sv.assignedAgentId)) ? (
                        <option value={sv.assignedAgentId ? String(sv.assignedAgentId) : ''}>
                          {sv.assignedAgentName || 'Unassigned'}
                        </option>
                      ) : null}
                      {agents.map(ag => (
                        <option key={ag.id} value={String(ag.id)}>
                          {String(ag.id) === String(user?.id) ? `${ag.name} (me)` : `${ag.name} (${ag.email})`}
                        </option>
                      ))}
                    </select>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary, #64748b)', marginTop: 6 }}>
                      {isReassigning ? 'Assigning…' : 'Choosing another agent assigns it to them and notifies them with the customer details.'}
                    </div>
                  </>
                ) : (
                  <div>{sv.assignedAgentName || 'Unassigned'}</div>
                )}
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary, #64748b)', marginTop: 4 }}>
                  {selfTaken ? 'Self-assigned' : sv.assignedByName ? `Assigned by ${sv.assignedByName}` : ''}
                </div>
              </div>

              {/* Status & remarks */}
              <div style={card}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={label}>Status &amp; remarks</div>
                  <StatusChip status={sv.status} size="sm" />
                </div>
                {sv.statusUpdatedByName ? (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary, #64748b)', marginBottom: 10 }}>
                    Last updated by {sv.statusUpdatedByName}
                    {sv.statusUpdatedAt ? ` · ${new Date(sv.statusUpdatedAt).toLocaleString()}` : ''}
                  </div>
                ) : null}

                {canUpdateVisit(sv) ? (
                  <>
                    <div className="form-group">
                      <label htmlFor="sitevisit-detail-status" className="form-label">Status</label>
                      <select
                        id="sitevisit-detail-status"
                        className="form-select"
                        value={detailStatus}
                        onChange={e => setDetailStatus(e.target.value)}
                      >
                        {statusOptions.map(s => (
                          <option key={s} value={s}>{VISIT_STATUS_CHOICES.includes(s) ? s : `${s} (current)`}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label htmlFor="sitevisit-detail-remarks" className="form-label">
                        Remarks{detailStatus !== 'Pending' ? ' *' : ''}
                      </label>
                      <textarea
                        id="sitevisit-detail-remarks"
                        className="form-input"
                        rows={4}
                        value={detailRemarks}
                        onChange={e => setDetailRemarks(e.target.value)}
                        placeholder="e.g. Liked the corner plot, will come back with family on Sunday"
                      />
                    </div>
                  </>
                ) : (
                  <div>{sv.outcomeNotes ? `"${sv.outcomeNotes}"` : 'No remarks yet'}</div>
                )}
              </div>
            </div>
          );
        })()}
      </Drawer>

      {/* ── Schedule Visit Modal ──────────────────────────────────────────── */}
      <Modal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        title="Schedule Prospective Buyer Site Visit"
        subtitle="Book layout walkthrough — linked to Lead or Customer, Project & Plot"
      >
        <form onSubmit={handleScheduleVisit} className="sitevisit-form">

          {/* Visitor: one picker for leads, customers, or a new visitor */}
          <div className="form-group">
            <label htmlFor="sitevisit-visitor-select" className="form-label">
              Visitor *{' '}
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                ({leads.length} leads · {customers.length} customers)
              </span>
            </label>
            <select
              id="sitevisit-visitor-select"
              name="visitor"
              className="form-select"
              required
              value={visitorSelectValue}
              onChange={e => handleVisitorSelect(e.target.value)}
            >
              <option value="">-- Choose a lead, customer or new visitor --</option>
              <optgroup label={`Leads (${leads.length})`}>
                {leads.map(l => (
                  <option key={`lead-${l.id}`} value={`lead:${l.id}`}>
                    {l.name} — {l.phone}
                  </option>
                ))}
              </optgroup>
              <optgroup label={`Customers (${customers.length})`}>
                {customers.map(c => (
                  <option key={`customer-${c.id}`} value={`customer:${c.id}`}>
                    {c.name} — {c.phone || 'no phone'}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Not in the CRM">
                <option value="new">+ New visitor (enter name and phone)</option>
              </optgroup>
            </select>
          </div>

          {existingOpenVisit && (
            <div
              role="alert"
              style={{
                margin: '4px 0 12px', padding: '12px 14px', borderRadius: 10,
                background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.45)', color: '#92400e',
              }}
            >
              <strong>{existingOpenVisit.customerName} already has an open site visit.</strong>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                {existingOpenVisit.projectName || 'Project'} · {visitPlotLabel(existingOpenVisit)} · {existingOpenVisit.scheduledAt}
                {existingOpenVisit.assignedAgentName ? ` · follow-up: ${existingOpenVisit.assignedAgentName}` : ''}
              </div>
              <div style={{ fontSize: 12.5, marginTop: 4 }}>
                A customer can have only one open visit. Reschedule it (change the time or the plots) instead of adding another.
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ marginTop: 8 }}
                onClick={() => {
                  setIsScheduleModalOpen(false);
                  handleOpenManageModal(existingOpenVisit, 'Rescheduled');
                }}
              >
                Reschedule that visit
              </button>
            </div>
          )}

          {/* Client Name & Phone (read-only for Lead/Customer; editable for New) */}
          <div className="sitevisit-form-grid-2">
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Client Name *</span>
                {visitorType !== 'new' && customerName && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <Lock size={10} /> Auto-filled from {visitorType === 'lead' ? 'Lead' : 'Customer'}
                  </span>
                )}
              </label>
              <input
                type="text"
                className={`form-input ${visitorType !== 'new' ? 'sitevisit-locked-input' : ''}`}
                required
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder={visitorType === 'new' ? 'e.g. Sunil Rao' : 'Select above to populate name'}
                readOnly={visitorType !== 'new'}
              />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Mobile Number *</span>
                {visitorType !== 'new' && customerPhone && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <Lock size={10} /> Locked
                  </span>
                )}
              </label>
              <input
                type="tel"
                inputMode="tel"
                className={`form-input ${visitorType !== 'new' ? 'sitevisit-locked-input' : ''}`}
                required
                value={customerPhone}
                onChange={e =>
                  setCustomerPhone(e.target.value.replace(/[a-zA-Z]/g, '').replace(/[^0-9+\s\-*#()]/g, ''))
                }
                placeholder={visitorType === 'new' ? '+91 98800 00000' : 'Select above to populate phone'}
                readOnly={visitorType !== 'new'}
              />
            </div>
          </div>

          {/* Project → Plot linked dropdowns */}
          <div className="sitevisit-form-grid-2">
            <div className="form-group">
              <label className="form-label">Project *</label>
              <select
                className="form-select"
                required
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
              >
                <option value="">-- Select Project --</option>
                {projects.map((p: any) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name} — {p.location}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">
                Plots{' '}
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  (optional — pick as many as fit the customer's requirement)
                </span>
              </label>
              {(() => {
                const chosen = selectedPlotIds
                  .map(id => plots.find((p: any) => String(p.id) === id))
                  .filter(Boolean) as any[];
                return (
                  <>
                    {chosen.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                        {chosen.map(pl => (
                          <div
                            key={pl.id}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                              padding: '8px 12px', border: '1px solid var(--border-base, #e2e8f0)', borderRadius: 8,
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{pl.plotNumber}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                {[pl.facing && `${pl.facing} facing`, pl.areaSqFt && `${pl.areaSqFt} sq ft`,
                                  pl.price ? `₹${Number(pl.price).toLocaleString('en-IN')}` : null].filter(Boolean).join(' · ')}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              aria-label={`Remove ${pl.plotNumber}`}
                              onClick={() => setSelectedPlotIds(prev => prev.filter(id => id !== String(pl.id)))}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ width: '100%', justifyContent: 'center' }}
                      onClick={handlePickPlotFromInventory}
                      disabled={!selectedProjectId}
                    >
                      {chosen.length > 0 ? `Add or change plots (${chosen.length} selected) →` : 'Choose plots from Plot Inventory →'}
                    </button>
                  </>
                );
              })()}
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                {selectedProjectId
                  ? 'Opens Plot Inventory so you can filter by facing, size and price and tick the plots to show. Leave empty for a General Project Tour.'
                  : 'Select a project first.'}
              </p>
            </div>
          </div>

          {/* Visit Date & Time */}
          <div className="sitevisit-form-grid-2">
            <div className="form-group">
              <label className="form-label">Visit Date *</label>
              <input
                type="date"
                className="form-input"
                required
                min={new Date().toISOString().split('T')[0]}
                value={visitDate}
                onChange={e => setVisitDate(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Time Slot *</label>
              <select
                className="form-select"
                required
                value={visitTimeSlot}
                onChange={e => setVisitTimeSlot(e.target.value)}
              >
                {TIME_SLOTS.map(slot => (
                  <option key={slot} value={slot}>{slot}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Follow-up Agent */}
          <div className="form-group">
            <label className="form-label">Follow-up Agent *</label>
            <select
              className="form-select"
              value={hostAgentId}
              onChange={e => {
                const id = Number(e.target.value);
                setHostAgentId(id);
                const ag = agents.find(a => a.id === id);
                setHostAgentName(ag?.name || '');
              }}
            >
              <option value="0">-- Select Agent --</option>
              {agents.map(ag => (
                <option key={ag.id} value={ag.id}>
                  {String(ag.id) === String(user?.id) ? `${ag.name} (me)` : `${ag.name} (${ag.email})`}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 12, color: 'var(--text-secondary, #64748b)', marginTop: 4 }}>
              Follow it up yourself, or pick a colleague. They are notified with the customer details and that you assigned it.
            </div>
          </div>

          {/* Notes */}
          <div className="form-group">
            <label htmlFor="sitevisit-notes" className="form-label">Visit Notes / Requirements</label>
            <textarea
              id="sitevisit-notes"
              name="notes"
              className="form-textarea"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Needs cab pickup from metro station, visiting with spouse, interested in corner plot..."
            />
          </div>

          <div className="sitevisit-form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsScheduleModalOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting || !!existingOpenVisit}>
              {isSubmitting ? 'Scheduling...' : 'Confirm Schedule'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Confirm removing a site visit ───────────────────────────────── */}
      <Modal
        isOpen={!!visitToRemove}
        onClose={() => !isRemoving && setVisitToRemove(null)}
        title="Remove this site visit?"
        subtitle={visitToRemove ? `${visitToRemove.customerName} · ${visitToRemove.projectName || 'Project'}` : undefined}
        maxWidth={520}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setVisitToRemove(null)} disabled={isRemoving}>
              Keep it
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleConfirmRemove}
              disabled={isRemoving}
              style={{ backgroundColor: '#dc2626', borderColor: '#dc2626' }}
            >
              {isRemoving ? 'Removing…' : 'Remove visit'}
            </button>
          </>
        }
      >
        {visitToRemove && (
          <div>
            <p style={{ marginTop: 0 }}>
              {visitToRemove.scheduledAt} · {visitPlotLabel(visitToRemove)}
              {visitToRemove.assignedAgentName ? ` · follow-up: ${visitToRemove.assignedAgentName}` : ''}
            </p>
            <p>
              This permanently deletes the visit with its plots, status and remarks. The follow-up agent is told it was removed, and the lead
              goes back to "Contacted" if this was their only open visit.
            </p>
            <p style={{ marginBottom: 0, color: 'var(--text-secondary, #64748b)', fontSize: 13 }}>
              To keep a record instead, close it with Update Status / Reschedule → Cancelled.
            </p>
          </div>
        )}
      </Modal>

      {/* ── Unified Manage Site Visit Modal ──────────────────────────────── */}
      <Modal
        isOpen={isManageModalOpen && !!managingVisit}
        onClose={() => setIsManageModalOpen(false)}
        title={
          manageStatus === 'Rescheduled'
            ? `Reschedule Site Visit: ${managingVisit?.customerName || ''}`
            : manageStatus === 'Completed'
              ? `Complete Site Visit: ${managingVisit?.customerName || ''}`
              : manageStatus === 'Cancelled'
                ? `Cancel Site Visit: ${managingVisit?.customerName || ''}`
                : `Update Visit: ${managingVisit?.customerName || ''}`
        }
        subtitle="Update walkthrough status, reschedule timing, or log outcome & reason"
        size="md"
      >
        <form onSubmit={handleSaveManageVisit} className="sitevisit-form">
          {/* Visit Summary Card */}
          <div className="sitevisit-summary-card">
            <div className="sitevisit-summary-row">
              <span className="sitevisit-summary-label">Client:</span>
              <span className="sitevisit-summary-val">
                {managingVisit?.customerName} ({managingVisit?.customerPhone})
              </span>
            </div>
            <div className="sitevisit-summary-row">
              <span className="sitevisit-summary-label">Project / Plot:</span>
              <span className="sitevisit-summary-val">
                {managingVisit?.projectName || 'Project Tour'} {managingVisit?.plotNumber ? `· Plot ${managingVisit.plotNumber}` : ''}
              </span>
            </div>
            <div className="sitevisit-summary-row">
              <span className="sitevisit-summary-label">Current Slot:</span>
              <span className="sitevisit-summary-val" style={{ color: '#2563eb', fontWeight: 700 }}>
                {managingVisit?.scheduledAt}
              </span>
            </div>
            <div className="sitevisit-summary-row">
              <span className="sitevisit-summary-label">Current Status:</span>
              <span className="sitevisit-summary-val">
                <StatusChip status={managingVisit?.status || 'Scheduled'} size="sm" />
              </span>
            </div>
          </div>

          {/* 1. FIRST: Status Dropdown (NO "Scheduled" option!) */}
          <div className="form-group">
            <label className="form-label" style={{ fontWeight: 700, fontSize: '13px' }}>
              Select New Visit Status *
            </label>
            <select
              className="form-select"
              required
              value={manageStatus}
              onChange={e => setManageStatus(e.target.value)}
              style={{ fontWeight: 600, fontSize: '13px', borderColor: 'var(--primary-500)' }}
            >
              <option value="">-- Select Status to Proceed --</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Rescheduled">Rescheduled</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>

          {!manageStatus && (
            <div
              style={{
                padding: '16px 20px',
                backgroundColor: 'var(--bg-surface-hover, #f8fafc)',
                borderRadius: '8px',
                border: '1px dashed var(--border-base, #cbd5e1)',
                textAlign: 'center',
                color: 'var(--text-secondary, #64748b)',
                fontSize: '13px',
                margin: '10px 0',
              }}
            >
              Please select a status above to proceed.
            </div>
          )}

          {/* 2. DYNAMIC FORM SECTIONS BASED ON STATUS */}

          {/* ── CASE A: RESCHEDULED ── */}
          {manageStatus === 'Rescheduled' && (
            <>
              <div className="sitevisit-manage-banner rescheduled">
                <span>📅 <strong>Rescheduling Visit:</strong> Choose the new inspection date, time slot, and escort agent below.</span>
              </div>

              {/* Date & Time Slot Grid */}
              <div className="sitevisit-form-grid-2">
                <div className="form-group">
                  <label className="form-label">New Visit Date *</label>
                  <input
                    type="date"
                    className="form-input"
                    required
                    min={new Date().toISOString().split('T')[0]}
                    value={manageVisitDate}
                    onChange={e => setManageVisitDate(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">New Time Slot *</label>
                  <select
                    className="form-select"
                    required
                    value={manageVisitTimeSlot}
                    onChange={e => setManageVisitTimeSlot(e.target.value)}
                  >
                    {TIME_SLOTS.map(slot => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Project & Plot Selection Grid */}
              <div className="sitevisit-form-grid-2">
                <div className="form-group">
                  <label className="form-label">Development Project</label>
                  <select
                    className="form-select"
                    value={manageProjectId}
                    onChange={e => handleManageProjectChange(e.target.value)}
                  >
                    <option value="">-- Keep Existing Project --</option>
                    {projects.map(p => (
                      <option key={p.id} value={String(p.id)}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Plots (Optional)</label>
                  {(() => {
                    const chosen = managePlotIds
                      .map(id => plots.find((p: any) => String(p.id) === id))
                      .filter(Boolean) as any[];
                    const hasProject = !!(manageProjectId || managingVisit?.projectId);
                    return (
                      <>
                        {chosen.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                            {chosen.map(pl => (
                              <span
                                key={pl.id}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 6px 3px 10px', borderRadius: 999,
                                  background: 'rgba(16, 185, 129, 0.12)', color: '#047857', fontSize: 12.5, fontWeight: 600,
                                }}
                              >
                                {pl.plotNumber}
                                <button
                                  type="button"
                                  aria-label={`Remove ${pl.plotNumber}`}
                                  onClick={() => setManagePlotIds(prev => prev.filter(id => id !== String(pl.id)))}
                                  style={{ border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', fontSize: 15, lineHeight: 1, padding: '0 2px' }}
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12.5, color: 'var(--text-secondary, #64748b)', marginBottom: 8 }}>
                            General Project Tour (no specific plot)
                          </div>
                        )}
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={handlePickPlotsForManage}
                          disabled={!hasProject}
                          style={{ width: '100%', justifyContent: 'center' }}
                        >
                          {chosen.length > 0 ? 'Add or change plots in Plot Inventory →' : 'Choose plots from Plot Inventory →'}
                        </button>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Follow-up Agent */}
              {<div className="form-group">
                <label className="form-label">Follow-up Agent</label>
                <select
                  className="form-select"
                  value={manageHostAgentId}
                  onChange={e => {
                    const id = Number(e.target.value);
                    setManageHostAgentId(id);
                    const ag = agents.find(a => a.id === id);
                    setManageHostAgentName(ag?.name || '');
                  }}
                >
                  <option value="0">-- select agent --</option>
                  {agents.map(ag => (
                    <option key={ag.id} value={ag.id}>
                      {ag.name} ({ag.email})
                    </option>
                  ))}
                </select>
              </div>}

              {/* Unified Reschedule Reason & Notes */}
              <div className="form-group">
                <label className="form-label">
                  Reason for Rescheduling / Visit Notes *
                </label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  required
                  value={manageNote}
                  onChange={e => setManageNote(e.target.value)}
                  placeholder="Why is this visit being rescheduled? (e.g. Client requested next Saturday 11 AM due to office work, out of station...)"
                />
              </div>
            </>
          )}

          {/* ── CASE B: SCHEDULED / CONFIRMED ── */}
          {manageStatus === 'Scheduled' && (
            <>
              <div className="sitevisit-manage-banner rescheduled" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46' }}>
                <span>✓ <strong>Confirm Visit:</strong> Site visit is confirmed for the client.</span>
              </div>

              <div className="form-group">
                <label className="form-label">Confirmation Notes / Requirements (Optional)</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  value={manageNote}
                  onChange={e => setManageNote(e.target.value)}
                  placeholder="Any requirements or discussion points for the visit..."
                />
              </div>
            </>
          )}

          {/* ── CASE C: COMPLETED ── */}
          {manageStatus === 'Completed' && (
            <>
              <div className="sitevisit-manage-banner completed">
                <span>✓ <strong>Mark as Completed:</strong> Record the client's inspection feedback and discussion outcome.</span>
              </div>

              <div className="form-group">
                <label className="form-label">
                  Client Feedback & Visit Outcome *
                </label>
                <textarea
                  className="form-textarea"
                  rows={4}
                  required
                  value={manageNote}
                  onChange={e => setManageNote(e.target.value)}
                  placeholder="What did the client say? Which plot did they prefer? Are they ready for token booking or follow-up needed?"
                />
              </div>
            </>
          )}

          {/* ── CASE C: CANCELLED ── */}
          {manageStatus === 'Cancelled' && (
            <>
              <div className="sitevisit-manage-banner cancelled">
                <span>✕ <strong>Cancel Site Visit:</strong> Please provide the reason for cancellation for records and tracking.</span>
              </div>

              <div className="form-group">
                <label className="form-label">
                  Reason for Cancellation *
                </label>
                <textarea
                  className="form-textarea"
                  rows={4}
                  required
                  value={manageNote}
                  onChange={e => setManageNote(e.target.value)}
                  placeholder="Why was this visit cancelled? (e.g. Client postponed indefinitely, client did not turn up, budget constraints, not interested...)"
                />
              </div>
            </>
          )}

          {/* Modal Actions */}
          <div className="sitevisit-form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsManageModalOpen(false)}
              disabled={isSubmittingManage}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmittingManage || !manageStatus}
              style={{
                backgroundColor:
                  manageStatus === 'Completed'
                    ? '#059669'
                    : manageStatus === 'Cancelled'
                      ? '#dc2626'
                      : manageStatus === 'Rescheduled'
                        ? '#4f46e5'
                        : 'var(--primary-600, #4f46e5)',
                borderColor:
                  manageStatus === 'Completed'
                    ? '#059669'
                    : manageStatus === 'Cancelled'
                      ? '#dc2626'
                      : manageStatus === 'Rescheduled'
                        ? '#4f46e5'
                        : 'var(--primary-600, #4f46e5)',
                color: '#ffffff',
                fontWeight: 600,
                opacity: !manageStatus ? 0.6 : 1,
                cursor: !manageStatus ? 'not-allowed' : 'pointer',
              }}
            >
              {isSubmittingManage
                ? 'Saving...'
                : manageStatus === 'Rescheduled'
                  ? 'Confirm Reschedule & Update Slot'
                  : manageStatus === 'Completed'
                    ? 'Save & Mark Completed'
                    : manageStatus === 'Cancelled'
                      ? 'Confirm Cancellation'
                      : 'Select Status to Save'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
