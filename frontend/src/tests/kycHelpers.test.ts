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
});
