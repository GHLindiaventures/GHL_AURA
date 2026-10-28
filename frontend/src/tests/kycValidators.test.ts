import { describe, it, expect } from 'vitest';
import {
  parseLocalDate,
  maskAadhaar,
  maskAccount,
  sanitizeDobString,
  getDobValidationError,
  kycValidators,
  validateKycStep,
  GENDER_OPTIONS,
  INVESTOR_TYPE_OPTIONS,
  RESIDENT_TYPE_OPTIONS,
  ACCOUNT_TYPE_OPTIONS,
  NOMINEE_RELATIONSHIP_OPTIONS,
  SharedKycFormData,
} from '../utils/kycValidators';

describe('kycValidators Unit Tests', () => {
  describe('parseLocalDate', () => {
    it('handles empty or whitespace values', () => {
      expect(parseLocalDate('')).toBeNull();
      expect(parseLocalDate('   ')).toBeNull();
      expect(parseLocalDate(null as any)).toBeNull();
    });

    it('parses YYYY-MM-DD and YYYY/MM/DD formats', () => {
      const d1 = parseLocalDate('1990-05-15');
      expect(d1).not.toBeNull();
      expect(d1?.getFullYear()).toBe(1990);
      expect(d1?.getMonth()).toBe(4);
      expect(d1?.getDate()).toBe(15);

      const d2 = parseLocalDate('1992/12/25');
      expect(d2?.getFullYear()).toBe(1992);
      expect(d2?.getMonth()).toBe(11);
      expect(d2?.getDate()).toBe(25);

      // Invalid date like Feb 31
      expect(parseLocalDate('1990-02-31')).toBeNull();
    });

    it('parses DD-MM-YYYY and DD/MM/YYYY formats', () => {
      const d1 = parseLocalDate('15-05-1990');
      expect(d1?.getFullYear()).toBe(1990);
      expect(d1?.getMonth()).toBe(4);
      expect(d1?.getDate()).toBe(15);

      const d2 = parseLocalDate('25/12/1992');
      expect(d2?.getFullYear()).toBe(1992);
      expect(d2?.getMonth()).toBe(11);
      expect(d2?.getDate()).toBe(25);

      // Invalid calendar date
      expect(parseLocalDate('31-04-1990')).toBeNull();
    });

    it('falls back to standard Date parsing or returns null for invalid strings', () => {
      const d = parseLocalDate('2020-01-01T00:00:00.000Z');
      expect(d).not.toBeNull();
      expect(parseLocalDate('invalid-date-string')).toBeNull();
    });
  });

  describe('maskAadhaar', () => {
    it('handles falsy or empty values', () => {
      expect(maskAadhaar('')).toBeNull();
      expect(maskAadhaar(null, 'N/A')).toBe('N/A');
      expect(maskAadhaar('   ', 'fallback')).toBe('fallback');
    });

    it('returns short numbers as is', () => {
      expect(maskAadhaar('123')).toBe('123');
    });

    it('masks full aadhaar numbers preserving only the last 4 digits', () => {
      expect(maskAadhaar('5432 1234 9876')).toBe('XXXX XXXX 9876');
      expect(maskAadhaar('543212349876')).toBe('XXXX XXXX 9876');
    });
  });

  describe('maskAccount', () => {
    it('handles falsy or empty values', () => {
      expect(maskAccount('')).toBeNull();
      expect(maskAccount(null, 'N/A')).toBe('N/A');
      expect(maskAccount('   ', 'default')).toBe('default');
    });

    it('returns short account numbers as is', () => {
      expect(maskAccount('1234')).toBe('1234');
    });

    it('masks standard account numbers with bullets', () => {
      const masked = maskAccount('123456789012');
      expect(masked?.endsWith('9012')).toBe(true);
      expect(masked?.startsWith('\u2022')).toBe(true);
    });
  });

  describe('sanitizeDobString', () => {
    it('returns empty string for falsy input', () => {
      expect(sanitizeDobString('')).toBe('');
      expect(sanitizeDobString(null)).toBe('');
    });

    it('clamps 5+ digit years in YYYY-MM-DD', () => {
      expect(sanitizeDobString('19900-05-15')).toBe('1990-05-15');
      expect(sanitizeDobString('1990-05-15000')).toBe('1990-05-1500');
    });

    it('clamps 5+ digit years in slashes format', () => {
      expect(sanitizeDobString('20000/01/01')).toBe('2000/01/01');
      expect(sanitizeDobString('01/01/20000')).toBe('01/01/2000');
    });

    it('leaves standard valid strings untouched', () => {
      expect(sanitizeDobString('1995-10-20')).toBe('1995-10-20');
      expect(sanitizeDobString('15/08/1947')).toBe('15/08/1947');
      expect(sanitizeDobString('just text')).toBe('just text');
    });
  });

  describe('getDobValidationError', () => {
    it('validates required presence', () => {
      expect(getDobValidationError('')).toBe('Date of birth is required.');
      expect(getDobValidationError(null)).toBe('Date of birth is required.');
    });

    it('rejects years with more than 4 digits', () => {
      expect(getDobValidationError('20000-01-01')).toBe('Year must be 4 digits.');
      expect(getDobValidationError('01-01-20000')).toBe('Year must be 4 digits.');
    });

    it('validates month boundaries', () => {
      expect(getDobValidationError('1990-13-01')).toBe('Invalid month in date of birth.');
      expect(getDobValidationError('1990-00-01')).toBe('Invalid month in date of birth.');
    });

    it('validates calendar days per month including leap years', () => {
      expect(getDobValidationError('1990-04-31')).toContain('April 1990 has only 30 days');
      expect(getDobValidationError('1990-02-29')).toContain('February 1990 has only 28 days');
      expect(getDobValidationError('31-06-1995')).toContain('June 1995 has only 30 days');
    });

    it('rejects unparseable dates', () => {
      expect(getDobValidationError('invalid-format-text')).toBe('Please enter a valid date of birth (DD-MM-YYYY).');
    });

    it('rejects future dates', () => {
      const nextYear = new Date().getFullYear() + 2;
      expect(getDobValidationError(`${nextYear}-01-01`)).toBe('Date of birth cannot be in the future.');
    });

    it('rejects investors under 18 years old', () => {
      const recent = new Date();
      recent.setFullYear(recent.getFullYear() - 10);
      const str = `${recent.getFullYear()}-${String(recent.getMonth() + 1).padStart(2, '0')}-${String(recent.getDate()).padStart(2, '0')}`;
      expect(getDobValidationError(str)).toBe('Investor must be at least 18 years old.');
    });

    it('rejects investors over 120 years old', () => {
      expect(getDobValidationError('1890-01-01')).toBe('Please enter a valid date of birth.');
    });

    it('accepts valid adult investor dates of birth', () => {
      expect(getDobValidationError('1985-06-15')).toBeNull();
      expect(getDobValidationError('15-06-1985')).toBeNull();
    });
  });

  describe('individual kycValidators functions', () => {
    it('validates PAN correctly', () => {
      expect(kycValidators.pan('ABCPE1234F')).toBe(true);
      expect(kycValidators.pan('abcpe1234f')).toBe(true); // lower case
      expect(kycValidators.pan('ABCPK1234F')).toBe(true); // 'P' entity
      expect(kycValidators.pan('ABCCE1234F')).toBe(true); // 'C' entity
      expect(kycValidators.pan('ABCXZ1234F')).toBe(false); // 'X' not in valid entity list
      expect(kycValidators.pan('ABCD12345F')).toBe(false); // invalid length/format
      expect(kycValidators.pan('ABCPE12345')).toBe(false);
    });

    it('validates Aadhaar correctly', () => {
      expect(kycValidators.aadhaar('234567890123')).toBe(true);
      expect(kycValidators.aadhaar('987654321098')).toBe(true);
      expect(kycValidators.aadhaar('012345678901')).toBe(false); // starts with 0
      expect(kycValidators.aadhaar('123456789012')).toBe(false); // starts with 1
      expect(kycValidators.aadhaar('23456789')).toBe(false); // length != 12
    });

    it('validates IFSC code correctly', () => {
      expect(kycValidators.ifsc('HDFC0001234')).toBe(true);
      expect(kycValidators.ifsc('hdfc0001234')).toBe(true); // auto upper
      expect(kycValidators.ifsc('HDFC1001234')).toBe(false); // 5th character not 0
      expect(kycValidators.ifsc('HDF0001234')).toBe(false); // wrong length
    });

    it('validates pincode correctly', () => {
      expect(kycValidators.pincode('560001')).toBe(true);
      expect(kycValidators.pincode('110001')).toBe(true);
      expect(kycValidators.pincode('060001')).toBe(false); // starts with 0
      expect(kycValidators.pincode('56000')).toBe(false); // 5 digits
    });

    it('validates nominee allocation sum', () => {
      expect(kycValidators.nomineeAllocation([{ allocationPercentage: 100 }])).toBe(true);
      expect(kycValidators.nomineeAllocation([
        { allocationPercentage: 50 },
        { allocationPercentage: 50 },
      ])).toBe(true);
      expect(kycValidators.nomineeAllocation([
        { allocationPercentage: 33.3 },
        { allocationPercentage: 33.3 },
        { allocationPercentage: 33.4 },
      ])).toBe(true);
      expect(kycValidators.nomineeAllocation([{ allocationPercentage: 0 }])).toBe(false);
      expect(kycValidators.nomineeAllocation([{ allocationPercentage: 90 }])).toBe(false);
      expect(kycValidators.nomineeAllocation([
        { allocationPercentage: 50 },
        { allocationPercentage: -10 },
      ])).toBe(false);
    });

    it('validates requiredText', () => {
      expect(kycValidators.requiredText('Hello')).toBe(true);
      expect(kycValidators.requiredText('H', 2)).toBe(false);
      expect(kycValidators.requiredText('   ', 1)).toBe(false);
      expect(kycValidators.requiredText(null as any)).toBe(false);
    });

    it('validates phone numbers with and without country code', () => {
      expect(kycValidators.phone('9876543210')).toBe(true);
      expect(kycValidators.phone('919876543210')).toBe(true); // 12-digit with 91
      expect(kycValidators.phone('09876543210')).toBe(true); // 11-digit with 0
      expect(kycValidators.phone('9123456789')).toBe(true); // 10-digit starting with 91
      expect(kycValidators.phone('5555555555')).toBe(false); // doesn't start with 6-9
      expect(kycValidators.phone('12345')).toBe(false);
    });

    it('validates email addresses', () => {
      expect(kycValidators.email('investor@example.com')).toBe(true);
      expect(kycValidators.email('investor.name+tag@domain.co.in')).toBe(true);
      expect(kycValidators.email('not-an-email')).toBe(false);
      expect(kycValidators.email('test@domain')).toBe(false);
    });

    it('validates dob through kycValidators.dob', () => {
      expect(kycValidators.dob('1990-01-01')).toBe(true);
      expect(kycValidators.dob('2030-01-01')).toBe(false);
    });

    it('validates bank account numbers', () => {
      expect(kycValidators.bankAccount('123456789')).toBe(true);
      expect(kycValidators.bankAccount('123456789012345678')).toBe(true);
      expect(kycValidators.bankAccount('12345')).toBe(false);
      expect(kycValidators.bankAccount('12345678901234567890')).toBe(false);
      expect(kycValidators.bankAccount('1234abc567')).toBe(false);
    });

    it('validates demat BOID / accounts', () => {
      expect(kycValidators.dematBoid('1234567890123456')).toBe(true); // 16 digit CDSL
      expect(kycValidators.dematBoid('IN30012312345678')).toBe(true); // NSDL
      expect(kycValidators.dematBoid('IN-300123-12345678')).toBe(true); // formatted
      expect(kycValidators.dematBoid('INVALID123')).toBe(false);
    });

    it('validates nomineeDob and isMinorDob', () => {
      expect(kycValidators.nomineeDob('1995-05-15')).toBe(true);
      expect(kycValidators.nomineeDob('2035-05-15')).toBe(false); // future
      expect(kycValidators.nomineeDob('1800-01-01')).toBe(false); // >120 years

      // isMinorDob
      const minorYear = new Date().getFullYear() - 10;
      expect(kycValidators.isMinorDob(`${minorYear}-01-01`)).toBe(true);
      expect(kycValidators.isMinorDob('1990-01-01')).toBe(false);
      expect(kycValidators.isMinorDob('')).toBe(false);
    });
  });

  describe('validateKycStep wizard step validation', () => {
    it('validates Step 1 with full errors and clean state', () => {
      const errsEmpty = validateKycStep(1, {});
      expect(errsEmpty.investorName).toBeDefined();
      expect(errsEmpty.phone).toBeDefined();
      expect(errsEmpty.email).toBeDefined();
      expect(errsEmpty.gender).toBeDefined();
      expect(errsEmpty.investorType).toBeDefined();
      expect(errsEmpty.residentType).toBeDefined();

      const validStep1: Partial<SharedKycFormData> = {
        investorName: 'Aarav Sharma',
        phone: '9876543210',
        email: 'aarav@example.com',
        gender: 'Male',
        investorType: 'Individual / Retail HNW',
        residentType: 'Resident Indian',
      };
      const errsValid = validateKycStep(1, validStep1);
      expect(Object.keys(errsValid)).toHaveLength(0);
    });

    it('validates Step 2 with full errors and clean state', () => {
      const errsEmpty = validateKycStep(2, {});
      expect(errsEmpty.panNumber).toBeDefined();
      expect(errsEmpty.nameAsPerPan).toBeDefined();
      expect(errsEmpty.aadhaarNumber).toBeDefined();
      expect(errsEmpty.dob).toBeDefined();
      expect(errsEmpty.address).toBeDefined();
      expect(errsEmpty.city).toBeDefined();
      expect(errsEmpty.state).toBeDefined();
      expect(errsEmpty.pincode).toBeDefined();

      const validStep2: Partial<SharedKycFormData> = {
        panNumber: 'ABCPE1234F',
        nameAsPerPan: 'Aarav Sharma',
        aadhaarNumber: '234567890123',
        dob: '1990-05-15',
        address: '123 MG Road, Suite 400',
        city: 'Bengaluru',
        state: 'Karnataka',
        pincode: '560001',
      };
      const errsValid = validateKycStep(2, validStep2);
      expect(Object.keys(errsValid)).toHaveLength(0);
    });

    it('validates Step 3 bank details', () => {
      const errsEmpty = validateKycStep(3, {});
      expect(errsEmpty.bankName).toBeDefined();
      expect(errsEmpty.accountNumber).toBeDefined();
      expect(errsEmpty.ifscCode).toBeDefined();
      expect(errsEmpty.accountType).toBeDefined();

      const validStep3: Partial<SharedKycFormData> = {
        bankName: 'HDFC Bank',
        accountNumber: '123456789012',
        ifscCode: 'HDFC0001234',
        accountType: 'Savings Account',
      };
      const errsValid = validateKycStep(3, validStep3);
      expect(Object.keys(errsValid)).toHaveLength(0);
    });

    it('validates Step 4 demat options', () => {
      // Skipping demat is valid
      expect(Object.keys(validateKycStep(4, { hasNoDemat: true }))).toHaveLength(0);

      // Invalid demat ID
      const errsInvalid = validateKycStep(4, { hasNoDemat: false, dematAccountNumber: 'bad' });
      expect(errsInvalid.dematAccountNumber).toBeDefined();

      // Valid demat ID
      const errsValid = validateKycStep(4, { hasNoDemat: false, dematAccountNumber: '1234567890123456' });
      expect(Object.keys(errsValid)).toHaveLength(0);
    });

    it('validates Step 5 nominee rules (optional vs opt-in)', () => {
      // No nominee opt-in -> passes with 0 errors
      expect(Object.keys(validateKycStep(5, { hasNominee: false, nominees: [] }))).toHaveLength(0);

      // Opted in with incomplete nominee
      const errsIncomplete = validateKycStep(5, {
        hasNominee: true,
        nominees: [{
          name: '',
          relationship: '',
          dob: '2040-01-01',
          allocationPercentage: 0,
        }],
      });
      expect(errsIncomplete.nominee_0_name).toBeDefined();
      expect(errsIncomplete.nominee_0_relationship).toBeDefined();
      expect(errsIncomplete.nominee_0_dob).toBeDefined();
      expect(errsIncomplete.nominee_0_pct).toBeDefined();
      expect(errsIncomplete.nominees).toContain('Total allocation across all nominees must equal exactly 100%');

      // Valid single nominee
      const errsValid = validateKycStep(5, {
        hasNominee: true,
        nominees: [{
          name: 'Priya Sharma',
          relationship: 'Spouse',
          dob: '1992-04-10',
          allocationPercentage: 100,
        }],
      });
      expect(Object.keys(errsValid)).toHaveLength(0);

      // Nominees provided without explicit hasNominee flag
      const errsImplicit = validateKycStep(5, {
        nominees: [{
          name: 'Priya Sharma',
          relationship: 'Spouse',
          dob: '1992-04-10',
          allocationPercentage: 100,
        }],
      });
      expect(Object.keys(errsImplicit)).toHaveLength(0);
    });

    it('exports canonical option arrays', () => {
      expect(GENDER_OPTIONS).toContain('Male');
      expect(INVESTOR_TYPE_OPTIONS).toContain('Individual / Retail HNW');
      expect(RESIDENT_TYPE_OPTIONS).toContain('Resident Indian');
      expect(ACCOUNT_TYPE_OPTIONS).toContain('Savings Account');
      expect(NOMINEE_RELATIONSHIP_OPTIONS).toContain('Spouse');
    });
  });
});
