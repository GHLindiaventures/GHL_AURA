import { Deal, Lead, Customer } from '../../../types';
import { normalizeLegacyKycStatus, getCustomerKycStatus, CustomerKycStatus } from '../../../services/kycService';
import { NomineeItem, validateKycStep, sanitizeDobString } from '../../../utils/kycValidators';
import { EXTERNAL_VERIFICATION_LINKS } from '../../../constants/externalLinks';
import type { KYCFormData, KycDoc } from '../KYCPage';

/**
 * Check if a toast message indicates an error or failure
 */
export const isToastError = (msg: string | null | undefined): boolean => {
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return (
    lower.includes('failed') ||
    lower.includes('error') ||
    lower.includes('denied') ||
    lower.includes('missing') ||
    lower.includes('invalid') ||
    lower.includes('cannot') ||
    lower.includes('could not') ||
    lower.includes('rejected') ||
    lower.includes('wrong') ||
    lower.includes('⚠️') ||
    lower.includes('❌') ||
    lower.includes('unauthorized') ||
    lower.includes('forbidden') ||
    lower.includes('please select') ||
    lower.includes('please enter') ||
    lower.includes('please provide') ||
    lower.includes('please re-attach') ||
    lower.includes('not saved') ||
    lower.includes('warning') ||
    lower.startsWith('no matching')
  );
};

/**
 * Format currency numbers in Indian Rupee format (Lakhs / Crores)
 */
