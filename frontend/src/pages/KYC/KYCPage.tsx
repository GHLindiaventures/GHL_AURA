import React, { useState, useEffect, useMemo, useRef, useId } from 'react';
import {
  FileCheck,
  Phone,
  Mail,
  MapPin,
  Clock,
  ArrowRight,
  ArrowLeft,
  CheckCircle,
  Eye,
  ShieldCheck,
  User,
  Upload,
  X,
  Plus,
  Trash2,
  AlertCircle,
  FileText,
  Building,
  CreditCard,
  Layers,
  Users,
  Edit2,
  Edit3,
  Send,
  UserCheck,
  Save,
  AlertTriangle,
  Info,
  Copy,
  Sparkles,
  Check,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { EXTERNAL_VERIFICATION_LINKS } from '../../constants/externalLinks';
import { SendKycLinkModal } from './components/SendKycLinkModal';
import { KycStatusBadge } from './components/KycStatusBadge';
import { normalizeLegacyKycStatus, KycChecklist, CustomerKycStatus } from '../../services/kycService';
import { KycRowActionsMenu } from './components/KycRowActionsMenu';
import { KycReviewDrawer } from './components/KycReviewDrawer';
import { KycVerifyModal } from './components/KycVerifyModal';
import { KycStageActionDropdown } from './components/KycStageActionDropdown';
import { PERMISSIONS } from '../../constants/permissions';
import { Deal, DealActivity, DocumentItem, Lead, Customer } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useCall } from '../../context/CallContext';
import { canPlaceCalls } from '../../utils/agentRoleUtils';
import { storageService } from '../../services/storageService';
import {
  getDeals,
  addDealActivity as apiAddDealActivity,
  getLeads,
  getCustomers,
  persistDeal,
} from '../../services/ghlApiService';
import { DataTable, Column, RowAction } from '../../components/common/DataTable';
import { FilterBar } from '../../components/common/FilterBar';
import { Modal } from '../../components/common/Modal';
import { ErrorAlertBanner } from '../../components/common/ErrorAlertBanner';
import { getAuthHeaders } from '../../utils/authHeaders';
import { apiUrl } from '../../utils/apiUrl';
import { saveKycLocal } from '../../utils/kycStorage';
import {
  SharedKycFormData,
  NomineeItem,
  sanitizeDobString,
} from '../../utils/kycValidators';
import {
  formatKycCurrency,
  getDealDaysInStage,
  findMatchingLeadAndCustomer,
  buildKycRecordMap,
  copyPanAndOpenPortal,
  buildAssistedKycPayload,
  formatBytes,
  getGhlId,
  getJoinedDate,
  calculateProfileCompletion,
  validateKycStepWithDocs,
  resolveCustomerKycStatus as resolveCustomerKycStatusHelper,
  getResolvedLocation as getResolvedLocationHelper,
  getCustomerFilledCapacity as getCustomerFilledCapacityHelper,
  getIrmInvestmentHorizon as getIrmInvestmentHorizonHelper,
  buildOriginalKycAgentOptions,
  filterOriginalKycDeals,
  countKpiMetrics,
  filterDealsByKpi,
  enrichDealWithContact,
  findBackendKyc,
  resolveCustomerInvestmentAmount,
  buildMergedProfileData,
  resolveDocUploadEntity as resolveDocUploadEntityHelper,
  buildKycDraftMetadata,
  BLANK_KYC_FORM,
  determineKycCorrectionStep,
  resolveKycResumeStep,
  buildInitialKycFormData,
  buildAssistedSubmissionMetadata,
  collectKycDocsForStorage,
} from './helpers/kycHelpers';
import {
  KycToast,
  KycDossierModal,
  NotSpecifiedBadge,
  SpecifiedValueBadge,
  PreferredAssetBadge,
  KycStatusPill,
} from '../../components/kyc';
import './KYCPage.css';

// ── Types for GHL IRM 5-Step Flow ──────────────────────────────────────────────
export type { NomineeItem };

/** A KYC document. `url` is set once the file is stored on the server. */
export interface KycDoc {
  name: string;
  size: string;
  type: string;
  url?: string;
}

// File objects can't be serialised; keep them here (keyed by the doc object) until they are uploaded.
const pendingDocFiles = new WeakMap<object, File>();
const MAX_KYC_UPLOAD_BYTES = 10 * 1024 * 1024; // matches the server limit (10 MB)

export interface KYCFormData extends SharedKycFormData {
  aadhaarDoc: KycDoc | null;
  panDoc: KycDoc | null;
  bankProofDoc: KycDoc | null;
  dematDoc: KycDoc | null;
  photoDoc: KycDoc | null;
  photoUrl?: string;
}

// formatBytes imported from helpers

// ── File Upload Helper Card ───────────────────────────────────────────────────
interface KYCUploadProps {
  label: string;
  required?: boolean;
  doc: KycDoc | null;
  error?: string;
  onUpload: (doc: KycDoc) => void;
  onRemove: () => void;
}

