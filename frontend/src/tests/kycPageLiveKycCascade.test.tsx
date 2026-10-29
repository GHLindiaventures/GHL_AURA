import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { KYCPage } from '../pages/KYC/KYCPage';
import * as ghlApiService from '../services/ghlApiService';
import * as authContext from '../context/AuthContext';
import * as callContext from '../context/CallContext';
import { Deal, Lead, Customer } from '../types';

vi.mock('../services/ghlApiService', () => ({
  getDeals: vi.fn(),
  getLeads: vi.fn(),
  getCustomers: vi.fn(),
  addDealActivity: vi.fn(),
  persistDeal: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../context/CallContext', () => ({
  useCall: vi.fn(),
}));

describe('KYCPage Live KYC Cascade & Background Sync Tests', () => {
  const originalFetch = globalThis.fetch;
  const mockInitiateCall = vi.fn();

  const mockUserIrm = {
    id: 'irm-1',
    name: 'IRM Officer',
    email: 'irm@ghl.com',
    role: { code: 'irm', name: 'IRM' },
    companySlug: 'ghl',
    companyName: 'GHL India Ventures',
  };

  const mockTenantGhl = {
    id: 't-ghl-01',
    slug: 'ghl',
    name: 'GHL India Ventures',
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();

    vi.mocked(ghlApiService.persistDeal).mockResolvedValue({} as any);
    vi.mocked(ghlApiService.addDealActivity).mockResolvedValue({} as any);

    vi.mocked(authContext.useAuth).mockReturnValue({
      user: mockUserIrm,
      tenant: mockTenantGhl,
      isAuthenticated: true,
      role: 'irm',
      permissions: ['view_kyc', 'edit_kyc', 'verify_kyc'],
      logout: vi.fn(),
    } as any);

    vi.mocked(callContext.useCall).mockReturnValue({
      initiateCall: mockInitiateCall,
      activeCall: null,
      callStatus: 'idle',
      endCall: vi.fn(),
      muteCall: vi.fn(),
      unmuteCall: vi.fn(),
      isMuted: false,
    } as any);
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it('fetches live KYC record by targetId when kycId is present', async () => {
    const dealWithKycId: Deal = {
      id: 'deal-target-1',
      companyId: 't-ghl-01',
      title: 'Target ID Deal',
      customerName: 'Target Investor',
      customerId: 'cust-tgt-1',
      stage: 'qualified_investor',
      status: 'In Progress',
      kycStatus: 'In Progress',
      email: 'target@example.com',
      phone: '+91 9911223344',
      value: 1500000,
      createdAt: '2026-02-01T10:00:00Z',
      notes: '',
      kycId: 991,
    } as any;

    vi.mocked(ghlApiService.getDeals).mockResolvedValue([dealWithKycId]);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue([]);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue([]);

    globalThis.fetch = vi.fn().mockImplementation((url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/irm/kyc/all')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [] }),
        } as any);
      }
      if (urlStr.includes('/irm/kyc/991')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              id: 991,
              investorName: 'Target Investor Live',
              panNumber: 'TARGET991P',
              fatherName: 'Late Harish Mehta',
              bankName: 'HDFC Bank Ltd',
              accountNumber: '991000123456',
              ifscCode: 'HDFC0001234',
            },
          }),
        } as any);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: {} }),
      } as any);
    });

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Target Investor')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Target Investor'));

    await waitFor(() => {
      expect(screen.getByText('Late Harish Mehta')).toBeDefined();
      expect(screen.getAllByText('TARGET991P').length).toBeGreaterThan(0);
    });
  }, 15000);

  it('fetches live KYC record by email fallback when targetId is missing', async () => {
    const dealWithEmail: Deal = {
      id: 'deal-email-1',
      companyId: 't-ghl-01',
      title: 'Email Match Deal',
      customerName: 'Pooja Agarwal',
      customerId: 'cust-em-1',
      stage: 'qualified_investor',
      status: 'In Progress',
      kycStatus: 'In Progress',
      email: 'pooja.agarwal@example.com',
      phone: '+91 9822334455',
      value: 2000000,
      createdAt: '2026-02-01T10:00:00Z',
      notes: '',
    } as any;

    vi.mocked(ghlApiService.getDeals).mockResolvedValue([dealWithEmail]);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue([]);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue([]);

    globalThis.fetch = vi.fn().mockImplementation((url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/irm/kyc/all')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [] }),
        } as any);
      }
      if (urlStr.includes('/irm/kyc/by-email')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              id: 772,
              email: 'pooja.agarwal@example.com',
              investorName: 'Pooja Agarwal',
              panNumber: 'POOJA7720A',
              fatherName: 'Rajendra Agarwal',
              bankName: 'ICICI Bank',
              accountNumber: '772000998877',
              ifscCode: 'ICIC0000104',
            },
          }),
        } as any);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: {} }),
      } as any);
    });

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Pooja Agarwal')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Pooja Agarwal'));

    await waitFor(() => {
      expect(screen.getAllByText('POOJA7720A').length).toBeGreaterThan(0);
      expect(screen.getByText('Rajendra Agarwal')).toBeDefined();
    });
  }, 15000);

  it('fetches live KYC record by numeric customerId fallback when email lookup returns 404', async () => {
    const dealWithNumericCustId: Deal = {
      id: 'deal-num-1',
      companyId: 't-ghl-01',
      title: 'Numeric Customer ID Deal',
      customerName: 'Kunal Singhania',
      customerId: 'CUST-883',
      stage: 'qualified_investor',
      status: 'In Progress',
      kycStatus: 'In Progress',
      email: 'kunal.missing@example.com',
      phone: '+91 9811223344',
      value: 3000000,
      createdAt: '2026-02-01T10:00:00Z',
      notes: '',
    } as any;

    vi.mocked(ghlApiService.getDeals).mockResolvedValue([dealWithNumericCustId]);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue([]);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue([]);

    globalThis.fetch = vi.fn().mockImplementation((url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/irm/kyc/all')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [] }),
        } as any);
      }
      if (urlStr.includes('/irm/kyc/by-email')) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({ success: false, message: 'Not found' }),
        } as any);
      }
      if (urlStr.includes('/irm/kyc/883')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              id: 883,
              investorName: 'Kunal Singhania',
              panNumber: 'KUNAL8830K',
              fatherName: 'Vikram Singhania',
              bankName: 'Axis Bank',
              accountNumber: '883000112233',
              ifscCode: 'UTIB0000050',
            },
          }),
        } as any);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: {} }),
      } as any);
    });

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Kunal Singhania')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Kunal Singhania'));

    await waitFor(() => {
      expect(screen.getAllByText('KUNAL8830K').length).toBeGreaterThan(0);
      expect(screen.getByText('Vikram Singhania')).toBeDefined();
    });
  }, 15000);

  it('fetches live KYC record by phone fallback when email lookup 404 and customerId non-numeric', async () => {
    const dealWithPhone: Deal = {
      id: 'deal-phone-1',
      companyId: 't-ghl-01',
      title: 'Phone Match Deal',
      customerName: 'Shalini Verma',
      customerId: 'NON_NUMERIC_ID',
      stage: 'qualified_investor',
      status: 'In Progress',
      kycStatus: 'In Progress',
      email: 'shalini.notfound@example.com',
      phone: '+91 9988776655',
      value: 1200000,
      createdAt: '2026-02-01T10:00:00Z',
      notes: '',
    } as any;

    vi.mocked(ghlApiService.getDeals).mockResolvedValue([dealWithPhone]);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue([]);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue([]);

    globalThis.fetch = vi.fn().mockImplementation((url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/irm/kyc/all')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [] }),
        } as any);
      }
      if (urlStr.includes('/irm/kyc/by-email')) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({ success: false, message: 'Not found' }),
        } as any);
      }
      if (urlStr.includes('/irm/kyc/by-phone')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              id: 664,
              phone: '+91 9988776655',
              investorName: 'Shalini Verma',
              panNumber: 'SHALINI664P',
              fatherName: 'Anil Verma',
            },
          }),
        } as any);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: {} }),
      } as any);
    });

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Shalini Verma')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Shalini Verma'));

    await waitFor(() => {
      expect(screen.getAllByText('SHALINI664P').length).toBeGreaterThan(0);
      expect(screen.getByText('Anil Verma')).toBeDefined();
    });
  }, 15000);

  it('fetches live KYC record via /irm/kyc/all search matching phone, email, and name', async () => {
    const dealAllSearch: Deal = {
      id: 'deal-all-1',
      companyId: 't-ghl-01',
      title: 'All List Search Deal',
      customerName: 'Vikram Malhotra',
      customerId: 'NO_NUM_ID',
      stage: 'qualified_investor',
      status: 'In Progress',
      kycStatus: 'In Progress',
      email: 'vikram.malhotra@example.com',
      phone: '+91 9123456780',
      value: 2500000,
      createdAt: '2026-02-01T10:00:00Z',
      notes: '',
    } as any;

    vi.mocked(ghlApiService.getDeals).mockResolvedValue([dealAllSearch]);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue([]);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue([]);

    globalThis.fetch = vi.fn().mockImplementation((url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/irm/kyc/by-email') || urlStr.includes('/irm/kyc/by-phone')) {
        return Promise.resolve({
          ok: false,
          status: 404,
          json: async () => ({ success: false, message: 'Not found' }),
        } as any);
      }
      if (urlStr.includes('/irm/kyc/all')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: [
              {
                id: 555,
                phone: '+91 9123456780',
                email: 'vikram.malhotra@example.com',
                investorName: 'Vikram Malhotra',
                status: 'Verified',
              },
            ],
          }),
        } as any);
      }
      if (urlStr.includes('/irm/kyc/555')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              id: 555,
              investorName: 'Vikram Malhotra',
              panNumber: 'MALHOTRA555M',
              fatherName: 'Late Somnath Malhotra',
              bankName: 'Kotak Mahindra Bank',
              accountNumber: '555000112233',
              ifscCode: 'KKBK0000958',
            },
          }),
        } as any);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: {} }),
      } as any);
    });

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Vikram Malhotra')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Vikram Malhotra'));

    await waitFor(() => {
      expect(screen.getAllByText('MALHOTRA555M').length).toBeGreaterThan(0);
      expect(screen.getByText('Late Somnath Malhotra')).toBeDefined();
    });
  }, 15000);

  it('gracefully handles live KYC fetch error and falls back to matching lead and customer data', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const fallbackDeal: Deal = {
      id: 'deal-fb-1',
      companyId: 't-ghl-01',
      title: 'Fallback Deal',
      customerName: 'Ananya Deshmukh',
      customerId: 'cust-fb-1',
      stage: 'qualified_investor',
      status: 'In Progress',
      kycStatus: 'In Progress',
      email: 'ananya.deshmukh@example.com',
      phone: '+91 9876500000',
      value: 1800000,
      createdAt: '2026-02-01T10:00:00Z',
      notes: '',
    } as any;

    const matchingLead: Lead = {
      id: 'cust-fb-1',
      companyId: 't-ghl-01',
      name: 'Ananya Deshmukh',
      email: 'ananya.deshmukh@example.com',
      phone: '+91 9876500000',
      status: 'Qualified',
      source: 'Website',
      createdAt: '2026-01-01T00:00:00Z',
      customFields: {
        pan: 'ANANYA999D',
      },
    } as any;

    const matchingCustomer: Customer = {
      id: 'cust-fb-1',
      companyId: 't-ghl-01',
      name: 'Ananya Deshmukh',
      email: 'ananya.deshmukh@example.com',
      phone: '+91 9876500000',
      createdAt: '2026-01-01T00:00:00Z',
      location: 'Navi Mumbai',
    } as any;

    vi.mocked(ghlApiService.getDeals).mockResolvedValue([fallbackDeal]);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue([matchingLead]);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue([matchingCustomer]);

    let initialAllLoaded = false;
    globalThis.fetch = vi.fn().mockImplementation((url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/irm/kyc/all') && !initialAllLoaded) {
        initialAllLoaded = true;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [] }),
        } as any);
      }
      // Fail all live fetch calls to test the catch block (line 669)
      return Promise.reject(new Error('Network connection timeout during live KYC fetch'));
    });

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Ananya Deshmukh')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Ananya Deshmukh'));

    // Dossier should fallback to data from lead and customer
    await waitFor(() => {
      expect(screen.getAllByText('ANANYA999D').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Navi Mumbai').length).toBeGreaterThan(0);
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Error loading live KYC record for customer profile:',
      expect.any(Error)
    );

    consoleWarnSpy.mockRestore();
  }, 15000);

  it('triggers refreshDbKycs on window focus and document visibilitychange and updates warnings on sync failure', async () => {
    const dummyDeal: Deal = {
      id: 'deal-sync-1',
      companyId: 't-ghl-01',
      title: 'Sync Test Deal',
      customerName: 'Sanjay Dutt',
      customerId: 'cust-sync-1',
      stage: 'qualified_investor',
      status: 'In Progress',
      kycStatus: 'In Progress',
      email: 'sanjay@example.com',
      phone: '+91 9833001122',
      value: 1000000,
      createdAt: '2026-02-01T10:00:00Z',
      notes: '',
    } as any;

    vi.mocked(ghlApiService.getDeals).mockResolvedValue([dummyDeal]);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue([]);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue([]);

    let fetchCount = 0;
    globalThis.fetch = vi.fn().mockImplementation((url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/irm/kyc/all')) {
        fetchCount++;
        if (fetchCount === 1) {
          // Initial load succeeds
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ success: true, data: [] }),
          } as any);
        }
        if (fetchCount === 2) {
          // On window focus, simulate HTTP 500 error
          return Promise.resolve({
            ok: false,
            status: 500,
            statusText: 'Internal Server Error',
          } as any);
        }
        // On visibilitychange, simulate Network throw
        return Promise.reject(new Error('Connection terminated'));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: {} }),
      } as any);
    });

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Sanjay Dutt')).toBeDefined();
    });

    // 1. Dispatch focus event -> triggers refreshDbKycs HTTP 500 branch
    window.dispatchEvent(new Event('focus'));

    await waitFor(() => {
      expect(screen.getByText(/Live KYC synchronization failed \(HTTP 500\)/i)).toBeDefined();
    });

    // 2. Dispatch visibilitychange event with document.visibilityState = visible
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(screen.getByText(/Network error: Live KYC synchronization failed/i)).toBeDefined();
    });

    // 3. Dispatch nexus_storage_updated event
    window.dispatchEvent(new Event('nexus_storage_updated'));
    expect(ghlApiService.getDeals).toHaveBeenCalled();
  }, 15000);

  it('handles browser back button (popstate) to exit assisted KYC flow', async () => {
    const dummyDeal: Deal = {
      id: 'deal-pop-1',
      companyId: 't-ghl-01',
      title: 'Popstate Deal',
      customerName: 'Ravi Teja',
      customerId: 'cust-pop-1',
      stage: 'qualified_investor',
      status: 'Assisted Draft',
      kycStatus: 'In Progress',
      customerKycStatus: 'Assisted Draft',
      email: 'ravi.teja@example.com',
      phone: '+91 9777788888',
      value: 1100000,
      createdAt: '2026-02-01T10:00:00Z',
      notes: '',
    } as any;

    vi.mocked(ghlApiService.getDeals).mockResolvedValue([dummyDeal]);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue([]);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue([]);

    globalThis.fetch = vi.fn().mockImplementation((url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/irm/kyc/all')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [] }),
        } as any);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: {} }),
      } as any);
    });

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Ravi Teja')).toBeDefined();
    });

    // Start KYC Flow
    fireEvent.click(screen.getByRole('button', { name: /Resume Draft/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 1 of 5/i)).toBeDefined();
    });

    // Dispatch popstate event to simulate user clicking browser back button
    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => {
      expect(screen.getByText('Ravi Teja')).toBeDefined();
      expect(screen.queryByText(/Step 1 of 5/i)).toBeNull();
    });
  }, 15000);

  it('filters deals for IRM user based on agent assignment and unassigned deals', async () => {
    const deals: Deal[] = [
      {
        id: 'deal-irm-match-id',
        companyId: 't-ghl-01',
        title: 'Assigned by ID',
        customerName: 'Matched By ID User',
        customerId: 'cust-1',
        stage: 'qualified_investor',
        status: 'In Progress',
        assignedAgentId: 'irm-1',
        assignedAgentName: 'Some Other Name',
        value: 1000000,
        createdAt: '2026-02-01T10:00:00Z',
        notes: '',
      } as any,
      {
        id: 'deal-irm-match-name',
        companyId: 't-ghl-01',
        title: 'Assigned by Name',
        customerName: 'Matched By Name User',
        customerId: 'cust-2',
        stage: 'qualified_investor',
        status: 'In Progress',
        assignedAgentId: 'other-id',
        assignedAgentName: 'IRM Officer',
        value: 1200000,
        createdAt: '2026-02-01T10:00:00Z',
        notes: '',
      } as any,
      {
        id: 'deal-irm-unassigned',
        companyId: 't-ghl-01',
        title: 'Unassigned Deal',
        customerName: 'Unassigned User',
        customerId: 'cust-3',
        stage: 'qualified_investor',
        status: 'In Progress',
        value: 800000,
        createdAt: '2026-02-01T10:00:00Z',
        notes: '',
      } as any,
      {
        id: 'deal-irm-other',
        companyId: 't-ghl-01',
        title: 'Other Agent Deal',
        customerName: 'Excluded User',
        customerId: 'cust-4',
        stage: 'qualified_investor',
        status: 'In Progress',
        assignedAgentId: 'different-agent-id',
        assignedAgentName: 'Different Agent',
        value: 900000,
        createdAt: '2026-02-01T10:00:00Z',
        notes: '',
      } as any,
    ];

    vi.mocked(ghlApiService.getDeals).mockResolvedValue(deals);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue([]);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue([]);

    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: [] }),
      } as any)
    );

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Matched By ID User')).toBeDefined();
      expect(screen.getByText('Matched By Name User')).toBeDefined();
      expect(screen.getByText('Unassigned User')).toBeDefined();
      expect(screen.queryByText('Excluded User')).toBeNull();
    });
  }, 15000);
});
