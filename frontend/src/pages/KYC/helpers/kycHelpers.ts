import { Deal, Lead, Customer } from '../../../types';
import { normalizeLegacyKycStatus } from '../../../services/kycService';
import { NomineeItem } from '../../../utils/kycValidators';
import { EXTERNAL_VERIFICATION_LINKS } from '../../../constants/externalLinks';
import type { KYCFormData } from '../KYCPage';

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

