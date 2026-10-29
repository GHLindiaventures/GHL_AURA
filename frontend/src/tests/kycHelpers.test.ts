import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isToastError,
  formatKycCurrency,
  getDealDaysInStage,
  findMatchingLeadAndCustomer,
  buildKycRecordMap,
  isDealAwaitingVerification,
  isDealPendingSubmission,
  parseNomineesList,
  copyPanAndOpenPortal,
  buildAssistedKycPayload,
  formatBytes,
  getGhlId,
  getJoinedDate,
  calculateProfileCompletion,
  validateKycStepWithDocs,
  findBackendKyc,
  resolveCustomerKycStatus,
  getResolvedLocation,
  getCustomerFilledCapacity,
  getIrmInvestmentHorizon,
  buildOriginalKycAgentOptions,
  filterOriginalKycDeals,
  countKpiMetrics,
  filterDealsByKpi,
  enrichDealWithContact,
  resolveCustomerInvestmentAmount,
  buildMergedProfileData,
  resolveDocUploadEntity,
  buildKycDraftMetadata,
  buildSectionEditData,
} from '../pages/KYC/helpers/kycHelpers';
import { Deal, Lead, Customer } from '../types';
import { KYCFormData } from '../pages/KYC/KYCPage';

describe('kycHelpers Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('isToastError', () => {
    it('returns false for falsy or empty inputs', () => {
      expect(isToastError(null)).toBe(false);
      expect(isToastError(undefined)).toBe(false);
      expect(isToastError('')).toBe(false);
    });

    it('identifies success messages as non-errors', () => {
      expect(isToastError('Deal updated successfully')).toBe(false);
      expect(isToastError('KYC status verified')).toBe(false);
    });

    it('identifies error keywords', () => {
      expect(isToastError('Action failed')).toBe(true);
      expect(isToastError('Network error occurred')).toBe(true);
      expect(isToastError('Permission denied')).toBe(true);
      expect(isToastError('Missing required field')).toBe(true);
      expect(isToastError('Invalid PAN number')).toBe(true);
      expect(isToastError('Cannot proceed')).toBe(true);
      expect(isToastError('Could not parse response')).toBe(true);
      expect(isToastError('KYC rejected')).toBe(true);
      expect(isToastError('Wrong KYC details')).toBe(true);
      expect(isToastError('⚠️ Alert message')).toBe(true);
      expect(isToastError('❌ Failure')).toBe(true);
      expect(isToastError('Unauthorized session')).toBe(true);
      expect(isToastError('Forbidden access')).toBe(true);
      expect(isToastError('Please select a valid option')).toBe(true);
      expect(isToastError('Please enter PAN')).toBe(true);
      expect(isToastError('Please provide bank proof')).toBe(true);
      expect(isToastError('Please re-attach document')).toBe(true);
      expect(isToastError('Changes not saved')).toBe(true);
      expect(isToastError('System warning')).toBe(true);
      expect(isToastError('No matching record found')).toBe(true);
    });
  });

  describe('formatKycCurrency', () => {
    it('formats values >= 1 Crore (10,000,000)', () => {
      expect(formatKycCurrency(10000000)).toBe('₹1.00 Cr');
      expect(formatKycCurrency(25000000)).toBe('₹2.50 Cr');
    });

    it('formats values >= 1 Lakh (100,000)', () => {
      expect(formatKycCurrency(500000)).toBe('₹5.0 L');
      expect(formatKycCurrency(1250000)).toBe('₹12.5 L');
    });

    it('formats smaller values using en-IN locale format', () => {
      expect(formatKycCurrency(50000)).toBe('₹50,000');
      expect(formatKycCurrency(0)).toBe('₹0');
    });
  });

  describe('getDealDaysInStage', () => {
    it('returns 0 when no timestamps exist', () => {
      const deal = { id: 'd-1', customerName: 'Test' } as Deal;
      expect(getDealDaysInStage(deal)).toBe(0);
    });

    it('returns 0 for invalid date strings', () => {
      const deal = { id: 'd-1', customerName: 'Test', stageEnteredAt: 'invalid-date' } as Deal;
      expect(getDealDaysInStage(deal)).toBe(0);
    });

    it('calculates days accurately from stageEnteredAt', () => {
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      const deal = { id: 'd-1', customerName: 'Test', stageEnteredAt: fiveDaysAgo } as Deal;
      expect(getDealDaysInStage(deal)).toBe(5);
    });

    it('falls back to createdAt if stageEnteredAt is missing', () => {
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const deal = { id: 'd-1', customerName: 'Test', createdAt: twoDaysAgo } as Deal;
      expect(getDealDaysInStage(deal)).toBe(2);
    });
  });

  describe('findMatchingLeadAndCustomer', () => {
    const leads: Lead[] = [
      { id: 'cust-1', phone: '+91 9876543210', location: 'Chennai' } as any,
      { id: 'lead-2', phone: '+91 9123456780', location: 'Bangalore' } as any,
    ];
    const customers: Customer[] = [
      { id: 'cust-1', phone: '+91 9876543210', location: 'Chennai' } as any,
      { id: 'cust-2', phone: '9998887770', location: 'Mumbai' } as any,
    ];

    it('matches by customerId', () => {
      const deal = { id: 'd-1', customerId: 'cust-1', phone: '0000000000' } as Deal;
      const { matchingLead, matchingCustomer } = findMatchingLeadAndCustomer(deal, leads, customers);
      expect(matchingLead?.id).toBe('cust-1');
      expect(matchingCustomer?.id).toBe('cust-1');
    });

    it('matches by last 10 digits of phone when customerId does not match', () => {
      const deal = { id: 'd-2', phone: '9123456780' } as Deal;
      const { matchingLead, matchingCustomer } = findMatchingLeadAndCustomer(deal, leads, customers);
      expect(matchingLead?.id).toBe('lead-2');
      expect(matchingCustomer).toBeUndefined();
    });

    it('returns empty matches when neither matches or lists are empty', () => {
      const deal = { id: 'd-3', phone: '1111111111' } as Deal;
      const { matchingLead, matchingCustomer } = findMatchingLeadAndCustomer(deal);
      expect(matchingLead).toBeUndefined();
      expect(matchingCustomer).toBeUndefined();
    });
  });

  describe('buildKycRecordMap', () => {
    it('handles empty or null array safely', () => {
      expect(buildKycRecordMap([])).toEqual({});
      expect(buildKycRecordMap(undefined as any)).toEqual({});
    });

    it('indexes records by id, investorId, email, phone, and companyId_investorId', () => {
      const records = [
        {
          id: 'rec-1',
          investorId: 'inv-100',
          email: 'Investor@Example.com ',
          phone: '+91 98765 43210',
          companyId: 'comp-1',
        },
        null,
      ];

      const map = buildKycRecordMap(records);
      expect(map['id_rec-1']).toBe(records[0]);
      expect(map['inv_inv-100']).toBe(records[0]);
      expect(map['email_investor@example.com']).toBe(records[0]);
      expect(map['investor@example.com']).toBe(records[0]);
      expect(map['phone_9876543210']).toBe(records[0]);
      expect(map['comp_comp-1_inv_inv-100']).toBe(records[0]);
    });
  });

  describe('isDealAwaitingVerification & isDealPendingSubmission', () => {
    const resolveStatus = (d: Deal) => (d as any).testStatus || 'Pending Submission';

    it('returns false for Verified deals', () => {
      const deal = { id: 'd-1', kycStatus: 'Verified' } as Deal;
      expect(isDealAwaitingVerification(deal, resolveStatus)).toBe(false);
      expect(isDealPendingSubmission(deal, resolveStatus)).toBe(false);
    });

    it('identifies awaiting verification deals', () => {
      const dealSubmitted = { id: 'd-2', testStatus: 'Submitted' } as any;
      const dealAssisted = { id: 'd-3', testStatus: 'Assisted KYC – Submitted for Verification' } as any;
      const dealCompleted = { id: 'd-4', testStatus: 'Completed' } as any;

      expect(isDealAwaitingVerification(dealSubmitted, resolveStatus)).toBe(true);
      expect(isDealPendingSubmission(dealSubmitted, resolveStatus)).toBe(false);

      expect(isDealAwaitingVerification(dealAssisted, resolveStatus)).toBe(true);
      expect(isDealPendingSubmission(dealAssisted, resolveStatus)).toBe(false);

      expect(isDealAwaitingVerification(dealCompleted, resolveStatus)).toBe(true);
      expect(isDealPendingSubmission(dealCompleted, resolveStatus)).toBe(false);
    });

    it('identifies pending submission deals', () => {
      const dealDraft = { id: 'd-5', testStatus: 'Assisted Draft' } as any;
      const dealLink = { id: 'd-6', testStatus: 'Link Sent' } as any;

      expect(isDealAwaitingVerification(dealDraft, resolveStatus)).toBe(false);
      expect(isDealPendingSubmission(dealDraft, resolveStatus)).toBe(true);

      expect(isDealAwaitingVerification(dealLink, resolveStatus)).toBe(false);
      expect(isDealPendingSubmission(dealLink, resolveStatus)).toBe(true);
    });
  });

  describe('parseNomineesList', () => {
    it('returns empty array for falsy input or corrupt JSON', () => {
      expect(parseNomineesList(null)).toEqual([]);
      expect(parseNomineesList('')).toEqual([]);
      expect(parseNomineesList('invalid json')).toEqual([]);
    });

    it('parses JSON string into normalized NomineeItem array', () => {
      const jsonStr = JSON.stringify([
        { id: 'nom-1', name: 'Jane Doe', relationship: 'Spouse', allocationPercentage: 50 },
        { nomineeName: 'Junior Doe', nomineeRelationship: 'Son', nomineeAllocation: 50 },
      ]);
      const result = parseNomineesList(jsonStr);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Jane Doe');
      expect(result[0].relationship).toBe('Spouse');
      expect(result[0].allocationPercentage).toBe(50);
      expect(result[1].name).toBe('Junior Doe');
      expect(result[1].relationship).toBe('Son');
      expect(result[1].allocationPercentage).toBe(50);
    });

    it('accepts already-parsed array objects directly', () => {
      const arr = [{ name: 'Alex' }];
      const result = parseNomineesList(arr as any);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Alex');
    });
  });

  describe('copyPanAndOpenPortal', () => {
    it('copies valid PAN and opens external portal window', () => {
      const showToast = vi.fn();
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const writeTextSpy = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextSpy,
        },
      });

      copyPanAndOpenPortal('ABCDE1234F', showToast);
      expect(writeTextSpy).toHaveBeenCalledWith('ABCDE1234F');
      expect(showToast).toHaveBeenCalledWith('PAN copied. Paste it on the Income Tax portal.');
      expect(openSpy).toHaveBeenCalled();
    });

    it('skips copying when PAN is missing or placeholder but still opens portal', () => {
      const showToast = vi.fn();
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

      copyPanAndOpenPortal('—', showToast);
      expect(showToast).not.toHaveBeenCalled();
      expect(openSpy).toHaveBeenCalled();

      copyPanAndOpenPortal('Not Specified', showToast);
      expect(showToast).not.toHaveBeenCalled();
    });
  });

  describe('buildAssistedKycPayload', () => {
    const mockDeal: Deal = {
      id: '123',
      customerId: '456',
      customerName: 'Aarav Sharma',
      phone: '+91 9876543210',
      email: 'aarav@example.com',
    } as any;

    const mockData: KYCFormData = {
      investorName: 'Aarav Sharma',
      phone: '+91 9876543210',
      email: 'aarav@example.com',
      gender: 'Male',
      investorType: 'Individual / Retail HNW',
      residentType: 'Resident Indian (RI)',
      occupation: 'Salaried Professional',
      panNumber: 'ABCDE1234F',
      nameAsPerPan: 'AARAV SHARMA',
      aadhaarNumber: '234567890123',
      fatherName: 'Rajesh Sharma',
      dob: '1985-06-15',
      address: '123 Marine Drive',
      courierAddress: 'Same',
      country: 'India',
      state: 'Maharashtra',
      city: 'Mumbai',
      pincode: '400020',
      bankName: 'HDFC Bank',
      accountNumber: '50100234567890',
      ifscCode: 'HDFC0001234',
      accountType: 'Savings Account',
      hasNoDemat: true,
      dematAccountNumber: '',
      hasNominee: false,
      nominees: [],
      panDoc: null,
      aadhaarDoc: null,
      bankProofDoc: null,
      dematDoc: null,
      photoDoc: null,
    } as any;

    it('constructs draft payload with isFinalSubmit false', () => {
      const docUrls = { pan: '/docs/pan.pdf' };
      const payload = buildAssistedKycPayload(mockDeal, mockData, docUrls, { isFinalSubmit: false });

      expect(payload.investorId).toBe(456);
      expect(payload.dealId).toBe(123);
      expect(payload.panNumber).toBe('ABCDE1234F');
      expect(payload.dematAccountNumber).toBeNull();
      expect(payload.panDocumentUrl).toBe('/docs/pan.pdf');
      expect(payload.isFinalSubmit).toBe(false);
      expect(payload.customerConsentObtained).toBe(false);
      expect(payload.customerConsentTimestamp).toBeNull();
    });

    it('constructs submission payload with isFinalSubmit true and consent details', () => {
      const docUrls = { pan: '/docs/pan.pdf', aadhaar: '/docs/aadhaar.pdf' };
      const now = new Date().toISOString();
      const payload = buildAssistedKycPayload(
        mockDeal,
        mockData,
        docUrls,
        {
          isFinalSubmit: true,
          customerConsentObtained: true,
          customerConsentTimestamp: now,
          customerConsentDetails: 'Verbal consent obtained',
        }
      );

      expect(payload.isFinalSubmit).toBe(true);
      expect(payload.customerConsentObtained).toBe(true);
      expect(payload.customerConsentTimestamp).toBe(now);
      expect(payload.customerConsentDetails).toBe('Verbal consent obtained');
    });
  });

  describe('formatBytes', () => {
    it('formats 0 bytes as 0 B', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('formats values under 1 KB as bytes', () => {
      expect(formatBytes(512)).toBe('512 B');
      expect(formatBytes(1023)).toBe('1023 B');
    });

    it('formats values between 1 KB and 1 MB in KB', () => {
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(512000)).toBe('500.0 KB');
    });

    it('formats values over 1 MB in MB', () => {
      expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
      expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    });
  });

  describe('getGhlId', () => {
    it('extracts trailing 6 digits if deal ID contains >= 6 digits', () => {
      expect(getGhlId({ id: 'deal-123456789' } as Deal)).toBe('GHL456789');
      expect(getGhlId({ id: '987654' } as Deal)).toBe('GHL987654');
    });

    it('generates consistent 6-char hash ID when digits are fewer than 6', () => {
      const res1 = getGhlId({ id: 'ab1' } as Deal);
      const res2 = getGhlId({ id: 'ab1' } as Deal);
      expect(res1).toBe(res2);
      expect(res1.startsWith('GHL')).toBe(true);
      expect(res1.length).toBe(9); // 'GHL' + 6 characters
    });

    it('handles empty or non-numeric deal id cleanly', () => {
      const res = getGhlId({ id: '' } as Deal);
      expect(res.startsWith('GHL')).toBe(true);
      expect(res.length).toBe(9);
    });
  });

  describe('getJoinedDate', () => {
    it('formats deal createdAt into Month Year string', () => {
      const d = { createdAt: '2026-01-15T10:00:00Z' } as Deal;
      expect(getJoinedDate(d)).toBe('January 2026');
    });

    it('falls back to current date if createdAt is missing', () => {
      const d = {} as Deal;
      const res = getJoinedDate(d);
      expect(typeof res).toBe('string');
      expect(res.length).toBeGreaterThan(0);
    });
  });

  describe('calculateProfileCompletion', () => {
    const mockDeal = { customerName: 'Aarav', phone: '9876543210', email: 'a@ex.com', location: 'Mumbai' } as Deal;

    it('returns minimum 25% when data is null', () => {
      expect(calculateProfileCompletion(null, mockDeal)).toBe(25);
    });

    it('calculates score based on filled valid fields and caps at 100%', () => {
      const fullData: Partial<KYCFormData> = {
        investorName: 'Aarav',
        phone: '9876543210',
        email: 'a@ex.com',
        panNumber: 'ABCDE1234F',
        dob: '1990-01-01',
        city: 'Mumbai',
        occupation: 'Business',
        aadhaarNumber: '123456789012',
        address: '123 Main St',
        courierAddress: '123 Main St',
        bankName: 'HDFC',
        accountNumber: '1234567890',
        ifscCode: 'HDFC0001234',
        nominees: [{ name: 'Priya', relationship: 'Spouse', dob: '1995-05-05', allocationPercentage: 100 }],
        hasNoDemat: true,
      };
      expect(calculateProfileCompletion(fullData, mockDeal)).toBe(100);
    });

    it('ignores "Not provided" or empty fields and clamps to minimum 25%', () => {
      const sparseData: Partial<KYCFormData> = {
        occupation: 'Not provided',
        panNumber: '',
      };
      expect(calculateProfileCompletion(sparseData, mockDeal)).toBeGreaterThanOrEqual(25);
    });
  });

  describe('validateKycStepWithDocs', () => {
    const baseForm: KYCFormData = {
      investorName: 'Aarav Sharma',
      phone: '+91 9876543210',
      email: 'aarav@example.com',
      gender: 'Male',
      investorType: 'Individual / Retail HNW',
      residentType: 'Resident Indian (RI)',
      occupation: 'Business',
      panNumber: 'ABCDE1234F',
      nameAsPerPan: 'Aarav Sharma',
      aadhaarNumber: '123456789012',
      fatherName: 'Raj Sharma',
      dob: '1990-01-01',
      address: '123 Palm Ave',
      courierAddress: '123 Palm Ave',
      country: 'India',
      state: 'Maharashtra',
      city: 'Mumbai',
      pincode: '400001',
      bankName: 'HDFC Bank',
      accountNumber: '123456789012',
      ifscCode: 'HDFC0001234',
      swiftCode: '',
      accountType: 'Savings Account',
      accountHolderName: 'Aarav Sharma',
      hasNoDemat: false,
      dematAccountNumber: '1208160012345678',
      dematDepository: 'CDSL',
      dematDpId: '12081600',
      dematClientId: '12345678',
      hasNominee: false,
      nominees: [],
      aadhaarDoc: { name: 'aadhaar.pdf', size: '100 KB', type: 'application/pdf', url: '/docs/aadhaar.pdf' },
      panDoc: { name: 'pan.pdf', size: '100 KB', type: 'application/pdf', url: '/docs/pan.pdf' },
      bankProofDoc: { name: 'cheque.pdf', size: '100 KB', type: 'application/pdf', url: '/docs/cheque.pdf' },
      dematDoc: { name: 'demat.pdf', size: '100 KB', type: 'application/pdf', url: '/docs/demat.pdf' },
      photoDoc: { name: 'photo.jpg', size: '50 KB', type: 'image/jpeg', url: '/docs/photo.jpg' },
    };

    it('validates Step 1 basic info successfully', () => {
      const res = validateKycStepWithDocs(1, baseForm);
      expect(res.isValid).toBe(true);
      expect(res.errors).toEqual({});
      expect(res.summary).toBeNull();
    });

    it('requires Step 2 identity documents and handles unattached docs', () => {
      const missingDocsForm = { ...baseForm, aadhaarDoc: null, panDoc: null, photoDoc: null };
      const res = validateKycStepWithDocs(2, missingDocsForm);
      expect(res.isValid).toBe(false);
      expect(res.errors.aadhaarDoc).toContain('Upload Aadhaar is required');
      expect(res.errors.panDoc).toContain('Upload PAN is required');
      expect(res.errors.photoDoc).toContain('Upload Investor Face Photo is required');
      expect(res.summary).toContain('required field(s) marked in red');

      // Test unattached doc
      const unattachedForm = {
        ...baseForm,
        aadhaarDoc: { name: 'a.pdf', size: '10KB', type: 'pdf' }, // no url
      };
      const res2 = validateKycStepWithDocs(2, unattachedForm, () => false);
      expect(res2.errors.aadhaarDoc).toContain('Please re-attach');
    });

    it('requires Step 3 bank proof document', () => {
      const missingBank = { ...baseForm, bankProofDoc: null };
      const res = validateKycStepWithDocs(3, missingBank);
      expect(res.isValid).toBe(false);
      expect(res.errors.bankProofDoc).toContain('Upload Bank Statement / Cheque');

      const unattachedBank = {
        ...baseForm,
        bankProofDoc: { name: 'b.pdf', size: '10KB', type: 'pdf' },
      };
      const res2 = validateKycStepWithDocs(3, unattachedBank, () => false);
      expect(res2.errors.bankProofDoc).toContain('Please re-attach the Bank Statement');
    });

    it('requires Step 4 demat document only when hasNoDemat is false', () => {
      const missingDemat = { ...baseForm, hasNoDemat: false, dematDoc: null };
      const res = validateKycStepWithDocs(4, missingDemat);
      expect(res.isValid).toBe(false);
      expect(res.errors.dematDoc).toContain('Upload Demat Statement is required');

      // Passes when hasNoDemat is true
      const noDematForm = { ...baseForm, hasNoDemat: true, dematDoc: null };
      const res2 = validateKycStepWithDocs(4, noDematForm);
      expect(res2.isValid).toBe(true);
    });
  });

  describe('findBackendKyc', () => {
    const mockMap = {
      id_10: { id: 10, investorId: 100, investorName: 'Aarav Sharma', phone: '9876543210', email: 'aarav@example.com' },
      inv_200: { id: 20, investorId: 200, investorName: 'Priya Patel', phone: '9876543211', email: 'priya@example.com' },
    };

    it('returns null when deal is null or undefined', () => {
      expect(findBackendKyc(null, mockMap)).toBeNull();
      expect(findBackendKyc(undefined, mockMap)).toBeNull();
    });

    it('matches by direct kycId', () => {
      const deal = { id: 'd-1', kycId: 10 } as unknown as Deal;
      expect(findBackendKyc(deal, mockMap)).toEqual(mockMap.id_10);
    });

    it('matches by customerId / investorId with company scoping', () => {
      const deal = { id: 'd-2', customerId: '200' } as Deal;
      expect(findBackendKyc(deal, mockMap)).toEqual(mockMap.inv_200);
    });

    it('matches by dealId', () => {
      const map = {
        k1: { id: 30, dealId: 'deal-300', investorName: 'Vikram Singh' },
      };
      const deal = { id: 'deal-300' } as Deal;
      expect(findBackendKyc(deal, map)).toEqual(map.k1);
    });

    it('matches by 10-digit phone', () => {
      const deal = { id: 'd-99', phone: '+91 9876543210' } as Deal;
      expect(findBackendKyc(deal, mockMap)).toEqual(mockMap.id_10);
    });

    it('matches by email', () => {
      const deal = { id: 'd-99', email: 'aarav@example.com' } as Deal;
      expect(findBackendKyc(deal, mockMap)).toEqual(mockMap.id_10);
    });

    it('matches by customerName', () => {
      const deal = { id: 'd-99', customerName: 'Aarav Sharma' } as Deal;
      expect(findBackendKyc(deal, mockMap)).toEqual(mockMap.id_10);
    });

    it('returns null when no record matches', () => {
      const deal = { id: 'd-99', customerName: 'Unknown Person' } as Deal;
      expect(findBackendKyc(deal, mockMap)).toBeNull();
    });
  });

  describe('resolveCustomerKycStatus', () => {
    it('returns Verified when deal.kycStatus is Verified', () => {
      const deal = { id: 'd-1', kycStatus: 'Verified' } as Deal;
      expect(resolveCustomerKycStatus(deal)).toBe('Verified');
    });

    it('returns Needs Correction when deal.kycStatus is Wrong', () => {
      const deal = { id: 'd-1', kycStatus: 'Wrong' } as Deal;
      expect(resolveCustomerKycStatus(deal)).toBe('Needs Correction');
    });

    it('identifies local assisted KYC submission from storage', () => {
      const deal = { id: 'd-1' } as Deal;
      const storageGetter = (key: string) => {
        if (key === 'nexus_kyc_assisted_d-1') {
          return JSON.stringify({ status: 'Assisted KYC – Submitted for Verification' });
        }
        return null;
      };
      expect(resolveCustomerKycStatus(deal, { storageGetter })).toBe('Assisted KYC – Submitted for Verification');
    });

    it('identifies backend KYC status variations', () => {
      const deal = { id: 'd-1', customerId: '10' } as Deal;

      const dbKycsApproved = { id_1: { id: 1, investorId: 10, status: 'approved' } };
      expect(resolveCustomerKycStatus(deal, { dbKycs: dbKycsApproved })).toBe('Verified');

      const dbKycsCorrection = { id_1: { id: 1, investorId: 10, status: 'reuploadrequested' } };
      expect(resolveCustomerKycStatus(deal, { dbKycs: dbKycsCorrection })).toBe('Needs Correction');

      const dbKycsRejected = { id_1: { id: 1, investorId: 10, status: 'rejected' } };
      expect(resolveCustomerKycStatus(deal, { dbKycs: dbKycsRejected })).toBe('Rejected');

      const dbKycsSubmitted = { id_1: { id: 1, investorId: 10, status: 'pendingreview', submittedAt: '2026-01-01' } };
      expect(resolveCustomerKycStatus(deal, { dbKycs: dbKycsSubmitted })).toBe('Submitted');

      const dbKycsAssistedSubmitted = { id_1: { id: 1, investorId: 10, status: 'pendingreview', isAssisted: true } };
      expect(resolveCustomerKycStatus(deal, { dbKycs: dbKycsAssistedSubmitted })).toBe('Assisted KYC – Submitted for Verification');

      const dbKycsLinkSent = { id_1: { id: 1, investorId: 10, status: 'linksent' } };
      expect(resolveCustomerKycStatus(deal, { dbKycs: dbKycsLinkSent })).toBe('Link Sent');

      const dbKycsDraftAssisted = { id_1: { id: 1, investorId: 10, status: 'draft', isAssisted: true } };
      expect(resolveCustomerKycStatus(deal, { dbKycs: dbKycsDraftAssisted })).toBe('Assisted Draft');
    });

    it('identifies in-session sentDealIds', () => {
      const deal = { id: 'd-1' } as Deal;
      expect(resolveCustomerKycStatus(deal, { sentDealIds: { 'd-1': true } })).toBe('Link Sent');
    });
  });

  describe('getResolvedLocation, getCustomerFilledCapacity, and getIrmInvestmentHorizon', () => {
    const deal = { id: 'd-1', customerId: 'cust-1', location: '—', investmentRange: '₹5 Cr – ₹10 Cr' } as Deal;
    const leads: Lead[] = [
      {
        id: 'cust-1',
        name: 'Aarav',
        phone: '9876543210',
        email: 'a@ex.com',
        location: 'Bengaluru',
        customFields: {
          investmentCapacity: '₹10 Cr',
          horizon: '3-5 Years',
        },
      } as unknown as Lead,
    ];
    const customers: Customer[] = [];

    it('resolves location from matching lead when deal location is "—"', () => {
      expect(getResolvedLocation(deal, leads, customers)).toBe('Bengaluru');
      expect(getResolvedLocation({ ...deal, location: 'Pune' }, leads, customers)).toBe('Pune');
    });

    it('resolves customer capacity from lead custom fields or deal investment range', () => {
      expect(getCustomerFilledCapacity(deal, leads, customers)).toBe('₹10 Cr');
      expect(getCustomerFilledCapacity({ ...deal, customerId: 'none' }, [], [])).toBe('₹5 Cr – ₹10 Cr');
    });

    it('resolves investment horizon from lead custom fields or local storage', () => {
      expect(getIrmInvestmentHorizon(deal, leads, customers)).toBe('3-5 Years');

      const storageGetter = (key: string) => {
        if (key === 'nexus_irm_pref_cust-1') return JSON.stringify({ horizon: '5+ Years' });
        return null;
      };
      expect(getIrmInvestmentHorizon({ ...deal, customerId: 'cust-1' }, [], [], storageGetter)).toBe('5+ Years');
    });
  });

  describe('OriginalKYCView helpers (buildOriginalKycAgentOptions & filterOriginalKycDeals)', () => {
    const mockDeals: Deal[] = [
      { id: '1', customerName: 'Aarav', assignedAgentName: 'Rahul', kycStatus: 'Pending', investmentRange: '₹1 Cr', phone: '9876543210' } as Deal,
      { id: '2', customerName: 'Priya', assignedAgentName: 'Ananya', kycStatus: 'Verified', investmentRange: '₹5 Cr', email: 'priya@example.com' } as Deal,
      { id: '3', customerName: 'Vikram', assignedAgentName: 'Rahul', kycStatus: 'Wrong', investmentRange: '₹10 Cr', location: 'Delhi' } as Deal,
    ];

    it('builds sorted unique agent options', () => {
      const opts = buildOriginalKycAgentOptions(mockDeals);
      expect(opts).toEqual([
        { value: 'Ananya', label: 'Ananya' },
        { value: 'Rahul', label: 'Rahul' },
      ]);
    });

    it('filters deals by agent, status, and search query', () => {
      const byAgent = filterOriginalKycDeals(mockDeals, { agentFilter: 'Ananya' });
      expect(byAgent.length).toBe(1);
      expect(byAgent[0].customerName).toBe('Priya');

      const byStatus = filterOriginalKycDeals(mockDeals, { statusFilter: 'Verified' });
      expect(byStatus.length).toBe(1);
      expect(byStatus[0].customerName).toBe('Priya');

      const bySearch = filterOriginalKycDeals(mockDeals, { searchQuery: 'Delhi' });
      expect(bySearch.length).toBe(1);
      expect(bySearch[0].customerName).toBe('Vikram');

      const all = filterOriginalKycDeals(mockDeals, {});
      expect(all.length).toBe(3);
    });
  });

  describe('countKpiMetrics & filterDealsByKpi', () => {
    const mockDeals: Deal[] = [
      { id: '1', kycStatus: 'Pending', customerKycStatus: 'Submitted' } as Deal,
      { id: '2', kycStatus: 'Pending', customerKycStatus: 'Link Sent' } as Deal,
      { id: '3', kycStatus: 'Verified' } as Deal,
    ];
    const statusFn = (d: Deal) => (d.customerKycStatus || d.kycStatus || 'Pending') as any;

    it('counts KPI metrics accurately', () => {
      const counts = countKpiMetrics(mockDeals, statusFn);
      expect(counts.total).toBe(3);
      expect(counts.awaiting).toBe(1);
      expect(counts.pending).toBe(1);
      expect(counts.verified).toBe(1);
    });

    it('filters deals according to active KPI card', () => {
      expect(filterDealsByKpi(mockDeals, 'all', statusFn).length).toBe(3);
      expect(filterDealsByKpi(mockDeals, 'awaiting', statusFn).length).toBe(1);
      expect(filterDealsByKpi(mockDeals, 'pending', statusFn).length).toBe(1);
      expect(filterDealsByKpi(mockDeals, 'verified', statusFn).length).toBe(1);
    });
  });

  describe('findBackendKyc', () => {
    const dbKycsMap = {
      id_101: { id: 101, investorId: 50, investorName: 'Aarav Sharma', email: 'aarav@ex.com', phone: '9876543210' },
      inv_55: { id: 102, investorId: 55, investorName: 'Priya Patel', email: 'priya@ex.com', phone: '9876543211', companyId: 'comp-1' },
      deal_200: { id: 103, investorId: 60, dealId: 'deal-200', investorName: 'Rohit Verma', email: 'rohit@ex.com', phone: '9876543212' },
    };

    it('returns null if deal is null or undefined', () => {
      expect(findBackendKyc(null, dbKycsMap)).toBeNull();
      expect(findBackendKyc(undefined, dbKycsMap)).toBeNull();
    });

    it('finds KYC record by direct kycId or kycRecordId', () => {
      expect(findBackendKyc({ id: '1', kycId: 101 } as any, dbKycsMap)).toEqual(dbKycsMap.id_101);
      expect(findBackendKyc({ id: '1', kycRecordId: 101 } as any, dbKycsMap)).toEqual(dbKycsMap.id_101);
    });

    it('finds KYC record by investorId/customerId and respects company scope', () => {
      expect(findBackendKyc({ id: '2', customerId: '55' } as any, dbKycsMap, 'comp-1')).toEqual(dbKycsMap.inv_55);
      expect(findBackendKyc({ id: '2', investorId: 55 } as any, dbKycsMap)).toEqual(dbKycsMap.inv_55);
    });

    it('finds KYC record by tracked dealId', () => {
      expect(findBackendKyc({ id: 'deal-200' } as any, dbKycsMap)).toEqual(dbKycsMap.deal_200);
    });

    it('falls back to 10-digit phone number match', () => {
      const match = findBackendKyc({ id: '99', phone: '+91 9876543210' } as any, dbKycsMap);
      expect(match).toEqual(dbKycsMap.id_101);
    });

    it('falls back to case-insensitive email match', () => {
      const match = findBackendKyc({ id: '99', email: 'AARAV@EX.COM' } as any, dbKycsMap);
      expect(match).toEqual(dbKycsMap.id_101);
    });

    it('falls back to customer name match', () => {
      const match = findBackendKyc({ id: '99', customerName: 'aarav sharma' } as any, dbKycsMap);
      expect(match).toEqual(dbKycsMap.id_101);
    });

    it('returns null when no criteria matches', () => {
      expect(findBackendKyc({ id: '99', customerName: 'Unknown Nobody' } as any, dbKycsMap)).toBeNull();
    });
  });

  describe('enrichDealWithContact', () => {
    const leads: Lead[] = [
      { id: 'lead-1', name: 'Kavita', phone: '9876543220', email: 'kavita@lead.com', location: 'Jaipur' } as any,
    ];
    const customers: Customer[] = [
      { id: 'cust-1', name: 'Manish', phone: '9876543221', email: 'manish@cust.com', location: 'Surat' } as any,
    ];

    it('returns untouched deal if phone, email, and location are already populated', () => {
      const fullDeal = { id: 'd1', phone: '123', email: 'a@b.com', location: 'Pune' } as Deal;
      expect(enrichDealWithContact(fullDeal, leads, customers)).toBe(fullDeal);
    });

    it('enriches missing fields from customer match by id', () => {
      const deal = { id: 'd2', customerId: 'cust-1' } as Deal;
      const res = enrichDealWithContact(deal, leads, customers);
      expect(res.phone).toBe('9876543221');
      expect(res.email).toBe('manish@cust.com');
      expect(res.location).toBe('Surat');
    });

    it('enriches missing fields from lead match by normalized phone digits', () => {
      const deal = { id: 'd3', phone: '+91 9876543220' } as Deal;
      const res = enrichDealWithContact(deal, leads, customers);
      expect(res.email).toBe('kavita@lead.com');
      expect(res.location).toBe('Jaipur');
    });

    it('enriches missing fields by customer name match', () => {
      const deal = { id: 'd4', customerName: 'Manish' } as Deal;
      const res = enrichDealWithContact(deal, leads, customers);
      expect(res.phone).toBe('9876543221');
      expect(res.email).toBe('manish@cust.com');
    });

    it('falls back to empty strings when no contact match is found', () => {
      const deal = { id: 'd5', customerName: 'Nonexistent' } as Deal;
      const res = enrichDealWithContact(deal, [], []);
      expect(res.phone).toBe('');
      expect(res.email).toBe('');
      expect(res.location).toBe('');
    });
  });

  describe('resolveCustomerInvestmentAmount', () => {
    it('returns formatted currency from deal.value', () => {
      const deal = { id: 'd1', value: 5000000 } as Deal;
      expect(resolveCustomerInvestmentAmount(deal)).toBe('₹50.0 L');
    });

    it('returns formatted currency from customFields on deal', () => {
      const deal = { id: 'd2', customFields: { investmentAmount: 10000000 } } as any;
      expect(resolveCustomerInvestmentAmount(deal)).toBe('₹1.00 Cr');
    });

    it('returns formatted currency from matched lead or customer customFields', () => {
      const deal = { id: 'd3', customerId: 'lead-1' } as Deal;
      const leads = [{ id: 'lead-1', customFields: { investmentAmount: 2500000 } }] as any;
      expect(resolveCustomerInvestmentAmount(deal, leads, [])).toBe('₹25.0 L');
    });

    it('returns "—" for 0, negative, or missing investment value', () => {
      expect(resolveCustomerInvestmentAmount({ id: 'd4', value: 0 } as any)).toBe('—');
      expect(resolveCustomerInvestmentAmount({ id: 'd5' } as any)).toBe('—');
    });
  });

  describe('buildMergedProfileData', () => {
    it('constructs merged profile data prioritizing dbKyc over lead/customer/deal fallbacks', () => {
      const deal = { id: 'd1', customerName: 'Deal Name', phone: '111', email: 'deal@ex.com', location: 'Deal City' } as Deal;
      const dbKyc = {
        investorName: 'DB Investor',
        panNumber: 'ABCDE1234F',
        dateOfBirth: '1990-01-01',
        bankName: 'HDFC Bank',
        nomineesJson: JSON.stringify([{ name: 'Nominee A', relationship: 'Spouse', dob: '1992-02-02', allocationPercentage: 100 }]),
        aadhaarDocumentUrl: 'https://docs.example.com/aadhaar.pdf',
      };

      const res = buildMergedProfileData(deal, dbKyc, undefined, undefined, () => null);
      expect(res.investorName).toBe('DB Investor');
      expect(res.panNumber).toBe('ABCDE1234F');
      expect(res.dob).toBe('1990-01-01');
      expect(res.bankName).toBe('HDFC Bank');
      expect(res.nominees?.length).toBe(1);
      expect(res.aadhaarDoc?.url).toBe('https://docs.example.com/aadhaar.pdf');
    });

    it('merges stored local draft data from storageGetter when available', () => {
      const deal = { id: 'd2', customerName: 'Local Test' } as Deal;
      const storageGetter = (key: string) => {
        if (key === 'nexus_kyc_data_d2') {
          return JSON.stringify({ investorName: 'Saved Draft Name', occupation: 'Engineer' });
        }
        return null;
      };

      const res = buildMergedProfileData(deal, null, undefined, undefined, storageGetter);
      expect(res.investorName).toBe('Saved Draft Name');
      expect(res.occupation).toBe('Engineer');
    });
  });

  describe('resolveDocUploadEntity', () => {
    it('returns investor entityType for direct numeric customerId', () => {
      expect(resolveDocUploadEntity({ customerId: '105' } as any)).toEqual({
        entityType: 'investor',
        entityId: '105',
      });
      expect(resolveDocUploadEntity({ customerId: 42 } as any)).toEqual({
        entityType: 'investor',
        entityId: '42',
      });
    });

    it('returns investor entityType for prefixed customer IDs like customer-14 or cust-14', () => {
      expect(resolveDocUploadEntity({ customerId: 'customer-14' } as any)).toEqual({
        entityType: 'investor',
        entityId: '14',
      });
      expect(resolveDocUploadEntity({ customerId: 'cust-99' } as any)).toEqual({
        entityType: 'investor',
        entityId: '99',
      });
      expect(resolveDocUploadEntity({ customerId: 'db-88' } as any)).toEqual({
        entityType: 'investor',
        entityId: '88',
      });
    });

    it('matches customer in loaded customers by phone or email', () => {
      const customers = [{ id: '55', phone: '9876543210', email: 'cust@ex.com' }] as Customer[];
      expect(resolveDocUploadEntity({ phone: '+91 9876543210' } as any, customers)).toEqual({
        entityType: 'investor',
        entityId: '55',
      });
      expect(resolveDocUploadEntity({ email: 'CUST@EX.COM' } as any, customers)).toEqual({
        entityType: 'investor',
        entityId: '55',
      });
    });

    it('matches lead in loaded leads by phone or email', () => {
      const leads = [{ id: '77', phone: '9876543210', email: 'lead@ex.com' }] as Lead[];
      expect(resolveDocUploadEntity({ phone: '+91 9876543210' } as any, [], leads)).toEqual({
        entityType: 'lead',
        entityId: '77',
      });
    });

    it('falls back to numeric deal ID', () => {
      expect(resolveDocUploadEntity({ id: '202' } as any)).toEqual({
        entityType: 'deal',
        entityId: '202',
      });
    });

    it('throws descriptive error on invalid or empty candidate identifier', () => {
      expect(() => resolveDocUploadEntity({ id: '0' } as any)).toThrowError(/Cannot upload document/);
      expect(() => resolveDocUploadEntity({ customerId: 'undefined' } as any)).toThrowError(/Cannot upload document/);
      expect(() => resolveDocUploadEntity({} as any)).toThrowError(/Cannot upload document/);
    });
  });

  describe('buildKycDraftMetadata', () => {
    it('builds metadata structure with step, user info, and ISO timestamp', () => {
      const now = '2026-03-01T12:00:00.000Z';
      const meta = buildKycDraftMetadata(3, { id: 'u-1', name: 'Sanjay' }, now);
      expect(meta).toEqual({
        isAssisted: true,
        step: 3,
        savedAt: now,
        assistedByIrmId: 'u-1',
        assistedByIrmName: 'Sanjay',
        status: 'Assisted Draft',
      });
    });

    it('handles null/undefined user safely', () => {
      const meta = buildKycDraftMetadata(1, null);
      expect(meta.isAssisted).toBe(true);
      expect(meta.step).toBe(1);
      expect(meta.assistedByIrmId).toBeUndefined();
      expect(meta.assistedByIrmName).toBeUndefined();
    });
  });

  describe('buildSectionEditData', () => {
    const deal = { customerName: 'Aarav', email: 'aarav@ex.com', phone: '9876543210' } as Deal;
    const current = {
      investorName: 'Aarav Sharma',
      panNumber: 'ABCDE1234F',
      dob: '1990-01-01',
      address: '123 Marine Drive',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400001',
    };

    it('builds personal section data with confirmation flag', () => {
      const data = buildSectionEditData('personal', deal, current, 'Mumbai', 'Real Estate');
      expect(data.investorName).toBe('Aarav Sharma');
      expect(data.panNumber).toBe('ABCDE1234F');
      expect(data.preferredAssetClass).toBe('Real Estate');
      expect(data.preferredAssetClassConfirmed).toBe(true);
    });

    it('builds address section data', () => {
      const data = buildSectionEditData('address', deal, current, 'Mumbai', 'Real Estate');
      expect(data.nameAsPerPan).toBe('Aarav Sharma');
      expect(data.address).toBe('123 Marine Drive');
      expect(data.city).toBe('Mumbai');
      expect(data.state).toBe('Maharashtra');
      expect(data.country).toBe('India');
    });

    it('handles null deal and placeholder asset class "—"', () => {
      const personalData = buildSectionEditData('personal', null, current, '', '—');
      expect(personalData.preferredAssetClassConfirmed).toBe(false);
      expect(personalData.city).toBe('Mumbai');
    });
  });

});
