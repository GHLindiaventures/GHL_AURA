import React, { useState, useEffect, useMemo } from 'react';
import { Grid, RefreshCw, Plus, Map, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw, RotateCw, X, Image as ImageIcon, Compass, Layers, ShieldCheck, Edit3, Trash2, MapPin } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { StatusChip } from '../../components/common/StatusChip';
import { Modal } from '../../components/common/Modal';
import { BlueprintViewerModal } from '../../components/common/BlueprintViewerModal';
import { PlotLayoutViewer, type LayoutPlot } from '../../components/common/PlotLayoutViewer';
import { ProjectMapModal } from '../../components/common/ProjectMapModal';
import { comparePlotNumbers } from '../../utils/plotUtils';
import { jaminApiService } from '../../services/jaminApiService';
import { getCustomers, getLeads } from '../../services/ghlApiService';
import { storageService } from '../../services/storageService';
import { toast } from '../../context/ToastContext';
import { ShareDocumentsModal, type ShareDocumentsTarget } from '../../components/jamin/ShareDocumentsModal';
import { PlotDocumentsPanel, VerificationChip } from '../../components/jamin/PlotDocumentsPanel';
import { documentPackService, latestShareByPlot, type PlotDocumentShare } from '../../services/documentPackService';
import './PlotsPage.css';


// ── Hold expiry helpers ────────────────────────────────────────────────────
const pad2 = (n: number) => String(n).padStart(2, '0');
const toLocalDateInput = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const MAX_HOLD_DAYS = 30;

/** e.g. "26 Nov 2026, 6:00 pm" */
const formatHoldExpiry = (iso?: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
};

