import { describe, it, expect, beforeEach } from 'vitest';
import {
  stripSensitiveKycFields,
  saveKycLocal,
  clearAllKycLocalStorage,
  sanitizeStoredKycData,
  SENSITIVE_KYC_FIELDS,
} from './kycStorage';

class LocalStorageMock {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] || null;
  }
}

const mockStorage = new LocalStorageMock();
(globalThis as any).localStorage = mockStorage;
(globalThis as any).window = globalThis;

describe('kycStorage: stripSensitiveKycFields', () => {
  it('strips all sensitive top-level KYC fields', () => {
    const rawData = {
      investorName: 'Jane Investor',
      email: 'jane@example.com',
      phone: '+919876543210',
      panNumber: 'ABCDE1234F',
      aadhaarNumber: '123456789012',
      accountNumber: '1122334455',
      bankAccountNumber: '1122334455',
      dematAccountNumber: '1208160012345678',
      dematClientId: '12345678',
      dematDpId: 'IN300123',
      dob: '1990-05-15',
      city: 'Mumbai',
    };

    const sanitized = stripSensitiveKycFields(rawData);

    for (const field of SENSITIVE_KYC_FIELDS) {
      expect((sanitized as any)[field]).toBeUndefined();
    }
    expect(sanitized.investorName).toBe('Jane Investor');
    expect(sanitized.email).toBe('jane@example.com');
    expect(sanitized.city).toBe('Mumbai');
  });

  it('strips base64 data: URLs from document objects while preserving permanent URLs', () => {
    const dataWithDocs = {
      investorName: 'John Doe',
      panDoc: {
        name: 'pan.pdf',
        size: '1.2 MB',
        type: 'application/pdf',
        url: 'data:application/pdf;base64,JVBERi0xLjQK...',
      },
      aadhaarDoc: {
        name: 'aadhaar.pdf',
        size: '2.4 MB',
        type: 'application/pdf',
        url: 'https://backend.example.com/uploads/aadhaar_123.pdf',
      },
      bankProofDoc: {
        name: 'cheque.png',
        size: '500 KB',
        type: 'image/png',
        url: '/uploads/cheque_456.png',
      },
    };

    const sanitized = stripSensitiveKycFields(dataWithDocs);

    expect(sanitized.panDoc?.url).toBeUndefined();
    expect(sanitized.panDoc?.name).toBe('pan.pdf');
    expect(sanitized.aadhaarDoc?.url).toBe(
      'https://backend.example.com/uploads/aadhaar_123.pdf'
    );
    expect(sanitized.bankProofDoc?.url).toBe('/uploads/cheque_456.png');
  });

  it('recursively sanitizes sensitive nominee fields including nominees[].dob', () => {
    const dataWithNominees = {
      investorName: 'Alice',
      nominees: [
        {
          name: 'Bob',
          relationship: 'Spouse',
          dob: '1992-08-20',
          nomineeDob: '1992-08-20',
          panNumber: 'FGHIJ5678K',
          aadhaarNumber: '998877665544',
          allocationPercentage: 50,
          address: '42 Marine Drive',
          guardianName: '',
        },
        {
          name: 'Charlie',
          relationship: 'Child',
          dob: '2015-12-10',
          allocationPercentage: 50,
          address: '42 Marine Drive',
          guardianName: 'Bob',
        },
      ],
    };

    const sanitized = stripSensitiveKycFields(dataWithNominees);

    expect(sanitized.nominees).toHaveLength(2);
    expect((sanitized.nominees[0] as any).dob).toBeUndefined();
    expect((sanitized.nominees[0] as any).nomineeDob).toBeUndefined();
    expect((sanitized.nominees[0] as any).panNumber).toBeUndefined();
    expect((sanitized.nominees[0] as any).aadhaarNumber).toBeUndefined();
    expect(sanitized.nominees[0].name).toBe('Bob');
    expect(sanitized.nominees[0].relationship).toBe('Spouse');
    expect(sanitized.nominees[0].allocationPercentage).toBe(50);

    expect((sanitized.nominees[1] as any).dob).toBeUndefined();
    expect(sanitized.nominees[1].name).toBe('Charlie');
    expect(sanitized.nominees[1].guardianName).toBe('Bob');
  });
});

