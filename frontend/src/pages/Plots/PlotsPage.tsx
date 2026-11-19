import React, { useState, useEffect, useMemo } from 'react';
import { Grid, RefreshCw, Plus, Map, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw, RotateCw, X, Image as ImageIcon, Compass, Layers, ShieldCheck, Edit3, Trash2, MapPin } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { StatusChip } from '../../components/common/StatusChip';
import { Modal } from '../../components/common/Modal';
import { BlueprintViewerModal } from '../../components/common/BlueprintViewerModal';
import { PlotLayoutViewer, type LayoutPlot } from '../../components/common/PlotLayoutViewer';
import { ProjectMapModal } from '../../components/common/ProjectMapModal';
import { comparePlotNumbers, calculatePlotAmount } from '../../utils/plotUtils';
import { PlotAmountField } from '../../components/common/PlotAmountField';
import { jaminApiService } from '../../services/jaminApiService';
import { getCustomers, getLeads } from '../../services/ghlApiService';
import { storageService } from '../../services/storageService';
import { toast } from '../../context/ToastContext';
import {
  ExtendHoldModal, VerifyHoldPaymentModal, HoldHistoryModal, PaymentBadge, toLocalInput, fmtDateTime,
} from '../../components/common/PlotHoldDialogs';
import './PlotsPage.css';


