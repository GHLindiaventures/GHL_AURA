import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { KYCPage } from '../pages/KYC/KYCPage';
import * as ghlApiService from '../services/ghlApiService';
import * as authContext from '../context/AuthContext';
import * as callContext from '../context/CallContext';
import { storageService } from '../services/storageService';
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

describe('KYCPage Component Tests', () => {
  const originalFetch = globalThis.fetch;

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

  const mockDeals: Deal[] = [
    {
      id: 'deal-101',
      companyId: 't-ghl-01',
      title: 'Invest in High Yield Fund',
      customerName: 'Aarav Sharma',
      customerId: 'cust-1',
      phone: '+91 9876543210',
      email: 'aarav@example.com',
      location: 'Mumbai',
      stage: 'qualified_investor',
      value: 5000000,
      investmentRange: '₹5 Cr – ₹10 Cr',
      expectedCloseDate: '2026-03-01',
      createdAt: '2026-01-15T10:00:00Z',
      assignedAgentId: 'irm-1',
      assignedAgentName: 'IRM Officer',
      notes: '',
      kycStatus: 'Pending',
    },
    {
      id: 'deal-102',
      companyId: 't-ghl-01',
      title: 'Tech Growth Fund',
      customerName: 'Priya Patel',
      customerId: 'cust-2',
      phone: '+91 9876543211',
      email: 'priya@example.com',
      location: 'Bengaluru',
      stage: 'qualified_investor',
      value: 10000000,
      investmentRange: '₹10 Cr – ₹25 Cr',
      expectedCloseDate: '2026-03-01',
      createdAt: '2026-01-16T10:00:00Z',
      assignedAgentId: 'irm-1',
      assignedAgentName: 'IRM Officer',
      notes: '',
      kycStatus: 'Verified',
      verifiedBy: 'IRM Officer',
    },
    {
      id: 'deal-103',
      companyId: 't-ghl-01',
      title: 'Real Estate Fund',
      customerName: 'Vikram Singh',
      customerId: 'cust-3',
      phone: '+91 9876543212',
      email: 'vikram@example.com',
      location: 'Delhi',
      stage: 'qualified_investor',
      value: 2000000,
      investmentRange: '₹1 Cr – ₹5 Cr',
      expectedCloseDate: '2026-03-01',
      createdAt: '2026-01-17T10:00:00Z',
      assignedAgentId: 'irm-1',
      assignedAgentName: 'IRM Officer',
      notes: '',
      kycStatus: 'Pending',
      customerKycStatus: 'Submitted',
    },
  ];

  const mockLeads: Lead[] = [
    {
      id: 'lead-1',
      companyId: 't-ghl-01',
      name: 'Aarav Sharma',
      phone: '+91 9876543210',
      email: 'aarav@example.com',
      status: 'Interested',
      source: 'Inbound',
      priority: 'High',
      assignedAgentId: 'irm-1',
      assignedAgentName: 'IRM Officer',
      location: 'Mumbai',
      createdAt: '2026-01-10T10:00:00Z',
      notes: '',
      customFields: {},
    },
  ];

  const mockCustomers: Customer[] = [
    {
      id: 'cust-1',
      companyId: 't-ghl-01',
      name: 'Aarav Sharma',
      phone: '+91 9876543210',
      email: 'aarav@example.com',
      status: 'Active',
      assignedAgentId: 'irm-1',
      assignedAgentName: 'IRM Officer',
      location: 'Mumbai',
      createdAt: '2026-01-10T10:00:00Z',
      openDealsCount: 1,
      totalValue: 5000000,
      lastContacted: '2026-01-12',
      notes: '',
      customFields: {},
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();

    vi.mocked(authContext.useAuth).mockReturnValue({
      user: mockUserIrm,
      tenant: mockTenantGhl,
      permissions: ['view_deals', 'edit_kyc'],
      isAuthenticated: true,
      token: 'jwt-token',
      login: vi.fn(),
      logout: vi.fn(),
      switchTenant: vi.fn(),
      availableTenants: [mockTenantGhl],
      refreshSession: vi.fn(),
      loading: false,
    } as any);

    vi.mocked(callContext.useCall).mockReturnValue({
      activeCall: null,
      callHistory: [],
      initiateCall: vi.fn(),
      endCall: vi.fn(),
      toggleMute: vi.fn(),
      toggleHold: vi.fn(),
      sendDtmf: vi.fn(),
      isMuted: false,
      isOnHold: false,
      isDialpadOpen: false,
      setIsDialpadOpen: vi.fn(),
    } as any);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: [] }),
    } as any);
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it('renders loading state initially while fetching KYC data', () => {
    vi.mocked(ghlApiService.getDeals).mockReturnValue(new Promise(() => {}));
    vi.mocked(ghlApiService.getLeads).mockReturnValue(new Promise(() => {}));
    vi.mocked(ghlApiService.getCustomers).mockReturnValue(new Promise(() => {}));

    render(<KYCPage />);
    expect(screen.getByText(/Loading Qualified Investors\.\.\./i)).toBeDefined();
  });

  it('renders successfully with representative mocked deals and KPI metrics', async () => {
    vi.mocked(ghlApiService.getDeals).mockResolvedValue(mockDeals);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue(mockLeads);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue(mockCustomers);

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeDefined();
    });

    expect(screen.getByText('Priya Patel')).toBeDefined();
    expect(screen.getByText('Vikram Singh')).toBeDefined();

    // Check KPI cards / filters are rendered
    expect(screen.getByText(/Total in KYC/i)).toBeDefined();
    expect(screen.getByText(/Awaiting Verification/i)).toBeDefined();
    expect(screen.getByText(/Pending Submission/i)).toBeDefined();
    expect(screen.getByText('Verified & Qualified')).toBeDefined();
  });

  it('renders empty state when there are no qualified investors', async () => {
    vi.mocked(ghlApiService.getDeals).mockResolvedValue([]);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue([]);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue([]);

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('No Qualified Investors')).toBeDefined();
    });
    expect(screen.getByText(/No investors currently in the Qualified Investor \/ KYC stage\./i)).toBeDefined();
  });

  it('renders error banner when getDeals fails and retries on button click', async () => {
    vi.mocked(ghlApiService.getDeals).mockRejectedValueOnce(new Error('Network error loading deals'));
    vi.mocked(ghlApiService.getLeads).mockResolvedValue([]);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue([]);

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load KYC data from server\./i)).toBeDefined();
    });

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeDefined();

    // Now mock success for retry
    vi.mocked(ghlApiService.getDeals).mockResolvedValue(mockDeals);
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeDefined();
    });
  });

  it('shows live sync warning when /irm/kyc/all returns an error but deals are loaded', async () => {
    vi.mocked(ghlApiService.getDeals).mockResolvedValue(mockDeals);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue(mockLeads);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue(mockCustomers);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    } as any);

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText(/Live Sync Warning:/i)).toBeDefined();
    });
    expect(screen.getByRole('button', { name: /Retry Live Sync/i })).toBeDefined();
  });

  it('filters rows when user clicks on KPI filters', async () => {
    vi.mocked(ghlApiService.getDeals).mockResolvedValue(mockDeals);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue(mockLeads);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue(mockCustomers);

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeDefined();
    });

    // Find the Verified KPI card/filter button
    const verifiedBtn = screen.getByText('Verified & Qualified').closest('[role="button"]');
    if (verifiedBtn) {
      fireEvent.click(verifiedBtn);

      await waitFor(() => {
        expect(screen.getByText('Priya Patel')).toBeDefined();
        expect(screen.queryByText('Aarav Sharma')).toBeNull();
      });

      // Restore All
      const allBtn = screen.getByText(/Total in KYC/i).closest('[role="button"]');
      if (allBtn) {
        fireEvent.click(allBtn);
        await waitFor(() => {
          expect(screen.getByText('Aarav Sharma')).toBeDefined();
        });
      }
    }
  });

  it('filters rows when typing in the search input', async () => {
    vi.mocked(ghlApiService.getDeals).mockResolvedValue(mockDeals);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue(mockLeads);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue(mockCustomers);

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText(/Search by investor, phone, city\.\.\./i);
    fireEvent.change(searchInput, { target: { value: 'Bengaluru' } });

    await waitFor(() => {
      expect(screen.getByText('Priya Patel')).toBeDefined();
      expect(screen.queryByText('Aarav Sharma')).toBeNull();
      expect(screen.queryByText('Vikram Singh')).toBeNull();
    });
  });

  it('opens customer profile view on clicking customer name and allows returning to table', async () => {
    vi.mocked(ghlApiService.getDeals).mockResolvedValue(mockDeals);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue(mockLeads);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue(mockCustomers);

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeDefined();
    });

    const customerNameBtn = screen.getByRole('button', { name: 'Aarav Sharma' });
    fireEvent.click(customerNameBtn);

    // Profile view displays the back button in the header
    await waitFor(() => {
      expect(screen.getByTitle(/Return to Qualified Investors list/i)).toBeDefined();
    });

    // Click back to table
    const backBtn = screen.getByTitle(/Return to Qualified Investors list/i);
    fireEvent.click(backBtn);

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeDefined();
      expect(screen.getByPlaceholderText(/Search by investor, phone, city\.\.\./i)).toBeDefined();
    });
  });

  it('renders OriginalKYCView when user is in a non-GHL tenant', async () => {
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: { id: 'agent-1', name: 'Agent', role: { code: 'sales_executive' } },
      tenant: { id: 'other-1', slug: 'other-tenant', name: 'Other Org' },
      permissions: [],
      isAuthenticated: true,
      token: 'jwt-token',
      login: vi.fn(),
      logout: vi.fn(),
      switchTenant: vi.fn(),
      availableTenants: [],
      refreshSession: vi.fn(),
      loading: false,
    } as any);

    vi.spyOn(storageService, 'getDeals').mockReturnValue(mockDeals);

    const { container } = render(<KYCPage />);

    // In OriginalKYCView, there is no kyc-kpi-container (only GHL IRM has it)
    expect(container.querySelector('.kyc-kpi-container')).toBeNull();
    expect(screen.getByText('Aarav Sharma')).toBeDefined();
  });
});