export const formatKycCurrency = (val: number): string => {
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)} L`;
  return `₹${val.toLocaleString('en-IN')}`;
};

/**
 * Calculate the number of days a deal has spent in its current stage
 */
export const getDealDaysInStage = (deal: Deal): number => {
  const timestamp = deal.stageEnteredAt || deal.createdAt;
  if (!timestamp) return 0;
  const time = new Date(timestamp).getTime();
  if (Number.isNaN(time)) return 0;
  const diffMs = new Date().getTime() - time;
  const days = Math.trunc(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
};

/**
 * Find matching Lead and Customer records by customerId or 10-digit normalized phone number
 */
export const findMatchingLeadAndCustomer = (
  deal: Deal,
  leadsList: Lead[] = [],
  customersList: Customer[] = []
): { matchingLead?: Lead; matchingCustomer?: Customer } => {
  const fDigits = (deal.phone || '').replace(/\D/g, '').slice(-10);

  const matchingLead = leadsList.find(l => {
    if (deal.customerId && (l.id === deal.customerId || String(l.id) === String(deal.customerId))) return true;
    const lDigits = (l.phone || '').replace(/\D/g, '').slice(-10);
    return Boolean(lDigits && fDigits && lDigits === fDigits);
  });

  const matchingCustomer = customersList.find(c => {
    if (deal.customerId && (c.id === deal.customerId || String(c.id) === String(deal.customerId))) return true;
    const cDigits = (c.phone || '').replace(/\D/g, '').slice(-10);
    return Boolean(cDigits && fDigits && cDigits === fDigits);
  });

  return { matchingLead, matchingCustomer };
};

/**
 * Build index lookup map for live KYC database records
 */
export const buildKycRecordMap = (data: any[] = []): Record<string, any> => {
  const map: Record<string, any> = {};
  data.forEach((k: any) => {
    if (!k) return;
    if (k.id) map[`id_${k.id}`] = k;
    if (k.investorId) map[`inv_${k.investorId}`] = k;
    if (k.email) {
      const normEmail = String(k.email).toLowerCase().trim();
      map[`email_${normEmail}`] = k;
      map[normEmail] = k;
    }
    if (k.phone) {
      const p10 = String(k.phone).replace(/\D/g, '').slice(-10);
      if (p10) map[`phone_${p10}`] = k;
    }
    if (k.companyId && k.investorId) {
      map[`comp_${k.companyId}_inv_${k.investorId}`] = k;
    }
  });
  return map;
};

/**
 * Check if a deal is awaiting verification
 */
export const isDealAwaitingVerification = (
  d: Deal,
  resolveCustomerKycStatus: (d: Deal) => string
): boolean => {
  const norm = normalizeLegacyKycStatus(d.kycStatus, d.verifiedBy);
  if (norm === 'Verified') return false;
  const cStatus = resolveCustomerKycStatus(d);
  return (
    cStatus === 'Submitted' ||
    cStatus === 'Under Verification' ||
    cStatus === 'Completed' ||
    cStatus === 'Assisted KYC – Submitted for Verification' ||
    (d as any).customerKycStatus === 'Assisted KYC – Submitted for Verification'
  );
};

/**
 * Check if a deal is pending submission
 */
export const isDealPendingSubmission = (
  d: Deal,
  resolveCustomerKycStatus: (d: Deal) => string
): boolean => {
  const norm = normalizeLegacyKycStatus(d.kycStatus, d.verifiedBy);
  if (norm === 'Verified') return false;
  return !isDealAwaitingVerification(d, resolveCustomerKycStatus);
};

/**
 * Parse nominees JSON safely into a normalized array
 */
export const parseNomineesList = (nomineesJson: string | null | undefined): NomineeItem[] => {
  if (!nomineesJson) return [];
  try {
    const parsed = typeof nomineesJson === 'string' ? JSON.parse(nomineesJson) : nomineesJson;
    if (Array.isArray(parsed)) {
      return parsed.map((n: any, i: number) => ({
        id: String(n.id || `nom-${i + 1}`),
        name: String(n.name || n.nomineeName || ''),
        relationship: String(n.relationship || n.nomineeRelationship || 'Spouse'),
        dob: String(n.dob || n.nomineeDob || ''),
        allocationPercentage: Number(n.allocationPercentage ?? n.nomineeAllocation) || 100,
        address: String(n.address || n.nomineeAddress || ''),
        guardianName: String(n.guardianName || ''),
      }));
    }
  } catch (err) {
    console.warn('Could not parse nomineesJson:', err);
  }
  return [];
};

/**
 * Copy PAN number to clipboard and open Income Tax portal
 */
export const copyPanAndOpenPortal = (
  panNumber: string | null | undefined,
  showToast: (msg: string) => void
): void => {
  const rawPan = panNumber ? String(panNumber).trim() : '';
  if (rawPan && rawPan !== '—' && rawPan.toLowerCase() !== 'not specified' && rawPan.toLowerCase() !== 'not provided') {
    try {
      void navigator.clipboard.writeText(rawPan).catch(() => {});
      showToast('PAN copied. Paste it on the Income Tax portal.');
    } catch {}
  }
  window.open(EXTERNAL_VERIFICATION_LINKS.PAN, '_blank', 'noopener,noreferrer');
};

/**
 * Build assisted KYC payload for draft save or final submission
 */
export const buildAssistedKycPayload = (
  deal: Deal,
  data: KYCFormData,
  docUrls: {
    pan?: string | null;
    aadhaar?: string | null;
    bank?: string | null;
    demat?: string | null;
    photo?: string | null;
  },
  options: {
    isFinalSubmit: boolean;
    customerConsentObtained?: boolean;
    customerConsentTimestamp?: string | null;
    customerConsentDetails?: string | null;
  }
) => {
  return {
    investorId: deal.customerId ? Number(deal.customerId) || 0 : 0,
    kycId: deal.kycId || (deal as any).kycRecordId || undefined,
    dealId: Number(deal.id) || undefined,
    investorName: data.investorName || deal.customerName,
    phone: data.phone || deal.phone,
    email: data.email || deal.email,
    gender: data.gender,
    investorType: data.investorType,
    residentType: data.residentType,
    occupation: data.occupation,
    panNumber: data.panNumber,
    nameAsPerPan: data.nameAsPerPan,
    aadhaarNumber: data.aadhaarNumber,
    fatherName: data.fatherName,
    dob: data.dob,
    country: data.country,
    addressLine1: data.address,
    addressLine2: data.courierAddress,
    city: data.city,
    state: data.state,
    pincode: data.pincode,
    bankName: data.bankName,
    accountNumber: data.accountNumber,
    ifscCode: data.ifscCode,
    accountType: data.accountType,
    dematAccountNumber: data.hasNoDemat ? null : data.dematAccountNumber,
    nomineesJson: data.hasNominee && data.nominees && data.nominees.length > 0 ? JSON.stringify(data.nominees) : '[]',
    panDocumentUrl: docUrls.pan,
    aadhaarDocumentUrl: docUrls.aadhaar,
    bankChequeUrl: docUrls.bank,
    dematDocumentUrl: docUrls.demat,
    photoUrl: docUrls.photo || data.photoUrl || undefined,
    customerConsentObtained: options.customerConsentObtained ?? false,
    customerConsentTimestamp: options.customerConsentTimestamp ?? null,
    customerConsentDetails: options.customerConsentDetails ?? null,
    isFinalSubmit: options.isFinalSubmit,
  };
};

/**
 * Format raw byte size into human readable string (B, KB, MB)
 */
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Deterministically format or hash deal ID to 6-digit GHL identifier
 */
export const getGhlId = (deal: Deal): string => {
  const digits = (deal.id || '').replace(/\D/g, '');
  if (digits.length >= 6) return `GHL${digits.slice(-6)}`;
  let hash = 0;
  for (let i = 0; i < (deal.id || '').length; i++) {
    hash = (hash << 5) - hash + deal.id.charCodeAt(i);
    hash = Math.trunc(hash);
  }
  const clean = Math.abs(hash).toString().padEnd(6, '7').slice(0, 6);
  return `GHL${clean}`;
};

/**
 * Format deal created timestamp into Month Year string
 */
export const getJoinedDate = (deal: Deal): string => {
  const d = deal.createdAt ? new Date(deal.createdAt) : new Date();
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

/**
 * Calculate KYC profile completion percentage (minimum 25%)
 */
export const calculateProfileCompletion = (
  data: Partial<KYCFormData> | null,
  deal: Deal
): number => {
  if (!data) return 25;
  const fields = [
    data.investorName || deal.customerName,
    data.phone || deal.phone,
    data.email || deal.email,
    data.panNumber,
    data.dob,
    data.city || deal.location,
    data.occupation,
    data.aadhaarNumber,
    data.address,
    data.courierAddress,
    data.bankName,
    data.accountNumber,
    data.ifscCode,
    data.nominees?.[0]?.name,
    data.nominees?.[0]?.relationship,
    data.hasNoDemat || data.dematAccountNumber || data.dematDpId,
  ];
  const filled = fields.filter(f => Boolean(f && String(f).trim() && f !== 'Not provided')).length;
  const pct = Math.round((filled / fields.length) * 100);
  return Math.max(25, Math.min(100, pct));
};

export interface StepValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  summary: string | null;
}

/**
 * Validate 5-step KYC form data including required document attachments for Assisted KYC
 */
export const validateKycStepWithDocs = (
  step: number,
  formData: KYCFormData,
  isDocAttached: (doc: KycDoc | null | undefined) => boolean = doc => Boolean(doc?.url)
): StepValidationResult => {
  const errs = validateKycStep(step as 1 | 2 | 3 | 4 | 5, formData);

  // In Assisted KYC flow, validate document uploads:
  if (step === 2) {
    if (!formData.aadhaarDoc) {
      errs.aadhaarDoc = 'Upload Aadhaar is required';
    } else if (!isDocAttached(formData.aadhaarDoc)) {
      errs.aadhaarDoc = 'Please re-attach the Aadhaar document.';
    }
    if (!formData.panDoc) {
      errs.panDoc = 'Upload PAN is required';
    } else if (!isDocAttached(formData.panDoc)) {
      errs.panDoc = 'Please re-attach the PAN document.';
    }
    if (!formData.photoDoc) {
      errs.photoDoc = 'Upload Investor Face Photo is required for biometric verification';
    } else if (!isDocAttached(formData.photoDoc)) {
      errs.photoDoc = 'Please re-attach the Investor Face Photo.';
    }
  }
  if (step === 3) {
    if (!formData.bankProofDoc) {
      errs.bankProofDoc = 'Upload Bank Statement / Cheque / Passbook is required';
    } else if (!isDocAttached(formData.bankProofDoc)) {
      errs.bankProofDoc = 'Please re-attach the Bank Statement / Cheque.';
    }
  }
  if (step === 4) {
    if (!formData.hasNoDemat) {
      if (!formData.dematDoc) {
        errs.dematDoc = 'Upload Demat Statement is required';
      } else if (!isDocAttached(formData.dematDoc)) {
        errs.dematDoc = 'Please re-attach the Demat Statement.';
      }
    }
  }

  const count = Object.keys(errs).length;
  const summary = count > 0 ? `Please correct the ${count} required field(s) marked in red below before continuing.` : null;
  return {
    isValid: count === 0,
    errors: errs,
    summary,
  };
};

/**
 * Locate matching backend KYC record from server/database map by ID, investorId, dealId, phone, email, or name
 */
export const findBackendKyc = (
  deal: Deal | null | undefined,
  dbKycsMap: Record<string, any> = {},
  companyId?: string | number
): any => {
  if (!deal) return null;
  const allKycs: any[] = Array.from(new Set(Object.values(dbKycsMap || {})));
  const compIdStr = companyId ? String(companyId) : deal.companyId ? String(deal.companyId) : '';

  // 1. Stable direct KYC record ID
  const directKycId = (deal as any).kycId || (deal as any).kycRecordId;
  if (directKycId) {
    const byId = dbKycsMap[`id_${directKycId}`] || allKycs.find(k => k && k.id === Number(directKycId));
    if (byId) return byId;
  }

  // 2. Stable Investor ID (deal.customerId / deal.investorId) and company scope
  const investorIdNum = deal.customerId ? Number(deal.customerId) : (deal as any).investorId ? Number((deal as any).investorId) : 0;
  if (investorIdNum > 0) {
    if (compIdStr) {
      const scopedMatch = allKycs.find(
        k => k && k.investorId === investorIdNum && (!k.companyId || String(k.companyId) === compIdStr)
      );
      if (scopedMatch) return scopedMatch;
    }
    const invMatch = dbKycsMap[`inv_${investorIdNum}`] || allKycs.find(k => k && k.investorId === investorIdNum);
    if (invMatch) return invMatch;
  }

  // 3. Stable Deal ID match if tracked on KYC record
  if (deal.id) {
    const dealMatch = allKycs.find(k => k && (k as any).dealId && String((k as any).dealId) === String(deal.id));
    if (dealMatch) return dealMatch;
  }

  // 4. Fallback to phone match (sanitized 10 digits)
  const phoneDigits = (deal.phone || '').replace(/\D/g, '').slice(-10);
  if (phoneDigits) {
    const phoneMatch = allKycs.find(
      k => k && (k.phone || '').replace(/\D/g, '').slice(-10) === phoneDigits &&
        (!compIdStr || !k.companyId || String(k.companyId) === compIdStr)
    );
    if (phoneMatch) return phoneMatch;
  }

  // 5. Fallback to email match
  const email = (deal.email || '').toLowerCase().trim();
  if (email) {
    const emailMatch = allKycs.find(
      k => k && (k.email || '').toLowerCase().trim() === email &&
        (!compIdStr || !k.companyId || String(k.companyId) === compIdStr)
    );
    if (emailMatch) return emailMatch;
  }

  // 6. Fallback to customer name match
  const custName = (deal.customerName || '').toLowerCase().trim();
  if (custName && custName.length > 2) {
    const nameMatch = allKycs.find(
      k => k && (k.investorName || '').toLowerCase().trim() === custName &&
        (!compIdStr || !k.companyId || String(k.companyId) === compIdStr)
    );
    if (nameMatch) return nameMatch;
  }

  return null;
};

export interface ResolveKycStatusOptions {
  dbKycs?: Record<string, any>;
  tenantId?: string | number;
  sentDealIds?: Record<string, boolean>;
  storageGetter?: (key: string) => string | null;
}

/**
 * Resolve unified KYC status for a deal combining local storage, database sync records, and deal state
 */
export const resolveCustomerKycStatus = (
  deal: Deal,
  options: ResolveKycStatusOptions = {}
): CustomerKycStatus => {
  const { dbKycs = {}, tenantId, sentDealIds = {}, storageGetter = key => {
    try { return localStorage.getItem(key); } catch { return null; }
  }} = options;

  // 1. IRM has explicitly set kycStatus on the deal
  if (deal.kycStatus === 'Verified') return 'Verified';
  if (deal.kycStatus === 'Wrong') return 'Needs Correction';

  // 1.5 Check if Assisted KYC was submitted for this deal locally
  const assistedKey = `nexus_kyc_assisted_${deal.id}`;
  const assistedRaw = storageGetter(assistedKey);
  if (assistedRaw) {
    try {
      const parsed = JSON.parse(assistedRaw);
      if (parsed.status === 'Assisted KYC – Submitted for Verification') {
        return 'Assisted KYC – Submitted for Verification';
      }
    } catch {}
  }
  if ((deal as any).customerKycStatus === 'Assisted KYC – Submitted for Verification') {
    return 'Assisted KYC – Submitted for Verification';
  }

  // 2. Check DB KYC record by stable IDs and scope first
  const rec = findBackendKyc(deal, dbKycs, tenantId);

  if (rec) {
    const recStatus = (rec.status || '').toLowerCase();
    if (recStatus === 'approved') return 'Verified';
    if (recStatus === 'reuploadrequested') return 'Needs Correction';
    if (recStatus === 'rejected') return 'Rejected';

    // Confirmed backend submission awaiting verification
    if (rec.submittedAt || recStatus === 'pendingreview') {
      if (rec.isAssisted) {
        return 'Assisted KYC – Submitted for Verification';
      }
      return 'Submitted';
    }

    if (recStatus === 'draft') {
      if (rec.isAssisted) return 'Assisted Draft';
      if (rec.kycLinkSent) return 'Link Sent';
      return 'Pending';
    }
    if (recStatus === 'linksent') return 'Link Sent';
  }

  // 2.5 Check if there is an active Assisted KYC Draft
  const draftKey = `nexus_kyc_draft_${deal.id}`;
  const draftRaw = storageGetter(draftKey);
  if (draftRaw) {
    try {
      const parsed = JSON.parse(draftRaw);
      if (parsed && (parsed.isAssisted || parsed.step)) {
        return 'Assisted Draft';
      }
    } catch {}
  }
  if ((deal as any).customerKycStatus === 'Assisted Draft') {
    return 'Assisted Draft';
  }
  if (rec && (rec.status || '').toLowerCase() === 'draft' && !rec.kycLinkSent && rec.isAssisted) {
    return 'Assisted Draft';
  }

  // 3. IRM clicked "Send Link" in this session but DB hasn't refreshed yet
  if (rec?.kycLinkSent || sentDealIds[deal.id]) return 'Link Sent';

  // 4. Legacy deal property / mock KYC status
  const existing = (deal as any).customerKycStatus;
  if (existing) return existing as CustomerKycStatus;

  return getCustomerKycStatus(deal.id, undefined);
};

/**
 * Resolve investor location falling back to matching lead and customer records
 */
export const getResolvedLocation = (
  deal: Deal,
  leads: Lead[] = [],
  customers: Customer[] = []
): string => {
  if (deal.location && deal.location !== '—') return deal.location;
  const { matchingLead, matchingCustomer } = findMatchingLeadAndCustomer(deal, leads, customers);
  return matchingLead?.location || matchingCustomer?.location || '—';
};

/**
 * Resolve investment capacity explicitly provided in lead/customer custom fields
 */
export const getCustomerFilledCapacity = (
  deal: Deal,
  leads: Lead[] = [],
  customers: Customer[] = []
): string => {
  const { matchingLead, matchingCustomer } = findMatchingLeadAndCustomer(deal, leads, customers);

  // Only use explicitly provided values — never fall back to deal.value
  return (
    matchingLead?.customFields?.investmentCapacity ||
    matchingLead?.customFields?.capacityRange ||
    matchingLead?.customFields?.investmentRange ||
    (matchingLead as any)?.investmentRange ||
    matchingCustomer?.customFields?.investmentCapacity ||
    (deal.investmentRange && deal.investmentRange.trim() ? deal.investmentRange : null) ||
    '—'
  );
};

/**
 * Resolve investment horizon preference across leads, customers, and local preferences
 */
export const getIrmInvestmentHorizon = (
  deal: Deal,
  leads: Lead[] = [],
  customers: Customer[] = [],
  storageGetter: (key: string) => string | null = key => {
    try { return localStorage.getItem(key); } catch { return null; }
  }
): string => {
  const fDigits = (deal.phone || '').replace(/\D/g, '').slice(-10);
  const matchingLead = leads.find(l => {
    if (deal.customerId && (l.id === deal.customerId || String(l.id) === String(deal.customerId))) return true;
    const lDigits = (l.phone || '').replace(/\D/g, '').slice(-10);
    return Boolean(lDigits && fDigits && lDigits === fDigits);
  });
  const matchingCustomer = customers.find(c => {
    if (deal.customerId && (c.id === deal.customerId || String(c.id) === String(deal.customerId))) return true;
    const cDigits = (c.phone || '').replace(/\D/g, '').slice(-10);
    return Boolean(cDigits && fDigits && cDigits === fDigits);
  });
  let savedLocal: any = null;
  try {
    const raw =
      (deal.customerId ? storageGetter(`nexus_irm_pref_${deal.customerId}`) : null) ||
      (fDigits ? storageGetter(`nexus_irm_pref_${fDigits}`) : null) ||
      storageGetter(`nexus_irm_pref_${deal.id}`);
    if (raw) savedLocal = JSON.parse(raw);
  } catch { }
  return (
    matchingLead?.customFields?.horizon ||
    matchingLead?.customFields?.investmentHorizon ||
    matchingCustomer?.customFields?.horizon ||
    matchingCustomer?.customFields?.investmentHorizon ||
    savedLocal?.horizon ||
    '—'
  );
};

/**
 * Build sorted unique agent options for OriginalKYCView
 */
export const buildOriginalKycAgentOptions = (
  deals: Deal[]
): { value: string; label: string }[] => {
  return Array.from(new Set(deals.map(d => d.assignedAgentName).filter(Boolean) as string[]))
    .sort((a, b) => a.localeCompare(b))
    .map(name => ({ value: name, label: name }));
};

export interface OriginalKycFilterOptions {
  agentFilter?: string;
  statusFilter?: string;
  investmentRangeFilter?: string;
  searchQuery?: string;
}

/**
 * Filter deals for OriginalKYCView by agent, status, investment range, and search keyword
 */
export const filterOriginalKycDeals = (
  deals: Deal[],
  options: OriginalKycFilterOptions
): Deal[] => {
  const {
    agentFilter = 'All',
    statusFilter = 'All',
    investmentRangeFilter = 'All',
    searchQuery = '',
  } = options;
  const q = searchQuery.toLowerCase().trim();

  return deals.filter(deal => {
    if (agentFilter !== 'All' && deal.assignedAgentName !== agentFilter) return false;
    if (statusFilter !== 'All') {
      const s = normalizeLegacyKycStatus(deal.kycStatus, deal.verifiedBy);
      if (statusFilter === 'Pending' && s !== 'Pending') return false;
      if (statusFilter === 'Verified' && s !== 'Verified') return false;
      if (statusFilter === 'Wrong' && s !== 'Wrong') return false;
    }
    if (investmentRangeFilter !== 'All' && deal.investmentRange !== investmentRangeFilter) return false;
    if (q) {
      const name = (deal.customerName || '').toLowerCase();
      const phone = (deal.phone || '').toLowerCase();
      const email = (deal.email || '').toLowerCase();
      const city = (deal.location || '').toLowerCase();
      if (!name.includes(q) && !phone.includes(q) && !email.includes(q) && !city.includes(q)) {
        return false;
      }
    }
    return true;
  });
};

/**
 * Count KPI summary metrics across deals
 */
export const countKpiMetrics = (
  deals: Deal[],
  resolveStatusFn: (d: Deal) => CustomerKycStatus
) => {
  const total = deals.length;
  let awaiting = 0;
  let pending = 0;
  let verified = 0;

  for (const d of deals) {
    if (isDealAwaitingVerification(d, resolveStatusFn)) {
      awaiting++;
    }
    if (isDealPendingSubmission(d, resolveStatusFn)) {
      pending++;
    }
    if (normalizeLegacyKycStatus(d.kycStatus, d.verifiedBy) === 'Verified') {
      verified++;
    }
  }

  return { total, awaiting, pending, verified };
};

/**
 * Filter deals in GHL IRM KYC view according to the active KPI card selection
 */
export const filterDealsByKpi = (
  deals: Deal[],
  activeKpiFilter: 'all' | 'awaiting' | 'pending' | 'verified',
  resolveStatusFn: (d: Deal) => CustomerKycStatus
): Deal[] => {
  if (activeKpiFilter === 'all') return deals;
  if (activeKpiFilter === 'awaiting') {
    return deals.filter(d => isDealAwaitingVerification(d, resolveStatusFn));
  }
  if (activeKpiFilter === 'pending') {
    return deals.filter(d => isDealPendingSubmission(d, resolveStatusFn));
  }
  return deals.filter(d => normalizeLegacyKycStatus(d.kycStatus, d.verifiedBy) === 'Verified');
};

/**
 * Enrich deal contact fields (phone, email, location) from matching leads or customers
 */
export const enrichDealWithContact = (
  d: Deal,
  leadsList: Lead[] = [],
  customersList: Customer[] = []
): Deal => {
  // If the API already populated all three contact fields, nothing to do
  if (d.phone && d.email && d.location) return d;

  // Prefer ID-based match; fall back to normalised-phone match; then name match
  const custIdStr = d.customerId ? String(d.customerId) : null;
  const dealPhoneDigits = (d.phone || '').replace(/\D/g, '').slice(-10);
  const dealNameLower = (d.customerName || '').trim().toLowerCase();

  const matchCust = customersList.find(c => {
    if (custIdStr && String(c.id) === custIdStr) return true;
    const cDigits = (c.phone || '').replace(/\D/g, '').slice(-10);
    if (cDigits && dealPhoneDigits && cDigits === dealPhoneDigits) return true;
    if (dealNameLower && c.name && c.name.trim().toLowerCase() === dealNameLower) return true;
    return false;
  });

  const matchLead = !matchCust ? leadsList.find(l => {
    if (custIdStr && String(l.id) === custIdStr) return true;
    const lDigits = (l.phone || '').replace(/\D/g, '').slice(-10);
    if (lDigits && dealPhoneDigits && lDigits === dealPhoneDigits) return true;
    if (dealNameLower && l.name && l.name.trim().toLowerCase() === dealNameLower) return true;
    return false;
  }) : null;

  return {
    ...d,
    phone: d.phone || matchCust?.phone || matchLead?.phone || '',
    email: d.email || matchCust?.email || matchLead?.email || '',
    location: d.location || matchCust?.location || matchLead?.location || '',
  };
};

/**
 * Resolve customer investment amount formatted as currency across deal, lead, and customer
 */
export const resolveCustomerInvestmentAmount = (
  deal: Deal,
  leadsList: Lead[] = [],
  customersList: Customer[] = []
): string => {
  const { matchingLead, matchingCustomer } = findMatchingLeadAndCustomer(deal, leadsList, customersList);
  const val =
    deal.value ||
    (deal as any).customFields?.investmentAmount ||
    matchingLead?.customFields?.investmentAmount ||
    matchingCustomer?.customFields?.investmentAmount;
  const num = Number(val);
  return num && num > 0 ? formatKycCurrency(num) : '—';
};

/**
 * Merge deal details, backend KYC records, lead/customer profiles, and local drafts for Customer Profile view
 */
export const buildMergedProfileData = (
  deal: Deal,
  dbKyc: any,
  matchingLead?: any,
  matchingCustomer?: any,
  storageGetter: (key: string) => string | null = key => {
    try { return localStorage.getItem(key); } catch { return null; }
  }
): Partial<KYCFormData> & Record<string, any> => {
  const savedKycKey = `nexus_kyc_data_${deal.id}`;
  let saved: Partial<KYCFormData> | null = null;
  try {
    const raw = storageGetter(savedKycKey);
    if (raw) saved = JSON.parse(raw);
  } catch { }

  const dbNominees: NomineeItem[] = parseNomineesList(dbKyc?.nomineesJson);

  const docFrom = (url?: string | null, label = 'Uploaded document') =>
    url && String(url).trim() ? { name: label, size: '', type: '', url: String(url) } : null;

  const savedNonEmpty: Record<string, any> = {};
  if (saved && typeof saved === 'object') {
    for (const [key, val] of Object.entries(saved)) {
      if (val !== '' && val !== null && val !== undefined) {
        if (Array.isArray(val)) {
          if (val.length > 0) savedNonEmpty[key] = val;
        } else {
          savedNonEmpty[key] = val;
        }
      }
    }
  }

  return {
    ...savedNonEmpty,
    investorName: dbKyc?.investorName || savedNonEmpty.investorName || deal.customerName || matchingLead?.name || matchingCustomer?.name || '',
    phone: dbKyc?.phone || savedNonEmpty.phone || deal.phone || matchingLead?.phone || matchingCustomer?.phone || '',
    email: dbKyc?.email || savedNonEmpty.email || deal.email || matchingLead?.email || matchingCustomer?.email || '',
    gender: dbKyc?.gender || savedNonEmpty.gender || 'Male',
    investorType: dbKyc?.investorType || savedNonEmpty.investorType || deal.investorType || 'Individual',
    residentType: dbKyc?.residentType || savedNonEmpty.residentType || 'Resident Indian',
    occupation: dbKyc?.occupation || savedNonEmpty.occupation || '',
    city: dbKyc?.city || savedNonEmpty.city || deal.location || matchingLead?.location || matchingCustomer?.location || '',
    state: dbKyc?.state || savedNonEmpty.state || '',
    pincode: dbKyc?.pincode || savedNonEmpty.pincode || '',
    address: dbKyc?.addressLine1 || dbKyc?.address || savedNonEmpty.address || '',
    courierAddress: dbKyc?.addressLine2 || dbKyc?.courierAddress || savedNonEmpty.courierAddress || '',
    country: dbKyc?.country || savedNonEmpty.country || 'India',
    panNumber: dbKyc?.panNumber || savedNonEmpty.panNumber || (deal as any).pan || matchingLead?.customFields?.pan || matchingCustomer?.customFields?.pan || '',
    nameAsPerPan: dbKyc?.nameAsPerPan || dbKyc?.investorName || savedNonEmpty.nameAsPerPan || deal.customerName || '',
    aadhaarNumber: dbKyc?.aadhaarNumber || savedNonEmpty.aadhaarNumber || '',
    fatherName: dbKyc?.fatherName || savedNonEmpty.fatherName || '',
    dob: sanitizeDobString(dbKyc?.dateOfBirth || dbKyc?.dob || savedNonEmpty.dob || ''),
    bankName: dbKyc?.bankName || savedNonEmpty.bankName || '',
    accountNumber: dbKyc?.accountNumber || savedNonEmpty.accountNumber || '',
    ifscCode: dbKyc?.ifscCode || savedNonEmpty.ifscCode || '',
    swiftCode: dbKyc?.swiftCode || savedNonEmpty.swiftCode || '',
    accountHolderName: dbKyc?.accountHolderName || dbKyc?.investorName || savedNonEmpty.accountHolderName || deal.customerName || '',
    accountType: dbKyc?.accountType || savedNonEmpty.accountType || '',
    branchName: dbKyc?.branchName || savedNonEmpty.branchName || '',
    hasNoDemat: dbKyc?.hasNoDemat !== undefined ? Boolean(dbKyc.hasNoDemat) : Boolean(savedNonEmpty.hasNoDemat),
    dematAccountNumber: dbKyc?.dematAccountNumber || savedNonEmpty.dematAccountNumber || '',
    dematDepository: dbKyc?.dematDepository || savedNonEmpty.dematDepository || '',
    dematDpId: dbKyc?.dpId || dbKyc?.dematDpId || savedNonEmpty.dematDpId || '',
    dematClientId: dbKyc?.dematClientId || savedNonEmpty.dematClientId || '',
    nominees: dbNominees.length ? dbNominees : (savedNonEmpty.nominees as NomineeItem[] | undefined) || [],
    aadhaarDoc: docFrom(dbKyc?.aadhaarDocumentUrl, 'Aadhaar (uploaded)') || savedNonEmpty.aadhaarDoc || null,
    panDoc: docFrom(dbKyc?.panDocumentUrl, 'PAN (uploaded)') || savedNonEmpty.panDoc || null,
    bankProofDoc: docFrom(dbKyc?.bankChequeUrl, 'Bank proof (uploaded)') || savedNonEmpty.bankProofDoc || null,
    dematDoc: docFrom(dbKyc?.dematDocumentUrl, 'Demat proof (uploaded)') || savedNonEmpty.dematDoc || null,
    photoDoc: docFrom(dbKyc?.photoUrl || savedNonEmpty.photoUrl, 'Investor Photo (uploaded)') || savedNonEmpty.photoDoc || null,
    photoUrl: dbKyc?.photoUrl || savedNonEmpty.photoUrl || (savedNonEmpty.photoDoc as any)?.url || null,
    status: dbKyc?.status || savedNonEmpty.status || deal.kycStatus || 'Pending',
    submittedAt: dbKyc?.submittedAt || savedNonEmpty.submittedAt || null,
    customerConsentTimestamp: dbKyc?.customerConsentTimestamp || savedNonEmpty.customerConsentTimestamp || null,
  };
};

/**
 * Resolves the appropriate entity type and id for uploading KYC documents to /documents
 */
export const resolveDocUploadEntity = (
  deal: Deal,
  customers: Customer[] = [],
  leads: Lead[] = []
): { entityType: string; entityId: string } => {
  // 1. Direct positive numeric customer ID on deal
  const parsedCust = Number(deal.customerId);
  if (Number.isInteger(parsedCust) && parsedCust > 0) {
    return { entityType: 'investor', entityId: String(parsedCust) };
  }

  // 2. Prefixed numeric customer ID (e.g. 'customer-14', 'cust-14', 'db-14')
  if (typeof deal.customerId === 'string') {
    const stripped = deal.customerId.replace(/^(customer-|cust-|db-)/i, '');
    const numStripped = Number(stripped);
    if (Number.isInteger(numStripped) && numStripped > 0) {
      return { entityType: 'investor', entityId: String(numStripped) };
    }
  }

  // 3. Match against loaded customers by phone/email/id
  const phoneDigits = (deal.phone || '').replace(/\D/g, '').slice(-10);
  const matchCust = customers.find(c =>
    (deal.customerId && (c.id === deal.customerId || String(c.id) === String(deal.customerId))) ||
    (phoneDigits && c.phone && c.phone.replace(/\D/g, '').slice(-10) === phoneDigits) ||
    (deal.email && c.email && c.email.trim().toLowerCase() === deal.email.trim().toLowerCase())
  );
  if (matchCust) {
    const custNum = Number(matchCust.id);
    if (Number.isInteger(custNum) && custNum > 0) {
      return { entityType: 'investor', entityId: String(custNum) };
    }
  }

  // 4. Match against loaded leads by phone/email/id
  const matchLead = leads.find(l =>
    (deal.customerId && (l.id === deal.customerId || String(l.id) === String(deal.customerId))) ||
    (phoneDigits && l.phone && l.phone.replace(/\D/g, '').slice(-10) === phoneDigits) ||
    (deal.email && l.email && l.email.trim().toLowerCase() === deal.email.trim().toLowerCase())
  );
  if (matchLead) {
    const leadNum = Number(matchLead.id);
    if (Number.isInteger(leadNum) && leadNum > 0) {
      return { entityType: 'lead', entityId: String(leadNum) };
    }
  }

  // 5. Deal numeric ID
  const dealNum = Number(deal.id);
  if (Number.isInteger(dealNum) && dealNum > 0) {
    return { entityType: 'deal', entityId: String(dealNum) };
  }

  // 6. Explicit validation: Reject fallback '0' and invalid/missing identifiers
  const candidateId = String(deal.id || deal.customerId || '').trim();
  if (!candidateId || candidateId === '0' || candidateId === 'undefined' || candidateId === 'null') {
    throw new Error(`Cannot upload document: Missing or invalid entity identifier for deal "${deal.customerName || deal.title || deal.id || 'Unknown'}".`);
  }
  return { entityType: 'deal', entityId: candidateId };
};

export interface KycDraftMetadata {
  isAssisted: boolean;
  step: number;
  savedAt: string;
  assistedByIrmId?: string | number;
  assistedByIrmName?: string;
  status: string;
}

/**
 * Build serialized draft metadata payload for local and server draft tracking
 */
export const buildKycDraftMetadata = (
  step: number,
  user?: { id?: string | number; name?: string } | null,
  nowIso: string = new Date().toISOString()
): KycDraftMetadata => ({
  isAssisted: true,
  step,
  savedAt: nowIso,
  assistedByIrmId: user?.id,
  assistedByIrmName: user?.name,
  status: 'Assisted Draft',
});

/**
 * Construct section form data for quick editing personal or address sections in Profile view
 */
export const buildSectionEditData = (
  section: 'personal' | 'address',
  deal: Deal | null,
  current: Partial<KYCFormData> & Record<string, any>,
  resolvedLocation: string,
  preferredAssetClass: string
): Record<string, any> => {
  if (section === 'personal') {
    return {
      investorName: current.investorName || deal?.customerName || '',
      email: current.email || deal?.email || '',
      phone: current.phone || deal?.phone || '',
      panNumber: current.panNumber || '',
      city: current.city || (deal ? resolvedLocation : '') || '',
      dob: current.dob || '',
      occupation: current.occupation || '',
      gender: current.gender || '',
      investorType: current.investorType || '',
      residentType: current.residentType || '',
      preferredAssetClass: deal ? (preferredAssetClass === '—' ? '' : preferredAssetClass) : '',
      preferredAssetClassConfirmed: deal ? preferredAssetClass !== '—' : false,
    };
  }
  return {
    nameAsPerPan: current.nameAsPerPan || current.investorName || deal?.customerName || '',
    fatherName: current.fatherName || '',
    aadhaarNumber: current.aadhaarNumber || '',
    address: current.address || '',
    courierAddress: current.courierAddress || current.address || '',
    city: current.city || (deal ? resolvedLocation : '') || '',
    state: current.state || '',
    pincode: current.pincode || '',
    country: current.country || 'India',
  };
};