/** "2d 4h left" / "3h 10m left" / "Expired" + urgency flag (< 24h) */
const getHoldRemaining = (iso?: string | null): { label: string; urgent: boolean } => {
  if (!iso) return { label: '', urgent: false };
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return { label: '', urgent: false };
  if (ms <= 0) return { label: 'Expired', urgent: true };
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  const label = days > 0 ? `${days}d ${hours}h left` : hours > 0 ? `${hours}h ${m}m left` : `${m}m left`;
  return { label, urgent: ms < 24 * 3600 * 1000 };
};

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

  // Hold action state
  const [isHoldModalOpen, setIsHoldModalOpen] = useState(false);
  const [holdSourceType, setHoldSourceType] = useState<'customer' | 'lead' | 'custom'>('customer');
  const [customersList, setCustomersList] = useState<any[]>([]);
  // Legal document pack sharing (during hold)
  const [shareTarget, setShareTarget] = useState<ShareDocumentsTarget | null>(null);
  const [shareRefreshKey, setShareRefreshKey] = useState(0);
  const [plotShares, setPlotShares] = useState<Record<string, PlotDocumentShare>>({});
  const [shareDocsAfterHold, setShareDocsAfterHold] = useState(true);
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
  const [holdDays, setHoldDays] = useState('7');
  // Custom hold expiry (local date + time)
  const [holdUntilDate, setHoldUntilDate] = useState('');
  const [holdUntilTime, setHoldUntilTime] = useState('18:00');
  const applyHoldPreset = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setHoldUntilDate(toLocalDateInput(d));
    setHoldDays(String(days));
  };
  const holdUntilDateObj = useMemo(() => {
    if (!holdUntilDate || !holdUntilTime) return null;
    const d = new Date(`${holdUntilDate}T${holdUntilTime}:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [holdUntilDate, holdUntilTime]);
  const holdUntilError = useMemo(() => {
    if (!holdUntilDateObj) return 'Select the hold expiry date and time.';
    const ms = holdUntilDateObj.getTime() - Date.now();
    if (ms <= 60 * 1000) return 'Hold expiry must be in the future.';
    if (ms > MAX_HOLD_DAYS * 24 * 3600 * 1000) return `Hold cannot be longer than ${MAX_HOLD_DAYS} days.`;
    return null;
  }, [holdUntilDateObj]);
  const [submittingHold, setSubmittingHold] = useState(false);

  // Booking action state
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [bookingSourceType, setBookingSourceType] = useState<'customer' | 'lead' | 'custom'>('customer');
  const [selectedBookingCustomerId, setSelectedBookingCustomerId] = useState('');
  const [selectedBookingLeadId, setSelectedBookingLeadId] = useState('');
  const [bookingCustomerName, setBookingCustomerName] = useState('');
  const [bookingCustomerPhone, setBookingCustomerPhone] = useState('');
  const [bookingTokenAmount, setBookingTokenAmount] = useState<number | undefined>(undefined);
  const [bookingTotalAgreementValue, setBookingTotalAgreementValue] = useState<number | undefined>(undefined);
  const [bookingPaymentMode, setBookingPaymentMode] = useState('');
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

  const loadPlotShares = async (projId: string) => {
    if (!projId) return;
    try {
      const shares = await documentPackService.getShares({ projectId: projId });
      setPlotShares(latestShareByPlot(shares));
    } catch {
      setPlotShares({});
    }
  };
  useEffect(() => {
    loadPlotShares(currentProjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId, shareRefreshKey]);

  const openShareDocs = (plot: any, overrides?: Partial<ShareDocumentsTarget>) => {
    const lead = plot?.heldByLeadId ? leadsList.find((l: any) => String(l.id) === String(plot.heldByLeadId)) : null;
    const cust = plot?.heldByCustomerId ? customersList.find((c: any) => String(c.id) === String(plot.heldByCustomerId)) : null;
    setShareTarget({
      plotId: plot.id,
      plotNumber: plot.plotNumber,
      projectName: projects.find((p: any) => String(p.id) === String(plot.projectId))?.name,
      holdExpiresAt: plot.status === 'Hold' ? plot.holdExpiresAt : null,
      recipientName: plot.heldByCustomerName || lead?.name || cust?.name || '',
      recipientPhone: plot.heldByCustomerPhone || lead?.phone || cust?.phone || '',
      recipientEmail: lead?.email || cust?.email || '',
      leadId: plot.heldByLeadId || null,
      customerId: plot.heldByCustomerId || null,
      ...overrides,
    });
  };

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
    setHoldSourceType('customer');
    setSelectedCustomerId('');
    setSelectedLeadId('');
    setHoldCustomer('');
    setHoldPhone('');
    // Default: 7 days from now at 6:00 PM (fully editable)
    applyHoldPreset(7);
    setHoldUntilTime('18:00');
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
    if (!holdCustomer.trim()) {
      alert(holdSourceType === 'customer' ? 'Please select a customer.' : holdSourceType === 'lead' ? 'Please select a lead.' : 'Client name is required.');
      return;
    }
    if (!holdPhone.trim()) {
      alert('Phone number is required.');
      return;
    }
    if (holdUntilError || !holdUntilDateObj) {
      alert(holdUntilError || 'Select the hold expiry date and time.');
      return;
    }
    setSubmittingHold(true);
    try {
      const daysApprox = Math.min(MAX_HOLD_DAYS, Math.max(1, Math.ceil((holdUntilDateObj.getTime() - Date.now()) / 86400000)));
      const success = await jaminApiService.holdPlot(
        String(selectedPlot.id),
        holdCustomer.trim(),
        holdPhone.trim(),
        daysApprox,
        undefined,
        user?.name || undefined,
        holdSourceType === 'customer' && selectedCustomerId ? selectedCustomerId : undefined,
        holdSourceType === 'lead' && selectedLeadId ? selectedLeadId : undefined,
        holdUntilDateObj.toISOString()
      );
      if (success) {
        const heldPlot = selectedPlot;
        const holdLead = holdSourceType === 'lead' && selectedLeadId ? leadsList.find((l: any) => String(l.id) === String(selectedLeadId)) : null;
        const holdCust = holdSourceType === 'customer' && selectedCustomerId ? customersList.find((c: any) => String(c.id) === String(selectedCustomerId)) : null;
        setIsHoldModalOpen(false);
        setSelectedPlot(null);
        await loadData(selectedProject);
        if (shareDocsAfterHold && heldPlot) {
          openShareDocs({ ...heldPlot, status: 'Hold' }, {
            holdExpiresAt: holdUntilDateObj.toISOString(),
            recipientName: holdCustomer.trim(),
            recipientPhone: holdPhone.trim(),
            recipientEmail: holdLead?.email || holdCust?.email || '',
            leadId: holdSourceType === 'lead' && selectedLeadId ? selectedLeadId : null,
            customerId: holdSourceType === 'customer' && selectedCustomerId ? selectedCustomerId : null,
          });
        }
      } else {
        alert('Failed to place plot on hold. Please check plot status.');
      }
    } catch (err) {
      console.error('Hold plot error', err);
      alert('Error communicating with server.');
    } finally {
      setSubmittingHold(false);
    }
  };

  const handleReleaseHold = async (plot: any) => {
    if (confirm(`Release hold on ${plot.plotNumber} back to Available status?`)) {
      try {
        const success = await jaminApiService.releasePlot(String(plot.id));
        if (success) {
          setSelectedPlot(null);
          await loadData(selectedProject);
        } else {
          alert('Failed to release plot hold.');
        }
      } catch (err) {
        console.error('Release hold error', err);
      }
    }
  };

  const handleOpenBooking = async (plot: any) => {
    setSelectedPlot(plot);
    const { custs, lds } = await loadHoldEntities();

    const heldPhone = (plot.heldByCustomerPhone || plot.holdPhone || '').trim();
    const heldName = (plot.heldByCustomerName || plot.holdCustomer || '').trim();

    if (plot.heldByCustomerId) {
      setBookingSourceType('customer');
      setSelectedBookingCustomerId(String(plot.heldByCustomerId));
      setSelectedBookingLeadId('');
      const matched = effectiveCustomersList.find((c: any) => String(c.id) === String(plot.heldByCustomerId));
      setBookingCustomerName(matched?.name || heldName);
      setBookingCustomerPhone(matched?.phone || heldPhone);
    } else if (heldName || heldPhone) {
      setBookingSourceType('custom');
      setSelectedBookingCustomerId('');
      setSelectedBookingLeadId('');
      setBookingCustomerName(heldName);
      setBookingCustomerPhone(heldPhone);
    } else {
      setBookingSourceType('customer');
      setSelectedBookingCustomerId('');
      setSelectedBookingLeadId('');
      setBookingCustomerName('');
      setBookingCustomerPhone('');
    }

    const price = plot.price || plot.totalPrice || 0;
    setBookingTotalAgreementValue(price);
    setBookingTokenAmount(undefined);
    setBookingPaymentMode('');
    setBookingPaymentTerms('');
    setBookingNotes('');
    setIsBookingModalOpen(true);
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
    await handleOpenBooking(plot);
    if (sel.leadId) {
      setBookingSourceType('lead');
      setSelectedBookingLeadId(String(sel.leadId));
      setSelectedBookingCustomerId('');
    } else if (sel.customerId) {
      setBookingSourceType('customer');
      setSelectedBookingCustomerId(String(sel.customerId));
      setSelectedBookingLeadId('');
    } else {
      setBookingSourceType('custom');
    }
    setBookingCustomerName(sel.name || '');
    setBookingCustomerPhone(sel.phone || '');
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

    setSubmittingBooking(true);
    try {
      const price = bookingTotalAgreementValue ?? (selectedPlot.price || selectedPlot.totalPrice || 0);
      const result = await jaminApiService.createBooking({
        plotId: selectedPlot.id,
        projectId: selectedPlot.projectId,
        customerId: bookingSourceType === 'customer' && selectedBookingCustomerId ? parseInt(selectedBookingCustomerId, 10) : (selectedPlot?.heldByCustomerId ? parseInt(String(selectedPlot.heldByCustomerId), 10) : undefined),
        leadId: bookingSourceType === 'lead' && selectedBookingLeadId ? parseInt(selectedBookingLeadId, 10) : undefined,
        customerName: bookingCustomerName.trim(),
        customerPhone: bookingCustomerPhone.trim(),
        totalPlotPrice: price,
        tokenAmountPaid: bookingTokenAmount || 0,
        paymentMode: bookingPaymentMode,
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
        alert(result.message || 'Failed to confirm booking. The plot may already be held or booked by another transaction.');
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
                    {plot.holdExpiresAt && (() => {
                      const rem = getHoldRemaining(plot.holdExpiresAt);
                      return (
                        <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                          <span title="Hold expires — the plot is auto-released to Available at this time">
                            ⏰ Until <strong>{formatHoldExpiry(plot.holdExpiresAt)}</strong>
                          </span>
                          {rem.label && (
                            <span
                              style={{
                                fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                                background: rem.urgent ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                color: rem.urgent ? '#dc2626' : '#b45309',
                              }}
                            >
                              {rem.label}
                            </span>
                          )}
                        </div>
                      );
                    })()}
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      {plotShares[String(plot.id)] ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }} title="Legal document verification">
                          📄 <VerificationChip small status={plotShares[String(plot.id)].isExpired && plotShares[String(plot.id)].status !== 'Verified' ? 'Link expired' : plotShares[String(plot.id)].status} />
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, opacity: 0.85 }}>📄 Docs not shared</span>
                      )}
                      <button
                        title="Share legal documents with the customer"
                        onClick={e => { e.stopPropagation(); openShareDocs(plot); }}
                        style={{ background: 'transparent', color: 'inherit', border: '1px solid currentColor', borderRadius: 4, padding: '1px 7px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                      >
                        {plotShares[String(plot.id)] ? 'Resend Docs' : 'Share Docs'}
                      </button>
                    </div>
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
        isOpen={!!selectedPlot && !isHoldModalOpen && !isBookingModalOpen && !isEditPlotModalOpen && !isDeletePlotModalOpen && !shareTarget}
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
                <button
                  className="btn btn-secondary plot-release-btn"
                  onClick={() => handleReleaseHold(selectedPlot)}
                >
                  Release Hold to Available
                </button>
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
                {selectedPlot.holdByAgent && <div>Held By Agent: <strong>{selectedPlot.holdByAgent}</strong></div>}
                <div>
                  Expiry: <strong>{formatHoldExpiry(selectedPlot.holdExpiresAt)}</strong>
                  {selectedPlot.holdExpiresAt && getHoldRemaining(selectedPlot.holdExpiresAt).label && (
                    <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 600, color: getHoldRemaining(selectedPlot.holdExpiresAt).urgent ? '#dc2626' : '#b45309' }}>
                      ({getHoldRemaining(selectedPlot.holdExpiresAt).label})
                    </span>
                  )}
                </div>
              </div>
            )}

            <PlotDocumentsPanel
              plotId={selectedPlot.id}
              plotNumber={selectedPlot.plotNumber}
              canManage={canManagePlots}
              refreshKey={shareRefreshKey}
              onShareClick={() => openShareDocs(selectedPlot)}
              onSharesChanged={() => setShareRefreshKey(k => k + 1)}
            />
          </div>
        )}
      </Modal>

      {/* Share legal document pack with the customer */}
      <ShareDocumentsModal
        isOpen={!!shareTarget}
        target={shareTarget}
        onClose={() => setShareTarget(null)}
        onShared={() => setShareRefreshKey(k => k + 1)}
      />

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
          <div className="form-group">
            <label className="form-label">Link Reservation To</label>
            <div className="hold-source-tabs">
              <button
                type="button"
                className={`hold-source-tab ${holdSourceType === 'customer' ? 'active' : ''}`}
                onClick={() => handleSourceTypeChange('customer')}
              >
                Customer
              </button>
              <button
                type="button"
                className={`hold-source-tab ${holdSourceType === 'lead' ? 'active' : ''}`}
                onClick={() => handleSourceTypeChange('lead')}
              >
                Lead
              </button>
              <button
                type="button"
                className={`hold-source-tab ${holdSourceType === 'custom' ? 'active' : ''}`}
                onClick={() => handleSourceTypeChange('custom')}
              >
                Custom
              </button>
            </div>
          </div>

          {holdSourceType === 'customer' && (
            <>
              <div className="form-group">
                <label className="form-label">Select Customer *</label>
                <select
                  className="form-select"
                  value={selectedCustomerId}
                  onChange={handleCustomerChange}
                >
                  <option value="">-- Choose Existing Customer --</option>
                  {effectiveCustomersList.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {holdCustomer && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Customer Name</label>
                    <input type="text" className="form-input" value={holdCustomer} readOnly />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Customer Phone</label>
                    <input type="text" className="form-input" value={holdPhone} readOnly />
                  </div>
                </div>
              )}
            </>
          )}

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

          {holdSourceType === 'custom' && (
            <>
              <div className="form-group">
                <label htmlFor="plot-hold-customer" className="form-label">Client Name *</label>
                <input
                  id="plot-hold-customer"
                  name="holdCustomer"
                  type="text"
                  className="form-input"
                  required
                  value={holdCustomer}
                  onChange={e => setHoldCustomer(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Client Phone Number *</label>
                <input
                  type="tel"
                  className="form-input"
                  required
                  value={holdPhone}
                  onChange={e => setHoldPhone(e.target.value)}
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="plot-hold-until-date" className="form-label">Hold Until (Date &amp; Time) *</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {[1, 3, 7, 14].map(d => (
                <button
                  key={d}
                  type="button"
                  className={`btn btn-sm ${holdDays === String(d) ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '3px 10px', fontSize: 12 }}
                  onClick={() => applyHoldPreset(d)}
                >
                  +{d} {d === 1 ? 'Day' : 'Days'}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <input
                id="plot-hold-until-date"
                name="holdUntilDate"
                type="date"
                className="form-input"
                aria-label="Hold expiry date"
                value={holdUntilDate}
                min={toLocalDateInput(new Date())}
                max={toLocalDateInput(new Date(Date.now() + MAX_HOLD_DAYS * 86400000))}
                onChange={e => { setHoldUntilDate(e.target.value); setHoldDays('custom'); }}
              />
              <input
                id="plot-hold-until-time"
                name="holdUntilTime"
                type="time"
                className="form-input"
                aria-label="Hold expiry time"
                value={holdUntilTime}
                onChange={e => { setHoldUntilTime(e.target.value); setHoldDays('custom'); }}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={shareDocsAfterHold}
                onChange={e => setShareDocsAfterHold(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span>
                <strong>Share legal document pack after hold</strong>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)' }}>
                  Send the DTCP/RERA approvals, parent deed, EC, patta, plot sketch &amp; cost sheet so the customer's lawyer or bank can verify during the hold.
                </span>
              </span>
            </label>
            {holdUntilError ? (
              <div style={{ marginTop: 6, fontSize: 12, color: '#dc2626' }}>{holdUntilError}</div>
            ) : holdUntilDateObj && (
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                ⏰ Hold expires on <strong>{formatHoldExpiry(holdUntilDateObj.toISOString())}</strong>
                {' '}({getHoldRemaining(holdUntilDateObj.toISOString()).label}). The plot is released back to Available automatically at this time.
              </div>
            )}
          </div>
        </div>
      </Modal>

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
          <div className="form-group">
            <label className="form-label">Link Buyer To</label>
            <div className="hold-source-tabs">
              <button
                type="button"
                className={`hold-source-tab ${bookingSourceType === 'customer' ? 'active' : ''}`}
                onClick={() => handleBookingSourceTypeChange('customer')}
              >
                Customer
              </button>
              <button
                type="button"
                className={`hold-source-tab ${bookingSourceType === 'lead' ? 'active' : ''}`}
                onClick={() => handleBookingSourceTypeChange('lead')}
              >
                Lead
              </button>
              <button
                type="button"
                className={`hold-source-tab ${bookingSourceType === 'custom' ? 'active' : ''}`}
                onClick={() => handleBookingSourceTypeChange('custom')}
              >
                Custom
              </button>
            </div>
          </div>

          {bookingSourceType === 'customer' && (
            <>
              <div className="form-group">
                <label className="form-label">Select Customer *</label>
                <select
                  className="form-select"
                  value={selectedBookingCustomerId}
                  onChange={handleBookingCustomerChange}
                >
                  <option value="">-- Choose Existing Customer --</option>
                  {effectiveCustomersList.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {bookingCustomerName && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Customer Name</label>
                    <input type="text" className="form-input" value={bookingCustomerName} readOnly />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Customer Phone</label>
                    <input type="text" className="form-input" value={bookingCustomerPhone} readOnly />
                  </div>
                </div>
              )}
            </>
          )}

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

          {bookingSourceType === 'custom' && (
            <>
              <div className="form-group">
                <label className="form-label">Buyer Name *</label>
                <input
                  type="text"
                  className="form-input"
                  required
                  value={bookingCustomerName}
                  onChange={e => setBookingCustomerName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Buyer Phone Number *</label>
                <input
                  type="tel"
                  className="form-input"
                  required
                  value={bookingCustomerPhone}
                  onChange={e => setBookingCustomerPhone(e.target.value)}
                />
              </div>
            </>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Token Advance (₹) <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-muted)' }}></span></label>
              <input
                type="number"
                className="form-input"
                min={0}
                value={bookingTokenAmount ?? ''}
                onChange={e => setBookingTokenAmount(e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Total Agreement Value (₹) <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: 'var(--text-muted)' }}></span></label>
              <input
                type="number"
                className="form-input"
                min={0}
                value={bookingTotalAgreementValue ?? ''}
                onChange={e => setBookingTotalAgreementValue(e.target.value ? Number(e.target.value) : undefined)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Payment Mode</label>
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