const KYCUploadCard: React.FC<KYCUploadProps> = ({
  label,
  required,
  doc,
  error,
  onUpload,
  onRemove,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadInputId = useId();

  const handleFile = (file: File) => {
    if (file.size > MAX_KYC_UPLOAD_BYTES) {
      window.alert('File is too large. Maximum allowed size is 10 MB.');
      return;
    }
    const doc: KycDoc = {
      name: file.name,
      size: formatBytes(file.size),
      type: file.type || 'application/pdf',
    };
    pendingDocFiles.set(doc, file);
    onUpload(doc);
  };

  return (
    <div className="form-group" style={{ marginBottom: 12 }}>
      <label className="form-label" htmlFor={uploadInputId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{label} {required && <span style={{ color: '#ef4444' }}>*</span>}</span>
        {doc && (
          doc.url || pendingDocFiles.has(doc) ? (
            <span style={{ color: '#10b981', fontSize: 11, fontWeight: 700 }}>✓ Uploaded</span>
          ) : (
            <span style={{ color: '#f59e0b', fontSize: 11, fontWeight: 700 }}>⚠️ Needs re-attachment</span>
          )
        )}
      </label>

      {doc ? (
        <div className="kyc-uploaded-card">
          <div className="kyc-uploaded-info">
            <FileText size={18} color="#10b981" />
            <div>
              <div className="kyc-uploaded-name" title={doc.name}>{doc.name}</div>
              <div className="kyc-uploaded-size">{doc.size}</div>
            </div>
          </div>
          <button
            type="button"
            className="kyc-remove-upload-btn"
            title="Remove document"
            onClick={onRemove}
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={`kyc-upload-dropzone ${error ? 'has-error' : ''}`}
          style={{ width: '100%', font: 'inherit', color: 'inherit' }}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
        >
          <Upload size={22} color="var(--primary-600)" />
          <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
            Click to upload or drag & drop
          </span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>
            PDF, JPG, PNG up to 10 MB
          </span>
        </button>
      )}

      <input
        ref={inputRef}
        id={uploadInputId}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />

      {error && <div className="kyc-field-error">{error}</div>}
      

    </div>
  );
};

// ==============================================================================
// PREFERRED ASSET CLASS RESOLVER (Only display if confirmed from real customer/IRM input)
// ==============================================================================
const resolvePreferredAssetClass = (deal: Deal, leadsList: Lead[] = [], customersList: Customer[] = []) => {
  // 1. Direct confirmed deal property (highest fidelity - saved by IRM on the deal)
  const dealPref = deal.preferredAssetClass?.trim();
  if (dealPref && dealPref !== '—' && dealPref.toLowerCase() !== 'not specified') {
    return dealPref;
  }

  const fDigits = (deal.phone || '').replace(/\D/g, '').slice(-10);
  const { matchingLead, matchingCustomer } = findMatchingLeadAndCustomer(deal, leadsList, customersList);

  const isConfirmedFlag = (val: any) =>
    val === true || val === 'true' || val === 'True' || val === 1 || val === '1';

  const _leadConfirmed = isConfirmedFlag(matchingLead?.customFields?.irmPreferencesConfirmed);
  const _custConfirmed = isConfirmedFlag(matchingCustomer?.customFields?.irmPreferencesConfirmed);

  let savedLocal: any = null;
  try {
    const raw =
      (deal.customerId ? localStorage.getItem(`nexus_irm_pref_${deal.customerId}`) : null) ||
      (fDigits ? localStorage.getItem(`nexus_irm_pref_${fDigits}`) : null) ||
      localStorage.getItem(`nexus_irm_pref_${deal.id}`);
    if (raw) savedLocal = JSON.parse(raw);
  } catch { }

  // 2. Confirmed lead custom fields
  if (matchingLead?.customFields?.preferredAssetClass) {
    const lPref = matchingLead.customFields.preferredAssetClass.trim();
    if (lPref && lPref !== '—' && lPref.toLowerCase() !== 'not specified') {
      return lPref;
    }
  }

  // 3. Confirmed customer custom fields
  if (matchingCustomer?.customFields?.preferredAssetClass) {
    const cPref = matchingCustomer.customFields.preferredAssetClass.trim();
    if (cPref && cPref !== '—' && cPref.toLowerCase() !== 'not specified') {
      return cPref;
    }
  }

  // 4. Stored local preference
  if (savedLocal?.preferredAssetClass) {
    const sPref = String(savedLocal.preferredAssetClass).trim();
    if (sPref && sPref !== '—' && sPref.toLowerCase() !== 'not specified') {
      return sPref;
    }
  }

  return '—';
};


// ==============================================================================
// GHL INDIA VENTURES -> IRM KYC EXPERIENCE
// ==============================================================================
const GhlIrmKycView: React.FC = () => {
  const { tenant, user, permissions = [] } = useAuth();
  const { initiateCall } = useCall();

  const roleCode = (user?.role?.code || '').toLowerCase();
  const isGhlAdmin =
    roleCode === 'company_admin' ||
    roleCode === 'admin' ||
    roleCode === 'super_admin' ||
    roleCode === 'ghl_admin' ||
    Boolean(user?.role?.name?.toLowerCase().includes('admin'));

  const reqId = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // KYC Link Feature State
  const [sendLinkDeal, setSendLinkDeal] = useState<Deal | null>(null);
  const [reviewDeal, setReviewDeal] = useState<Deal | null>(null);
  const [dbKycs, setDbKycs] = useState<Record<string, any>>({});
  const [kycSyncWarning, setKycSyncWarning] = useState<string | null>(null);
  const [_isLiveKycLoaded, setIsLiveKycLoaded] = useState<boolean>(false);
  const [sentDealIds, setSentDealIds] = useState<Record<string, boolean>>({});

  // In-flight upload promise deduplication mutex & step save flag
  const [isStepSaving, setIsStepSaving] = useState<boolean>(false);
  const inFlightUploads = useRef<WeakMap<object, Promise<string | null>>>(new WeakMap());

  // View state: 'table' | 'flow' | 'profile'
  const [viewMode, setViewMode] = useState<'table' | 'flow' | 'profile'>('table');
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [selectedCustomerDeal, setSelectedCustomerDeal] = useState<Deal | null>(null);
  const [profileKycData, setProfileKycData] = useState<Partial<KYCFormData> | null>(null);
  const [profileDossierTab, setProfileDossierTab] = useState<'all' | 'personal' | 'identity' | 'bank' | 'demat' | 'nominees'>('all');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [verifyModalDeal, setVerifyModalDeal] = useState<Deal | null>(null);

  // Dossier modal for table preview
  const [selectedDealForDetail, setSelectedDealForDetail] = useState<Deal | null>(null);

  // Form State
  const [formData, setFormData] = useState<KYCFormData>(BLANK_KYC_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [sameAsPermanent, setSameAsPermanent] = useState(false);

  // Assisted KYC State
  const [isAssistedFlow, setIsAssistedFlow] = useState<boolean>(false);
  const [isAssistedReviewModalOpen, setIsAssistedReviewModalOpen] = useState<boolean>(false);
  const [customerConsentChecked, setCustomerConsentChecked] = useState<boolean>(false);
  const [lastSavedDraftAt, setLastSavedDraftAt] = useState<string | null>(null);

  const todayDateString = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [validationErrorSummary, setValidationErrorSummary] = useState<string | null>(null);


  const refreshDbKycs = async () => {
    try {
      const res = await fetch(apiUrl('/irm/kyc/all'), {
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        setKycSyncWarning(`Live KYC synchronization failed (HTTP ${res.status}). Retaining cached records.`);
        setIsLiveKycLoaded(false);
        return;
      }
      const json = await res.json();
      if (json?.success && Array.isArray(json.data)) {
        setKycSyncWarning(null);
        setIsLiveKycLoaded(true);
        const map = buildKycRecordMap(json.data);
        setDbKycs(map);
      }
    } catch {
      setKycSyncWarning('Network error: Live KYC synchronization failed. Retaining cached records.');
      setIsLiveKycLoaded(false);
    }
  };

  const resolveCustomerKycStatus = (deal: Deal): CustomerKycStatus => {
    return resolveCustomerKycStatusHelper(deal, { dbKycs, tenantId: tenant?.id, sentDealIds });
  };

  const loadData = async () => {
    const my = ++reqId.current;
    setIsLoading(true);
    setLoadError(false);
    try {
      interface KycFetchResult {
        isError: boolean;
        status?: number;
        networkError?: boolean;
        message?: string;
        json?: any;
      }

      const [allDeals, apiLeads, apiCustomers, kycResponse] = await Promise.all([
        getDeals(tenant?.id),
        getLeads(tenant?.id),
        getCustomers(tenant?.id),
        fetch(apiUrl('/irm/kyc/all'), {
          headers: getAuthHeaders(),
        })
          .then(async (res): Promise<KycFetchResult> => {
            if (!res.ok) {
              return { isError: true, status: res.status, message: `HTTP ${res.status}` };
            }
            const json = await res.json().catch(() => null);
            return { isError: false, json };
          })
          .catch((err): KycFetchResult => {
            console.warn('[KYCPage] Error fetching KYC records:', err);
            return { isError: true, networkError: true, message: err?.message || 'Network error' };
          }),
      ]);
      if (my !== reqId.current) return;

      if (kycResponse?.isError) {
        setKycSyncWarning(
          kycResponse.networkError
            ? 'Network error: Unable to load live KYC records. Showing cached or local records.'
            : `Live KYC synchronization failed (${kycResponse.message}). Showing cached or local records.`
        );
        setIsLiveKycLoaded(false);
      } else if (kycResponse?.json?.success && Array.isArray(kycResponse.json.data)) {
        setKycSyncWarning(null);
        setIsLiveKycLoaded(true);
        const map = buildKycRecordMap(kycResponse.json.data);
        setDbKycs(map);
      }

      const leadsList = apiLeads || [];
      const customersList = apiCustomers || [];
      const enriched = (allDeals || []).map(d => enrichDealWithContact(d, leadsList, customersList));
      const qualified = enriched.filter(d => d.stage === 'qualified_investor');
      const isIrmUser = user?.role?.code === 'irm';
      const myNameLower = (user?.name || '').toLowerCase().trim();
      const myIdStr = user?.id ? String(user.id) : '';
      const scopedQualified = isIrmUser
        ? qualified.filter(d => {
            const agentId = d.assignedAgentId ? String(d.assignedAgentId) : '';
            const agentName = (d.assignedAgentName || '').toLowerCase().trim();
            if (myIdStr && agentId === myIdStr) return true;
            if (myNameLower && (agentName === myNameLower || agentName.includes(myNameLower) || myNameLower.includes(agentName))) return true;
            if (!agentId && !agentName) return true;
            return false;
          })
        : qualified;

      const seenCustomer = new Set<string>();
      const dedupedDeals: Deal[] = [];
      for (const d of scopedQualified) {
        const ph = (d.phone || '').replace(/\D/g, '').slice(-10);
        const em = (d.email || '').trim().toLowerCase();
        const key = ph ? `ph:${ph}` : em ? `em:${em}` : d.customerId ? `cid:${d.customerId}` : `id:${d.id}`;
        if (!seenCustomer.has(key)) {
          seenCustomer.add(key);
          dedupedDeals.push(d);
        }
      }
      setDeals(dedupedDeals);
      setLeads(leadsList);
      setCustomers(customersList);
    } catch {
      if (my === reqId.current) {
        setLoadError(true);
      }
    } finally {
      if (my === reqId.current) {
        setIsLoading(false);
      }
    }
  };

  const getResolvedLocation = (deal: Deal) => getResolvedLocationHelper(deal, leads, customers);

  const getCustomerFilledCapacity = (deal: Deal) => getCustomerFilledCapacityHelper(deal, leads, customers);

  const getIrmPreferredAssetClass = (deal: Deal) => {
    return resolvePreferredAssetClass(deal, leads, customers);
  };

  const getCustomerInvestmentAmount = (deal: Deal) => {
    return resolveCustomerInvestmentAmount(deal, leads, customers);
  };

  const getIrmInvestmentHorizon = (deal: Deal) => getIrmInvestmentHorizonHelper(deal, leads, customers);

  const getDynamicKycStatus = (deal: Deal): 'completed' | 'continue' | 'pending' => {
    // Only manual IRM action setting deal.kycStatus === 'Verified' (or legacy Completed with recorded verifiedBy) counts as completed
    const normalized = normalizeLegacyKycStatus(deal.kycStatus, deal.verifiedBy);
    if (normalized === 'Verified') return 'completed';
    return 'pending';
  };

  useEffect(() => {
    void loadData();
    let timeoutId: any;
    const handleUpdate = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        void loadData();
      }, 300);
    };
    window.addEventListener('nexus_storage_updated', handleUpdate);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('nexus_storage_updated', handleUpdate);
    };
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- loadData intentionally excluded; only re-run when tenant changes
  }, [tenant?.id]);

  useEffect(() => {
    const interval = setInterval(() => {
      void refreshDbKycs();
    }, 15000);

    const handleFocus = () => {
      void refreshDbKycs();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshDbKycs();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);


  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const _getDaysInStage = (deal: Deal) => getDealDaysInStage(deal);
  const formatCurrency = (val: number) => formatKycCurrency(val);

  // getGhlId, getJoinedDate, calculateProfileCompletion imported directly from helpers

  const handleOpenCustomerProfile = (deal: Deal) => {
    setSelectedCustomerDeal(deal);
    const { matchingLead, matchingCustomer } = findMatchingLeadAndCustomer(deal, leads, customers);

    // 1. Stable lookup using stable investor / deal / KYC record ID and company scope first
    const dbKyc = findBackendKyc(deal, dbKycs, tenant?.id);
    const merged = buildMergedProfileData(deal, dbKyc, matchingLead, matchingCustomer);

    setProfileKycData(merged);
    setViewMode('profile');
  };

  useEffect(() => {
    if (!selectedCustomerDeal || viewMode !== 'profile') return;
    let isCancelled = false;
    const fetchLiveKycForProfile = async () => {
      try {
        // Only a real KYC record id may be used here. customerId / deal.id are different id spaces and
        // would load (and show) some other investor's KYC. Without a KYC id we look up by email instead.
        const targetId = (selectedCustomerDeal as any).kycId ||
                         (selectedCustomerDeal as any).kycRecordId ||
                         0;
        let liveRecord: any = null;
        if (targetId) {
          const res = await fetch(apiUrl(`/irm/kyc/${targetId}`), { headers: getAuthHeaders() });
          if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) {
              liveRecord = json.data;
            }
          }
        }
        if (!liveRecord && selectedCustomerDeal.email) {
          const res = await fetch(apiUrl(`/irm/kyc/by-email?email=${encodeURIComponent(selectedCustomerDeal.email)}`), { headers: getAuthHeaders() });
          if (res.ok) {
            const json = await res.json();
            if (json.success && json.data) {
              liveRecord = json.data;
            }
          }
        }
        if (!liveRecord && selectedCustomerDeal.customerId) {
          const numId = Number.parseInt(String(selectedCustomerDeal.customerId).replace(/\D/g, ''), 10);
          if (numId > 0) {
            try {
              const res = await fetch(apiUrl(`/irm/kyc/${numId}`), { headers: getAuthHeaders() });
              if (res.ok) {
                const json = await res.json();
                if (json.success && json.data) liveRecord = json.data;
              }
            } catch {}
          }
        }
        if (!liveRecord && selectedCustomerDeal.phone && selectedCustomerDeal.phone.trim()) {
          try {
            const res = await fetch(apiUrl(`/irm/kyc/by-phone?phone=${encodeURIComponent(selectedCustomerDeal.phone.trim())}`), { headers: getAuthHeaders() });
            if (res.ok) {
              const json = await res.json();
              if (json.success && json.data) liveRecord = json.data;
            }
          } catch {}
        }
        if (!liveRecord) {
          try {
            const res = await fetch(apiUrl('/irm/kyc/all'), { headers: getAuthHeaders() });
            if (res.ok) {
              const json = await res.json();
              if (json.success && Array.isArray(json.data)) {
                const pDigits = (selectedCustomerDeal.phone || '').replace(/\D/g, '').slice(-10);
                const cleanMail = (selectedCustomerDeal.email || '').trim().toLowerCase();
                const cleanName = (selectedCustomerDeal.customerName || '').trim().toLowerCase();
                const matched = json.data.find((k: any) => {
                  const kp = (k.phone || '').replace(/\D/g, '').slice(-10);
                  if (pDigits && kp && pDigits === kp) return true;
                  const km = (k.email || '').trim().toLowerCase();
                  if (cleanMail && km && cleanMail === km) return true;
                  const kn = (k.investorName || '').trim().toLowerCase();
                  if (cleanName && kn && cleanName === kn) return true;
                  return false;
                });
                if (matched?.id) {
                  const det = await fetch(apiUrl(`/irm/kyc/${matched.id}`), { headers: getAuthHeaders() });
                  if (det.ok) {
                    const detJson = await det.json();
                    if (detJson.success && detJson.data) liveRecord = detJson.data;
                  }
                }
              }
            }
          } catch {}
        }
        if (!isCancelled && liveRecord) {
          setDbKycs(prev => ({
            ...prev,
            [`id_${liveRecord.id}`]: liveRecord,
            ...(liveRecord.investorId ? { [`inv_${liveRecord.investorId}`]: liveRecord } : {}),
            ...(liveRecord.email ? { [`email_${liveRecord.email.toLowerCase().trim()}`]: liveRecord, [liveRecord.email.toLowerCase().trim()]: liveRecord } : {}),
          }));
          const fDigits = (selectedCustomerDeal.phone || '').replace(/\D/g, '').slice(-10);
          const matchLead = leads.find(l => (selectedCustomerDeal.customerId && l.id === selectedCustomerDeal.customerId) || (l.phone && l.phone.replace(/\D/g, '').slice(-10) === fDigits));
          const matchCust = customers.find(c => (selectedCustomerDeal.customerId && c.id === selectedCustomerDeal.customerId) || (c.phone && c.phone.replace(/\D/g, '').slice(-10) === fDigits));
          setProfileKycData(buildMergedProfileData(selectedCustomerDeal, liveRecord, matchLead, matchCust));
        }
      } catch (err) {
        console.warn('Error loading live KYC record for customer profile:', err);
      }
    };
    void fetchLiveKycForProfile();
    return () => {
      isCancelled = true;
    };
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- leads/customers excluded intentionally; effect only syncs on deal/view change
  }, [selectedCustomerDeal, viewMode]);

  const handleExitFlow = () => {
    if (isAssistedFlow && selectedDeal) {
      void handleSaveDraft(false);
    }
    setViewMode('table');
    setSelectedCustomerDeal(null);
    setIsAssistedFlow(false);
  };

  // Browser Back button handling while in KYC flow
  useEffect(() => {
    if (viewMode === 'flow') {
      window.history.pushState({ kycFlow: true }, '');
      const handlePopState = () => {
        handleExitFlow();
      };
      window.addEventListener('popstate', handlePopState);
      return () => {
        window.removeEventListener('popstate', handlePopState);
      };
    }
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- handleExitFlow excluded intentionally to avoid re-registering listener on every render
  }, [viewMode]);

  // Helper to open the 5-step wizard prefilled with deal info
  const startKycFlow = (deal?: Deal, targetStep?: 1 | 2 | 3 | 4 | 5, isAssisted?: boolean) => {
    const targetDeal = deal || selectedCustomerDeal || null;
    setSelectedDeal(targetDeal);
    if (!isAssisted) {
      if (targetDeal) setSelectedCustomerDeal(targetDeal);
    } else {
      setSelectedCustomerDeal(null);
    }
    setIsAssistedFlow(!!isAssisted);

    // Retrieve saved KYC data if any
    const savedKycKey = targetDeal ? `nexus_kyc_data_${targetDeal.id}` : null;
    let savedKycData: Partial<KYCFormData> | null = null;
    if (savedKycKey) {
      try {
        const existing = localStorage.getItem(savedKycKey);
        if (existing) savedKycData = JSON.parse(existing);
      } catch {}
    }

    const dbKyc = targetDeal ? findBackendKyc(targetDeal, dbKycs, tenant?.id) : null;
    const initialForm = buildInitialKycFormData({
      targetDeal,
      leads,
      customers,
      dbKyc,
      savedKycData,
      blankForm: BLANK_KYC_FORM,
    });

    const draftMetaJson = targetDeal ? localStorage.getItem(`nexus_kyc_draft_${targetDeal.id}`) : null;
    const { resumeStep, lastSavedDraftAt } = resolveKycResumeStep(targetStep, draftMetaJson);
    if (lastSavedDraftAt) {
      setLastSavedDraftAt(lastSavedDraftAt);
    }

    setFormData(initialForm);
    setFormErrors({});
    setValidationErrorSummary(null);
    setCurrentStep(resumeStep);
    setViewMode('flow');
  };

  const startAssistedKycFlow = (deal: Deal, targetStep?: 1 | 2 | 3 | 4 | 5) => {
    startKycFlow(deal, targetStep, true);
  };

  const handleCorrectKycDetails = (deal: Deal) => {
    const targetStep = determineKycCorrectionStep(deal);
    startAssistedKycFlow(deal, targetStep);
  };


  /** Uploads a KYC document file to the server (once) and returns its stored URL. */
  const uploadKycDoc = async (
    doc: KycDoc | null,
    category: string,
    deal: Deal
  ): Promise<string | null> => {
    if (!doc) return null;
    if (doc.url) return doc.url;

    // Mutex / in-flight deduplication to prevent duplicate concurrent uploads
    const existing = inFlightUploads.current.get(doc);
    if (existing) {
      return existing;
    }

    const uploadPromise = (async () => {
      const file = pendingDocFiles.get(doc);
      if (!file) {
        throw new Error(`Please re-attach the ${category} document and try again.`);
      }

      const { entityType, entityId } = resolveDocUploadEntityHelper(deal, customers, leads);

      const fd = new FormData();
      fd.append('Name', file.name);
      fd.append('Size', doc.size);
      fd.append('Type', doc.type);
      fd.append('Category', category);
      fd.append('EntityType', entityType);
      fd.append('EntityId', entityId);
      fd.append('File', file);

      const res = await fetch(apiUrl('/documents'), {
        method: 'POST',
        headers: getAuthHeaders(), // no Content-Type: the browser sets the multipart boundary
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success || !json?.data?.fileUrl) {
        throw new Error(json?.message || `Failed to upload ${category} document.`);
      }
      doc.url = String(json.data.fileUrl); // cache so retries don't upload again
      return doc.url;
    })();

    inFlightUploads.current.set(doc, uploadPromise);
    try {
      return await uploadPromise;
    } finally {
      inFlightUploads.current.delete(doc);
    }
  };

  const saveBackendDraft = async (deal: Deal, data: KYCFormData, step: number) => {
    try {
      // Step-aware document upload: uploads required documents and propagates failures
      const uploadOrThrow = async (doc: KycDoc | null, category: string, isRequired: boolean) => {
        if (!doc) return null;
        if (doc.url) return doc.url;
        try {
          return await uploadKycDoc(doc, category, deal);
        } catch (e: any) {
          if (isRequired || pendingDocFiles.has(doc)) {
            throw e;
          }
          console.warn(`[KYC draft] ${category} upload non-critical failure:`, e);
          return null;
        }
      };

      const isStep2 = step === 2;
      const isStep3 = step === 3;
      const isStep4 = step === 4;

      const docUrls = {
        pan: await uploadOrThrow(data.panDoc, 'KYC - PAN', isStep2),
        aadhaar: await uploadOrThrow(data.aadhaarDoc, 'KYC - Aadhaar', isStep2),
        bank: await uploadOrThrow(data.bankProofDoc, 'KYC - Bank Proof', isStep3),
        demat: data.hasNoDemat ? null : await uploadOrThrow(data.dematDoc, 'KYC - Demat Statement', isStep4),
        photo: await uploadOrThrow(data.photoDoc, 'KYC - Investor Photo', isStep2),
      };

      // Keep local state & storage synchronized with returned server URLs
      if (data.panDoc && docUrls.pan) data.panDoc.url = docUrls.pan;
      if (data.aadhaarDoc && docUrls.aadhaar) data.aadhaarDoc.url = docUrls.aadhaar;
      if (data.bankProofDoc && docUrls.bank) data.bankProofDoc.url = docUrls.bank;
      if (data.dematDoc && docUrls.demat) data.dematDoc.url = docUrls.demat;
      if (data.photoDoc && docUrls.photo) data.photoDoc.url = docUrls.photo;
      saveKycLocal(deal.id, data);

      const payload = buildAssistedKycPayload(deal, data, docUrls, { isFinalSubmit: false });
      const res = await fetch(apiUrl('/irm/kyc/assisted-draft'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.message || `Draft was not saved on the server (${res.status}).`);
      } else {
        setFormData({ ...data });
      }
    } catch (err) {
      console.warn('Draft save error:', err);
      throw err;
    }
  };

  const submitBackendAssistedKyc = async (deal: Deal, data: KYCFormData) => {
    try {
      // Upload the actual files first; submission fails (and nothing is reported as saved) if an upload fails.
      const panUrl = await uploadKycDoc(data.panDoc, 'KYC - PAN', deal);
      const aadhaarUrl = await uploadKycDoc(data.aadhaarDoc, 'KYC - Aadhaar', deal);
      const bankUrl = await uploadKycDoc(data.bankProofDoc, 'KYC - Bank Proof', deal);
      const dematUrl = data.hasNoDemat ? null : await uploadKycDoc(data.dematDoc, 'KYC - Demat Statement', deal);
      const photoUrl = await uploadKycDoc(data.photoDoc, 'KYC - Investor Photo', deal);
      const payload = buildAssistedKycPayload(
        deal,
        data,
        {
          pan: panUrl,
          aadhaar: aadhaarUrl,
          bank: bankUrl,
          demat: dematUrl,
          photo: photoUrl,
        },
        {
          isFinalSubmit: true,
          customerConsentObtained: Boolean(customerConsentChecked),
          customerConsentTimestamp: new Date().toISOString(),
          customerConsentDetails: "Customer verbal and electronic consent obtained during assisted KYC session.",
        }
      );
      const res = await fetch(apiUrl('/irm/kyc/assisted-submit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.message || 'Failed to submit assisted KYC to backend');
      }
      const json = await res.json().catch(() => null);
      return json?.data;
    } catch (err) {
      console.error('[Assisted KYC] Backend submit error:', err);
      throw err;
    }
  };

  const handleSaveDraft = async (showToastNotice: boolean = true): Promise<boolean> => {
    if (!selectedDeal) return false;
    const dealId = selectedDeal.id;

    // Preserve existing submitted/verified status — avoid overwriting
    const currentResolved = resolveCustomerKycStatus(selectedDeal);
    const isAlreadyFinished =
      currentResolved === 'Verified' ||
      currentResolved === 'Submitted' ||
      currentResolved === 'Assisted KYC – Submitted for Verification';

    // 1. Save all form field values locally (sanitized)
    saveKycLocal(dealId, formData);

    // 2. Save draft metadata
    const nowIso = new Date().toISOString();
    const draftPayload = buildKycDraftMetadata(currentStep, user, nowIso);
    localStorage.setItem(`nexus_kyc_draft_${dealId}`, JSON.stringify(draftPayload));
    setLastSavedDraftAt(nowIso);

    // 3. Mark status as 'Assisted Draft' ONLY if not already finished
    if (!isAlreadyFinished) {
      localStorage.setItem(`nexus_kyc_status_${dealId}`, 'Assisted Draft');
      const updatedDeal: Deal = {
        ...selectedDeal,
        customerKycStatus: 'Assisted Draft' as any,
      };
      void persistDeal(updatedDeal).catch(() => {});
    }

    // 4. Save to backend if authenticated (awaiting upload & draft persistence)
    if (user) {
      try {
        await saveBackendDraft(selectedDeal, formData, currentStep);
      } catch (err: any) {
        const errorMsg = err?.message || 'Server error while saving draft or uploading documents.';
        setValidationErrorSummary(`Save / Upload failed: ${errorMsg}`);
        showToast(`⚠️ ${errorMsg}`);
        return false;
      }
    }

    window.dispatchEvent(new Event('nexus_storage_updated'));
    if (showToastNotice) {
      showToast(`Assisted KYC draft saved at Step ${currentStep} of 5. You can resume at any time.`);
    }
    return true;
  };

  // Advance deal to opportunity — saves to DB
  
  const handleStatusChange = async (
    deal: Deal,
    newStatus: 'Pending' | 'Wrong' | 'Verified',
    comment?: string,
    flaggedSections?: string[],
    checklist?: KycChecklist
  ) => {
    const newCustStatus =
      newStatus === 'Verified' ? 'Verified' : newStatus === 'Wrong' ? 'Needs Correction' : 'Submitted';
    const verifiedBy = newStatus === 'Verified' ? (user?.email || user?.name || 'IRM User') : undefined;
    const verifiedAt = newStatus === 'Verified' ? new Date().toISOString() : undefined;

    // Resolve KYC record ID from the deal's own kycId / kycRecordId or matching dbKycs
    const emailKey = (deal.email || '').toLowerCase().trim();
    const phoneDigits = (deal.phone || '').replace(/\D/g, '').slice(-10);
    const dbItem = dbKycs[emailKey] || (phoneDigits ? Object.values(dbKycs).find((k: any) => (k.phone || '').replace(/\D/g, '').slice(-10) === phoneDigits) : null);
    // Never fall back to deal.customerId / deal.id: those are different id spaces and would update
    // (or verify) an unrelated investor's KYC record.
    const resolvedKycId =
      (deal as any).kycId ||
      (deal as any).kycRecordId ||
      dbItem?.id;

    if (typeof resolvedKycId === 'number' || /^\d+$/.test(String(resolvedKycId))) {
      try {
        const res = await fetch(apiUrl(`/irm/kyc/${resolvedKycId}/status`), {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            status: newStatus,
            comment,
            flaggedSections,
            checklist,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.message || `KYC status update rejected by backend (${res.status})`;
          showToast(errMsg);
          throw new Error(errMsg);
        }
      } catch (err: any) {
        console.warn('[KYCPage] PATCH status error:', err);
        showToast(err?.message || 'Error updating KYC status in backend.');
        throw err;
      }
    } else {
      const errMsg = 'Cannot update KYC status: no matching backend KYC submission found for this customer.';
      showToast(errMsg);
      throw new Error(errMsg);
    }

    const updatedDeal: Deal = {
      ...deal,
      kycStatus: newStatus,
      verifiedBy,
      verifiedAt,
      remarks: comment,
      flaggedSections,
      customerKycStatus: newCustStatus,
    };

    setSelectedCustomerDeal(updatedDeal);
    setDeals(prev => prev.map(d => (d.id === deal.id ? updatedDeal : d)));
    await persistDeal(updatedDeal);
    showToast(`KYC Status updated to ${newStatus}`);
    await loadData();
  };

  const handleAdvanceStage = async (deal: Deal) => {
    const updatedDeal: Deal = {
      ...deal,
      stage: 'investment_opportunity',
      stageEnteredAt: new Date().toISOString(),
    };

    // Save updated deal stage to DB
    try {
      await persistDeal(updatedDeal);
    } catch (err) {
      console.warn('[KYCPage] API saveDeal (advance stage) failed:', err);
      showToast("Error updating deal stage");
    }

    const activity: DealActivity = {
      id: `act-${Date.now()}`,
      dealId: deal.id,
      companyId: tenant?.id || '',
      type: 'stage_change',
      fromStage: 'qualified_investor',
      toStage: 'investment_opportunity',
      text: 'KYC Completed → Moved to Investment Opportunities by IRM',
      loggedByName: user?.name || 'IRM User',
      loggedByRole: 'IRM',
      timestamp: new Date().toISOString(),
    };

    // Save activity to DB
    try {
      await apiAddDealActivity(activity);
    } catch (err) {
      console.warn('[KYCPage] API addDealActivity failed:', err);
      storageService.addDealActivity(activity);
    }

    if (selectedDealForDetail?.id === deal.id) {
      setSelectedDealForDetail(null);
    }

    await loadData();
    showToast(`✓ ${deal.customerName} moved to Investment Opportunities!`);
  };

  // IFSC Lookup Logic
  const handleIfscChange = async (val: string) => {
    const ifsc = val.toUpperCase().trim();
    setFormData(prev => ({ ...prev, ifscCode: ifsc }));

    if (formErrors.ifscCode) {
      setFormErrors(prev => {
        const copy = { ...prev };
        delete copy.ifscCode;
        return copy;
      });
    }

    // Known bank prefix deduction
    const prefix = ifsc.slice(0, 4);
    const bankPrefixMap: Record<string, string> = {
      HDFC: 'HDFC Bank',
      SBIN: 'State Bank of India',
      ICIC: 'ICICI Bank',
      UTIB: 'Axis Bank',
      KKBK: 'Kotak Mahindra Bank',
      PUNB: 'Punjab National Bank',
      BARB: 'Bank of Baroda',
      YESB: 'Yes Bank',
      IDFB: 'IDFC FIRST Bank',
      INDB: 'IndusInd Bank',
      CNRB: 'Canara Bank',
      UBIN: 'Union Bank of India',
    };

    if (bankPrefixMap[prefix] && !formData.bankName) {
      setFormData(prev => ({ ...prev, bankName: bankPrefixMap[prefix] }));
    }

    // If 11 chars, lookup branch from public ifsc endpoint
    if (ifsc.length === 11) {
      try {
        const res = await fetch(`https://ifsc.razorpay.com/${ifsc}`);
        if (res.ok) {
          const data = await res.json();
          setFormData(prev => ({
            ...prev,
            bankName: data.BANK || prev.bankName,
            branchName: data.BRANCH || prev.branchName,
          }));
        }
      } catch {
        // silent fallback
      }
    }
  };

  // ── Step Validations ────────────────────────────────────────────────────────
  const validateStep = (step: number): boolean => {
    const { isValid, errors, summary } = validateKycStepWithDocs(
      step,
      formData,
      doc => Boolean(doc?.url || (doc && pendingDocFiles.has(doc)))
    );
    setFormErrors(errors);
    setValidationErrorSummary(summary);
    return isValid;
  };

  const handleContinue = async () => {
    if (isStepSaving) return;
    if (!validateStep(currentStep)) {
      return;
    }
    setFormErrors({});
    setValidationErrorSummary(null);
    if (selectedDeal) {
      if (isAssistedFlow) {
        setIsStepSaving(true);
        try {
          const savedOk = await handleSaveDraft(false);
          if (!savedOk) {
            // Stop navigation if document upload or backend persistence failed
            return;
          }
        } finally {
          setIsStepSaving(false);
        }
      } else {
        const currentStatus = localStorage.getItem(`nexus_kyc_status_${selectedDeal.id}`);
        if (currentStatus !== 'Completed' && currentStatus !== 'Submitted for Review') {
          localStorage.setItem(`nexus_kyc_status_${selectedDeal.id}`, 'Partially Completed');
        }
      }
      window.dispatchEvent(new Event('nexus_storage_updated'));
    }
    if (currentStep < 5) {
      setCurrentStep((prev) => (prev + 1) as 1 | 2 | 3 | 4 | 5);
    }
  };

  const handleBack = () => {
    setFormErrors({});
    setValidationErrorSummary(null);
    if (isAssistedFlow && selectedDeal) {
      void handleSaveDraft(false);
    }
    if (currentStep > 1) {
      setCurrentStep((prev) => (prev - 1) as 1 | 2 | 3 | 4 | 5);
    } else {
      handleExitFlow();
    }
  };

  const handleOpenReviewForSubmission = () => {
    if (!validateStep(5)) return;
    setCustomerConsentChecked(false);
    setIsAssistedReviewModalOpen(true);
  };

  const handleConfirmAssistedSubmit = async () => {
    if (!customerConsentChecked) {
      showToast('Please obtain and confirm customer consent before submitting.');
      return;
    }
    if (!selectedDeal) return;

    if (!user) {
      showToast('Your session has expired. Please sign in again before submitting KYC.');
      return;
    }

    let savedKycDto: any = null;
    // Await server submission first; never report success if backend save fails
    try {
      savedKycDto = await submitBackendAssistedKyc(selectedDeal, formData);
      if (savedKycDto?.id) {
        setSelectedDeal((prev: Deal | null) =>
          prev ? ({ ...prev, kycId: savedKycDto.id, kycRecordId: savedKycDto.id } as Deal) : prev
        );
      }
    } catch (err: any) {
      showToast(`⚠️ Failed to submit assisted KYC: ${err.message || 'Server error'}`);
      return;
    }

    const investorName = formData.investorName.trim();
    const dealId = selectedDeal.id;
    const nowIso = new Date().toISOString();

    const assistedMetadata = buildAssistedSubmissionMetadata(user, nowIso);

    // 1. Persist full KYC form data in localStorage
    saveKycLocal(dealId, {
      ...formData,
      assistedMetadata,
    });
    localStorage.setItem(`nexus_kyc_status_${dealId}`, 'Submitted for Review');
    localStorage.setItem(`nexus_kyc_assisted_${dealId}`, JSON.stringify(assistedMetadata));

    // Clear draft
    localStorage.removeItem(`nexus_kyc_draft_${dealId}`);

    window.dispatchEvent(new Event('nexus_storage_updated'));

    // 2. Persist Document metadata in storageService
    const nowStr = new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    const docsToSave = collectKycDocsForStorage(formData);

    docsToSave.forEach(d => {
      const docItem: DocumentItem = {
        id: `doc-${Date.now()}-${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36)}`,
        name: d.name,
        size: d.size,
        type: d.type,
        uploadedBy: user?.name || 'IRM User',
        uploadedAt: nowStr,
        category: d.category,
        entityType: 'investor',
        entityId: dealId,
      };
      storageService.saveDocument(docItem);
    });

    // 3. Log deal activity & audit log
    const activityText = `Assisted KYC – Submitted for Verification on behalf of customer with consent by IRM ${user?.name || 'IRM User'} (ID: ${user?.id || '—'}) at ${new Date(nowIso).toLocaleString()}`;
    const activity: DealActivity = {
      id: `act-${Date.now()}`,
      dealId: selectedDeal.id,
      companyId: tenant?.id || '',
      type: 'note',
      text: activityText,
      loggedByName: user?.name || 'IRM User',
      loggedByRole: 'IRM',
      timestamp: nowIso,
    };
    storageService.addDealActivity(activity);

    storageService.addAuditLog({
      id: `aud-${Date.now()}`,
      timestamp: nowIso,
      actorName: user?.name || 'IRM User',
      actorEmail: user?.email || '',
      action: 'assisted_kyc_submit',
      entityType: 'kyc',
      entityId: selectedDeal.id,
      details: activityText,
    });

    // 4. Update deal with Assisted KYC status, stable kycId, and attribution
    const updatedDeal: Deal = {
      ...selectedDeal,
      kycId: selectedDeal.kycId,
      customerKycStatus: 'Assisted KYC – Submitted for Verification' as any,
      notes: selectedDeal.notes ? `${selectedDeal.notes} | ${activityText}` : activityText,
    };
    try {
      await persistDeal(updatedDeal);
    } catch (e) {
      console.warn('Error saving deal:', e);
    }

    if (savedKycDto?.id) {
      const kycRec = { ...savedKycDto, status: 'PendingReview', submittedAt: nowIso };
      setDbKycs(prev => ({
        ...prev,
        [`id_${savedKycDto.id}`]: kycRec,
        ...(savedKycDto.investorId ? { [`inv_${savedKycDto.investorId}`]: kycRec } : {}),
      }));
    }
    await refreshDbKycs();

    setIsAssistedReviewModalOpen(false);
    setIsAssistedFlow(false);
    showToast(`Assisted KYC for "${investorName}" submitted for verification!`);
    await loadData();
    setSelectedCustomerDeal(null);
    setViewMode('table');
  };

  // Submit KYC for Review
  const _handleSubmitKycForReview = () => {
    handleOpenReviewForSubmission();
  };

  // Nominee helpers
  const handleAddNominee = () => {
    if (formData.nominees.length >= 3) return;
    const currentCount = formData.nominees.length;
    const newNominee: NomineeItem = {
      id: `nom-${Date.now()}`,
      name: '',
      relationship: 'Spouse',
      dob: '',
      allocationPercentage: currentCount === 0 ? 100 : 0,
      address: '',
      guardianName: '',
    };
    setFormData(prev => ({
      ...prev,
      hasNominee: true,
      nominees: [...prev.nominees, newNominee],
    }));
  };

  const handleRemoveNominee = (idOrIndex: string | number) => {
    setFormData(prev => {
      const updated = prev.nominees.filter((n, i) => (n.id ? n.id !== idOrIndex : i !== idOrIndex));
      return {
        ...prev,
        nominees: updated,
        hasNominee: updated.length > 0,
      };
    });
  };

  const handleNomineeChange = (idOrIndex: string | number, field: keyof NomineeItem, value: any) => {
    setFormData(prev => ({
      ...prev,
      nominees: prev.nominees.map((n, i) =>
        (n.id ? n.id === idOrIndex : i === idOrIndex) ? { ...n, [field]: value } : n
      ),
    }));
    setFormErrors(prev => {
      const c = { ...prev };
      delete c.nominees;
      return c;
    });
  };

  const [activeKpiFilter, setActiveKpiFilter] = useState<'all' | 'awaiting' | 'pending' | 'verified'>('all');

  const totalKycInvestors = deals.length;

  const { awaiting: awaitingVerificationCount, pending: pendingSubmissionCount, verified: verifiedCount } = useMemo(() => {
    return countKpiMetrics(deals, resolveCustomerKycStatus);
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- resolveCustomerKycStatus is a stable function defined in module scope
  }, [deals, resolveCustomerKycStatus]);

  const filteredDeals = useMemo(() => {
    return filterDealsByKpi(deals, activeKpiFilter, resolveCustomerKycStatus);
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- resolveCustomerKycStatus is a stable function defined in module scope
  }, [deals, activeKpiFilter, resolveCustomerKycStatus]);

  const getDealKycStatus = (deal: Deal) => {
    const status = getDynamicKycStatus(deal);
    if (status === 'completed') {
      return (
        <span className="kyc-badge-verified">
          <CheckCircle size={12} /> Completed
        </span>
      );
    }
    if (status === 'continue') {
      return (
        <span className="kyc-badge-review">
          <Clock size={12} /> Partially Completed
        </span>
      );
    }
    return (
      <span className="kyc-badge-review" style={{ background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>
        <AlertCircle size={12} /> Pending
      </span>
    );
  };

  const columns: Column<Deal>[] = [
    {
      key: 'customerName',
      header: 'Name & Contact',
      width: '240px',
      sortable: true,
      render: deal => {
        const initial = (deal.customerName || 'U').trim().charAt(0).toUpperCase();
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="kyc-row-avatar">{initial}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <button
                type="button"
                className="kyc-customer-name"
                style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer', background: 'none', border: 'none', padding: 0, textAlign: 'left' }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenCustomerProfile(deal);
                }}
                title="Click to view KYC profile"
              >
                {deal.customerName}
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
                {deal.phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
                    <Phone size={11} color="var(--text-muted)" />
                    <span>{deal.phone}</span>
                  </div>
                )}
                {deal.email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
                    <Mail size={11} color="var(--text-muted)" />
                    <span style={{ maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {deal.email}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: 'location',
      header: 'Location',
      width: '120px',
      render: deal => {
        const loc = getResolvedLocation(deal);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary)' }}>
            <MapPin size={12} color="var(--text-muted)" />
            <span>{loc}</span>
          </div>
        );
      },
    },
    {
      key: 'investmentRange',
      header: 'Investment Capacity',
      width: '185px',
      sortable: true,
      render: deal => {
        const capacity = getCustomerFilledCapacity(deal);
        const isSpecified = capacity && capacity !== '—' && capacity.trim() !== '' && capacity.toLowerCase() !== 'not specified';
        return isSpecified ? (
          <span
            className="kyc-capacity-badge"
            title={capacity}
            style={{
              maxWidth: '100%',
              display: 'inline-block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              verticalAlign: 'middle',
            }}
          >
            {capacity}
          </span>
        ) : (
          <NotSpecifiedBadge />
        );
      },
    },
    {
      key: 'value',
      header: 'Investment Amount',
      width: '150px',
      sortable: true,
      render: deal => {
        const val = getCustomerInvestmentAmount(deal);
        return <SpecifiedValueBadge value={val} />;
      },
    },
    ...(isGhlAdmin ? [{
      key: 'assignedAgentName',
      header: 'Assigned IRM',
      width: '140px',
      render: (deal: Deal) => (
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
          {deal.assignedAgentName || 'Unassigned'}
        </span>
      ),
    }] : []),
    {
      key: 'preferredAssetClass',
      header: 'Preferred Asset Class',
      width: '150px',
      render: deal => {
        const pref = getIrmPreferredAssetClass(deal);
        return <PreferredAssetBadge preferredAssetClass={pref} />;
      },
    },
    {
      key: 'kycStatus',
      header: 'KYC Status',
      width: '160px',
      render: deal => {
        const displayStatus = normalizeLegacyKycStatus(deal.kycStatus, deal.verifiedBy);
        const isVerified = displayStatus === 'Verified';
        const isWrong = displayStatus === 'Wrong';
        const isPending = !isVerified && !isWrong;

        return (
          <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 700,
                background: isVerified
                  ? 'rgba(16, 185, 129, 0.15)'
                  : isWrong
                  ? 'rgba(239, 68, 68, 0.15)'
                  : 'rgba(245, 158, 11, 0.15)',
                color: isVerified
                  ? '#10B981'
                  : isWrong
                  ? '#EF4444'
                  : '#F59E0B',
                border: isVerified
                  ? '1px solid rgba(16, 185, 129, 0.35)'
                  : isWrong
                  ? '1px solid rgba(239, 68, 68, 0.35)'
                  : '1px solid rgba(245, 158, 11, 0.35)',
                whiteSpace: 'nowrap',
                cursor: 'default',
              }}
              title={`KYC Status: ${displayStatus}`}
            >
              {isVerified && <ShieldCheck size={12} />}
              {isWrong && <AlertCircle size={12} />}
              {isPending && <Clock size={12} />}
              <span>{displayStatus}</span>
            </span>
            {isVerified && deal.verifiedBy && (
              <span style={{ fontSize: 9.5, color: 'var(--text-muted, #94a3b8)', marginTop: 1 }}>
                by {deal.verifiedBy.split('@')[0]}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'customerKycStatus',
      header: 'Customer KYC',
      width: '140px',
      render: deal => {
        const custStatus = resolveCustomerKycStatus(deal);
        return <KycStatusBadge status={custStatus} />;
      },
    },
    {
      key: 'stageAction',
      header: 'Stage Action',
      width: '180px',
      render: deal => {
        const status = resolveCustomerKycStatus(deal);

        // For GHL Admin, render clean read-only status tags rather than operational action buttons or dropdowns
        if (isGhlAdmin) {
          if (status === 'Verified') {
            return (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '3px 10px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 600,
                  backgroundColor: 'rgba(16,185,129,0.1)',
                  color: '#059669',
                  border: '1px solid rgba(16,185,129,0.3)',
                }}
                title="KYC verified by IRM"
              >
                <CheckCircle size={12} /> Verified
              </span>
            );
          }

          return <KycStatusPill status={status} />;
        }

        // IRM-verified: show prominent "Move to Opportunity" action button directly in the row
        if (status === 'Verified') {
          return (
            <button
              type="button"
              className="kyc-advance-btn"
              title="KYC Verified — Click to advance investor to Investment Opportunities stage"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                void handleAdvanceStage(deal);
              }}
            >
              <span>Move to Opportunity</span>
              <ArrowRight size={13} />
            </button>
          );
        }

        // Assisted KYC submitted awaiting IRM verification: show compact green assisted icon with hover/focus tooltip
        if (status === 'Assisted KYC – Submitted for Verification') {
          return (
            <div
              className="kyc-stage-action-group"
              style={{ display: 'inline-flex', alignItems: 'center' }}
            >
              <div className="kyc-stage-action-tooltip-wrapper">
                <button
                  type="button"
                  className="kyc-stage-action-btn"
                  tabIndex={0}
                  aria-label="Assisted KYC submitted — awaiting IRM verification"
                  style={{
                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                    borderColor: 'rgba(16, 185, 129, 0.35)',
                    color: '#059669',
                    cursor: 'default',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    minWidth: 28,
                    borderRadius: 6,
                    padding: 0,
                  }}
                >
                  <UserCheck size={14} />
                </button>
                <span
                  className="kyc-stage-action-tooltip"
                  role="tooltip"
                  style={{ whiteSpace: 'nowrap' }}
                >
                  Assisted KYC submitted — awaiting IRM verification
                </span>
              </div>
            </div>
          );
        }

        // Customer or IRM submitted: waiting for IRM review — show a status badge, not a send button
        if (
          status === 'Submitted' ||
          status === 'Under Verification' ||
          status === 'Completed'
        ) {
          return (
            <KycStatusPill
              status={status}
              titleOverride="Customer has submitted the KYC form — awaiting IRM review"
            />
          );
        }

        // Assisted Draft: show distinct standalone Resume Draft icon and Send Link icon
        if (status === 'Assisted Draft') {
          return (
            <div
              className="kyc-stage-action-group"
            >
              <div className="kyc-stage-action-tooltip-wrapper">
                <button
                  type="button"
                  className="kyc-stage-action-btn kyc-stage-action-btn--draft"
                  aria-label="Resume Draft"
                  title="Resume Draft"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    startAssistedKycFlow(deal);
                  }}
                >
                  <Clock size={13} />
                </button>
                <span className="kyc-stage-action-tooltip" role="tooltip">
                  Resume Draft
                </span>
              </div>

              <div className="kyc-stage-action-tooltip-wrapper">
                <button
                  type="button"
                  className="kyc-stage-action-btn kyc-stage-action-btn--link"
                  aria-label="Send KYC Link"
                  title="Send KYC Link"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const enriched = enrichDealWithContact(deal, leads, customers);
                    setSendLinkDeal(enriched);
                  }}
                >
                  <Send size={13} />
                </button>
                <span className="kyc-stage-action-tooltip" role="tooltip">
                  Send KYC Link
                </span>
              </div>
            </div>
          );
        }

        // Needs Correction / Wrong: show prominent "Correct Details" button so it can be edited
        if (status === 'Needs Correction' || deal.kycStatus === 'Wrong') {
          return (
            <div
              className="kyc-stage-action-group"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <button
                type="button"
                className="kyc-advance-btn"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 12px',
                  borderRadius: 6,
                  backgroundColor: 'rgba(239, 68, 68, 0.12)',
                  color: '#dc2626',
                  border: '1px solid rgba(239, 68, 68, 0.35)',
                  fontSize: 11.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                title="KYC marked Wrong — Click to edit and correct flagged details"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleCorrectKycDetails(deal);
                }}
              >
                <Edit3 size={13} color="#dc2626" />
                <span>Correct Details</span>
              </button>
            </div>
          );
        }

        const isResend = ['Link Sent', 'In Progress', 'Needs Correction', 'Rejected'].includes(status);
        const isIrmRole = user?.role?.code === 'irm';

        return (
          <KycStageActionDropdown
            deal={deal}
            isResend={isResend}
            isIrmRole={isIrmRole}
            onSendLink={() => {
              const enriched = enrichDealWithContact(deal, leads, customers);
              setSendLinkDeal(enriched);
            }}
            onAssistedKyc={() => {
              startAssistedKycFlow(deal);
            }}
          />
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      width: '80px',
      align: 'center',
      render: deal => {
        const _kycStatus = getDynamicKycStatus(deal);
        const resolvedCustomerStatus = resolveCustomerKycStatus(deal);
        const isVerified =
          normalizeLegacyKycStatus(deal.kycStatus, deal.verifiedBy) === 'Verified' ||
          resolvedCustomerStatus === 'Verified' ||
          deal.kycStatus === 'Verified';

        return (
          <KycRowActionsMenu
            deal={deal}
            isGhlAdmin={isGhlAdmin}
            isVerified={isVerified}
            onShowToast={msg => showToast(msg)}
            onEditKyc={isGhlAdmin || isVerified ? undefined : (d => handleCorrectKycDetails(d))}
            onAssistedKyc={isGhlAdmin || isVerified ? undefined : (d => startAssistedKycFlow(d))}
            onCallInvestor={canPlaceCalls(user) ? d => void initiateCall(d.customerName, d.phone || '', 'customer', d.customerId || d.id, undefined, 'kyc') : undefined}
            // Also available in menu as fallback (not available in Admin oversight mode)
            onAdvanceStage={!isGhlAdmin && isVerified ? d => { void handleAdvanceStage(d); } : undefined}
          />
        );
      },
    },
  ];

  const stepTitles = [
    { step: 1, label: 'Basic Details', icon: <User size={16} /> },
    { step: 2, label: 'Identity Details', icon: <ShieldCheck size={16} /> },
    { step: 3, label: 'Bank Details', icon: <Building size={16} /> },
    { step: 4, label: 'Demat Account', icon: <CreditCard size={16} /> },
    { step: 5, label: 'Nominee Details', icon: <Users size={16} /> },
  ];

  return (
    <div className="kyc-page-container">
      {/* Toast Notification */}
      <KycToast message={toastMessage} />

      {viewMode === 'profile' && selectedCustomerDeal ? (() => {
        const deal = selectedCustomerDeal;
        const data = profileKycData || {};
        const completionPct = calculateProfileCompletion(profileKycData, deal);
        const status = getDynamicKycStatus(deal);
        const _isCompleted = status === 'completed';
        const _isContinue = status === 'continue';
        const initial = (deal.customerName || 'U').trim().charAt(0).toUpperCase();

        const handleCopy = (text?: string | number | null, fieldKey?: string) => {
          if (!text || text === '—') return;
          try {
            void navigator.clipboard.writeText(String(text)).catch(() => {});
            setCopiedField(fieldKey || String(text));
            showToast(`✓ Copied ${fieldKey || 'text'} to clipboard`);
            setTimeout(() => setCopiedField(null), 2200);
          } catch {}
        };

        const renderField = (
          label: string,
          value?: string | number | null,
          options?: { copyable?: boolean; isDoc?: boolean; isMono?: boolean; extraAction?: React.ReactNode }
        ) => {
          const valStr = value ? String(value).trim() : '';
          const hasVal = valStr && valStr !== '—' && valStr.toLowerCase() !== 'not provided' && valStr.toLowerCase() !== 'not specified';
          const isCopied = copiedField === label || (valStr && copiedField === valStr);

          return (
            <div className="kyc-glass-field">
              <span className="kyc-glass-label">{label}</span>
              {hasVal ? (
                <div className="kyc-glass-val-container">
                  {options?.isDoc ? (
                    <span className="kyc-glass-doc-chip" title={valStr}>
                      <FileText size={13} className="kyc-glass-doc-icon" />
                      <span className="kyc-glass-doc-name">{valStr}</span>
                      <span className="kyc-glass-doc-status-pill">Uploaded</span>
                    </span>
                  ) : (
                    <span className={`kyc-glass-value ${options?.isMono ? 'font-mono' : ''}`}>
                      {valStr}
                    </span>
                  )}
                  {options?.copyable && (
                    <button
                      type="button"
                      className={`kyc-glass-copy-btn ${isCopied ? 'copied' : ''}`}
                      onClick={() => handleCopy(valStr, label)}
                      title={`Copy ${label}`}
                    >
                      {isCopied ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                    </button>
                  )}
                  {options?.extraAction}
                </div>
              ) : (
                <div className="kyc-glass-empty-container">
                  <span className="kyc-glass-empty-pill">Not Specified</span>
                  {options?.extraAction}
                </div>
              )}
            </div>
          );
        };

        return (
          <div className="kyc-glass-canvas">
            {/* Spatial Ambient Glow Atmosphere */}
            <div className="kyc-glass-ambient-orbs" aria-hidden="true">
              <div className="kyc-glass-orb kyc-glass-orb-1" />
              <div className="kyc-glass-orb kyc-glass-orb-2" />
              <div className="kyc-glass-orb kyc-glass-orb-3" />
            </div>

            {/* Floating macOS Top Glass Capsule Bar */}
            <div className="kyc-glass-top-bar">
              <div className="kyc-glass-top-left">
                <button
                  type="button"
                  className="kyc-glass-back-btn"
                  onClick={() => setViewMode('table')}
                  title="Return to Qualified Investors list"
                >
                  <ArrowLeft size={15} /> <span>Qualified Investors</span>
                </button>
                <div className="kyc-glass-breadcrumb">
                  <span className="kyc-glass-crumb-node">Dossier</span>
                  <span className="kyc-glass-crumb-sep">/</span>
                  <span className="kyc-glass-crumb-active">{deal.customerName}</span>
                </div>
              </div>

              <div className="kyc-glass-top-right">
                {canPlaceCalls(user) && (
                  <button
                    type="button"
                    className="kyc-glass-action-pill kyc-btn-call"
                    onClick={() => void initiateCall(deal.customerName, deal.phone || '', 'customer', deal.customerId || deal.id, undefined, 'kyc')}
                    title={`Initiate direct phone consultation with ${deal.customerName}`}
                  >
                    <Phone size={13} /> <span>Call Investor</span>
                  </button>
                )}
                <button
                  type="button"
                  className="kyc-glass-action-pill kyc-btn-edit"
                  onClick={() => startAssistedKycFlow(deal)}
                  title="Update or submit Assisted KYC details"
                >
                  <Edit2 size={13} /> <span>Update Dossier</span>
                </button>
              </div>
            </div>

            {/* Holographic Identity Shield (Floating Spatial Hero Card) */}
            <div className="kyc-glass-hero-shield">
              <div className="kyc-glass-specular-light" />
              
              <div className="kyc-glass-hero-content">
                {/* Left: Prismatic Avatar, Customer Name & Status */}
                <div className="kyc-glass-hero-left">
                  <div className="kyc-glass-avatar-box">
                    <div className="kyc-glass-avatar">
                      {initial}
                    </div>
                  </div>
                  <div className="kyc-glass-hero-user">
                    <div className="kyc-glass-name-row">
                      <h2 className="kyc-glass-hero-name">{deal.customerName}</h2>
                      <span className="kyc-glass-vip-pill">
                        <Sparkles size={11} /> Qualified HNW
                      </span>
                    </div>
                    <div className="kyc-glass-contact-row">
                      <span className="kyc-glass-contact-chip">
                        <Mail size={12} /> {data.email || deal.email || '—'}
                        {deal.email && (
                          <button
                            type="button"
                            className="kyc-glass-mini-copy"
                            onClick={() => handleCopy(deal.email, 'Email')}
                            title="Copy Email"
                          >
                            <Copy size={10} />
                          </button>
                        )}
                      </span>
                      <span className="kyc-glass-contact-chip">
                        <Phone size={12} /> {data.phone || deal.phone || '—'}
                        {deal.phone && (
                          <button
                            type="button"
                            className="kyc-glass-mini-copy"
                            onClick={() => handleCopy(deal.phone, 'Phone')}
                            title="Copy Phone"
                          >
                            <Copy size={10} />
                          </button>
                        )}
                      </span>
                    </div>
                    <div className="kyc-glass-status-row">
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '4px 10px',
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 700,
                          background:
                            normalizeLegacyKycStatus(deal.kycStatus, deal.verifiedBy) === 'Verified'
                              ? 'rgba(16, 185, 129, 0.15)'
                              : normalizeLegacyKycStatus(deal.kycStatus, deal.verifiedBy) === 'Wrong'
                              ? 'rgba(239, 68, 68, 0.15)'
                              : 'rgba(245, 158, 11, 0.15)',
                          color:
                            normalizeLegacyKycStatus(deal.kycStatus, deal.verifiedBy) === 'Verified'
                              ? '#10B981'
                              : normalizeLegacyKycStatus(deal.kycStatus, deal.verifiedBy) === 'Wrong'
                              ? '#EF4444'
                              : '#F59E0B',
                          border:
                            normalizeLegacyKycStatus(deal.kycStatus, deal.verifiedBy) === 'Verified'
                              ? '1px solid rgba(16, 185, 129, 0.35)'
                              : normalizeLegacyKycStatus(deal.kycStatus, deal.verifiedBy) === 'Wrong'
                              ? '1px solid rgba(239, 68, 68, 0.35)'
                              : '1px solid rgba(245, 158, 11, 0.35)',
                          whiteSpace: 'nowrap',
                          cursor: 'default',
                        }}
                      >
                        {normalizeLegacyKycStatus(deal.kycStatus, deal.verifiedBy) === 'Verified' && <ShieldCheck size={12} />}
                        {normalizeLegacyKycStatus(deal.kycStatus, deal.verifiedBy) === 'Wrong' && <AlertCircle size={12} />}
                        {normalizeLegacyKycStatus(deal.kycStatus, deal.verifiedBy) === 'Pending' && <Clock size={12} />}
                        <span>{normalizeLegacyKycStatus(deal.kycStatus, deal.verifiedBy)}</span>
                      </span>
                      {deal.kycStatus === 'Verified' && (deal.verifiedBy || deal.verifiedAt) && (
                        <span className="kyc-glass-verified-stamp">
                          <CheckCircle size={12} /> Verified by {deal.verifiedBy ? deal.verifiedBy.split('@')[0] : 'IRM'}
                          {deal.verifiedAt ? ' · ' + new Date(deal.verifiedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right: Floating Glass Metrics + Spatial Action Button */}
                <div className="kyc-glass-hero-right">
                  <div className="kyc-glass-metrics-grid">
                    <div className="kyc-glass-metric-cell">
                      <span className="kyc-glass-metric-label">GHL ID</span>
                      <span className="kyc-glass-metric-val font-mono">{getGhlId(deal)}</span>
                    </div>
                    <div className="kyc-glass-metric-cell">
                      <span className="kyc-glass-metric-label">PAN Number</span>
                      <div className="kyc-glass-metric-with-copy">
                        <span className="kyc-glass-metric-val font-mono">{data.panNumber || '—'}</span>
                        {data.panNumber && (
                          <button
                            type="button"
                            className="kyc-glass-mini-copy"
                            onClick={() => handleCopy(data.panNumber, 'PAN Number')}
                            title="Copy PAN"
                          >
                            <Copy size={10} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="kyc-glass-mini-copy"
                          title="Verify PAN on Income Tax portal"
                          aria-label="Verify PAN on Income Tax portal"
                          onClick={() => {
                            copyPanAndOpenPortal(data.panNumber, showToast);
                          }}
                        >
                          <ExternalLink size={10} />
                        </button>
                      </div>
                    </div>
                    <div className="kyc-glass-metric-cell">
                      <span className="kyc-glass-metric-label">Registered Mobile</span>
                      <span className="kyc-glass-metric-val font-mono">{data.phone || deal.phone || '—'}</span>
                    </div>
                    <div className="kyc-glass-metric-cell">
                      <span className="kyc-glass-metric-label">Pipeline Joined</span>
                      <span className="kyc-glass-metric-val">{getJoinedDate(deal)}</span>
                    </div>
                  </div>

                  <div className="kyc-glass-hero-cta">
                    {(() => {
                      const normalizedStatus = normalizeLegacyKycStatus(deal.kycStatus, deal.verifiedBy);
                      const custStatus = resolveCustomerKycStatus(deal);
                      const backendKyc = findBackendKyc(deal, dbKycs, tenant?.id);

                      const backendSubmitted = Boolean(
                        backendKyc && (
                          (backendKyc.submittedAt && (backendKyc.status || '').toLowerCase() === 'pendingreview') ||
                          (backendKyc.submittedAt && (backendKyc.status || '').toLowerCase() === 'approved') ||
                          (backendKyc.isAssisted && backendKyc.customerConsentObtained && backendKyc.submittedAt)
                        )
                      );

                      const isBackendDraft = Boolean(
                        backendKyc &&
                        (backendKyc.status || '').toLowerCase() === 'draft' &&
                        !backendKyc.submittedAt
                      );

                      const isAssistedSubmitted =
                        custStatus === 'Assisted KYC – Submitted for Verification' ||
                        (deal as any).customerKycStatus === 'Assisted KYC – Submitted for Verification' ||
                        Boolean(backendKyc?.isAssisted && backendSubmitted);

                      const isDraftOnly =
                        custStatus === 'Assisted Draft' ||
                        (deal as any).customerKycStatus === 'Assisted Draft' ||
                        isBackendDraft;

                      const customerSubmitted =
                        !isDraftOnly && (
                          backendSubmitted ||
                          isAssistedSubmitted ||
                          custStatus === 'Completed' ||
                          custStatus === 'Submitted' ||
                          custStatus === 'Under Verification' ||
                          custStatus === 'Verified'
                        );

                      const canVerify =
                        permissions.includes(PERMISSIONS.KYC_VERIFY) ||
                        user?.role?.code === 'irm' ||
                        user?.role?.code === 'company_admin' ||
                        user?.role?.code === 'super_admin' ||
                        user?.role?.code === 'sales_executive' ||
                        !permissions ||
                        permissions.length === 0;

                      const isBtnDisabled = !canVerify || !customerSubmitted;
                      const tooltipText = !canVerify
                        ? 'You do not have permission to verify KYC'
                        : isDraftOnly
                          ? 'Assisted KYC is currently an incomplete draft and has not been submitted yet'
                          : !customerSubmitted
                            ? 'Customer has not submitted KYC yet'
                            : undefined;

                      return (
                        <button
                          type="button"
                          className="kyc-glass-cta-btn"
                          disabled={isBtnDisabled}
                          title={tooltipText}
                          style={{
                            background: normalizedStatus === 'Verified'
                              ? 'linear-gradient(135deg, #059669 0%, #10b981 100%)'
                              : 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
                            cursor: isBtnDisabled ? 'not-allowed' : 'pointer',
                            opacity: isBtnDisabled ? 0.6 : 1,
                          }}
                          onClick={() => {
                            if (!profileKycData) {
                              const fDigits = (deal.phone || '').replace(/\D/g, '').slice(-10);
                              const matchLead = leads.find(l => (deal.customerId && l.id === deal.customerId) || (l.phone && l.phone.replace(/\D/g, '').slice(-10) === fDigits));
                              const matchCust = customers.find(c => (deal.customerId && c.id === deal.customerId) || (c.phone && c.phone.replace(/\D/g, '').slice(-10) === fDigits));
                              setProfileKycData(buildMergedProfileData(deal, backendKyc, matchLead, matchCust));
                            }
                            setVerifyModalDeal(deal);
                          }}
                        >
                          <ShieldCheck size={16} />
                          <span>{normalizedStatus === 'Verified' ? 'Re-verify KYC' : 'Verify Dossier'}</span>
                        </button>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* Holographic Compliance Tracker Card */}
            <div className="kyc-glass-compliance-card">
              <div className="kyc-glass-compliance-header">
                <div className="kyc-glass-compliance-left">
                  <div className="kyc-glass-pulse-dot" style={{ background: completionPct === 100 ? '#10b981' : '#ef4444' }} />
                  <span className="kyc-glass-compliance-title">KYC Compliance Dossier Status</span>
                  <span className={`kyc-glass-compliance-pct-badge ${completionPct === 100 ? 'done' : ''}`}>
                    {completionPct}% Complete
                  </span>
                </div>
                <div className="kyc-glass-milestones">
                  <span className={`kyc-glass-milestone-chip ${data.panNumber ? 'done' : ''}`}>
                    PAN {data.panNumber ? '✓' : '—'}
                  </span>
                  <span className={`kyc-glass-milestone-chip ${data.aadhaarNumber ? 'done' : ''}`}>
                    Aadhaar {data.aadhaarNumber ? '✓' : '—'}
                  </span>
                  <span className={`kyc-glass-milestone-chip ${data.bankName ? 'done' : ''}`}>
                    Bank {data.bankName ? '✓' : '—'}
                  </span>
                  <span className={`kyc-glass-milestone-chip ${data.dematAccountNumber || data.hasNoDemat ? 'done' : ''}`}>
                    Demat {data.dematAccountNumber || data.hasNoDemat ? '✓' : '—'}
                  </span>
                </div>
              </div>
              <div className="kyc-glass-progress-track">
                <div
                  className="kyc-glass-progress-fill"
                  style={{
                    width: `${completionPct}%`,
                    background: completionPct === 100
                      ? 'linear-gradient(90deg, #059669 0%, #10b981 100%)'
                      : 'linear-gradient(90deg, #991b1b 0%, #dc2626 50%, #ef4444 100%)'
                  }}
                />
              </div>
              <div className="kyc-glass-compliance-footer">
                <span>SEBI &amp; PMLA institutional verification tracker</span>
                <span className="kyc-glass-compliance-counter">
                  {completionPct === 100 ? '✓ Ready for institutional tranche allocations' : `${100 - completionPct}% remaining to complete onboarding`}
                </span>
              </div>
            </div>

            {/* Floating macOS Segmented Island Dock */}
            <div className="kyc-glass-dock-wrapper">
              <div className="kyc-glass-dock">
                <button
                  type="button"
                  className={`kyc-glass-dock-item ${profileDossierTab === 'all' ? 'active' : ''}`}
                  onClick={() => setProfileDossierTab('all')}
                >
                  <span>All Sections (5)</span>
                </button>
                <button
                  type="button"
                  className={`kyc-glass-dock-item ${profileDossierTab === 'personal' ? 'active' : ''}`}
                  onClick={() => setProfileDossierTab('personal')}
                >
                  <User size={13} /> <span>Personal Details</span>
                </button>
                <button
                  type="button"
                  className={`kyc-glass-dock-item ${profileDossierTab === 'identity' ? 'active' : ''}`}
                  onClick={() => setProfileDossierTab('identity')}
                >
                  <ShieldCheck size={13} /> <span>Address &amp; Identity</span>
                </button>
                <button
                  type="button"
                  className={`kyc-glass-dock-item ${profileDossierTab === 'bank' ? 'active' : ''}`}
                  onClick={() => setProfileDossierTab('bank')}
                >
                  <Building size={13} /> <span>Bank Details</span>
                </button>
                <button
                  type="button"
                  className={`kyc-glass-dock-item ${profileDossierTab === 'demat' ? 'active' : ''}`}
                  onClick={() => setProfileDossierTab('demat')}
                >
                  <Layers size={13} /> <span>Demat Account</span>
                </button>
                <button
                  type="button"
                  className={`kyc-glass-dock-item ${profileDossierTab === 'nominees' ? 'active' : ''}`}
                  onClick={() => setProfileDossierTab('nominees')}
                >
                  <Users size={13} /> <span>Nominees</span>
                </button>
              </div>
            </div>

            {/* Floating Acrylic Bento Panels Grid (Zero Empty Space 2+3 Bento Architecture) */}
            <div className="kyc-glass-bento-grid">
              {/* 1. Personal Details */}
              {(profileDossierTab === 'all' || profileDossierTab === 'personal') && (
                <div className="kyc-glass-panel kyc-panel-personal">
                  <div className="kyc-glass-panel-header">
                    <div className="kyc-glass-panel-title-box">
                      <div className="kyc-glass-icon-chip kyc-icon-personal">
                        <User size={16} />
                      </div>
                      <div>
                        <h3 className="kyc-glass-panel-title">Personal Details</h3>
                        <p className="kyc-glass-panel-desc">Investor demographics, capacity &amp; asset preferences</p>
                      </div>
                    </div>
                    <span className="kyc-glass-badge">12 Fields</span>
                  </div>
                  <div className="kyc-glass-fields-matrix">
                    {renderField('Full Name', data.investorName || deal.customerName)}
                    {renderField('Email', data.email || deal.email, { copyable: true })}
                    {renderField('Phone', data.phone || deal.phone, { copyable: true, isMono: true })}
                    {renderField('PAN Number', data.panNumber, {
                      copyable: true,
                      isMono: true,
                      extraAction: (
                        <button
                          type="button"
                          className="kyc-glass-verify-btn"
                          title="Verify PAN on Income Tax portal"
                          aria-label="Verify PAN on Income Tax portal"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyPanAndOpenPortal(data.panNumber, showToast);
                          }}
                        >
                          <ShieldCheck size={12} /> <span>Verify PAN</span>
                        </button>
                      ),
                    })}
                    {renderField('City', data.city || getResolvedLocation(deal))}
                    {renderField('Date of Birth', data.dob)}
                    {renderField('Occupation', data.occupation)}
                    {renderField('Gender', data.gender)}
                    {renderField('Investor Type', data.investorType)}
                    {renderField('Resident Type', data.residentType)}
                    {renderField('Investment Capacity', getCustomerFilledCapacity(deal))}
                    {renderField('Investment Amount', getCustomerInvestmentAmount(deal))}
                    {renderField('Preferred Asset Class', getIrmPreferredAssetClass(deal))}
                    {renderField('Investment Horizon', getIrmInvestmentHorizon(deal))}
                  </div>
                </div>
              )}

              {/* 2. Address & Identity */}
              {(profileDossierTab === 'all' || profileDossierTab === 'identity') && (
                <div className="kyc-glass-panel kyc-panel-identity">
                  <div className="kyc-glass-panel-header">
                    <div className="kyc-glass-panel-title-box">
                      <div className="kyc-glass-icon-chip kyc-icon-identity">
                        <ShieldCheck size={16} />
                      </div>
                      <div>
                        <h3 className="kyc-glass-panel-title">Address &amp; Identity</h3>
                        <p className="kyc-glass-panel-desc">Statutory Aadhaar, PAN documents &amp; residence</p>
                      </div>
                    </div>
                    <span className="kyc-glass-badge">11 Fields</span>
                  </div>
                  <div className="kyc-glass-fields-matrix">
                    {renderField('Name on Document', data.nameAsPerPan || data.investorName || deal.customerName)}
                    {renderField("Father's Name", data.fatherName)}
                    {renderField('Aadhaar Number', data.aadhaarNumber, {
                      copyable: true,
                      isMono: true,
                      extraAction: (
                        <button
                          type="button"
                          className="kyc-glass-verify-btn"
                          title="Verify Aadhaar on UIDAI portal"
                          aria-label="Verify Aadhaar on UIDAI portal"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(EXTERNAL_VERIFICATION_LINKS.AADHAAR, '_blank', 'noopener,noreferrer');
                          }}
                        >
                          <ShieldCheck size={12} /> <span>Verify Aadhaar</span>
                        </button>
                      ),
                    })}
                    {renderField('Permanent Address', data.address)}
                    {renderField('Courier Address', data.courierAddress || data.address)}
                    {renderField('City', data.city || getResolvedLocation(deal))}
                    {renderField('State', data.state)}
                    {renderField('Pincode', data.pincode, { isMono: true })}
                    {renderField('Country', data.country || 'India')}
                    {renderField('Aadhaar Document', data.aadhaarDoc?.name, { isDoc: true })}
                    {renderField('PAN Document', data.panDoc?.name, { isDoc: true })}
                  </div>
                </div>
              )}

              {/* 3. Bank Details */}
              {(profileDossierTab === 'all' || profileDossierTab === 'bank') && (
                <div className="kyc-glass-panel kyc-panel-bank">
                  <div className="kyc-glass-panel-header">
                    <div className="kyc-glass-panel-title-box">
                      <div className="kyc-glass-icon-chip kyc-icon-bank">
                        <Building size={16} />
                      </div>
                      <div>
                        <h3 className="kyc-glass-panel-title">Bank Details</h3>
                        <p className="kyc-glass-panel-desc">Verified payout &amp; subscription settlement account</p>
                      </div>
                    </div>
                    <span className="kyc-glass-badge">5 Fields</span>
                  </div>
                  <div className="kyc-glass-fields-matrix">
                    {renderField('Bank Name', data.bankName)}
                    {renderField('Account No', data.accountNumber, { copyable: true, isMono: true })}
                    {renderField('IFSC Code', data.ifscCode, { copyable: true, isMono: true })}
                    {renderField('Account Type', data.accountType)}
                    {renderField('Bank Proof Document', data.bankProofDoc?.name, { isDoc: true })}
                  </div>
                </div>
              )}

              {/* 4. Demat Details */}
              {(profileDossierTab === 'all' || profileDossierTab === 'demat') && (
                <div className="kyc-glass-panel kyc-panel-demat">
                  <div className="kyc-glass-panel-header">
                    <div className="kyc-glass-panel-title-box">
                      <div className="kyc-glass-icon-chip kyc-icon-demat">
                        <Layers size={16} />
                      </div>
                      <div>
                        <h3 className="kyc-glass-panel-title">Demat Details</h3>
                        <p className="kyc-glass-panel-desc">Depository participant details for securities allotment</p>
                      </div>
                    </div>
                    <span className="kyc-glass-badge">6 Fields</span>
                  </div>
                  <div className="kyc-glass-fields-matrix">
                    {renderField('Demat Account Status', data.hasNoDemat ? 'No Demat Account' : (data.dematAccountNumber || data.dematDepository || data.dematDpId ? 'Active Demat' : null))}
                    {renderField('Demat Account Number', data.dematAccountNumber, { copyable: true, isMono: true })}
                    {renderField('Depository', data.dematDepository)}
                    {renderField('DP ID', data.dematDpId, { copyable: true, isMono: true })}
                    {renderField('Client ID', data.dematClientId, { copyable: true, isMono: true })}
                    {renderField('Demat Statement Proof', data.dematDoc?.name, { isDoc: true })}
                  </div>
                </div>
              )}

              {/* 5. Nominee Details */}
              {(profileDossierTab === 'all' || profileDossierTab === 'nominees') && (
                <div className="kyc-glass-panel kyc-panel-nominees">
                  <div className="kyc-glass-panel-header">
                    <div className="kyc-glass-panel-title-box">
                      <div className="kyc-glass-icon-chip kyc-icon-nominee">
                        <Users size={16} />
                      </div>
                      <div>
                        <h3 className="kyc-glass-panel-title">Nominee Details</h3>
                        <p className="kyc-glass-panel-desc">Primary succession &amp; legal beneficiaries</p>
                      </div>
                    </div>
                    <span className="kyc-glass-badge">6 Fields</span>
                  </div>
                  <div className="kyc-glass-fields-matrix">
                    {renderField('Nominee Name', data.nominees?.[0]?.name)}
                    {renderField('Relationship', data.nominees?.[0]?.relationship)}
                    {renderField('ID Proof / Guardian', data.nominees?.[0]?.guardianName ? `Guardian: ${data.nominees[0].guardianName}` : (data.nominees?.[0] ? 'Provided' : null))}
                    {renderField('Share Allocation', data.nominees?.[0]?.allocationPercentage ? `${data.nominees[0].allocationPercentage}%` : null)}
                    {renderField('Date of Birth / Age', data.nominees?.[0]?.dob)}
                    {renderField('Nominee Address', data.nominees?.[0]?.address)}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })() : viewMode === 'table' ? (
        <>
          {/* Header */}
          <div className="page-header" style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h1 className="page-title">
                <FileCheck size={24} color="#06b6d4" /> {isGhlAdmin ? 'KYC Leads & Verification Directory' : 'Qualified Investor & KYC Verification'}
              </h1>
              <p className="page-subtitle">
                {isGhlAdmin
                  ? 'Company-wide oversight of leads undergoing KYC verification across all IRMs before moving to Opportunities.'
                  : 'SEBI compliance checked, ticket size verified, KYC validated investors ready for investment opportunities.'}
              </p>
            </div>
          </div>

          {/* Executive KPI Metric Cards */}
          <div className="kyc-kpi-container">
            <button
              type="button"
              className={`kyc-metric-card ${activeKpiFilter === 'all' ? 'active' : ''}`}
              onClick={() => setActiveKpiFilter('all')}
              title={activeKpiFilter === 'all' ? 'Showing all investors' : 'Click to show all investors'}
              style={{ textAlign: 'left', font: 'inherit', color: 'inherit' }}
            >
              <span className="kyc-metric-header">
                <span className="kyc-metric-label">Total in KYC</span>
                <span className="kyc-metric-icon kyc-metric-icon--blue">
                  <Users size={16} />
                </span>
              </span>
              <span className="kyc-metric-val" style={{ display: 'block' }}>{totalKycInvestors}</span>
              <span className="kyc-metric-subtext" style={{ display: 'block' }}>
                {activeKpiFilter === 'all' ? 'Showing all investors' : 'Click to view all'}
              </span>
            </button>

            <button
              type="button"
              className={`kyc-metric-card ${activeKpiFilter === 'awaiting' ? 'active' : ''}`}
              onClick={() => setActiveKpiFilter(prev => prev === 'awaiting' ? 'all' : 'awaiting')}
              title={activeKpiFilter === 'awaiting' ? 'Click to reset filter' : 'Click to filter awaiting verification'}
              style={{ textAlign: 'left', font: 'inherit', color: 'inherit' }}
            >
              <span className="kyc-metric-header">
                <span className="kyc-metric-label">Awaiting Verification</span>
                <span className="kyc-metric-icon kyc-metric-icon--amber">
                  <Clock size={16} />
                </span>
              </span>
              <span className="kyc-metric-val" style={{ display: 'block' }}>{awaitingVerificationCount}</span>
              <span className="kyc-metric-subtext" style={{ display: 'block' }}>
                {activeKpiFilter === 'awaiting' ? '● Filter active (Click to reset)' : 'Ready for compliance review'}
              </span>
            </button>

            <button
              type="button"
              className={`kyc-metric-card ${activeKpiFilter === 'pending' ? 'active' : ''}`}
              onClick={() => setActiveKpiFilter(prev => prev === 'pending' ? 'all' : 'pending')}
              title={activeKpiFilter === 'pending' ? 'Click to reset filter' : 'Click to filter pending submission'}
              style={{ textAlign: 'left', font: 'inherit', color: 'inherit' }}
            >
              <span className="kyc-metric-header">
                <span className="kyc-metric-label">Pending Submission</span>
                <span className="kyc-metric-icon kyc-metric-icon--purple">
                  <Send size={16} />
                </span>
              </span>
              <span className="kyc-metric-val" style={{ display: 'block' }}>{pendingSubmissionCount}</span>
              <span className="kyc-metric-subtext" style={{ display: 'block' }}>
                {activeKpiFilter === 'pending' ? '● Filter active (Click to reset)' : 'Link sent or draft in progress'}
              </span>
            </button>

            <button
              type="button"
              className={`kyc-metric-card ${activeKpiFilter === 'verified' ? 'active' : ''}`}
              onClick={() => setActiveKpiFilter(prev => prev === 'verified' ? 'all' : 'verified')}
              title={activeKpiFilter === 'verified' ? 'Click to reset filter' : 'Click to filter verified & qualified'}
              style={{ textAlign: 'left', font: 'inherit', color: 'inherit' }}
            >
              <span className="kyc-metric-header">
                <span className="kyc-metric-label">Verified &amp; Qualified</span>
                <span className="kyc-metric-icon kyc-metric-icon--green">
                  <CheckCircle size={16} />
                </span>
              </span>
              <span className="kyc-metric-val" style={{ display: 'block' }}>{verifiedCount}</span>
              <span className="kyc-metric-subtext" style={{ display: 'block' }}>
                {activeKpiFilter === 'verified' ? '● Filter active (Click to reset)' : 'SEBI verified & cleared'}
              </span>
            </button>
          </div>

          {/* Inline Error Banner */}
          <ErrorAlertBanner
            message={loadError ? 'Failed to load KYC data from server. Please check your connection or try again.' : null}
            showIcon={true}
            onRetry={() => void loadData()}
            style={{ fontSize: 13, border: '1px solid rgba(239, 68, 68, 0.25)' }}
          />

          {/* Live Sync Warning Banner */}
          {kycSyncWarning && !loadError && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              marginBottom: 16,
              borderRadius: 8,
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              color: '#d97706',
              fontSize: 13,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={16} />
                <span><strong>Live Sync Warning:</strong> {kycSyncWarning}</span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => void refreshDbKycs()}
                style={{ borderColor: '#d97706', color: '#d97706', marginLeft: 12 }}
              >
                Retry Live Sync
              </button>
            </div>
          )}

          {/* Data Table */}
          {isLoading && filteredDeals.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)' }}>
              <p>Loading Qualified Investors...</p>
            </div>
          ) : (
          <DataTable
            data={filteredDeals}
            columns={columns}
            onRowClick={deal => handleOpenCustomerProfile(deal)}
            keyExtractor={d => d.id}
            searchPlaceholder="Search by investor, phone, city..."
            searchFilter={(deal, q) => {
              const matchName = deal.customerName?.toLowerCase().includes(q);
              const matchPhone = deal.phone?.toLowerCase().includes(q);
              const matchTitle = deal.title?.toLowerCase().includes(q);
              const matchLocation = deal.location?.toLowerCase().includes(q);
              return Boolean(matchName || matchPhone || matchTitle || matchLocation);
            }}
            emptyTitle="No Qualified Investors"
            emptyDescription="No investors currently in the Qualified Investor / KYC stage."
          />
          )}
        </>
      ) : (        /* ── 5-STEP KYC FLOW CONTAINER ── */
        <div className="kyc-flow-card">
          {/* Top Bar with Back to Table link */}
          <div className="kyc-flow-top-bar">
            <div>
              <button
                type="button"
                className="kyc-flow-back-btn"
                onClick={handleExitFlow}
                title="Exit KYC flow and return to Qualified Investors list"
              >
                <ArrowLeft size={16} /> Back to Qualified Investors
              </button>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                {selectedDeal ? selectedDeal.customerName : formData.investorName || 'New Investor KYC'}
              </div>
              <div style={{ fontSize: 11, color: isAssistedFlow ? '#a78bfa' : 'var(--text-muted)' }}>
                {isAssistedFlow ? 'Assisted KYC Mode • IRM Onboarding on Behalf' : 'SEBI Regulated AIF • Cat-II Investor Onboarding'}
              </div>
            </div>
          </div>

          {/* Stepper Progress Bar */}
          <div className="kyc-stepper-wrapper">
            <div className="kyc-stepper">
              <div className="kyc-stepper-line-bg" />
              <div
                className="kyc-stepper-line-progress"
                style={{
                  width: `${((currentStep - 1) / 4) * 100}%`,
                }}
              />
              {stepTitles.map(item => {
                const isCompleted = item.step < currentStep;
                const isActive = item.step === currentStep;
                return (
                  <button
                    type="button"
                    key={item.step}
                    className={`kyc-step-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                    onClick={() => {
                      if (item.step < currentStep) {
                        setCurrentStep(item.step as 1 | 2 | 3 | 4 | 5);
                      }
                    }}
                    style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', textAlign: 'left', cursor: item.step < currentStep ? 'pointer' : 'default' }}
                  >
                    <div className="kyc-step-circle">
                      {isCompleted ? <CheckCircle size={18} /> : item.step}
                    </div>
                    <div className="kyc-step-label">{item.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Assisted KYC Banner */}
          {isAssistedFlow && (
            <div className="kyc-assisted-banner">
              <div className="kyc-assisted-banner-icon">
                <UserCheck size={20} />
              </div>
              <div className="kyc-assisted-banner-content">
                <div className="kyc-assisted-banner-title">
                  Assisted KYC Mode: Onboarding on Behalf of {selectedDeal?.customerName || formData.investorName || 'Customer'}
                </div>
                <div className="kyc-assisted-banner-desc">
                  You are entering verified information on behalf of the customer. All inputs are saved as a draft. You can exit anytime and resume later. Official verification status will only be submitted upon your final confirmation at Step 5.
                </div>
              </div>
              {lastSavedDraftAt && (
                <div className="kyc-assisted-banner-saved">
                  <Clock size={12} />
                  Draft auto-saved {new Date(lastSavedDraftAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              )}
            </div>
          )}

          {/* Validation Error Summary Banner */}
          {validationErrorSummary && (
            <div className="kyc-validation-summary">
              <AlertTriangle size={18} className="kyc-validation-summary-icon" />
              <div className="kyc-validation-summary-text">
                {validationErrorSummary}
              </div>
            </div>
          )}

          {/* Step Form Body */}
          <div className="kyc-step-body">
            {/* ── STEP 1: BASIC DETAILS ── */}
            {currentStep === 1 && (
              <div>
                <div className="kyc-step-header">
                  <h2 className="kyc-step-title">
                    <User size={20} color="var(--primary-600)" /> Step 1: Basic Details
                  </h2>
                  <p className="kyc-step-subtitle">
                    Enter primary investor contact and demographic profile information for regulatory records.
                  </p>
                </div>

                <div className="kyc-step-guidance-box">
                  <Info size={16} className="kyc-step-guidance-box-icon" />
                  <div className="kyc-step-guidance-box-text">
                    <strong>Guidance:</strong> Ensure the investor's legal name, phone number, and email match their official identification. All communication and SEBI AIF confirmation will be routed to these coordinates.
                  </div>
                </div>

                {/* Section Card: Primary Investor Contact */}
                <div className="kyc-form-section-card">
                  <div className="kyc-form-section-header">
                    <h3 className="kyc-form-section-title">Primary Investor Contact</h3>
                    <p className="kyc-form-section-subtitle">Core contact details for all investor communications and OTP verification</p>
                  </div>
                  <div className="kyc-form-grid">
                    <div className="form-group">
                      <label className="form-label" htmlFor="kyc-investor-name">Investor Full Name <span className="kyc-required-star">*</span></label>
                      <input
                        id="kyc-investor-name"
                        type="text"
                        className={`form-input ${formErrors.investorName ? 'kyc-input-error' : ''}`}
                        placeholder="e.g. Ramesh Chandra Verma"
                        value={formData.investorName}
                        onChange={e => {
                          setFormData({ ...formData, investorName: e.target.value });
                          if (formErrors.investorName) {
                            setFormErrors(prev => { const c = { ...prev }; delete c.investorName; return c; });
                          }
                        }}
                      />
                      {formErrors.investorName && <div className="kyc-field-error">{formErrors.investorName}</div>}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="kyc-investor-phone">Phone Number <span className="kyc-required-star">*</span></label>
                      <input
                        id="kyc-investor-phone"
                        type="text"
                        className={`form-input ${formErrors.phone ? 'kyc-input-error' : ''}`}
                        placeholder="+91 98765 43210"
                        value={formData.phone}
                        onChange={e => {
                          setFormData({ ...formData, phone: e.target.value });
                          if (formErrors.phone) {
                            setFormErrors(prev => { const c = { ...prev }; delete c.phone; return c; });
                          }
                        }}
                      />
                      {formErrors.phone && <div className="kyc-field-error">{formErrors.phone}</div>}
                    </div>

                    <div className="form-group kyc-form-grid-full">
                      <label className="form-label" htmlFor="kyc-investor-email">Email Address <span className="kyc-required-star">*</span></label>
                      <input
                        id="kyc-investor-email"
                        type="email"
                        className={`form-input ${formErrors.email ? 'kyc-input-error' : ''}`}
                        placeholder="e.g. ramesh.verma@example.com"
                        value={formData.email}
                        onChange={e => {
                          setFormData({ ...formData, email: e.target.value });
                          if (formErrors.email) {
                            setFormErrors(prev => { const c = { ...prev }; delete c.email; return c; });
                          }
                        }}
                      />
                      {formErrors.email && <div className="kyc-field-error">{formErrors.email}</div>}
                    </div>
                  </div>
                </div>

                {/* Section Card: Investor & Tax Classification */}
                <div className="kyc-form-section-card">
                  <div className="kyc-form-section-header">
                    <h3 className="kyc-form-section-title">Investor &amp; Tax Classification</h3>
                    <p className="kyc-form-section-subtitle">Required for FATCA/CRS compliance and applicable withholding taxes</p>
                  </div>
                  <div className="kyc-form-grid-3">
                    <div className="form-group">
                      <label className="form-label" htmlFor="kyc-investor-gender">Gender <span className="kyc-required-star">*</span></label>
                      <select
                        id="kyc-investor-gender"
                        className={`form-select ${formErrors.gender ? 'kyc-input-error' : ''}`}
                        value={formData.gender}
                        onChange={e => setFormData({ ...formData, gender: e.target.value })}
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Other">Other</option>
                      </select>
                      {formErrors.gender && <div className="kyc-field-error">{formErrors.gender}</div>}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="kyc-investor-type">Investor Type <span className="kyc-required-star">*</span></label>
                      <select
                        id="kyc-investor-type"
                        className={`form-select ${formErrors.investorType ? 'kyc-input-error' : ''}`}
                        value={formData.investorType}
                        onChange={e => setFormData({ ...formData, investorType: e.target.value })}
                      >
                        <option value="Individual / Retail HNW">Individual / Retail HNW</option>
                        <option value="HUF (Hindu Undivided Family)">HUF (Hindu Undivided Family)</option>
                        <option value="Corporate / Private Ltd">Corporate / Private Ltd</option>
                        <option value="Partnership / LLP">Partnership / LLP</option>
                        <option value="Family Office / AIF">Family Office / AIF</option>
                        <option value="Trust / Society">Trust / Society</option>
                      </select>
                      {formErrors.investorType && <div className="kyc-field-error">{formErrors.investorType}</div>}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="kyc-investor-resident">Resident Type <span className="kyc-required-star">*</span></label>
                      <select
                        id="kyc-investor-resident"
                        className={`form-select ${formErrors.residentType ? 'kyc-input-error' : ''}`}
                        value={formData.residentType}
                        onChange={e => setFormData({ ...formData, residentType: e.target.value })}
                      >
                        <option value="Resident Indian (RI)">Resident Indian (RI)</option>
                        <option value="Non-Resident Indian (NRI)">Non-Resident Indian (NRI)</option>
                        <option value="Overseas Citizen of India (OCI)">Overseas Citizen of India (OCI)</option>
                        <option value="Person of Indian Origin (PIO)">Person of Indian Origin (PIO)</option>
                        <option value="Foreign National">Foreign National</option>
                      </select>
                      {formErrors.residentType && <div className="kyc-field-error">{formErrors.residentType}</div>}
                    </div>

                    <div className="form-group kyc-form-grid-full">
                      <label className="form-label" htmlFor="kyc-investor-occupation">Occupation / Source of Wealth (Optional)</label>
                      <input
                        id="kyc-investor-occupation"
                        type="text"
                        className="form-input"
                        placeholder="e.g. Salaried / Business / Professional"
                        value={formData.occupation || ''}
                        onChange={e => setFormData({ ...formData, occupation: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 2: IDENTITY DETAILS ── */}
            {currentStep === 2 && (
              <div>
                <div className="kyc-step-header">
                  <h2 className="kyc-step-title">
                    <ShieldCheck size={20} color="var(--primary-600)" /> Step 2: Identity Details
                  </h2>
                  <p className="kyc-step-subtitle">
                    Permanent Account Number (PAN), Aadhaar, address verification, and government ID uploads.
                  </p>
                </div>

                <div className="kyc-step-guidance-box">
                  <Info size={16} className="kyc-step-guidance-box-icon" />
                  <div className="kyc-step-guidance-box-text">
                    <strong>Guidance:</strong> PAN is mandatory under SEBI regulations. Name must match exactly as printed on the PAN card. Uploaded documents must be legible and in PDF, JPG, or PNG format.
                  </div>
                </div>

                {/* Card 1: Government Identification */}
                <div className="kyc-form-section-card">
                  <div className="kyc-form-section-header">
                    <h3 className="kyc-form-section-title">Government Identification</h3>
                    <p className="kyc-form-section-subtitle">Official tax and identity identifiers</p>
                  </div>
                  <div className="kyc-form-grid">
                    <div className="form-group">
                      <label className="form-label" htmlFor="kyc-investor-pan">PAN Number <span className="kyc-required-star">*</span></label>
                      <input
                        id="kyc-investor-pan"
                        type="text"
                        className={`form-input ${formErrors.panNumber ? 'kyc-input-error' : ''}`}
                        placeholder="e.g. ABCDE1234F"
                        maxLength={10}
                        value={formData.panNumber}
                        onChange={e => {
                          const val = e.target.value.toUpperCase();
                          setFormData({ ...formData, panNumber: val });
                          if (formErrors.panNumber) {
                            setFormErrors(prev => { const c = { ...prev }; delete c.panNumber; return c; });
                          }
                        }}
                      />
                      {formErrors.panNumber && <div className="kyc-field-error">{formErrors.panNumber}</div>}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="kyc-investor-pan-name">Name (As per PAN) <span className="kyc-required-star">*</span></label>
                      <input
                        id="kyc-investor-pan-name"
                        type="text"
                        className={`form-input ${formErrors.nameAsPerPan ? 'kyc-input-error' : ''}`}
                        placeholder="Full legal name"
                        value={formData.nameAsPerPan}
                        onChange={e => {
                          setFormData({ ...formData, nameAsPerPan: e.target.value });
                          if (formErrors.nameAsPerPan) {
                            setFormErrors(prev => { const c = { ...prev }; delete c.nameAsPerPan; return c; });
                          }
                        }}
                      />
                      {formErrors.nameAsPerPan && <div className="kyc-field-error">{formErrors.nameAsPerPan}</div>}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="kyc-investor-aadhaar">Aadhaar Number <span className="kyc-required-star">*</span></label>
                      <input
                        id="kyc-investor-aadhaar"
                        type="text"
                        className={`form-input ${formErrors.aadhaarNumber ? 'kyc-input-error' : ''}`}
                        placeholder="12-digit Aadhaar number"
                        maxLength={14}
                        value={formData.aadhaarNumber}
                        onChange={e => {
                          setFormData({ ...formData, aadhaarNumber: e.target.value });
                          if (formErrors.aadhaarNumber) {
                            setFormErrors(prev => { const c = { ...prev }; delete c.aadhaarNumber; return c; });
                          }
                        }}
                      />
                      {formErrors.aadhaarNumber && <div className="kyc-field-error">{formErrors.aadhaarNumber}</div>}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="kyc-investor-father-name">Father's Full Name (Optional)</label>
                      <input
                        id="kyc-investor-father-name"
                        type="text"
                        className="form-input"
                        placeholder="Father's full name"
                        value={formData.fatherName || ''}
                        onChange={e => setFormData({ ...formData, fatherName: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="kyc-investor-dob-step2">Date of Birth (DOB) <span className="kyc-required-star">*</span></label>
                      <input
                        id="kyc-investor-dob-step2"
                        type="date"
                        min="1900-01-01"
                        max={todayDateString}
                        className={`form-input ${formErrors.dob ? 'kyc-input-error' : ''}`}
                        value={sanitizeDobString(formData.dob)}
                        onChange={e => {
                          const val = sanitizeDobString(e.target.value);
                          setFormData({ ...formData, dob: val });
                          if (formErrors.dob) {
                            setFormErrors(prev => { const c = { ...prev }; delete c.dob; return c; });
                          }
                        }}
                      />
                      {formErrors.dob && <div className="kyc-field-error">{formErrors.dob}</div>}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="kyc-investor-country">Country</label>
                      <input
                        id="kyc-investor-country"
                        type="text"
                        className="form-input"
                        placeholder="India"
                        value={formData.country || 'India'}
                        onChange={e => setFormData({ ...formData, country: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Card 2: Residential & Mailing Addresses */}
                <div className="kyc-form-section-card">
                  <div className="kyc-form-section-header">
                    <h3 className="kyc-form-section-title">Residential &amp; Mailing Addresses</h3>
                    <p className="kyc-form-section-subtitle">Permanent registered address and physical courier delivery location</p>
                  </div>
                  <div className="kyc-form-grid">
                    <div className="form-group kyc-form-grid-full">
                      <label className="form-label" htmlFor="kyc-permanent-address">Permanent Address <span className="kyc-required-star">*</span></label>
                      <textarea
                        id="kyc-permanent-address"
                        rows={2}
                        className={`form-textarea ${formErrors.address ? 'kyc-input-error' : ''}`}
                        placeholder="Flat/House No, Building, Street, Area"
                        value={formData.address}
                        onChange={e => {
                          const val = e.target.value;
                          setFormData(prev => ({
                            ...prev,
                            address: val,
                            courierAddress: sameAsPermanent ? val : prev.courierAddress,
                          }));
                          if (formErrors.address) {
                            setFormErrors(prev => { const c = { ...prev }; delete c.address; return c; });
                          }
                        }}
                      />
                      {formErrors.address && <div className="kyc-field-error">{formErrors.address}</div>}
                    </div>

                    <div className="form-group kyc-form-grid-full">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <label className="form-label" htmlFor="kyc-courier-address" style={{ margin: 0 }}>Communication / Courier Address (Optional)</label>
                        <label htmlFor="kyc-same-as-perm" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                          <input
                            id="kyc-same-as-perm"
                            type="checkbox"
                            checked={sameAsPermanent}
                            onChange={e => {
                              const chk = e.target.checked;
                              setSameAsPermanent(chk);
                              if (chk) {
                                setFormData(prev => ({ ...prev, courierAddress: prev.address }));
                              }
                            }}
                          />
                          Same as Permanent Address
                        </label>
                      </div>
                      <textarea
                        id="kyc-courier-address"
                        rows={2}
                        className="form-textarea"
                        placeholder="Delivery & physical documentation address"
                        value={formData.courierAddress || ''}
                        onChange={e => setFormData({ ...formData, courierAddress: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="kyc-form-grid-3">
                    <div className="form-group">
                      <label className="form-label" htmlFor="kyc-address-state">State <span className="kyc-required-star">*</span></label>
                      <input
                        id="kyc-address-state"
                        type="text"
                        className={`form-input ${formErrors.state ? 'kyc-input-error' : ''}`}
                        placeholder="e.g. Karnataka"
                        value={formData.state}
                        onChange={e => {
                          setFormData({ ...formData, state: e.target.value });
                          if (formErrors.state) {
                            setFormErrors(prev => { const c = { ...prev }; delete c.state; return c; });
                          }
                        }}
                      />
                      {formErrors.state && <div className="kyc-field-error">{formErrors.state}</div>}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="kyc-address-city">City <span className="kyc-required-star">*</span></label>
                      <input
                        id="kyc-address-city"
                        type="text"
                        className={`form-input ${formErrors.city ? 'kyc-input-error' : ''}`}
                        placeholder="e.g. Bengaluru"
                        value={formData.city}
                        onChange={e => {
                          setFormData({ ...formData, city: e.target.value });
                          if (formErrors.city) {
                            setFormErrors(prev => { const c = { ...prev }; delete c.city; return c; });
                          }
                        }}
                      />
                      {formErrors.city && <div className="kyc-field-error">{formErrors.city}</div>}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="kyc-address-pincode">Pincode <span className="kyc-required-star">*</span></label>
                      <input
                        id="kyc-address-pincode"
                        type="text"
                        maxLength={6}
                        className={`form-input ${formErrors.pincode ? 'kyc-input-error' : ''}`}
                        placeholder="6-digit PIN code"
                        value={formData.pincode}
                        onChange={e => {
                          setFormData({ ...formData, pincode: e.target.value });
                          if (formErrors.pincode) {
                            setFormErrors(prev => { const c = { ...prev }; delete c.pincode; return c; });
                          }
                        }}
                      />
                      {formErrors.pincode && <div className="kyc-field-error">{formErrors.pincode}</div>}
                    </div>
                  </div>
                </div>

                {/* Card 3: Identity Proof Documents */}
                <div className="kyc-form-section-card">
                  <div className="kyc-form-section-header">
                    <h3 className="kyc-form-section-title">Identity Proof Documents</h3>
                    <p className="kyc-form-section-subtitle">Upload clear scanned copies or photos of the investor's Aadhaar, PAN card, and Face Photo for Biometric verification</p>
                  </div>
                  <div className="kyc-form-grid">
                    <KYCUploadCard
                      label="Upload Aadhaar (Front & Back) *"
                      required
                      doc={formData.aadhaarDoc}
                      error={formErrors.aadhaarDoc}
                      onUpload={doc => {
                        setFormData({ ...formData, aadhaarDoc: doc });
                        if (formErrors.aadhaarDoc) {
                          setFormErrors(prev => { const c = { ...prev }; delete c.aadhaarDoc; return c; });
                        }
                      }}
                      onRemove={() => setFormData({ ...formData, aadhaarDoc: null })}
                    />

                    <KYCUploadCard
                      label="Upload PAN Card *"
                      required
                      doc={formData.panDoc}
                      error={formErrors.panDoc}
                      onUpload={doc => {
                        setFormData({ ...formData, panDoc: doc });
                        if (formErrors.panDoc) {
                          setFormErrors(prev => { const c = { ...prev }; delete c.panDoc; return c; });
                        }
                      }}
                      onRemove={() => setFormData({ ...formData, panDoc: null })}
                    />

                    <KYCUploadCard
                      label="Upload Investor Face Photo / Live Selfie (Biometric Verification) *"
                      required
                      doc={formData.photoDoc}
                      error={formErrors.photoDoc}
                      onUpload={doc => {
                        setFormData({ ...formData, photoDoc: doc });
                        if (formErrors.photoDoc) {
                          setFormErrors(prev => { const c = { ...prev }; delete c.photoDoc; return c; });
                        }
                      }}
                      onRemove={() => setFormData({ ...formData, photoDoc: null })}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── STEP 3: BANK DETAILS ── */}
            {currentStep === 3 && (
              <div>
                <div className="kyc-step-header">
                  <h2 className="kyc-step-title">
                    <Building size={20} color="var(--primary-600)" /> Step 3: Bank Details
                  </h2>
                  <p className="kyc-step-subtitle">
                    Investment account details for capital drawdowns, dividends, and distributions.
                  </p>
                </div>

                <div className="kyc-step-guidance-box">
                  <Info size={16} className="kyc-step-guidance-box-icon" />
                  <div className="kyc-step-guidance-box-text">
                    <strong>Guidance:</strong> The bank account must be held in the name of the investor. Joint accounts are permitted if the investor is the primary holder. Third-party bank accounts are strictly prohibited by SEBI.
                  </div>
                </div>

                {/* Card 1: Bank Account Information */}
                <div className="kyc-form-section-card">
                  <div className="kyc-form-section-header">
                    <h3 className="kyc-form-section-title">Bank Account Information</h3>
                    <p className="kyc-form-section-subtitle">Account numbers and branch routing identifiers</p>
                  </div>
                  <div className="kyc-form-grid">
                    <div className="form-group">
                      <label className="form-label" htmlFor="kyc-bank-account-type">Account Type <span className="kyc-required-star">*</span></label>
                      <select
                        id="kyc-bank-account-type"
                        className={`form-select ${formErrors.accountType ? 'kyc-input-error' : ''}`}
                        value={formData.accountType}
                        onChange={e => setFormData({ ...formData, accountType: e.target.value })}
                      >
                        <option value="Savings">Savings Account</option>
                        <option value="Current">Current Account</option>
                        <option value="NRE">NRE (Non-Resident External)</option>
                        <option value="NRO">NRO (Non-Resident Ordinary)</option>
                      </select>
                      {formErrors.accountType && <div className="kyc-field-error">{formErrors.accountType}</div>}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="kyc-bank-account-number">Account Number <span className="kyc-required-star">*</span></label>
                      <input
                        id="kyc-bank-account-number"
                        type="text"
                        className={`form-input ${formErrors.accountNumber ? 'kyc-input-error' : ''}`}
                        placeholder="Bank account number"
                        value={formData.accountNumber}
                        onChange={e => {
                          setFormData({ ...formData, accountNumber: e.target.value });
                          if (formErrors.accountNumber) {
                            setFormErrors(prev => { const c = { ...prev }; delete c.accountNumber; return c; });
                          }
                        }}
                      />
                      {formErrors.accountNumber && <div className="kyc-field-error">{formErrors.accountNumber}</div>}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="kyc-bank-ifsc-code">IFSC Code <span className="kyc-required-star">*</span></label>
                      <input
                        id="kyc-bank-ifsc-code"
                        type="text"
                        className={`form-input ${formErrors.ifscCode ? 'kyc-input-error' : ''}`}
                        placeholder="e.g. HDFC0001234"
                        maxLength={11}
                        value={formData.ifscCode}
                        onChange={e => void handleIfscChange(e.target.value)}
                      />
                      {formErrors.ifscCode && <div className="kyc-field-error">{formErrors.ifscCode}</div>}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="kyc-bank-swift-code">SWIFT / IBAN Code</label>
                      <input
                        id="kyc-bank-swift-code"
                        type="text"
                        className="form-input"
                        placeholder="For international / NRI wires"
                        value={formData.swiftCode}
                        onChange={e => setFormData({ ...formData, swiftCode: e.target.value.toUpperCase() })}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="kyc-bank-account-holder-name">Account Holder Name <span className="kyc-required-star">*</span></label>
                      <input
                        id="kyc-bank-account-holder-name"
                        type="text"
                        className={`form-input ${formErrors.accountHolderName ? 'kyc-input-error' : ''}`}
                        placeholder="Name as registered with the bank"
                        value={formData.accountHolderName}
                        onChange={e => {
                          setFormData({ ...formData, accountHolderName: e.target.value });
                          if (formErrors.accountHolderName) {
                            setFormErrors(prev => { const c = { ...prev }; delete c.accountHolderName; return c; });
                          }
                        }}
                      />
                      {formErrors.accountHolderName && <div className="kyc-field-error">{formErrors.accountHolderName}</div>}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="kyc-bank-name">Bank Name <span className="kyc-required-star">*</span></label>
                      <input
                        id="kyc-bank-name"
                        type="text"
                        className={`form-input ${formErrors.bankName ? 'kyc-input-error' : ''}`}
                        placeholder="e.g. HDFC Bank Ltd"
                        value={formData.bankName}
                        onChange={e => {
                          setFormData({ ...formData, bankName: e.target.value });
                          if (formErrors.bankName) {
                            setFormErrors(prev => { const c = { ...prev }; delete c.bankName; return c; });
                          }
                        }}
                      />
                      {formErrors.bankName && <div className="kyc-field-error">{formErrors.bankName}</div>}
                    </div>

                    <div className="form-group kyc-form-grid-full">
                      <label className="form-label" htmlFor="kyc-bank-branch-name">Branch Name</label>
                      <input
                        id="kyc-bank-branch-name"
                        type="text"
                        className="form-input"
                        placeholder="e.g. Koramangala 5th Block Branch"
                        value={formData.branchName}
                        onChange={e => setFormData({ ...formData, branchName: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Card 2: Bank Verification Document */}
                <div className="kyc-form-section-card">
                  <div className="kyc-form-section-header">
                    <h3 className="kyc-form-section-title">Bank Verification Document</h3>
                    <p className="kyc-form-section-subtitle">Proof of account showing investor name, account number, and IFSC</p>
                  </div>
                  <KYCUploadCard
                    label="Upload Bank Statement / Cancelled Cheque / Passbook *"
                    required
                    doc={formData.bankProofDoc}
                    error={formErrors.bankProofDoc}
                    onUpload={doc => {
                      setFormData({ ...formData, bankProofDoc: doc });
                      if (formErrors.bankProofDoc) {
                        setFormErrors(prev => { const c = { ...prev }; delete c.bankProofDoc; return c; });
                      }
                    }}
                    onRemove={() => setFormData({ ...formData, bankProofDoc: null })}
                  />
                </div>
              </div>
            )}

            {/* ── STEP 4: DEMAT ACCOUNT ── */}
            {currentStep === 4 && (
              <div>
                <div className="kyc-step-header">
                  <h2 className="kyc-step-title">
                    <CreditCard size={20} color="var(--primary-600)" /> Step 4: Demat Account
                  </h2>
                  <p className="kyc-step-subtitle">
                    Provide depository participant (NSDL / CDSL) details for unlisted/listed securities allotment.
                  </p>
                </div>

                <div className="kyc-step-guidance-box">
                  <Info size={16} className="kyc-step-guidance-box-icon" />
                  <div className="kyc-step-guidance-box-text">
                    <strong>Guidance:</strong> A Demat account enables electronic credit of units. If the investor does not currently hold a Demat account, check the skip option below to issue physical certificates instead.
                  </div>
                </div>

                {/* Skip Checkbox Card */}
                <div className="kyc-demat-card">
                  <label className="kyc-checkbox-label" htmlFor="kyc-skip-demat">
                    <input
                      id="kyc-skip-demat"
                      type="checkbox"
                      className="kyc-checkbox-input"
                      checked={formData.hasNoDemat}
                      onChange={e => {
                        const checked = e.target.checked;
                        setFormData({ ...formData, hasNoDemat: checked });
                        if (checked) {
                          setFormErrors(prev => {
                            const c = { ...prev };
                            delete c.dematAccountNumber;
                            delete c.dematDoc;
                            return c;
                          });
                        }
                      }}
                    />
                    <span style={{ fontWeight: 600 }}>I don't have a Demat account (Skip this step)</span>
                  </label>
                  {formData.hasNoDemat && (
                    <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                      ℹ️ <em>You have elected to skip the Demat step. Physical investment certificate &amp; holding statement will be issued instead. You may proceed directly to Nominee Details.</em>
                    </div>
                  )}
                </div>

                {/* If Not Skipped: Demat Fields Card */}
                {!formData.hasNoDemat && (
                  <div className="kyc-form-section-card">
                    <div className="kyc-form-section-header">
                      <h3 className="kyc-form-section-title">Demat Account Details</h3>
                      <p className="kyc-form-section-subtitle">NSDL / CDSL Beneficiary Account information</p>
                    </div>
                    <div className="kyc-form-grid">
                      <div className="form-group kyc-form-grid-full">
                        <label className="form-label" htmlFor="kyc-demat-account-number">Demat Account Number (16-digit BO ID / DP ID) <span className="kyc-required-star">*</span></label>
                        <input
                          id="kyc-demat-account-number"
                          type="text"
                          className={`form-input ${formErrors.dematAccountNumber ? 'kyc-input-error' : ''}`}
                          placeholder="e.g. 1208160012345678 or IN30012345678901"
                          value={formData.dematAccountNumber}
                          onChange={e => {
                            setFormData({ ...formData, dematAccountNumber: e.target.value });
                            if (formErrors.dematAccountNumber) {
                              setFormErrors(prev => { const c = { ...prev }; delete c.dematAccountNumber; return c; });
                            }
                          }}
                        />
                        {formErrors.dematAccountNumber && (
                          <div className="kyc-field-error">{formErrors.dematAccountNumber}</div>
                        )}
                      </div>

                      <div className="kyc-form-grid-full">
                        <KYCUploadCard
                          label="Upload Demat Statement (CML / Holding Statement) *"
                          required
                          doc={formData.dematDoc}
                          error={formErrors.dematDoc}
                          onUpload={doc => {
                            setFormData({ ...formData, dematDoc: doc });
                            if (formErrors.dematDoc) {
                              setFormErrors(prev => { const c = { ...prev }; delete c.dematDoc; return c; });
                            }
                          }}
                          onRemove={() => setFormData({ ...formData, dematDoc: null })}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── STEP 5: NOMINEE DETAILS ── */}
            {currentStep === 5 && (
              <div>
                <div className="kyc-step-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h2 className="kyc-step-title">
                      <Users size={20} color="var(--primary-600)" /> Step 5: Nominee Details
                    </h2>
                    <p className="kyc-step-subtitle">
                      SEBI statutory nomination declaration. Designate up to 3 nominees for asset succession.
                    </p>
                  </div>
                  {formData.hasNominee && formData.nominees.length < 3 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      onClick={handleAddNominee}
                    >
                      <Plus size={14} /> Add Nominee
                    </button>
                  )}
                </div>

                {/* Optional Nominee Toggle */}
                <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 8, background: 'var(--bg-secondary, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)' }}>
                  <label className="kyc-checkbox-label" htmlFor="kyc-has-nominee" aria-label="Register Nominee(s) for this Investment Account" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                    <input
                      id="kyc-has-nominee"
                      type="checkbox"
                      className="kyc-checkbox-input"
                      checked={formData.hasNominee}
                      onChange={e => {
                        const enabled = e.target.checked;
                        setFormData(prev => ({
                          ...prev,
                          hasNominee: enabled,
                          nominees: enabled
                            ? (prev.nominees.length > 0 ? prev.nominees : [
                                {
                                  id: `nom-${Date.now()}`,
                                  name: '',
                                  relationship: 'Spouse',
                                  dob: '',
                                  allocationPercentage: 100,
                                  address: '',
                                  guardianName: '',
                                }
                              ])
                            : [],
                        }));
                        if (!enabled) {
                          setFormErrors(prev => {
                            const c = { ...prev };
                            delete c.nominees;
                            Object.keys(c).forEach(k => {
                              if (k.startsWith('nominee_')) delete c[k];
                            });
                            return c;
                          });
                        }
                      }}
                    />
                    <span style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>
                        Register Nominee(s) for this Investment Account
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        Nomination is optional. Designate up to 3 legal nominees or uncheck to proceed as a single applicant without nominee.
                      </span>
                    </span>
                  </label>
                </div>

                {!formData.hasNominee ? (
                  <div style={{ padding: '14px 16px', borderRadius: 8, backgroundColor: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <ShieldCheck size={20} color="#2563eb" style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      <strong style={{ color: 'var(--text-primary)' }}>No Nominee Appointed (Opted Out):</strong> You or the investor has elected to proceed without declaring a nominee. All investment account rights and redemption proceeds will accrue strictly to the primary applicant or legal succession heirs.
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="kyc-step-guidance-box">
                      <Info size={16} className="kyc-step-guidance-box-icon" />
                      <div className="kyc-step-guidance-box-text">
                        <strong>Guidance:</strong> The sum of allocation percentages across all nominees must total <strong>exactly 100%</strong>. If any nominee is a minor (under 18), guardian details must be provided.
                      </div>
                    </div>

                    {/* Total Allocation Progress Pill */}
                    {(() => {
                      const totalPct = formData.nominees.reduce((sum, n) => sum + (Number(n.allocationPercentage) || 0), 0);
                      const is100 = totalPct === 100;
                      return (
                        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className={is100 ? 'kyc-allocation-pill-ok' : 'kyc-allocation-pill-warn'}>
                            {is100 ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
                            Total Allocation: {totalPct}% / 100% {is100 ? '(Valid)' : `(Needs ${100 - totalPct > 0 ? `${100 - totalPct}% more` : `${totalPct - 100}% less`})`}
                          </span>
                        </div>
                      );
                    })()}

                    {formErrors.nominees && (
                      <div className="kyc-field-error" style={{ marginBottom: 16 }}>{formErrors.nominees}</div>
                    )}

                    {formData.nominees.map((nom, idx) => (
                      <div key={nom.id} className="kyc-nominee-box">
                        <div className="kyc-nominee-box-header">
                          <div className="kyc-nominee-box-title">
                            Nominee #{idx + 1}
                          </div>
                          {formData.nominees.length > 1 && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                              onClick={() => handleRemoveNominee(nom.id || idx)}
                            >
                              <Trash2 size={14} /> Remove
                            </button>
                          )}
                        </div>

                        <div className="kyc-form-grid">
                          <div className="form-group">
                            <label className="form-label" htmlFor={`kyc-nominee-${nom.id || idx}-name`}>Nominee Full Name <span className="kyc-required-star">*</span></label>
                            <input
                              id={`kyc-nominee-${nom.id || idx}-name`}
                              type="text"
                              className={`form-input ${formErrors[`nominee_${idx}_name`] ? 'kyc-input-error' : ''}`}
                              placeholder="Nominee legal name"
                              value={nom.name}
                              onChange={e => handleNomineeChange(nom.id || idx, 'name', e.target.value)}
                            />
                            {formErrors[`nominee_${idx}_name`] && (
                              <div className="kyc-field-error">{formErrors[`nominee_${idx}_name`]}</div>
                            )}
                          </div>

                          <div className="form-group">
                            <label className="form-label" htmlFor={`kyc-nominee-${nom.id || idx}-relationship`}>Relationship with Investor <span className="kyc-required-star">*</span></label>
                            <select
                              id={`kyc-nominee-${nom.id || idx}-relationship`}
                              className="form-select"
                              value={nom.relationship}
                              onChange={e => handleNomineeChange(nom.id || idx, 'relationship', e.target.value)}
                            >
                              <option value="Spouse">Spouse</option>
                              <option value="Son">Son</option>
                              <option value="Daughter">Daughter</option>
                              <option value="Father">Father</option>
                              <option value="Mother">Mother</option>
                              <option value="Brother">Brother</option>
                              <option value="Sister">Sister</option>
                              <option value="Other">Other</option>
                            </select>
                          </div>

                          <div className="form-group">
                            <label className="form-label" htmlFor={`kyc-nominee-${nom.id || idx}-dob`}>Date of Birth / Age <span className="kyc-required-star">*</span></label>
                            <input
                              id={`kyc-nominee-${nom.id || idx}-dob`}
                              type="date"
                              min="1900-01-01"
                              max={todayDateString}
                              className={`form-input ${formErrors[`nominee_${idx}_dob`] ? 'kyc-input-error' : ''}`}
                              value={sanitizeDobString(nom.dob)}
                              onChange={e => handleNomineeChange(nom.id || idx, 'dob', sanitizeDobString(e.target.value))}
                            />
                            {formErrors[`nominee_${idx}_dob`] && (
                              <div className="kyc-field-error">{formErrors[`nominee_${idx}_dob`]}</div>
                            )}
                          </div>

                          <div className="form-group">
                            <label className="form-label" htmlFor={`kyc-nominee-${nom.id || idx}-allocation`}>Allocation Percentage (%) <span className="kyc-required-star">*</span></label>
                            <input
                              id={`kyc-nominee-${nom.id || idx}-allocation`}
                              type="number"
                              min={1}
                              max={100}
                              className={`form-input ${formErrors[`nominee_${idx}_pct`] ? 'kyc-input-error' : ''}`}
                              value={nom.allocationPercentage}
                              onChange={e => handleNomineeChange(nom.id || idx, 'allocationPercentage', Number(e.target.value))}
                            />
                            {formErrors[`nominee_${idx}_pct`] && (
                              <div className="kyc-field-error">{formErrors[`nominee_${idx}_pct`]}</div>
                            )}
                          </div>

                          <div className="form-group kyc-form-grid-full">
                            <label className="form-label" htmlFor={`kyc-nominee-${nom.id || idx}-address`}>Nominee Address</label>
                            <input
                              id={`kyc-nominee-${nom.id || idx}-address`}
                              type="text"
                              className="form-input"
                              placeholder="Address (Leave blank if same as investor)"
                              value={nom.address}
                              onChange={e => handleNomineeChange(nom.id || idx, 'address', e.target.value)}
                            />
                          </div>

                          <div className="form-group kyc-form-grid-full">
                            <label className="form-label" htmlFor={`kyc-nominee-${nom.id || idx}-guardian`}>Guardian Name (If nominee is a minor under 18)</label>
                            <input
                              id={`kyc-nominee-${nom.id || idx}-guardian`}
                              type="text"
                              className="form-input"
                              placeholder="Guardian full name"
                              value={nom.guardianName}
                              onChange={e => handleNomineeChange(nom.id || idx, 'guardianName', e.target.value)}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* ── ACTION NAVIGATION BAR ── */}
            <div className="kyc-nav-bar">
              <div className="kyc-nav-left" style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleBack}
                  title={currentStep === 1 ? 'Exit Assisted KYC and return to list' : 'Return to previous step'}
                >
                  <ArrowLeft size={14} style={{ marginRight: 6 }} />
                  {currentStep === 1 ? 'Back to Table' : 'Previous Step'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => void handleSaveDraft(true)}
                  disabled={isStepSaving}
                  title="Save current details as draft"
                  style={{ border: '1px solid var(--border-color)', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                >
                  {isStepSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  {isStepSaving ? 'Saving...' : 'Save Draft'}
                </button>
              </div>

              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Step {currentStep} of 5 {isAssistedFlow ? '• Assisted KYC Draft' : ''}
              </div>

              <div className="kyc-nav-right">
                {currentStep < 5 ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void handleContinue()}
                    disabled={isStepSaving}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                  >
                    {isStepSaving && <Loader2 size={16} className="animate-spin" />}
                    {isStepSaving
                      ? 'Saving & Uploading Documents...'
                      : currentStep === 1
                      ? 'Continue to Identity Details (Step 2) →'
                      : currentStep === 2
                      ? 'Continue to Bank Details (Step 3) →'
                      : currentStep === 3
                      ? 'Continue to Demat Details (Step 4) →'
                      : 'Continue to Nominee Details (Step 5) →'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={isStepSaving}
                    style={{ backgroundColor: '#7c3aed', borderColor: '#7c3aed', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={handleOpenReviewForSubmission}
                  >
                    <CheckCircle size={15} /> Review &amp; Submit on Behalf
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KYC Dossier Modal (Preview / SEBI checklist) */}
      {selectedDealForDetail && (
        <KycDossierModal
          deal={selectedDealForDetail}
          isOpen={!!selectedDealForDetail}
          onClose={() => setSelectedDealForDetail(null)}
          onAdvanceStage={handleAdvanceStage}
          onOpenKycForm={(d) => {
            setSelectedDealForDetail(null);
            startKycFlow(d);
          }}
          statusBadge={getDealKycStatus(selectedDealForDetail)}
          formatCurrency={formatCurrency}
        />
      )}

      {/* Send Customer KYC Link Modal */}
      <SendKycLinkModal
        isOpen={!!sendLinkDeal}
        onClose={() => setSendLinkDeal(null)}
        deal={sendLinkDeal}
        onShowToast={showToast}
        isResend={!!sendLinkDeal && ['Link Sent', 'In Progress', 'Needs Correction', 'Rejected'].includes(resolveCustomerKycStatus(sendLinkDeal))}
        onSent={sent => {
          setSentDealIds(prev => ({ ...prev, [sent.id]: true }));
          void refreshDbKycs();
        }}
      />

      {/* Review Customer KYC Drawer */}
      <KycReviewDrawer
        isOpen={!!reviewDeal}
        onClose={() => setReviewDeal(null)}
        deal={reviewDeal}
        onShowToast={showToast}
        onChangeKycStatus={handleStatusChange}
        isReadOnly={isGhlAdmin}
        onEditKyc={handleCorrectKycDetails}
      />

      {/* ── Assisted KYC Review & Consent Confirmation Modal ── */}
      <Modal
        isOpen={isAssistedReviewModalOpen && !!selectedDeal}
        onClose={() => setIsAssistedReviewModalOpen(false)}
        title="Review & Submit Assisted KYC"
        subtitle={`Submitting KYC on behalf of customer: ${formData.investorName || selectedDeal?.customerName}`}
        maxWidth={640}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 12 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsAssistedReviewModalOpen(false)}
            >
              Back to Edit
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{
                backgroundColor: customerConsentChecked ? '#7c3aed' : '#a78bfa',
                borderColor: customerConsentChecked ? '#7c3aed' : '#a78bfa',
                cursor: customerConsentChecked ? 'pointer' : 'not-allowed',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
              disabled={!customerConsentChecked}
              onClick={() => void handleConfirmAssistedSubmit()}
            >
              <CheckCircle size={15} /> Confirm &amp; Submit for Verification
            </button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Summary Box */}
          <div style={{ background: 'var(--bg-card, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: 8, padding: 14 }}>
            <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
              Application Summary
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Full Name:</span>
                <div style={{ fontWeight: 600 }}>{formData.investorName || '—'}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Contact Phone:</span>
                <div style={{ fontWeight: 600 }}>{formData.phone || '—'}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Email:</span>
                <div style={{ fontWeight: 600 }}>{formData.email || '—'}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>PAN Number:</span>
                <div style={{ fontWeight: 600 }}>{formData.panNumber || '—'}</div>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Aadhaar Number:</span>
                <div style={{ fontWeight: 600 }}>
                  {formData.aadhaarNumber ? `•••• •••• ${formData.aadhaarNumber.slice(-4)}` : '—'}
                </div>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)' }}>Bank &amp; Account:</span>
                <div style={{ fontWeight: 600 }}>
                  {formData.bankName ? `${formData.bankName} (${formData.accountNumber ? '••••' + formData.accountNumber.slice(-4) : '—'})` : '—'}
                </div>
              </div>
            </div>

            {/* Documents preview summary */}
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-color, #e2e8f0)', fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>Uploaded Documents:</span>
              <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {formData.panDoc && (
                  <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(16, 185, 129, 0.1)', color: '#059669', fontSize: 11, fontWeight: 600 }}>
                    ✓ PAN Card
                  </span>
                )}
                {formData.aadhaarDoc && (
                  <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(16, 185, 129, 0.1)', color: '#059669', fontSize: 11, fontWeight: 600 }}>
                    ✓ Aadhaar Card
                  </span>
                )}
                {formData.bankProofDoc && (
                  <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(16, 185, 129, 0.1)', color: '#059669', fontSize: 11, fontWeight: 600 }}>
                    ✓ Bank Proof
                  </span>
                )}
                {formData.dematDoc && !formData.hasNoDemat && (
                  <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(16, 185, 129, 0.1)', color: '#059669', fontSize: 11, fontWeight: 600 }}>
                    ✓ Demat
                  </span>
                )}
                {!formData.panDoc && !formData.aadhaarDoc && !formData.bankProofDoc && (
                  <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>No documents attached</span>
                )}
              </div>
            </div>
          </div>

          {/* IRM Attribution Info */}
          <div style={{ background: 'rgba(124, 58, 237, 0.05)', border: '1px solid rgba(124, 58, 237, 0.2)', borderRadius: 8, padding: 12, fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700, color: '#7c3aed', marginBottom: 4 }}>
              <UserCheck size={14} /> IRM Assisted Onboarding Record
            </div>
            <div style={{ color: 'var(--text-secondary)' }}>
              Entered By: <strong style={{ color: 'var(--text-primary)' }}>{user?.name || 'IRM User'}</strong> (ID: {user?.id || '—'}) • Timestamp: <strong>{new Date().toLocaleString()}</strong>
            </div>
          </div>

          {/* Customer Consent Checkbox (Mandatory) */}
          <div style={{
            background: customerConsentChecked ? 'rgba(16, 185, 129, 0.06)' : 'rgba(245, 158, 11, 0.08)',
            border: `1px solid ${customerConsentChecked ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
            borderRadius: 8,
            padding: 14,
          }}>
            <label htmlFor="kyc-customer-consent-check" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13, lineHeight: '1.4' }}>
              <input
                id="kyc-customer-consent-check"
                type="checkbox"
                checked={customerConsentChecked}
                onChange={e => setCustomerConsentChecked(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 2, cursor: 'pointer', accentColor: '#7c3aed', flexShrink: 0 }}
              />
              <span style={{ color: 'var(--text-primary)' }}>
                <strong>Customer Consent &amp; Authorization:</strong> I certify that the information and documents entered in this form were provided directly by the customer (<strong>{formData.investorName || selectedDeal?.customerName}</strong>), and the customer has granted explicit consent and authorization for the IRM to submit this KYC application on their behalf.
              </span>
            </label>
            {!customerConsentChecked && (
              <div style={{ marginTop: 6, marginLeft: 28, fontSize: 11, color: '#d97706', fontWeight: 600 }}>
                * Customer consent must be recorded before submission.
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* KycVerifyModal — opened from profile card Verify KYC button */}
      {verifyModalDeal && (
        <KycVerifyModal
          isOpen={verifyModalDeal !== null}
          onClose={() => setVerifyModalDeal(null)}
          deal={verifyModalDeal}
          profileKycData={
            (profileKycData || buildMergedProfileData(
              verifyModalDeal,
              findBackendKyc(verifyModalDeal, dbKycs, tenant?.id),
              leads.find(l => (verifyModalDeal.customerId && l.id === verifyModalDeal.customerId) || (l.phone && l.phone.replace(/\D/g, '').slice(-10) === (verifyModalDeal.phone || '').replace(/\D/g, '').slice(-10))),
              customers.find(c => (verifyModalDeal.customerId && c.id === verifyModalDeal.customerId) || (c.phone && c.phone.replace(/\D/g, '').slice(-10) === (verifyModalDeal.phone || '').replace(/\D/g, '').slice(-10)))
            )) as Record<string, any>
          }
          onSaveVerification={async (status, comment, flaggedSections, checklist) => {
            await handleStatusChange(verifyModalDeal, status, comment, flaggedSections, checklist);
          }}
          onShowToast={showToast}
        />
      )}
    </div>
  );
};

// ==============================================================================
// ORIGINAL KYC VIEW (For any non-GHL IRM persona/company)
// ==============================================================================
const OriginalKYCView: React.FC = () => {
  const { tenant, user } = useAuth();
  const { initiateCall } = useCall();

  const [deals, setDeals] = useState<Deal[]>([]);
  const [agentFilter, setAgentFilter] = useState('All');
  const [selectedDealForDetail, setSelectedDealForDetail] = useState<Deal | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadData = () => {
    const allDeals = storageService.getDeals(tenant?.id);
    setDeals(allDeals.filter(d => d.stage === 'qualified_investor'));
  };

  useEffect(() => {
    loadData();
    let timeoutId: any;
    const handleUpdate = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        loadData();
      }, 300);
    };
    window.addEventListener('nexus_storage_updated', handleUpdate);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('nexus_storage_updated', handleUpdate);
    };
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- loadData intentionally excluded; only re-run when tenant changes
  }, [tenant?.id]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const getDaysInStage = (deal: Deal) => getDealDaysInStage(deal);
  const formatCurrency = (val: number) => formatKycCurrency(val);

  const handleAdvanceStage = (deal: Deal) => {
    const updatedDeal: Deal = {
      ...deal,
      stage: 'investment_opportunity',
      stageEnteredAt: new Date().toISOString(),
    };
    void persistDeal(updatedDeal).catch(_e => showToast("Error saving deal:"));

    const activity: DealActivity = {
      id: `act-${Date.now()}`,
      dealId: deal.id,
      companyId: tenant?.id || '',
      type: 'stage_change',
      fromStage: 'qualified_investor',
      toStage: 'investment_opportunity',
      text: 'Qualified Investor → Investment Opportunity (KYC Verified)',
      loggedByName: user?.name || 'IRM User',
      loggedByRole: 'IRM',
      timestamp: new Date().toISOString(),
    };
    storageService.addDealActivity(activity);

    if (selectedDealForDetail?.id === deal.id) {
      setSelectedDealForDetail(null);
    }

    loadData();
    showToast(`Investor "${deal.customerName}" advanced to Investment Opportunity!`);
  };

  const agentOptions = useMemo(() => {
    return buildOriginalKycAgentOptions(deals);
  }, [deals]);

  const filteredDeals = useMemo(() => {
    return filterOriginalKycDeals(deals, { agentFilter });
  }, [deals, agentFilter]);

  const columns: Column<Deal>[] = [
    {
      key: 'customerName',
      header: 'Investor & Deal',
      sortable: true,
      render: deal => (
        <div>
          <div className="kyc-customer-name">{deal.customerName}</div>
          <div className="kyc-deal-subtitle">{deal.title}</div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact Details',
      render: deal => (
        <div className="kyc-contact-info">
          {deal.phone && (
            <div className="kyc-contact-row">
              <Phone size={12} color="var(--text-muted)" />
              <span>{deal.phone}</span>
            </div>
          )}
          {deal.email && (
            <div className="kyc-contact-row">
              <Mail size={12} color="var(--text-muted)" />
              <span style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {deal.email}
              </span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'location',
      header: 'Location',
      render: deal => (
        <div className="kyc-contact-row" style={{ fontSize: 12 }}>
          <MapPin size={12} color="var(--text-muted)" />
          <span>{deal.location || '—'}</span>
        </div>
      ),
    },
    {
      key: 'investmentRange',
      header: 'Investment Capacity',
      sortable: true,
      render: deal => {
        const val = deal.investmentRange || (deal.value > 0 ? formatCurrency(deal.value) : null);
        const isSpecified = val && val !== '—' && val.trim() !== '' && val.toLowerCase() !== 'not specified';
        return isSpecified ? (
          <span className="kyc-capacity-badge">
            {val}
          </span>
        ) : (
          <NotSpecifiedBadge />
        );
      },
    },
    {
      key: 'value',
      header: 'Investment Amount',
      sortable: true,
      render: deal => {
        const val = resolveCustomerInvestmentAmount(deal, storageService.getLeads(tenant?.id), storageService.getCustomers(tenant?.id));
        return <SpecifiedValueBadge value={val} style={{ color: '#10b981', fontWeight: 800, fontSize: 13 }} />;
      },
    },
    {
      key: 'preferredAssetClass',
      header: 'Preferred Asset Class',
      render: deal => {
        const pref = resolvePreferredAssetClass(deal, storageService.getLeads(tenant?.id), storageService.getCustomers(tenant?.id));
        return <PreferredAssetBadge preferredAssetClass={pref} />;
      },
    },
    {
      key: 'kycStatus',
      header: 'KYC Document Status',
      render: () => (
        <span className="kyc-badge-verified">
          <CheckCircle size={12} /> SEBI KYC Validated
        </span>
      ),
    },
    {
      key: 'assignedAgentName',
      header: 'Assigned IRM',
      render: deal => (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {deal.assignedAgentName || 'Ananya Iyer'}
        </span>
      ),
    },
    {
      key: 'stageEnteredAt',
      header: 'Stage Duration',
      render: deal => {
        const days = getDaysInStage(deal);
        return (
          <span className="kyc-days-pill">
            <Clock size={11} /> {days}d
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Stage Action',
      render: deal => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {canPlaceCalls(user) && (
            <button
              type="button"
              className="btn btn-sm btn-ghost btn-icon"
              title={`Call ${deal.customerName}`}
              onClick={() => void initiateCall(deal.customerName, deal.phone || '', 'customer', deal.customerId || deal.id, undefined, 'kyc')}
            >
              <Phone size={14} color="#059669" />
            </button>
          )}
          <button
            type="button"
            className="kyc-advance-btn"
            title="Advance stage to Investment Opportunity"
            onClick={() => void handleAdvanceStage(deal)}
          >
            Advance <ArrowRight size={13} />
          </button>
        </div>
      ),
    },
  ];

  const rowActions: RowAction<Deal>[] = [
    {
      label: 'View KYC Dossier',
      icon: <Eye size={14} style={{ marginRight: 6 }} />,
      onClick: deal => setSelectedDealForDetail(deal),
    },
    ...(canPlaceCalls(user)
      ? [
          {
            label: 'Call Investor',
            icon: <Phone size={14} color="#059669" style={{ marginRight: 6 }} />,
            onClick: (deal: Deal) => void initiateCall(deal.customerName, deal.phone || '', 'customer', deal.customerId || deal.id, undefined, 'kyc'),
          },
        ]
      : []),
    {
      label: 'Advance to Opportunity',
      icon: <ArrowRight size={14} color="var(--primary-600)" style={{ marginRight: 6 }} />,
      onClick: deal => void handleAdvanceStage(deal),
    },
  ];

  return (
    <div className="kyc-page-container">
      {/* Toast Notification */}
      <KycToast message={toastMessage} />

      {/* Header */}
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">
            <FileCheck size={24} color="#06b6d4" /> Qualified Investor & KYC Verification
          </h1>
          <p className="page-subtitle">
            SEBI compliance checked, ticket size verified, KYC validated investors ready for investment opportunities.
          </p>
        </div>
      </div>

      {/* Data Table */}
      <DataTable
        data={filteredDeals}
        columns={columns}
        rowActions={rowActions}
        keyExtractor={d => d.id}
        searchPlaceholder="Search by investor, phone, city..."
        searchFilter={(deal, q) => {
          const matchName = deal.customerName?.toLowerCase().includes(q);
          const matchPhone = deal.phone?.toLowerCase().includes(q);
          const matchTitle = deal.title?.toLowerCase().includes(q);
          const matchLocation = deal.location?.toLowerCase().includes(q);
          return Boolean(matchName || matchPhone || matchTitle || matchLocation);
        }}
        emptyTitle="No Qualified Investors"
        emptyDescription="No investors currently in the Qualified Investor / KYC stage."
        filtersNode={
          <FilterBar
            filters={[
              {
                key: 'agent',
                label: 'Assigned IRM',
                value: agentFilter,
                onChange: setAgentFilter,
                options: agentOptions,
              },
            ]}
            onClearAll={() => {
              setAgentFilter('All');
            }}
          />
        }
      />

      {/* KYC Dossier Modal */}
      {selectedDealForDetail && (
        <KycDossierModal
          deal={selectedDealForDetail}
          isOpen={!!selectedDealForDetail}
          onClose={() => setSelectedDealForDetail(null)}
          onAdvanceStage={handleAdvanceStage}
          statusBadge={
            <span className="kyc-badge-verified">
              <ShieldCheck size={13} /> Verified & Eligible
            </span>
          }
          formatCurrency={formatCurrency}
        />
      )}
      

    </div>
  );
};

// ==============================================================================
// MAIN KYC PAGE EXPORT (WITH STRICT PERSONA & TENANT GATING)
// ==============================================================================
export const KYCPage: React.FC = () => {
  const { tenant, user } = useAuth();

  const isGhl =
    tenant?.slug === 'ghl' ||
    tenant?.id === 't-ghl-01' ||
    tenant?.id === '1' ||
    tenant?.name === 'GHL India Ventures' ||
    user?.companySlug === 'ghl' ||
    user?.companyName === 'GHL India Ventures';

  const roleCode = (user?.role?.code || '').toLowerCase();
  const isIrm = roleCode === 'irm';
  const isGhlAdmin = isGhl && (roleCode === 'company_admin' || roleCode === 'admin' || roleCode === 'super_admin');
  const isGhlIrm = isGhl && isIrm;

  // GHL IRM and GHL Admin use the GHL IRM KYC pipeline view (Admin has read-only oversight)
  if (isGhlIrm || isGhlAdmin) {
    return <GhlIrmKycView />;
  }

  return <OriginalKYCView />;
};