describe('kycStorage: localStorage persistence and logout cleanup', () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it('saveKycLocal saves sanitized data into localStorage', () => {
    saveKycLocal('deal-42', {
      investorName: 'Target Customer',
      panNumber: 'ABCDE1234F',
      nominees: [{ name: 'Nominee A', dob: '1995-01-01', allocationPercentage: 100 }],
    });

    const stored = JSON.parse(mockStorage.getItem('nexus_kyc_data_deal-42') || '{}');
    expect(stored.investorName).toBe('Target Customer');
    expect(stored.panNumber).toBeUndefined();
    expect(stored.nominees[0].dob).toBeUndefined();
    expect(stored.nominees[0].name).toBe('Nominee A');
  });

  it('clearAllKycLocalStorage cleans up all KYC keys without deleting unrelated keys', () => {
    // KYC-related keys
    mockStorage.setItem('nexus_kyc_data_deal-1', '{"investorName":"A"}');
    mockStorage.setItem('nexus_kyc_draft_deal-1', '{"step":2}');
    mockStorage.setItem('nexus_kyc_status_deal-1', 'Assisted Draft');
    mockStorage.setItem('nexus_kyc_assisted_deal-1', '{"irmId":1}');
    mockStorage.setItem('nexus_kyc_verify_draft_deal-1', '{"pan":"ok"}');
    mockStorage.setItem('nexus_irm_pref_cust-10', '{"preferredAssetClass":"Equity"}');
    mockStorage.setItem('nexus_irm_pref_deal-1', '{"confirmed":true}');

    // Unrelated application keys
    mockStorage.setItem('nexus_tenants', '[{"id":"t-ghl-01"}]');
    mockStorage.setItem('nexus_users', '[{"id":1,"name":"Admin"}]');
    mockStorage.setItem('nexus_platform_roles', '{"admin":{"permissions":[]}}');
    mockStorage.setItem('nexus_storage_kyc_sanitized_v1', 'true');

    clearAllKycLocalStorage();

    // Verify KYC keys are deleted
    expect(mockStorage.getItem('nexus_kyc_data_deal-1')).toBeNull();
    expect(mockStorage.getItem('nexus_kyc_draft_deal-1')).toBeNull();
    expect(mockStorage.getItem('nexus_kyc_status_deal-1')).toBeNull();
    expect(mockStorage.getItem('nexus_kyc_assisted_deal-1')).toBeNull();
    expect(mockStorage.getItem('nexus_kyc_verify_draft_deal-1')).toBeNull();
    expect(mockStorage.getItem('nexus_irm_pref_cust-10')).toBeNull();
    expect(mockStorage.getItem('nexus_irm_pref_deal-1')).toBeNull();

    // Verify unrelated application keys are preserved
    expect(mockStorage.getItem('nexus_tenants')).toBe('[{"id":"t-ghl-01"}]');
    expect(mockStorage.getItem('nexus_users')).toBe('[{"id":1,"name":"Admin"}]');
    expect(mockStorage.getItem('nexus_platform_roles')).toBe(
      '{"admin":{"permissions":[]}}'
    );
    expect(mockStorage.getItem('nexus_storage_kyc_sanitized_v1')).toBe('true');
  });

  it('sanitizeStoredKycData migrates and cleans legacy cached KYC data', () => {
    mockStorage.setItem(
      'nexus_kyc_data_legacy-deal',
      JSON.stringify({
        investorName: 'Legacy User',
        panNumber: 'OLDPA1234Z',
        nominees: [{ name: 'Nom', dob: '1980-02-02' }],
      })
    );

    sanitizeStoredKycData();

    const migrated = JSON.parse(
      mockStorage.getItem('nexus_kyc_data_legacy-deal') || '{}'
    );
    expect(migrated.investorName).toBe('Legacy User');
    expect(migrated.panNumber).toBeUndefined();
    expect(migrated.nominees[0].dob).toBeUndefined();
    expect(mockStorage.getItem('nexus_storage_kyc_sanitized_v1')).toBe('true');
  });
});
