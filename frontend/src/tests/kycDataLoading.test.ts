import { describe, it, expect, vi, beforeEach } from 'vitest';

// Simulate the KYC load and live sync error handling logic verified in KYCPage
interface KycLoadResult {
  isError: boolean;
  status?: number;
  networkError?: boolean;
  message?: string;
  json?: any;
}

const fetchKycRecords = async (mockFetch: typeof fetch): Promise<KycLoadResult> => {
  return mockFetch('/api/irm/kyc/all')
    .then(async (res) => {
      if (!res.ok) {
        return { isError: true, status: res.status, message: `HTTP ${res.status}` };
      }
      const json = await res.json().catch(() => null);
      return { isError: false, json };
    })
    .catch((err) => {
      return { isError: true, networkError: true, message: err?.message || 'Network error' };
    });
};

const processKycSyncState = (
  result: KycLoadResult,
  existingCache: Record<string, any>
): {
  kycSyncWarning: string | null;
  isLiveKycLoaded: boolean;
  dbKycs: Record<string, any>;
} => {
  if (result.isError) {
    const warning = result.networkError
      ? 'Network error: Unable to load live KYC records. Showing cached or local records.'
      : `Live KYC synchronization failed (${result.message}). Showing cached or local records.`;
    return {
      kycSyncWarning: warning,
      isLiveKycLoaded: false,
      dbKycs: existingCache, // Preserve legitimate cached data
    };
  }

  if (result.json?.success && Array.isArray(result.json.data)) {
    const map: Record<string, any> = {};
    result.json.data.forEach((k: any) => {
      if (!k) return;
      if (k.id) map[`id_${k.id}`] = k;
      if (k.investorId) map[`inv_${k.investorId}`] = k;
    });
    return {
      kycSyncWarning: null,
      isLiveKycLoaded: true,
      dbKycs: map,
    };
  }

  return {
    kycSyncWarning: 'Invalid response format from live KYC backend.',
    isLiveKycLoaded: false,
    dbKycs: existingCache,
  };
};

// Document upload identifier resolution logic verified in KYCPage
const resolveDocUploadEntitySafe = (deal: { id?: string | number; customerId?: string | number; dealName?: string }): { entityType: string; entityId: string } => {
  const custNum = Number(deal.customerId);
  if (Number.isInteger(custNum) && custNum > 0) {
    return { entityType: 'investor', entityId: String(custNum) };
  }

  const dealNum = Number(deal.id);
  if (Number.isInteger(dealNum) && dealNum > 0) {
    return { entityType: 'deal', entityId: String(dealNum) };
  }

  const candidateId = String(deal.id || deal.customerId || '').trim();
  if (!candidateId || candidateId === '0' || candidateId === 'undefined' || candidateId === 'null') {
    throw new Error(`Cannot upload document: Missing or invalid entity identifier for deal "${deal.dealName || deal.id || 'Unknown'}".`);
  }
  return { entityType: 'deal', entityId: candidateId };
};

describe('REL-1 — KYC Load Error Handling & Cached State Integrity', () => {
  it('does not silently swallow HTTP 500 errors and sets explicit warning while preserving cache', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    const initialCache = { id_101: { id: 101, status: 'Approved' } };
    const loadResult = await fetchKycRecords(mockFetch as unknown as typeof fetch);

    expect(loadResult.isError).toBe(true);
    expect(loadResult.status).toBe(500);
    expect(loadResult.message).toBe('HTTP 500');

    const syncState = processKycSyncState(loadResult, initialCache);
    expect(syncState.isLiveKycLoaded).toBe(false);
    expect(syncState.kycSyncWarning).toContain('Live KYC synchronization failed (HTTP 500)');
    // Legitimate cached data must be preserved
    expect(syncState.dbKycs).toEqual(initialCache);
    expect(syncState.dbKycs['id_101'].status).toBe('Approved');
  });

  it('captures network failure errors and sets clear warning while preserving cache', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

    const initialCache = { id_202: { id: 202, status: 'Draft' } };
    const loadResult = await fetchKycRecords(mockFetch as unknown as typeof fetch);

    expect(loadResult.isError).toBe(true);
    expect(loadResult.networkError).toBe(true);
    expect(loadResult.message).toBe('Failed to fetch');

    const syncState = processKycSyncState(loadResult, initialCache);
    expect(syncState.isLiveKycLoaded).toBe(false);
    expect(syncState.kycSyncWarning).toContain('Network error: Unable to load live KYC records');
    // Cache preserved
    expect(syncState.dbKycs['id_202']).toBeDefined();
  });

  it('clears warning and marks isLiveKycLoaded as true on successful backend refresh', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          { id: 301, investorId: 42, status: 'Approved' },
        ],
      }),
    } as Response);

    const staleCache = { id_101: { id: 101, status: 'Pending' } };
    const loadResult = await fetchKycRecords(mockFetch as unknown as typeof fetch);

    expect(loadResult.isError).toBe(false);

    const syncState = processKycSyncState(loadResult, staleCache);
    expect(syncState.isLiveKycLoaded).toBe(true);
    expect(syncState.kycSyncWarning).toBeNull();
    expect(syncState.dbKycs['id_301']).toBeDefined();
    expect(syncState.dbKycs['inv_42']).toBeDefined();
  });
});

describe('REL-2 — Document Upload Identifier Validation', () => {
  it('resolves valid positive numeric customer IDs as investor entity', () => {
    const res = resolveDocUploadEntitySafe({ id: 'deal-99', customerId: 105 });
    expect(res).toEqual({ entityType: 'investor', entityId: '105' });
  });

  it('resolves valid numeric deal IDs when customer ID is not numeric', () => {
    const res = resolveDocUploadEntitySafe({ id: 55, customerId: undefined });
    expect(res).toEqual({ entityType: 'deal', entityId: '55' });
  });

  it('rejects fallback "0" entity ID with an explicit error', () => {
    expect(() => {
      resolveDocUploadEntitySafe({ id: 0, customerId: '0' });
    }).toThrowError(/Missing or invalid entity identifier/);
  });

  it('rejects missing or empty identifiers with an explicit error', () => {
    expect(() => {
      resolveDocUploadEntitySafe({ id: '', customerId: '' });
    }).toThrowError(/Missing or invalid entity identifier/);
  });
});