export const PlotsPage: React.FC = () => {
  const { tenant, user } = useAuth();
  const [plots, setPlots] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedPlot, setSelectedPlot] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isMasterLayoutModalOpen, setIsMasterLayoutModalOpen] = useState(false);
  const [blueprintZoom, setBlueprintZoom] = useState<number>(1);
  const [blueprintRotation, setBlueprintRotation] = useState<number>(0);
  const [isBlueprintFullScreen, setIsBlueprintFullScreen] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<'All' | 'Available' | 'Hold' | 'Sold'>('All');
  const [facingFilter, setFacingFilter] = useState<string[]>([]);
  const [areaMin, setAreaMin] = useState('');
  const [areaMax, setAreaMax] = useState('');
  const [priceMinLakh, setPriceMinLakh] = useState('');
  const [priceMaxLakh, setPriceMaxLakh] = useState('');
  const canManagePlots = user?.role?.code === 'company_admin' || user?.role?.code === 'super_admin';
  const isFinanceOrAdmin = canManagePlots || ['admin', 'sales_manager'].includes(String(user?.role?.code));
  /** Only the agent responsible for a hold (or an admin) may extend or release it. */
  const canManageHold = (plot: any) =>
    isFinanceOrAdmin || !plot?.holdAgentId || String(plot.holdAgentId) === String(user?.id);

  // Hold action state
  const [isHoldModalOpen, setIsHoldModalOpen] = useState(false);
  const [holdSourceType, setHoldSourceType] = useState<'customer' | 'lead' | 'custom'>('lead');
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [leadsList, setLeadsList] = useState<any[]>([]);

  // Effective customers list: includes all customers from CRM database, PLUS any converted leads who are already customers
  const effectiveCustomersList = useMemo(() => {
    const list = [...customersList];
    leadsList.forEach(l => {
      if ((l.status || '').toLowerCase() === 'converted') {
        const exists = list.some(c => String(c.id) === String(l.id));
        if (!exists) {
          list.push({
            id: l.id,
            name: l.name,
            phone: l.phone,
            status: 'Active',
            email: l.email,
            location: l.location,
          });
        }
      }
    });
    return list;
  }, [customersList, leadsList]);

  // Active unconverted leads ONLY (leads who are already converted are customers and excluded here)
  const availableLeadsList = useMemo(() => {
    return leadsList.filter(l => (l.status || '').toLowerCase() !== 'converted');
  }, [leadsList]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedLeadId, setSelectedLeadId] = useState('');
  const [holdCustomer, setHoldCustomer] = useState('');
  const [holdPhone, setHoldPhone] = useState('');
  // Hold details: exact expiry, optional hold payment, reason.
  const [holdExpiry, setHoldExpiry] = useState('');
  const [holdAmount, setHoldAmount] = useState<number | undefined>(undefined);
  const [holdPaymentMode, setHoldPaymentMode] = useState('');
  const [holdPaymentRef, setHoldPaymentRef] = useState('');
  const [holdNotes, setHoldNotes] = useState('');
  const [holdError, setHoldError] = useState('');
  const [isExtendOpen, setIsExtendOpen] = useState(false);
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [submittingHold, setSubmittingHold] = useState(false);

  // Booking action state
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [bookingSourceType, setBookingSourceType] = useState<'customer' | 'lead' | 'custom'>('lead');
  const [selectedBookingCustomerId, setSelectedBookingCustomerId] = useState('');
  const [selectedBookingLeadId, setSelectedBookingLeadId] = useState('');
  const [bookingCustomerName, setBookingCustomerName] = useState('');
  const [bookingCustomerPhone, setBookingCustomerPhone] = useState('');
  const [bookingTokenAmount, setBookingTokenAmount] = useState<number | undefined>(undefined);
  const [bookingTotalAgreementValue, setBookingTotalAgreementValue] = useState<number | undefined>(undefined);
  const [bookingPaymentMode, setBookingPaymentMode] = useState('');
  const [bookingPaymentRef, setBookingPaymentRef] = useState('');
  const [bookingErrors, setBookingErrors] = useState<string[]>([]);
  const [bookingPaymentTerms, setBookingPaymentTerms] = useState('');
  const [bookingNotes, setBookingNotes] = useState('');
  const [submittingBooking, setSubmittingBooking] = useState(false);

  // Add Plot Modal State
  const [isAddPlotModalOpen, setIsAddPlotModalOpen] = useState(false);
  const [newPlotProjectId, setNewPlotProjectId] = useState<string>('');
  const [newPlotNumber, setNewPlotNumber] = useState('');
  const [newPlotDimensions, setNewPlotDimensions] = useState('');
  const [newPlotAreaSqFt, setNewPlotAreaSqFt] = useState<number>(0);
  const [newPlotFacing, setNewPlotFacing] = useState('East');
  const [newPlotPrice, setNewPlotPrice] = useState<number>(0);
  const [newPlotNotes, setNewPlotNotes] = useState('');
  const [submittingPlot, setSubmittingPlot] = useState(false);

  // Edit Plot Modal State
  const [isEditPlotModalOpen, setIsEditPlotModalOpen] = useState(false);
  const [editPlotNumber, setEditPlotNumber] = useState('');
  const [editPlotDimensions, setEditPlotDimensions] = useState('');
  const [editPlotAreaSqFt, setEditPlotAreaSqFt] = useState<number>(0);
  const [editPlotFacing, setEditPlotFacing] = useState('East');
  const [editPlotPrice, setEditPlotPrice] = useState<number>(0);
  const [editPlotStatus, setEditPlotStatus] = useState('Available');
  const [editPlotNotes, setEditPlotNotes] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Delete Plot Modal State
  const [isDeletePlotModalOpen, setIsDeletePlotModalOpen] = useState(false);
  const [submittingDelete, setSubmittingDelete] = useState(false);

  // Pick mode: another page (Site Visits, Bookings) sent the rep here to choose plot(s).
  //  - visit:   several Available plots (a customer can see more than one)
  //  - booking: exactly one plot that can be booked (Available, or held for this buyer)
  const readPickState = (): {
    projectId: string; plotIds: string[]; mode: 'visit' | 'booking' | 'followup'; phone: string; buyerCustomerId: string;
    contact?: { name: string; phone: string; leadId?: string; customerId?: string };
  } | null => {
    try {
      const raw = sessionStorage.getItem('site_visit_plot_pick');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return {
        projectId: String(parsed?.projectId ?? ''),
        plotIds: Array.isArray(parsed?.selectedPlotIds) ? parsed.selectedPlotIds.map((id: unknown) => String(id)) : [],
        mode: parsed?.mode === 'booking' ? 'booking' : parsed?.mode === 'followup' ? 'followup' : 'visit',
        phone: String(parsed?.phone ?? ''),
        buyerCustomerId: String(parsed?.buyerCustomerId ?? ''),
        contact: parsed?.contact && typeof parsed.contact === 'object' ? parsed.contact : undefined,
      };
    } catch {
      return null;
    }
  };
  const [pickState] = useState(() => readPickState());
  const [pickProjectId, setPickProjectId] = useState<string | null>(() => pickState?.projectId || null);
  const [pickedIds, setPickedIds] = useState<string[]>(() => pickState?.plotIds ?? []);
  const pickMode = pickProjectId !== null;
  const pickPurpose: 'visit' | 'booking' | 'followup' = pickState?.mode ?? 'visit';
  const bookingLikePick = pickPurpose !== 'visit';

  // Leaving Plot Inventory by any other route (sidebar, back) must not leave it stuck in pick mode next time.
  useEffect(() => () => {
    try { sessionStorage.removeItem('site_visit_plot_pick'); } catch { /* ignore */ }
  }, []);

  const phoneKeyOf = (p?: string) => (p || '').replace(/\D/g, '').slice(-10);
  /** Can this plot be picked? Visits: Available. Bookings: Available, or held for this buyer. */
  const isPickable = (plot: any): boolean => {
    if (plot.status === 'Available') return true;
    if (!bookingLikePick || plot.status !== 'Hold') return false;
    const heldPhone = phoneKeyOf(plot.heldByCustomerPhone);
    return (!!heldPhone && heldPhone === phoneKeyOf(pickState?.phone))
      || (!!plot.heldByCustomerId && String(plot.heldByCustomerId) === pickState?.buyerCustomerId);
  };

  const leavePicking = () => {
    try { sessionStorage.removeItem('site_visit_plot_pick'); } catch { /* ignore */ }
    setPickProjectId(null);
    window.dispatchEvent(new CustomEvent('nexus_navigate', { detail: pickPurpose === 'booking' ? 'bookings' : pickPurpose === 'followup' ? 'followups' : 'site-visits' }));
  };

  // Booking queue: several plots chosen for one customer are booked one after another.
  type BookingContactInfo = { name: string; phone: string; leadId?: string; customerId?: string };
  const [bookingQueue, setBookingQueue] = useState<{ ids: string[]; contact: BookingContactInfo } | null>(null);
  const bookingQueueRef = React.useRef(bookingQueue);
  bookingQueueRef.current = bookingQueue;

  /** Done: hand the picked plot(s) back to the page that sent the rep here. */
  const confirmPicked = () => {
    if (pickPurpose === 'followup') {
      // Stay here: book the picked plots for the follow-up customer, one at a time.
      try { sessionStorage.removeItem('site_visit_plot_pick'); } catch { /* ignore */ }
      const contact = pickState?.contact || { name: '', phone: pickState?.phone || '' };
      setPickProjectId(null);
      const ids = pickedIds;
      setPickedIds([]);
      if (ids.length === 0) return;
      const [first, ...rest] = ids;
      setBookingQueue(rest.length > 0 ? { ids: rest, contact } : null);
      const plot = plots.find(p => String(p.id) === first);
      if (plot) void openBookingForContact(plot, contact);
      return;
    }
    try {
      sessionStorage.setItem(
        pickPurpose === 'booking' ? 'booking_plot_selection' : 'site_visit_plot_selection',
        JSON.stringify({ projectId: pickProjectId, plotIds: pickedIds }),
      );
    } catch { /* ignore */ }
    leavePicking();
  };

  const handlePickPlot = (plot: any) => {
    if (!isPickable(plot)) {
      toast.error(bookingLikePick
        ? `${plot.plotNumber} is ${plot.status} and cannot be booked for this buyer.`
        : `${plot.plotNumber} is ${plot.status}. Pick Available plots for the site visit.`);
      return;
    }
    if (pickProjectId && String(plot.projectId) !== String(pickProjectId)) {
      toast.error(`This plot belongs to a different project than the ${pickPurpose === 'booking' ? 'booking' : 'site visit'}.`);
      return;
    }
    const id = String(plot.id);
    if (pickPurpose === 'followup') { togglePicked(id); return; }
    if (pickPurpose === 'booking') {
      // One plot per booking: picking another replaces it, picking the same one clears it.
      setPickedIds(prev => (prev.includes(id) ? [] : [id]));
      return;
    }
    // Several customers may visit the same plot, but adding one that is already planned needs a confirmation.
    if (!pickedIds.includes(id) && (plotUsage[id]?.length ?? 0) > 0) {
      setConfirmPlot(plot);
      return;
    }
    togglePicked(id);
  };

  const togglePicked = (id: string) =>
    setPickedIds(prev => (prev.includes(id) ? prev.filter(p => p !== id) : prev.length >= 10 ? (toast.error('You can pick up to 10 plots.'), prev) : [...prev, id]));

  // Open visits per plot, to warn when a plot is already planned for another customer.
  const [plotUsage, setPlotUsage] = useState<Record<string, Array<{ visitId: number; scheduledAt: string; status: string; followUpAgentName?: string }>>>({});
  const [confirmPlot, setConfirmPlot] = useState<any | null>(null);
  useEffect(() => {
    if (!pickProjectId || pickPurpose !== "visit") return; // "already planned for another visit" only matters when picking for a visit
    let cancelled = false;
    jaminApiService.getPlotUsage(pickProjectId).then(u => { if (!cancelled) setPlotUsage(u); });
    return () => { cancelled = true; };
  }, [pickProjectId]);

  const loadData = async (projId?: string) => {
    setLoading(true);
    try {
      const [projList, plotList] = await Promise.all([
        jaminApiService.getProjects(),
        jaminApiService.getPlots(projId || undefined),
      ]);
      setProjects(projList);
      if (projList.length > 0 && (!selectedProject || !projList.some(p => String(p.id) === String(selectedProject))) && !projId) {
        setSelectedProject(String(projList[0].id));
      }
      setPlots([...plotList].sort(comparePlotNumbers));
    } catch (err) {
      console.error('Failed to load plots/projects from backend', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // In pick mode, open straight on the project the visit is being scheduled for.
    if (pickProjectId) setSelectedProject(pickProjectId);
    loadData(pickProjectId || undefined);
    loadHoldEntities();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isBlueprintFullScreen) {
        setIsBlueprintFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isBlueprintFullScreen]);

  const handleProjectChange = async (projId: string) => {
    setSelectedProject(projId);
    setStatusFilter('All');
    setFacingFilter([]);
    setAreaMin('');
    setAreaMax('');
    setPriceMinLakh('');
    setPriceMaxLakh('');
    setLoading(true);
    try {
      const plotList = await jaminApiService.getPlots(projId || undefined);
      setPlots([...plotList].sort(comparePlotNumbers));
    } catch (err) {
      console.error('Failed to filter plots', err);
    } finally {
      setLoading(false);
    }
  };

  const currentProjectId = selectedProject || (projects[0]?.id ? String(projects[0].id) : '');

  const projectPlots = currentProjectId
    ? plots.filter(p => String(p.projectId) === String(currentProjectId)).sort(comparePlotNumbers)
    : [...plots].sort(comparePlotNumbers);

  // Requirement filters (facing / area / price) — applied on top of the status filter.
  const normalizeFacing = (v: unknown) => String(v ?? '').replace(/[^a-zA-Z]/g, '').toLowerCase();
  const toNum = (v: string): number | null => {
    if (v.trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const areaMinNum = toNum(areaMin);
  const areaMaxNum = toNum(areaMax);
  const priceMinNum = toNum(priceMinLakh);
  const priceMaxNum = toNum(priceMaxLakh);
  const hasSpecFilters =
    facingFilter.length > 0 || areaMinNum !== null || areaMaxNum !== null || priceMinNum !== null || priceMaxNum !== null;

  const clearSpecFilters = () => {
    setFacingFilter([]);
    setAreaMin('');
    setAreaMax('');
    setPriceMinLakh('');
    setPriceMaxLakh('');
  };

  const toggleFacing = (dir: string) => {
    const key = normalizeFacing(dir);
    setFacingFilter(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  };

  const specFilteredPlots = useMemo(() => {
    if (!hasSpecFilters) return projectPlots;
    return projectPlots.filter(p => {
      if (facingFilter.length > 0 && !facingFilter.includes(normalizeFacing(p.facing))) return false;
      const area = Number(p.areaSqFt ?? 0);
      if (areaMinNum !== null && area < areaMinNum) return false;
      if (areaMaxNum !== null && area > areaMaxNum) return false;
      const priceLakh = Number(p.price ?? p.totalPrice ?? 0) / 100000;
      if (priceMinNum !== null && priceLakh < priceMinNum) return false;
      if (priceMaxNum !== null && priceLakh > priceMaxNum) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPlots, facingFilter, areaMin, areaMax, priceMinLakh, priceMaxLakh]);

  // Facing options: the standard compass directions plus anything else present in this project.
  const facingOptions = useMemo(() => {
    const standard = ['North', 'North-East', 'East', 'South-East', 'South', 'South-West', 'West', 'North-West'];
    const seen = new Set(standard.map(normalizeFacing));
    const extra: string[] = [];
    projectPlots.forEach(p => {
      const key = normalizeFacing(p.facing);
      if (key && !seen.has(key)) {
        seen.add(key);
        extra.push(String(p.facing).trim());
      }
    });
    return [...standard, ...extra];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPlots]);

  const availableCount = specFilteredPlots.filter(p => p.status === 'Available').length;
  const holdCount = specFilteredPlots.filter(p => p.status === 'Hold').length;
  const soldCount = specFilteredPlots.filter(p => p.status === 'Booked' || p.status === 'Registered' || p.status === 'Sold').length;

  const displayedPlots = useMemo(() => {
    if (statusFilter === 'Available') return specFilteredPlots.filter(p => p.status === 'Available');
    if (statusFilter === 'Hold') return specFilteredPlots.filter(p => p.status === 'Hold');
    if (statusFilter === 'Sold') return specFilteredPlots.filter(p => p.status === 'Booked' || p.status === 'Registered' || p.status === 'Sold');
    return specFilteredPlots;
  }, [specFilteredPlots, statusFilter]);

  const handleToggleStatusFilter = (status: 'All' | 'Available' | 'Hold' | 'Sold') => {
    if (status === 'All') {
      setStatusFilter('All');
    } else {
      setStatusFilter(prev => (prev === status ? 'All' : status));
    }
  };

  const currentProjectObj = projects.find(p => String(p.id) === String(currentProjectId)) || projects[0];
  // The approved layout drawing (set by the layout sync) wins over the marketing image.
  const projectLayoutUrl: string = (currentProjectObj?.layoutImageUrl || '').trim();
  const hasMasterLayout = Boolean(projectLayoutUrl || (currentProjectObj?.imageUrl && currentProjectObj.imageUrl.trim() !== ''));
  const [layoutPlot, setLayoutPlot] = useState<LayoutPlot | null>(null);
  const [mapPlotLabel, setMapPlotLabel] = useState<string | null>(null); // plot being looked at (null = map closed)
  const [isMapOpen, setIsMapOpen] = useState(false);

  const getProjectMasterLayout = () => {
    if (hasMasterLayout) {
      return projectLayoutUrl || currentProjectObj!.imageUrl;
    }
    return '';
  };

  const loadHoldEntities = async () => {
    try {
      const [custs, lds] = await Promise.all([
        getCustomers(tenant?.id).catch(() => []),
        getLeads(tenant?.id).catch(() => storageService.getLeads(tenant?.id) || []),
      ]);
      setCustomersList(custs || []);
      setLeadsList(lds || []);
      return { custs: custs || [], lds: lds || [] };
    } catch (err) {
      console.error('Failed to load customers/leads for hold modal', err);
      return { custs: [], lds: [] };
    }
  };

  const handleOpenHold = (plot: any) => {
    setSelectedPlot(plot);
    setHoldSourceType('lead');
    setSelectedCustomerId('');
    setSelectedLeadId('');
    setHoldCustomer('');
    setHoldPhone('');
    setHoldExpiry(toLocalInput(new Date(Date.now() + 7 * 24 * 3600 * 1000)));
    setHoldAmount(undefined);
    setHoldPaymentMode('');
    setHoldPaymentRef('');
    setHoldNotes('');
    setHoldError('');
    setIsHoldModalOpen(true);
    loadHoldEntities();
  };

  const handleSourceTypeChange = (type: 'customer' | 'lead' | 'custom') => {
    setHoldSourceType(type);
    setSelectedCustomerId('');
    setSelectedLeadId('');
    setHoldCustomer('');
    setHoldPhone('');
  };

  const handleCustomerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const custId = e.target.value;
    setSelectedCustomerId(custId);
    const found = effectiveCustomersList.find(c => String(c.id) === String(custId));
    if (found) {
      setHoldCustomer(found.name || '');
      setHoldPhone(found.phone || '');
    } else {
      setHoldCustomer('');
      setHoldPhone('');
    }
  };

  const handleLeadChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const leadId = e.target.value;
    setSelectedLeadId(leadId);
    const found = availableLeadsList.find(l => String(l.id) === String(leadId));
    if (found) {
      setHoldCustomer(found.name || '');
      setHoldPhone(found.phone || '');
    } else {
      setHoldCustomer('');
      setHoldPhone('');
    }
  };

  const handleConfirmHold = async () => {
    if (!selectedPlot) return;
    const missing: string[] = [];
    if (!selectedLeadId || !holdCustomer.trim()) missing.push('lead');
    if (!holdPhone.trim()) missing.push('phone number');
    const when = new Date(holdExpiry);
    if (!holdExpiry || Number.isNaN(when.getTime())) missing.push('hold expiry date & time');
    if ((holdAmount ?? 0) > 0) {
      if (!holdPaymentMode) missing.push('payment mode');
      if (!holdPaymentRef.trim()) missing.push('payment reference / transaction id');
    }
    if (missing.length > 0) { setHoldError(`Please complete: ${missing.join(', ')}.`); return; }
    if (when.getTime() <= Date.now() + 60_000) { setHoldError('The hold expiry must be in the future.'); return; }
    if (when.getTime() > Date.now() + 30 * 24 * 3600 * 1000) { setHoldError('A hold cannot be longer than 30 days.'); return; }

    setSubmittingHold(true);
    setHoldError('');
    try {
      const result = await jaminApiService.placeHold(String(selectedPlot.id), {
        customerName: holdCustomer.trim(),
        customerPhone: holdPhone.trim(),
        heldByCustomerId: holdSourceType === 'customer' && selectedCustomerId ? selectedCustomerId : undefined,
        heldByLeadId: holdSourceType === 'lead' && selectedLeadId ? selectedLeadId : undefined,
        expiresAt: when.toISOString(),
        amountPaid: (holdAmount ?? 0) > 0 ? holdAmount : undefined,
        paymentMode: (holdAmount ?? 0) > 0 ? holdPaymentMode : undefined,
        paymentReference: (holdAmount ?? 0) > 0 ? holdPaymentRef.trim() : undefined,
        notes: holdNotes.trim() || undefined,
      });
      if (result.success) {
        setIsHoldModalOpen(false);
        setSelectedPlot(null);
        await loadData(selectedProject);
        toast.success(`Plot placed on hold until ${fmtDateTime(when.toISOString())}.`);
      } else {
        setHoldError(result.message || 'Failed to place plot on hold.');
      }
    } catch (err) {
      console.error('Hold plot error', err);
      setHoldError('Error communicating with server.');
    } finally {
      setSubmittingHold(false);
    }
  };

  const handleReleaseHold = async (plot: any) => {
    if (!confirm(`Release hold on ${plot.plotNumber} back to Available status?`)) return;
    const result = await jaminApiService.releaseHold(String(plot.id));
    if (result.success) {
      setSelectedPlot(null);
      await loadData(selectedProject);
      toast.success(`Hold on ${plot.plotNumber} released.`);
    } else {
      toast.error(result.message || 'Failed to release plot hold.');
    }
  };

  /** Refresh the list and keep the open plot drawer in step with the server. */
  const refreshAfterHoldChange = async () => {
    const id = selectedPlot?.id;
    await loadData(selectedProject);
    if (id !== undefined) {
      const fresh = await jaminApiService.getPlots(selectedProject || undefined);
      const again = (fresh as any[]).find(x => String(x.id) === String(id));
      setSelectedPlot(again ?? null);
    }
  };

  const handleOpenBooking = async (plot: any) => {
    setSelectedPlot(plot);
    const { custs, lds } = await loadHoldEntities();

    const heldPhone = (plot.heldByCustomerPhone || plot.holdPhone || '').trim();
    const heldName = (plot.heldByCustomerName || plot.holdCustomer || '').trim();

    // Bookings are made for a lead: pre-select the lead the plot is held for (matched by id, then phone).
    setBookingSourceType('lead');
    setSelectedBookingCustomerId('');
    const heldLead = lds.find((l: any) =>
      (plot.heldByLeadId && String(l.id).replace(/\D/g, '') === String(plot.heldByLeadId))
      || (!!phoneKeyOf(heldPhone) && phoneKeyOf(l.phone) === phoneKeyOf(heldPhone)));
    setSelectedBookingLeadId(heldLead ? String(heldLead.id) : '');
    setBookingCustomerName(heldLead?.name || heldName);
    setBookingCustomerPhone(heldLead?.phone || heldPhone);

    // The agreement value starts as rate x area of THIS plot (editable); choosing another plot recalculates it.
    const price = calculatePlotAmount(plot).amount || plot.price || plot.totalPrice || 0;
    setBookingTotalAgreementValue(price);
    setBookingTokenAmount(undefined);
    setBookingPaymentMode('');
    setBookingPaymentRef('');
    setBookingErrors([]);
    setBookingPaymentTerms('');
    setBookingNotes('');
    setIsBookingModalOpen(true);
    return { custs, lds };
  };

  const handleBookingSourceTypeChange = (type: 'customer' | 'lead' | 'custom') => {
    setBookingSourceType(type);
    setSelectedBookingCustomerId('');
    setSelectedBookingLeadId('');
    setBookingCustomerName('');
    setBookingCustomerPhone('');
  };

  const handleBookingCustomerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const custId = e.target.value;
    setSelectedBookingCustomerId(custId);
    const found = effectiveCustomersList.find(c => String(c.id) === String(custId));
    if (found) {
      setBookingCustomerName(found.name || '');
      setBookingCustomerPhone(found.phone || '');
    } else {
      setBookingCustomerName('');
      setBookingCustomerPhone('');
    }
  };

  const handleBookingLeadChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const leadId = e.target.value;
    setSelectedBookingLeadId(leadId);
    const found = availableLeadsList.find(l => String(l.id) === String(leadId));
    if (found) {
      setBookingCustomerName(found.name || '');
      setBookingCustomerPhone(found.phone || '');
    } else {
      setBookingCustomerName('');
      setBookingCustomerPhone('');
    }
  };

  /** Open the booking form for a plot with the customer already filled in. */
  const openBookingForContact = async (plot: any, sel: BookingContactInfo) => {
    setSelectedProject(String(plot.projectId));
    const loaded = await handleOpenBooking(plot);
    const digits = (v?: string | number) => String(v ?? '').replace(/\D/g, '');
    const phoneKey = (v?: string) => digits(v).slice(-10);
    const leadsPool: any[] = loaded?.lds ?? [];
    const custsPool: any[] = loaded?.custs ?? [];

    // Find the real lead / customer record: by id first, then by phone number.
    const lead = sel.leadId
      ? (leadsPool.find(l => digits(l.id) === digits(sel.leadId)) ?? undefined)
      : undefined;
    const leadByPhone = !lead && phoneKey(sel.phone).length >= 10
      ? leadsPool.find(l => phoneKey(l.phone) === phoneKey(sel.phone))
      : undefined;
    const customer = sel.customerId
      ? custsPool.find(c => digits(c.id) === digits(sel.customerId))
      : (!lead && !leadByPhone && phoneKey(sel.phone).length >= 10
        ? custsPool.find(c => phoneKey(c.phone) === phoneKey(sel.phone))
        : undefined);
    const foundLead = lead ?? leadByPhone;

    // Always a lead: the lead found by id / phone is selected for you; otherwise choose it from the list.
    setBookingSourceType('lead');
    setSelectedBookingCustomerId('');
    setSelectedBookingLeadId(foundLead ? String(foundLead.id) : '');
    setBookingCustomerName(foundLead?.name || sel.name || '');
    setBookingCustomerPhone(foundLead?.phone || sel.phone || '');
  };

  /** After a booking is saved, open the form for the next plot waiting in the queue. */
  const openNextQueuedBooking = async (justBooked: string, freshPlots: any[]) => {
    const q = bookingQueueRef.current;
    if (!q) return;
    const remaining = [...q.ids];
    while (remaining.length > 0) {
      const nextId = remaining.shift() as string;
      const nextPlot = freshPlots.find(p => String(p.id) === nextId);
      if (!nextPlot) continue;
      if (nextPlot.status !== 'Available' && nextPlot.status !== 'Hold') {
        toast.error(`${nextPlot.plotNumber} is no longer available, skipped.`);
        continue;
      }
      setBookingQueue(remaining.length > 0 ? { ...q, ids: remaining } : null);
      toast.success(`Booked ${justBooked}. Next: ${nextPlot.plotNumber}`);
      await openBookingForContact(nextPlot, q.contact);
      return;
    }
    setBookingQueue(null);
  };

  // Booking started from a follow-up: open the booking form for that plot with the customer already filled in.
  const bookingPrefillHandled = React.useRef(false);
  useEffect(() => {
    if (loading || bookingPrefillHandled.current || plots.length === 0) return;
    let raw: string | null = null;
    try { raw = sessionStorage.getItem('booking_prefill'); } catch { /* ignore */ }
    if (!raw) return;
    bookingPrefillHandled.current = true;
    try { sessionStorage.removeItem('booking_prefill'); } catch { /* ignore */ }

    let sel: { plotId?: string; leadId?: string; customerId?: string; name?: string; phone?: string };
    try { sel = JSON.parse(raw); } catch { return; }
    const rawIds = Array.isArray((sel as any).plotIds) && (sel as any).plotIds.length > 0 ? (sel as any).plotIds : [sel.plotId];
    const ids: string[] = rawIds.map((x: unknown) => String(x));
    const plot = plots.find(p => String(p.id) === ids[0]);
    if (!plot) {
      toast.error('That plot could not be found in Plot Inventory.');
      return;
    }
    const contact = { name: sel.name || '', phone: sel.phone || '', leadId: sel.leadId, customerId: sel.customerId };
    setBookingQueue(ids.length > 1 ? { ids: ids.slice(1), contact } : null);
    void openBookingForContact(plot, contact);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, plots]);

  const cancelBookingModal = () => {
    setIsBookingModalOpen(false);
    const q = bookingQueueRef.current;
    if (q) {
      toast.error(`Skipped the remaining ${q.ids.length} selected plot${q.ids.length === 1 ? '' : 's'}.`);
      setBookingQueue(null);
    }
  };

  const handleConfirmBooking = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedPlot) return;
    if (!bookingCustomerName.trim()) {
      alert(bookingSourceType === 'customer' ? 'Please select a customer.' : bookingSourceType === 'lead' ? 'Please select a lead.' : 'Buyer / Customer name is required to confirm booking.');
      return;
    }
    if (!bookingCustomerPhone.trim()) {
      alert('Buyer / Customer phone number is required.');
      return;
    }

    // Every mandatory detail must be present before a booking can be confirmed.
    const missingBooking: string[] = [];
    if (!selectedBookingLeadId) missingBooking.push('Lead');
    const bookingPrice = bookingTotalAgreementValue ?? (selectedPlot.price || selectedPlot.totalPrice || 0);
    if (bookingPrice <= 0) missingBooking.push('Total agreement value');
    if (!bookingTokenAmount || bookingTokenAmount <= 0) missingBooking.push('Token advance amount');
    else if (bookingTokenAmount > bookingPrice) missingBooking.push('Token advance cannot exceed the agreement value');
    if (!bookingPaymentMode) missingBooking.push('Payment mode');
    else if (!/cash/i.test(bookingPaymentMode) && !bookingPaymentRef.trim()) missingBooking.push('Payment reference / transaction id');
    if (bookingCustomerPhone.replace(/\D/g, '').length < 10) missingBooking.push('Buyer phone (10 digits)');
    if (missingBooking.length > 0) {
      setBookingErrors(missingBooking);
      return;
    }
    setBookingErrors([]);

    setSubmittingBooking(true);
    try {
      const price = bookingTotalAgreementValue ?? (selectedPlot.price || selectedPlot.totalPrice || 0);
      const result = await jaminApiService.createBooking({
        plotId: selectedPlot.id,
        projectId: selectedPlot.projectId,
        customerId: bookingSourceType === 'customer' && selectedBookingCustomerId ? parseInt(selectedBookingCustomerId, 10) : (selectedPlot?.heldByCustomerId ? parseInt(String(selectedPlot.heldByCustomerId), 10) : undefined),
        leadId: bookingSourceType === 'lead' && selectedBookingLeadId ? (parseInt(selectedBookingLeadId.replace(/\D/g, ''), 10) || undefined) : undefined,
        customerName: bookingCustomerName.trim(),
        customerPhone: bookingCustomerPhone.trim(),
        totalPlotPrice: price,
        tokenAmountPaid: bookingTokenAmount || 0,
        paymentMode: bookingPaymentMode,
        transactionReference: bookingPaymentRef.trim() || undefined,
        paymentTerms: bookingPaymentTerms.trim(),
        notes: bookingNotes.trim(),
        plotNumber: selectedPlot.plotNumber,
        projectName: currentProjectObj?.name || '',
      });

      if (result.success) {
        setIsBookingModalOpen(false);
        setSelectedPlot(null);
        const fresh = await jaminApiService.getPlots(selectedProject || undefined).catch(() => plots);
        await loadData(selectedProject);
        if ((bookingQueueRef.current?.ids.length ?? 0) > 0) {
          await openNextQueuedBooking(selectedPlot.plotNumber, fresh as any[]);
          return;
        }
        alert(`✓ Plot ${selectedPlot.plotNumber} successfully reserved! The token payment of ₹${(bookingTokenAmount || 0).toLocaleString('en-IN')} is awaiting finance verification. The prospect will be officially confirmed in Customer 360 once the payment is verified.`);
      } else {
        setBookingErrors([result.message || 'Failed to confirm booking. The plot may already be held or booked by another transaction.']);
      }
    } catch (err: any) {
      console.error('Error confirming booking', err);
      alert(err?.message || 'Error communicating with server.');
    } finally {
      setSubmittingBooking(false);
    }
  };

  const handleOpenEditPlot = (plot: any) => {
    setSelectedPlot(plot);
    setEditPlotNumber(plot.plotNumber || '');
    setEditPlotDimensions(plot.dimensions || '');
    setEditPlotAreaSqFt(plot.areaSqFt || 1200);
    setEditPlotFacing(plot.facing || 'East');
    setEditPlotPrice(plot.price || 0);
    setEditPlotStatus(plot.status || 'Available');
    setEditPlotNotes(plot.notes || '');
    setIsEditPlotModalOpen(true);
  };

  const handleSaveEditPlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPlot || !editPlotNumber.trim()) {
      alert('Plot number is required.');
      return;
    }
    setSubmittingEdit(true);
    try {
      const success = await jaminApiService.updatePlot(selectedPlot.id, {
        plotNumber: editPlotNumber.trim(),
        dimensions: editPlotDimensions.trim(),
        areaSqFt: Number(editPlotAreaSqFt) || 1200,
        facing: editPlotFacing,
        price: Number(editPlotPrice) || 0,
        ...(editPlotStatus === 'Available' ? { status: editPlotStatus } : {}),
        notes: editPlotNotes.trim(),
      });
      if (success) {
        setIsEditPlotModalOpen(false);
        setSelectedPlot(null);
        await loadData(selectedProject);
      } else {
        alert('Failed to update plot. Please verify inputs.');
      }
    } catch (err) {
      console.error('Error updating plot', err);
      alert('Error communicating with server.');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleOpenDeletePlot = (plot: any) => {
    setSelectedPlot(plot);
    setIsDeletePlotModalOpen(true);
  };

  const handleConfirmDeletePlot = async () => {
    if (!selectedPlot) return;
    setSubmittingDelete(true);
    try {
      const success = await jaminApiService.deletePlot(selectedPlot.id);
      if (success) {
        setIsDeletePlotModalOpen(false);
        setSelectedPlot(null);
        await loadData(selectedProject);
      } else {
        alert('Failed to delete plot. It may have active bookings.');
      }
    } catch (err) {
      console.error('Error deleting plot', err);
      alert('Error communicating with server.');
    } finally {
      setSubmittingDelete(false);
    }
  };

  const handleCreatePlot = async (e: React.FormEvent) => {
    e.preventDefault();
    const projId = newPlotProjectId || selectedProject;
    if (!projId || !newPlotNumber.trim()) {
      alert('Project and Plot Number are required.');
      return;
    }

    setSubmittingPlot(true);
    try {
      const success = await jaminApiService.createPlot({
        projectId: parseInt(projId, 10),
        plotNumber: newPlotNumber.trim(),
        dimensions: newPlotDimensions.trim(),
        areaSqFt: Number(newPlotAreaSqFt) || 1200,
        facing: newPlotFacing,
        price: Number(newPlotPrice) || 0,
        notes: newPlotNotes.trim(),
      });

      if (success) {
        setIsAddPlotModalOpen(false);
        setNewPlotNumber('');
        setNewPlotNotes('');
        await loadData(selectedProject);
      } else {
        alert('Failed to add plot. Please verify plot number is unique for this project.');
      }
    } catch (err) {
      console.error('Error creating plot', err);
      alert('Error communicating with server.');
    } finally {
      setSubmittingPlot(false);
    }
  };

  const formatCurrency = (val?: number) => {
    if (!val) return '₹0';
    if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
    if (val >= 100000) return `₹${(val / 100000).toFixed(2)} L`;
    return `₹${val.toLocaleString('en-IN')}`;
  };

  return (
    <div className="plots-page-container">
      {pickMode && (
        <div
          role="status"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap',
            padding: '12px 16px', marginBottom: 16, borderRadius: 10,
            background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.4)', color: '#047857',
          }}
        >
          <span>
            {pickPurpose === 'followup' ? (
              <>
                <strong>Select the plots to book{pickState?.contact?.name ? ` for ${pickState.contact.name}` : ''}.</strong> Use the filters, then tick every plot they want. You will confirm each booking next.{' '}
                <strong>{pickedIds.length} selected</strong>
              </>
            ) : pickPurpose === 'booking' ? (
              <>
                <strong>Select the plot to book.</strong> Use the filters, then click the plot. Only plots that can be booked for this buyer can be chosen.{' '}
                <strong>{pickedIds.length > 0 ? `${projectPlots.find(p => String(p.id) === pickedIds[0])?.plotNumber ?? 'Plot'} selected` : 'No plot selected'}</strong>
              </>
            ) : (
              <>
                <strong>Select plots for the site visit.</strong> Use the filters, then click every Available plot the customer should see.{' '}
                <strong>{pickedIds.length} selected</strong>
              </>
            )}
          </span>
          <span style={{ display: 'inline-flex', gap: 8 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={leavePicking}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={confirmPicked}
              disabled={bookingLikePick && pickedIds.length === 0}
            >
              {pickPurpose === 'followup'
                ? `Book ${pickedIds.length} plot${pickedIds.length === 1 ? '' : 's'}`
                : pickPurpose === 'booking'
                ? 'Done — use this plot'
                : pickedIds.length > 0 ? `Done — add ${pickedIds.length} plot${pickedIds.length === 1 ? '' : 's'}` : 'Done — no specific plot'}
            </button>
          </span>
        </div>
      )}
      {/* Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 className="page-title">
            <Grid size={24} color="#059669" /> Interactive Plot Inventory
          </h1>
          <p className="page-subtitle">
            Visual plot layout, availability status, and reservation management.
          </p>
        </div>

        {/* Project Selector, Refresh, Add Plot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => { setMapPlotLabel(null); setIsMapOpen(true); }}
            title="Show where this project is on the map"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <MapPin size={14} /> View on Map
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label htmlFor="plots-project-selector" style={{ fontSize: 13, fontWeight: 600 }}>Project:</label>
            <select
              id="plots-project-selector"
              name="selectedProject"
              className="form-select plots-project-selector"
              value={currentProjectId || selectedProject}
              onChange={e => handleProjectChange(e.target.value)}
            >
              <option value="" disabled>-- Select Project --</option>
              {projects.map(p => (
                <option key={p.id} value={String(p.id)}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => loadData(selectedProject || currentProjectId)}
            disabled={loading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>

          {canManagePlots && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setNewPlotProjectId(selectedProject || (projects[0]?.id ? String(projects[0].id) : ''));
                setIsAddPlotModalOpen(true);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={15} /> Add Plot
            </button>
          )}
        </div>
      </div>

      {/* Status Legend & Telemetry Bar */}
      <div className="card plots-legend-bar">
        <div className="plots-legend-group">
          <div
            className={`plots-legend-item ${statusFilter === 'All' ? 'active all' : ''}`}
            onClick={() => handleToggleStatusFilter('All')}
            role="button"
            tabIndex={0}
            title="Click to show all plots"
          >
            <span className="plots-legend-dot all" />
            <span className="plots-legend-label">All Plots: </span>
            <strong style={{ color: '#334155' }}>{projectPlots.length}</strong>
          </div>

          <div
            className={`plots-legend-item ${statusFilter === 'Available' ? 'active avail' : ''}`}
            onClick={() => handleToggleStatusFilter('Available')}
            role="button"
            tabIndex={0}
            title="Click to filter by Available plots"
          >
            <span className="plots-legend-dot avail" />
            <span className="plots-legend-label">Available: </span>
            <strong style={{ color: '#059669' }}>{availableCount}</strong>
          </div>

          <div
            className={`plots-legend-item ${statusFilter === 'Hold' ? 'active hold' : ''}`}
            onClick={() => handleToggleStatusFilter('Hold')}
            role="button"
            tabIndex={0}
            title="Click to filter by On Hold plots"
          >
            <span className="plots-legend-dot hold" />
            <span className="plots-legend-label">On Hold: </span>
            <strong style={{ color: '#d97706' }}>{holdCount}</strong>
          </div>

          <div
            className={`plots-legend-item ${statusFilter === 'Sold' ? 'active sold' : ''}`}
            onClick={() => handleToggleStatusFilter('Sold')}
            role="button"
            tabIndex={0}
            title="Click to filter by Booked & Sold plots"
          >
            <span className="plots-legend-dot sold" />
            <span className="plots-legend-label">Booked / Sold: </span>
            <strong style={{ color: '#dc2626' }}>{soldCount}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* {statusFilter !== 'All' && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setStatusFilter('All')}
              style={{ fontSize: 12, color: '#64748b' }}
            >
              Reset Filter
            </button>
          )} */}
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setBlueprintZoom(1);
              setBlueprintRotation(0);
              setIsBlueprintFullScreen(false);
              setIsMasterLayoutModalOpen(true);
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', fontWeight: 600 }}
          >
            <Map size={15} /> View Master Layout Blueprint
          </button>
          <div className="plots-legend-hint">
            Click status headings above to filter plots
          </div>
        </div>
      </div>

      {/* Requirement filters: facing / area / price */}
      <div className="card plots-spec-filters" aria-label="Plot requirement filters">
        <div className="plots-spec-group">
          <span className="plots-spec-label">Facing</span>
          <div className="plots-spec-chips">
            {facingOptions.map(dir => {
              const active = facingFilter.includes(normalizeFacing(dir));
              return (
                <button
                  key={dir}
                  type="button"
                  className={`plots-spec-chip ${active ? 'active' : ''}`}
                  aria-pressed={active}
                  onClick={() => toggleFacing(dir)}
                >
                  {dir}
                </button>
              );
            })}
          </div>
        </div>

        <div className="plots-spec-group">
          <span className="plots-spec-label">Area (sq ft)</span>
          <div className="plots-spec-range">
            <input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="Min"
              aria-label="Minimum area in square feet"
              value={areaMin}
              onChange={e => setAreaMin(e.target.value)}
            />
            <span>–</span>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              placeholder="Max"
              aria-label="Maximum area in square feet"
              value={areaMax}
              onChange={e => setAreaMax(e.target.value)}
            />
          </div>
        </div>

        <div className="plots-spec-group">
          <span className="plots-spec-label">Price (₹ lakh)</span>
          <div className="plots-spec-range">
            <input
              type="number"
              min={0}
              inputMode="decimal"
              placeholder="Min"
              aria-label="Minimum price in lakh rupees"
              value={priceMinLakh}
              onChange={e => setPriceMinLakh(e.target.value)}
            />
            <span>–</span>
            <input
              type="number"
              min={0}
              inputMode="decimal"
              placeholder="Max"
              aria-label="Maximum price in lakh rupees"
              value={priceMaxLakh}
              onChange={e => setPriceMaxLakh(e.target.value)}
            />
          </div>
        </div>

        {hasSpecFilters && (
          <div className="plots-spec-summary">
            <span>{specFilteredPlots.length} of {projectPlots.length} plots match</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearSpecFilters}>
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Visual Plot Layout Grid */}
      {loading && projectPlots.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
          Loading plots for selected project...
        </div>
      ) : projectPlots.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '16px' }}>No plots have been added to this project yet.</p>
          <button
            className="btn btn-primary"
            onClick={() => {
              setNewPlotProjectId(selectedProject || (projects[0]?.id ? String(projects[0].id) : ''));
              setIsAddPlotModalOpen(true);
            }}
          >
            <Plus size={16} /> Add Plot
          </button>
        </div>
      ) : displayedPlots.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', color: '#64748b' }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '16px' }}>
            {hasSpecFilters
              ? <>No plots match your facing, area or price filters{statusFilter !== 'All' ? <> with status <strong>{statusFilter === 'Sold' ? 'Booked / Sold' : statusFilter}</strong></> : null}.</>
              : <>No plots found with status <strong>{statusFilter === 'Sold' ? 'Booked / Sold' : statusFilter}</strong> in this project.</>}
          </p>
          <div style={{ display: 'inline-flex', gap: 8 }}>
            {hasSpecFilters && (
              <button className="btn btn-primary btn-sm" onClick={clearSpecFilters}>
                Clear filters
              </button>
            )}
            {statusFilter !== 'All' && (
              <button className="btn btn-secondary btn-sm" onClick={() => setStatusFilter('All')}>
                Show All Plots ({specFilteredPlots.length})
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="plots-grid-container">
          {displayedPlots.map(plot => {
            const isAvailable = plot.status === 'Available';
            const isHold = plot.status === 'Hold';
            const isSold = plot.status === 'Booked' || plot.status === 'Registered' || plot.status === 'Sold';
            const statusClass = isAvailable ? 'available' : isHold ? 'hold' : 'sold';

            const price = plot.price || plot.totalPrice || 0;
            const area = plot.areaSqFt || plot.sizeSqft || 0;
            const rate = area > 0 ? Math.round(price / area) : (plot.pricePerSqft || 0);

            return (
              <div
                key={plot.id}
                className={`card card-hover plot-item-card ${statusClass}`}
                onClick={() => (pickMode ? handlePickPlot(plot) : setSelectedPlot(plot))}
                style={{
                  position: 'relative',
                  ...(pickMode && !isPickable(plot) ? { opacity: 0.55, cursor: 'not-allowed' } : {}),
                  ...(pickMode && pickedIds.includes(String(plot.id)) ? { outline: '2px solid #10b981', outlineOffset: -2 } : {}),
                }}
                title={pickMode ? (isPickable(plot) ? (pickedIds.includes(String(plot.id)) ? 'Selected — click to remove' : bookingLikePick ? 'Click to select this plot for the booking' : 'Click to select this plot for the site visit') : `Not available (${plot.status})`) : undefined}
                aria-pressed={pickMode ? pickedIds.includes(String(plot.id)) : undefined}
              >
                {pickMode && pickedIds.includes(String(plot.id)) && (
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute', top: 8, right: 8, zIndex: 1, background: '#10b981', color: '#fff',
                      borderRadius: 999, width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700,
                    }}
                  >
                    ✓
                  </span>
                )}
                {pickMode && isPickable(plot) && (
                  <button
                    type="button"
                    className={pickedIds.includes(String(plot.id)) ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                    style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}
                    onClick={e => { e.stopPropagation(); handlePickPlot(plot); }}
                  >
                    {pickedIds.includes(String(plot.id)) ? '✓ Selected' : bookingLikePick ? 'Select for booking' : 'Select for visit'}
                  </button>
                )}
                <div className="plot-card-header">
                  <span className="plot-number-title">
                    {plot.plotNumber}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <StatusChip status={plot.status} size="sm" />
                  </div>
                </div>

                <div className="plot-dimensions">
                  {plot.dimensions && <span>{plot.dimensions} ft • </span>}
                  <strong>{area} sq.ft</strong>
                </div>

                {plot.facing && (
                  <div className="plot-facing">
                    Facing: {plot.facing}
                  </div>
                )}

                <div className="plot-pricing-footer">
                  <span className="plot-price-highlight">
                    {price > 0 ? formatCurrency(price) : '—'}
                  </span>
                  {rate > 0 && (
                    <span className="plot-sqft-rate">
                      @ ₹{rate}/sqft
                    </span>
                  )}
                </div>

                {pickMode && (plotUsage[String(plot.id)]?.length ?? 0) > 0 && (
                  <div
                    style={{
                      marginTop: 6, fontSize: 11.5, fontWeight: 600, color: '#b45309',
                      background: 'rgba(245, 158, 11, 0.14)', borderRadius: 6, padding: '3px 8px', display: 'inline-block',
                    }}
                  >
                    Planned for {plotUsage[String(plot.id)].length} other visit{plotUsage[String(plot.id)].length === 1 ? '' : 's'}
                  </div>
                )}

                {isHold && (
                  <div className="plot-hold-badge">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span>🔒 Held for <strong>{plot.heldByCustomerName || '—'}</strong></span>
                      <button
                        title="Confirm Booking"
                        onClick={e => {
                          e.stopPropagation();
                          handleOpenBooking(plot);
                        }}
                        style={{
                          background: '#10b981',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 4,
                          padding: '2px 8px',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Book
                      </button>
                    </div>
                    {plot.holdExpiresAt && (
                      <div style={{ marginTop: 2 }}>Expiry: {new Date(plot.holdExpiresAt).toLocaleDateString()}</div>
                    )}
                  </div>
                )}

                {isSold && (
                  <div className="plot-sold-badge">
                    ✓ Booked / Sold {plot.heldByCustomerName ? `to ${plot.heldByCustomerName}` : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pick mode: this plot is already planned for another customer's visit */}
      <Modal
        isOpen={!!confirmPlot}
        onClose={() => setConfirmPlot(null)}
        title="This plot is already planned for a visit"
        subtitle={confirmPlot ? `${confirmPlot.plotNumber} · ${currentProjectObj?.name || 'Project'}` : undefined}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmPlot(null)}>Don't add</button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (confirmPlot) togglePicked(String(confirmPlot.id));
                setConfirmPlot(null);
              }}
            >
              Add anyway
            </button>
          </>
        }
      >
        {confirmPlot && (
          <div>
            <p style={{ marginTop: 0 }}>
              {confirmPlot.plotNumber} is already part of {plotUsage[String(confirmPlot.id)]?.length ?? 0} other open site visit
              {(plotUsage[String(confirmPlot.id)]?.length ?? 0) === 1 ? '' : 's'}:
            </p>
            <ul style={{ paddingLeft: 18, margin: '0 0 12px' }}>
              {(plotUsage[String(confirmPlot.id)] ?? []).map(u => (
                <li key={u.visitId}>
                  {u.scheduledAt || 'Date to be confirmed'} · {u.status}
                  {u.followUpAgentName ? ` · follow-up: ${u.followUpAgentName}` : ''}
                </li>
              ))}
            </ul>
            <p style={{ marginBottom: 0 }}>
              More than one customer can visit the same plot. Adding it will notify the agents of those visits.
            </p>
          </div>
        )}
      </Modal>

      {/* Plot Detail Modal */}
      <Modal
        isOpen={!!selectedPlot && !isHoldModalOpen && !isBookingModalOpen && !isEditPlotModalOpen && !isDeletePlotModalOpen}
        onClose={() => setSelectedPlot(null)}
        title={`${selectedPlot?.plotNumber} Specifications`}
        maxWidth={760}
        subtitle={`${currentProjectObj?.name || 'Project Layout'}`}
        footer={
          <>
            {selectedPlot && (
              <button
                className="btn btn-secondary"
                onClick={() => projectLayoutUrl && setLayoutPlot(selectedPlot)}
                disabled={!projectLayoutUrl}
                title={projectLayoutUrl ? 'Show this plot on the approved layout' : 'No layout drawing has been loaded for this project yet'}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <Map size={14} /> View on Layout
              </button>
            )}
            {selectedPlot && (
              <button
                className="btn btn-secondary"
                onClick={() => { setMapPlotLabel(selectedPlot.plotNumber); setIsMapOpen(true); }}
                title="Show where this project is on the map"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <MapPin size={14} /> View on Map
              </button>
            )}
            {selectedPlot?.status === 'Available' && (
              <>
                <button
                  className="btn btn-primary plot-hold-btn-gold"
                  onClick={() => handleOpenHold(selectedPlot)}
                >
                  Put Plot on Hold
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => handleOpenBooking(selectedPlot)}
                  style={{ backgroundColor: '#10b981', borderColor: '#059669', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  ✓ Confirm Booking
                </button>
              </>
            )}

            {selectedPlot?.status === 'Hold' && (
              <>
                <button
                  className="btn btn-primary"
                  onClick={() => handleOpenBooking(selectedPlot)}
                  style={{ backgroundColor: '#10b981', borderColor: '#059669', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  ✓ Confirm to Book
                </button>
                {canManageHold(selectedPlot) && (
                  <button className="btn btn-secondary" onClick={() => setIsExtendOpen(true)}>
                    Extend / Change Hold
                  </button>
                )}
                {isFinanceOrAdmin && selectedPlot.holdPaymentStatus === 'Pending Verification' && (
                  <button className="btn btn-secondary" onClick={() => setIsVerifyOpen(true)}>
                    Verify Hold Payment
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => setIsHistoryOpen(true)}>
                  Hold History
                </button>
                {canManageHold(selectedPlot) && (
                  <button
                    className="btn btn-secondary plot-release-btn"
                    onClick={() => handleReleaseHold(selectedPlot)}
                  >
                    Release Hold to Available
                  </button>
                )}
              </>
            )}

            {canManagePlots && selectedPlot && (
              <>
                <button
                  className="btn btn-secondary"
                  title="Edit Plot"
                  aria-label="Edit Plot"
                  onClick={() => handleOpenEditPlot(selectedPlot)}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '8px 10px' }}
                >
                  <Edit3 size={14} />
                </button>
                <button
                  className="btn btn-secondary"
                  title="Delete Plot"
                  aria-label="Delete Plot"
                  onClick={() => handleOpenDeletePlot(selectedPlot)}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '8px 10px', color: '#b91c1c' }}
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}

          </>
        }
      >
        {selectedPlot && (
          <div className="plot-detail-body">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Current Status:</span>
              <StatusChip status={selectedPlot.status} />
            </div>

            <div className="plot-detail-grid">
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Plot Dimension:</span>
                <div className="plot-detail-val">{selectedPlot.dimensions || '—'}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Total Area:</span>
                <div className="plot-detail-val">
                  {(selectedPlot.areaSqFt || selectedPlot.sizeSqft) ? `${selectedPlot.areaSqFt || selectedPlot.sizeSqft} sq.ft` : '—'}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Facing:</span>
                <div className="plot-detail-val">{selectedPlot.facing || '—'}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Price per Sq.Ft:</span>
                <div className="plot-detail-val">
                  {selectedPlot.pricePerSqft
                    ? `₹${Number(selectedPlot.pricePerSqft).toLocaleString('en-IN')}/sq.ft`
                    : selectedPlot.areaSqFt > 0 && selectedPlot.price > 0
                      ? `₹${Math.round(selectedPlot.price / selectedPlot.areaSqFt).toLocaleString('en-IN')}/sq.ft`
                      : '—'}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Total Plot Price:</span>
                <div className="plot-detail-price">
                  {(selectedPlot.price || selectedPlot.totalPrice) > 0
                    ? formatCurrency(selectedPlot.price || selectedPlot.totalPrice)
                    : '—'}
                </div>
              </div>
              {selectedPlot.notes && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Notes:</span>
                  <div className="plot-detail-val">{selectedPlot.notes}</div>
                </div>
              )}
            </div>

            {selectedPlot.status === 'Hold' && (
              <div className="plot-hold-detail-box">
                <div className="plot-hold-detail-title">
                  Active Hold Reservation Details
                </div>
                <div>Customer: <strong>{selectedPlot.heldByCustomerName || '—'}</strong></div>
                <div>Phone: <strong>{selectedPlot.heldByCustomerPhone || '—'}</strong></div>
                {selectedPlot.holdByAgent && <div>Responsible agent: <strong>{selectedPlot.holdByAgent}</strong></div>}
                <div>Expires: <strong>{fmtDateTime(selectedPlot.holdExpiresAt)}</strong></div>
                {selectedPlot.holdAmount > 0 && <div>Hold amount: <strong>₹{Number(selectedPlot.holdAmount).toLocaleString('en-IN')}</strong></div>}
                <div style={{ marginTop: 4 }}><PaymentBadge status={selectedPlot.holdPaymentStatus} /></div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Place on Hold Form Modal */}
      <Modal
        isOpen={isHoldModalOpen && !!selectedPlot}
        onClose={() => setIsHoldModalOpen(false)}
        title={`Place ${selectedPlot?.plotNumber} on Hold`}
        subtitle="Reserve plot for a Customer, Lead, or Custom contact"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setIsHoldModalOpen(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleConfirmHold} disabled={submittingHold}>
              {submittingHold ? 'Saving Reservation...' : 'Confirm Hold Reservation'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {holdSourceType === 'lead' && (
            <>
              <div className="form-group">
                <label className="form-label">Select Lead *</label>
                <select
                  className="form-select"
                  value={selectedLeadId}
                  onChange={handleLeadChange}
                >
                  <option value="">-- Choose Existing Lead --</option>
                  {availableLeadsList.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name} {l.phone ? `(${l.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {holdCustomer && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Lead Name</label>
                    <input type="text" className="form-input" value={holdCustomer} readOnly />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Lead Phone</label>
                    <input type="text" className="form-input" value={holdPhone} readOnly />
                  </div>
                </div>
              )}
            </>
          )}


          <div className="form-group">
            <label htmlFor="plot-hold-expiry" className="form-label">Hold expires on *</label>
            <input
              id="plot-hold-expiry"
              type="datetime-local"
              className="form-input"
              value={holdExpiry}
              onChange={e => setHoldExpiry(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {[[3, '3 days (express)'], [7, '7 days (standard)'], [14, '14 days (executive approval)']].map(([d, label]) => (
                <button key={String(d)} type="button" className="btn btn-secondary btn-sm"
                  onClick={() => setHoldExpiry(toLocalInput(new Date(Date.now() + Number(d) * 24 * 3600 * 1000)))}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
              The plot returns to Available automatically at this time unless the hold is extended or booked. Maximum 30 days.
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label htmlFor="plot-hold-amount" className="form-label">Hold / advance amount (₹)</label>
              <input id="plot-hold-amount" type="number" min={0} className="form-input"
                value={holdAmount ?? ''} onChange={e => setHoldAmount(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Leave empty if no money was taken" />
            </div>
            <div className="form-group">
              <label htmlFor="plot-hold-mode" className="form-label">Payment mode{(holdAmount ?? 0) > 0 ? ' *' : ''}</label>
              <select id="plot-hold-mode" className="form-select" value={holdPaymentMode} onChange={e => setHoldPaymentMode(e.target.value)} disabled={!(holdAmount && holdAmount > 0)}>
                <option value="">-- Select --</option>
                <option value="UPI / Online">UPI / Online</option>
                <option value="Bank Transfer / NEFT">Bank Transfer / NEFT</option>
                <option value="Cheque / DD">Cheque / DD</option>
                <option value="Cash">Cash</option>
              </select>
            </div>
          </div>
          {(holdAmount ?? 0) > 0 && (
            <div className="form-group">
              <label htmlFor="plot-hold-ref" className="form-label">Payment reference / transaction id *</label>
              <input id="plot-hold-ref" type="text" className="form-input" value={holdPaymentRef} onChange={e => setHoldPaymentRef(e.target.value)} />
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                The payment is recorded as <strong>Pending Verification</strong>. The hold becomes <strong>Confirmed</strong> once finance verifies it.
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="plot-hold-notes" className="form-label">Reason / notes</label>
            <input id="plot-hold-notes" type="text" className="form-input" value={holdNotes} onChange={e => setHoldNotes(e.target.value)} placeholder="Why is the plot being held?" />
          </div>

          <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
            Responsible agent: <strong>{user?.name || 'you'}</strong> · Project: <strong>{currentProjectObj?.name || '—'}</strong> · Plot: <strong>{selectedPlot?.plotNumber}</strong>
          </div>

          {holdError && (
            <div role="alert" style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', color: '#b91c1c', fontSize: 13 }}>
              {holdError}
            </div>
          )}
        </div>
      </Modal>

      <ExtendHoldModal isOpen={isExtendOpen} onClose={() => setIsExtendOpen(false)} plot={selectedPlot} onDone={refreshAfterHoldChange} />
      <VerifyHoldPaymentModal isOpen={isVerifyOpen} onClose={() => setIsVerifyOpen(false)} plot={selectedPlot} onDone={refreshAfterHoldChange} />
      <HoldHistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} plot={selectedPlot} />

      {/* Confirm Booking Modal */}
      <Modal
        isOpen={isBookingModalOpen && !!selectedPlot}
        onClose={cancelBookingModal}
        title={`Confirm Booking — ${selectedPlot?.plotNumber}`}
        subtitle={`Confirm plot sale & register customer into CRM for ${currentProjectObj?.name || 'Project'}`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={cancelBookingModal}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleConfirmBooking}
              disabled={submittingBooking}
              style={{ backgroundColor: '#10b981', borderColor: '#059669' }}
            >
              {submittingBooking ? 'Confirming Booking...' : '✓ Confirm & Book Plot'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 8, padding: '12px 16px', fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--text-muted)' }}>Plot:</span>
              <strong>{selectedPlot?.plotNumber} ({selectedPlot?.areaSqFt || selectedPlot?.sizeSqft || 0} sq.ft)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Total Plot Price:</span>
              <strong style={{ color: '#059669' }}>{formatCurrency(selectedPlot?.price || selectedPlot?.totalPrice)}</strong>
            </div>
          </div>

          {/* Buyer selection tabs: Customer, Lead, Custom */}
          {bookingSourceType === 'lead' && (
            <>
              <div className="form-group">
                <label className="form-label">Select Lead *</label>
                <select
                  className="form-select"
                  value={selectedBookingLeadId}
                  onChange={handleBookingLeadChange}
                >
                  <option value="">-- Choose Existing Lead --</option>
                  {availableLeadsList.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.name} {l.phone ? `(${l.phone})` : ''}
                    </option>
                  ))}
                  {selectedBookingLeadId && !availableLeadsList.some(l => String(l.id) === String(selectedBookingLeadId)) && (
                    <option value={selectedBookingLeadId}>
                      {bookingCustomerName} {bookingCustomerPhone ? `(${bookingCustomerPhone})` : ''}
                    </option>
                  )}
                </select>
              </div>
              {bookingCustomerName && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Lead Name</label>
                    <input type="text" className="form-input" value={bookingCustomerName} readOnly />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Lead Phone</label>
                    <input type="text" className="form-input" value={bookingCustomerPhone} readOnly />
                  </div>
                </div>
              )}
            </>
          )}


          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Token Advance (₹) *</label>
              <input
                type="number"
                className="form-input"
                min={0}
                value={bookingTokenAmount ?? ''}
                onChange={e => setBookingTokenAmount(e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>

          </div>

          <PlotAmountField plot={selectedPlot} value={bookingTotalAgreementValue} onChange={setBookingTotalAgreementValue} id="plots-booking-amount" />

          <div className="form-group">
            <label className="form-label">Payment Mode *</label>
            <select
              className="form-select"
              value={bookingPaymentMode}
              onChange={e => setBookingPaymentMode(e.target.value)}
            >
              <option value="">-- Select Payment Mode --</option>
              <option value="Bank Transfer / NEFT">Bank Transfer / NEFT</option>
              <option value="RTGS">RTGS</option>
              <option value="Cheque / DD">Cheque / Demand Draft</option>
              <option value="UPI / Online">UPI / Online Gateway</option>
              <option value="Cash">Cash</option>
            </select>
          </div>

          {bookingPaymentMode && !/cash/i.test(bookingPaymentMode) && (
            <div className="form-group">
              <label className="form-label">Payment Reference / Transaction ID *</label>
              <input
                type="text"
                className="form-input"
                value={bookingPaymentRef}
                onChange={e => setBookingPaymentRef(e.target.value)}
                placeholder="UTR / cheque number / UPI reference"
              />
            </div>
          )}

          {bookingErrors.length > 0 && (
            <div role="alert" style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)', color: '#b91c1c', fontSize: 13 }}>
              <strong>The booking cannot be confirmed yet.</strong> Please complete:
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {bookingErrors.map(e => <li key={e}>{e}</li>)}
              </ul>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Payment Terms / Milestone Schedule <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-muted)' }}></span></label>
            <input
              type="text"
              className="form-input"
              value={bookingPaymentTerms}
              onChange={e => setBookingPaymentTerms(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">General Notes & Remarks</label>
            <textarea
              className="form-textarea"
              rows={2}
              value={bookingNotes}
              onChange={e => setBookingNotes(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      {/* Edit Plot Modal */}
      <Modal
        isOpen={isEditPlotModalOpen && !!selectedPlot}
        onClose={() => setIsEditPlotModalOpen(false)}
        title={`Edit Plot — ${selectedPlot?.plotNumber}`}
        subtitle="Update plot specifications and inventory details"
      >
        <form onSubmit={handleSaveEditPlot}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Plot Number *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={editPlotNumber}
                  onChange={e => setEditPlotNumber(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Dimensions</label>
                <input
                  type="text"
                  className="form-input"
                  value={editPlotDimensions}
                  onChange={e => setEditPlotDimensions(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Area (sq.ft) *</label>
                <input
                  type="number"
                  className="form-input"
                  required
                  min={100}
                  value={editPlotAreaSqFt}
                  onChange={e => setEditPlotAreaSqFt(Number(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Facing Direction</label>
                <select
                  className="form-select"
                  value={editPlotFacing}
                  onChange={e => setEditPlotFacing(e.target.value)}
                >
                  <option value="East">East</option>
                  <option value="North">North</option>
                  <option value="North-East">North-East (Corner)</option>
                  <option value="West">West</option>
                  <option value="South">South</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Total Plot Price (₹) *</label>
                <input
                  type="number"
                  className="form-input"
                  required
                  min={1}
                  value={editPlotPrice}
                  onChange={e => setEditPlotPrice(Number(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  className="form-select"
                  value={editPlotStatus}
                  onChange={e => setEditPlotStatus(e.target.value)}
                  disabled={editPlotStatus !== 'Available'}
                >
                  <option value="Available">Available</option>
                  {editPlotStatus !== 'Available' && (
                    <option value={editPlotStatus}>{editPlotStatus} (booking controlled)</option>
                  )}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Notes</label>
              <input
                type="text"
                className="form-input"
                value={editPlotNotes}
                onChange={e => setEditPlotNotes(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setIsEditPlotModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submittingEdit}>
                {submittingEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Delete Plot Confirmation Modal */}
      <Modal
        isOpen={isDeletePlotModalOpen && !!selectedPlot}
        onClose={() => setIsDeletePlotModalOpen(false)}
        title="Delete Plot"
        subtitle="This action cannot be undone"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setIsDeletePlotModalOpen(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleConfirmDeletePlot}
              disabled={submittingDelete}
              style={{ background: '#dc2626', borderColor: '#dc2626' }}
            >
              {submittingDelete ? 'Deleting...' : 'Yes, Delete Plot'}
            </button>
          </>
        }
      >
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <Trash2 size={48} style={{ color: '#dc2626', margin: '0 auto 16px auto' }} />
          <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 8 }}>
            Delete <strong>{selectedPlot?.plotNumber}</strong>?
          </p>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 0 }}>
            This will permanently remove the plot from the project inventory.
            Plots with active bookings cannot be deleted.
          </p>
        </div>
      </Modal>

      {/* Add New Plot Modal */}
      <Modal
        isOpen={isAddPlotModalOpen}
        onClose={() => setIsAddPlotModalOpen(false)}
        title="Add New Plot to Inventory"
        subtitle="Add an individual plot to the project inventory"
      >
        <form onSubmit={handleCreatePlot}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Project *</label>
              <select
                className="form-select"
                required
                value={newPlotProjectId}
                onChange={e => setNewPlotProjectId(e.target.value)}
              >
                <option value="">-- Select Project --</option>
                {projects.map(p => (
                  <option key={p.id} value={String(p.id)}>
                    {p.name} ({p.location})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Plot Number *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={newPlotNumber}
                  onChange={e => setNewPlotNumber(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Dimensions</label>
                <input
                  type="text"
                  className="form-input"
                  value={newPlotDimensions}
                  onChange={e => setNewPlotDimensions(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Area (sq.ft) *</label>
                <input
                  type="number"
                  className="form-input"
                  required
                  min={100}
                  value={newPlotAreaSqFt}
                  onChange={e => setNewPlotAreaSqFt(Number(e.target.value))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Facing Direction</label>
                <select
                  className="form-select"
                  value={newPlotFacing}
                  onChange={e => setNewPlotFacing(e.target.value)}
                >
                  <option value="East">East</option>
                  <option value="North">North</option>
                  <option value="North-East">North-East (Corner)</option>
                  <option value="West">West</option>
                  <option value="South">South</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Total Plot Price (₹) *</label>
              <input
                type="number"
                className="form-input"
                required
                min={1}
                value={newPlotPrice}
                onChange={e => setNewPlotPrice(Number(e.target.value))}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Notes</label>
              <input
                type="text"
                className="form-input"
                value={newPlotNotes}
                onChange={e => setNewPlotNotes(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setIsAddPlotModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submittingPlot}>
                {submittingPlot ? 'Adding Plot...' : 'Add Plot'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Where the project is on the map */}
      <ProjectMapModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        projectName={currentProjectObj?.name}
        location={currentProjectObj?.location}
        mapQuery={currentProjectObj?.mapQuery}
        plotNumber={mapPlotLabel ?? undefined}
        canEdit={canManagePlots}
        onSaveQuery={async (query) => {
          if (!currentProjectObj) return false;
          const result = await jaminApiService.updateProject(currentProjectObj.id, { mapQuery: query });
          if (result.success) {
            setProjects(prev => prev.map(p => String(p.id) === String(currentProjectObj.id) ? { ...p, mapQuery: query || null } : p));
          }
          return result.success;
        }}
      />

      {/* View a single plot on the approved layout drawing */}
      <PlotLayoutViewer
        isOpen={!!layoutPlot}
        onClose={() => setLayoutPlot(null)}
        imageUrl={projectLayoutUrl}
        projectName={currentProjectObj?.name}
        plot={layoutPlot}
      />

      {/* Master Layout Blueprint Modal */}
      <BlueprintViewerModal
        isOpen={isMasterLayoutModalOpen}
        onClose={() => setIsMasterLayoutModalOpen(false)}
        projectName={currentProjectObj?.name}
        projectLocation={currentProjectObj?.location}
        imageUrl={getProjectMasterLayout()}
        availableCount={availableCount}
        holdCount={holdCount}
        soldCount={soldCount}
        phaseText="Phase 1"
        canManage={canManagePlots}
      />
    </div>
  );
};
