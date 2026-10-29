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

    vi.mocked(ghlApiService.persistDeal).mockResolvedValue({} as any);
    vi.mocked(ghlApiService.addDealActivity).mockResolvedValue({} as any);

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

    globalThis.fetch = vi.fn().mockImplementation((url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/documents')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { fileUrl: 'https://cdn.example.com/mock.pdf' } }),
        } as any);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: [] }),
      } as any);
    });
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
    vi.mocked(ghlApiService.persistDeal).mockResolvedValue({} as any);
    vi.mocked(ghlApiService.addDealActivity).mockResolvedValue({} as any);

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

  it('opens assisted KYC flow and prefills form fields from deal and customer data', async () => {
    vi.mocked(ghlApiService.getDeals).mockResolvedValue(mockDeals);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue(mockLeads);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue(mockCustomers);

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeDefined();
    });

    // Open profile
    fireEvent.click(screen.getByRole('button', { name: 'Aarav Sharma' }));
    await waitFor(() => {
      expect(screen.getByTitle(/Update or submit Assisted KYC details/i)).toBeDefined();
    });

    // Click Update Dossier
    fireEvent.click(screen.getByTitle(/Update or submit Assisted KYC details/i));

    // Verify viewMode is 'flow' and step 1 is displayed
    await waitFor(() => {
      expect(screen.getByText(/Assisted KYC Mode • IRM Onboarding on Behalf/i)).toBeDefined();
      expect(screen.getByLabelText(/Investor Full Name/i)).toBeDefined();
    });

    const nameInput = screen.getByLabelText(/Investor Full Name/i) as HTMLInputElement;
    expect(nameInput.value).toBe('Aarav Sharma');
  });

  it('validates Step 1 required fields and shows validation summary on invalid submission', async () => {
    vi.mocked(ghlApiService.getDeals).mockResolvedValue(mockDeals);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue(mockLeads);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue(mockCustomers);

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Aarav Sharma' }));
    await waitFor(() => {
      expect(screen.getByTitle(/Update or submit Assisted KYC details/i)).toBeDefined();
    });
    fireEvent.click(screen.getByTitle(/Update or submit Assisted KYC details/i));

    await waitFor(() => {
      expect(screen.getByLabelText(/Investor Full Name/i)).toBeDefined();
    });

    // Clear name to trigger validation error
    const nameInput = screen.getByLabelText(/Investor Full Name/i);
    fireEvent.change(nameInput, { target: { value: '' } });

    // Click Continue
    const continueBtn = screen.getByRole('button', { name: /Continue to Identity Details/i });
    fireEvent.click(continueBtn);

    // Expect validation error
    await waitFor(() => {
      expect(screen.getByText(/Full Name is required/i)).toBeDefined();
    });
  });

  it('successfully saves draft and persists metadata locally and to backend', async () => {
    vi.mocked(ghlApiService.getDeals).mockResolvedValue(mockDeals);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue(mockLeads);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue(mockCustomers);

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Aarav Sharma' }));
    await waitFor(() => {
      expect(screen.getByTitle(/Update or submit Assisted KYC details/i)).toBeDefined();
    });
    fireEvent.click(screen.getByTitle(/Update or submit Assisted KYC details/i));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save draft/i })).toBeDefined();
    });

    const saveDraftBtn = screen.getByRole('button', { name: /save draft/i });
    fireEvent.click(saveDraftBtn);

    await waitFor(() => {
      expect(screen.getByText(/Assisted KYC draft saved at Step 1 of 5/i)).toBeDefined();
    });

    const savedDraft = localStorage.getItem('nexus_kyc_draft_deal-101');
    expect(savedDraft).toBeDefined();
    expect(JSON.parse(savedDraft!).isAssisted).toBe(true);
  });

  it('handles save draft failure gracefully and displays warning toast', async () => {
    vi.mocked(ghlApiService.getDeals).mockResolvedValue(mockDeals);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue(mockLeads);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue(mockCustomers);

    // Mock backend draft save failure
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/irm/kyc/assisted-draft')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ message: 'Database down' }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: [] }),
      });
    });

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Aarav Sharma' }));
    await waitFor(() => {
      expect(screen.getByTitle(/Update or submit Assisted KYC details/i)).toBeDefined();
    });
    fireEvent.click(screen.getByTitle(/Update or submit Assisted KYC details/i));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save draft/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(screen.getByText(/Save \/ Upload failed: Database down/i)).toBeDefined();
    });
  });

  it('routes to the correct step when handleCorrectKycDetails is triggered', async () => {
    const dealsWithCorrection: Deal[] = [
      {
        ...mockDeals[0],
        id: 'deal-bank-issue',
        flaggedSections: ['Bank Details'],
        remarks: 'Please update IFSC code',
        kycStatus: 'Needs Correction',
      },
    ];

    vi.mocked(ghlApiService.getDeals).mockResolvedValue(dealsWithCorrection);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue(mockLeads);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue(mockCustomers);

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Aarav Sharma' }));
    await waitFor(() => {
      expect(screen.getByTitle(/Update or submit Assisted KYC details/i)).toBeDefined();
    });

    // Save a draft pointing to Step 3 so resolveKycResumeStep or correction step works
    localStorage.setItem('nexus_kyc_draft_deal-bank-issue', JSON.stringify({ step: 3, savedAt: '2026-03-01' }));
    fireEvent.click(screen.getByTitle(/Update or submit Assisted KYC details/i));

    await waitFor(() => {
      expect(screen.getByText(/Step 3 of 5/i)).toBeDefined();
      expect(screen.getByLabelText(/Bank Name/i)).toBeDefined();
    });
  });

  it('submits assisted KYC successfully with consent and moves to review', async () => {
    vi.mocked(ghlApiService.getDeals).mockResolvedValue(mockDeals);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue(mockLeads);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue(mockCustomers);

    // Save full draft data at step 5
    const fullForm = {
      investorName: 'Aarav Sharma',
      phone: '+91 9876543210',
      email: 'aarav@example.com',
      gender: 'Male',
      investorType: 'Individual / Retail HNW',
      residentType: 'Resident Indian (RI)',
      occupation: 'Business',
      panNumber: 'ABCDE1234F',
      nameAsPerPan: 'AARAV SHARMA',
      aadhaarNumber: '123456789012',
      fatherName: 'Rajesh Sharma',
      dob: '1990-01-01',
      address: '123 Marine Drive',
      courierAddress: '123 Marine Drive',
      country: 'India',
      state: 'Maharashtra',
      city: 'Mumbai',
      pincode: '400001',
      aadhaarDoc: { name: 'aadhaar.pdf', size: '1MB', type: 'application/pdf', url: 'https://ex.com/a.pdf' },
      panDoc: { name: 'pan.pdf', size: '1MB', type: 'application/pdf', url: 'https://ex.com/p.pdf' },
      bankName: 'HDFC Bank',
      accountNumber: '1234567890',
      ifscCode: 'HDFC0001234',
      accountHolderName: 'AARAV SHARMA',
      accountType: 'Savings Account',
      bankProofDoc: { name: 'cheque.pdf', size: '1MB', type: 'application/pdf', url: 'https://ex.com/b.pdf' },
      hasNoDemat: true,
      hasNominee: false,
      nominees: [],
    };
    localStorage.setItem('nexus_kyc_data_deal-101', JSON.stringify(fullForm));
    localStorage.setItem('nexus_kyc_draft_deal-101', JSON.stringify({ step: 5, savedAt: '2026-03-01' }));

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/irm/kyc/assisted-submit')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { id: 999 } }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: [] }),
      });
    });

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Aarav Sharma' }));
    await waitFor(() => {
      expect(screen.getByTitle(/Update or submit Assisted KYC details/i)).toBeDefined();
    });
    fireEvent.click(screen.getByTitle(/Update or submit Assisted KYC details/i));

    await waitFor(() => {
      expect(screen.getByText(/Step 5 of 5/i)).toBeDefined();
      expect(screen.getByRole('button', { name: /Review & Submit on Behalf/i })).toBeDefined();
    });

    // Click Review & Submit
    fireEvent.click(screen.getByRole('button', { name: /Review & Submit on Behalf/i }));

    // Review Modal appears
    await waitFor(() => {
      expect(screen.getByText('Review & Submit Assisted KYC')).toBeDefined();
    });

    // Check customer consent checkbox
    const consentCheck = screen.getByLabelText(/Customer Consent & Authorization/i);
    fireEvent.click(consentCheck);

    // Submit button is now active
    const submitBtn = screen.getByRole('button', { name: /Confirm & Submit for Verification/i });
    expect(submitBtn).toBeDefined();
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Assisted KYC for "Aarav Sharma" submitted for verification!/i)).toBeDefined();
    });
  });

  it('shows error toast when assisted submission fails on backend', async () => {
    vi.mocked(ghlApiService.getDeals).mockResolvedValue(mockDeals);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue(mockLeads);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue(mockCustomers);

    const fullForm = {
      investorName: 'Aarav Sharma',
      phone: '+91 9876543210',
      email: 'aarav@example.com',
      gender: 'Male',
      investorType: 'Individual / Retail HNW',
      residentType: 'Resident Indian (RI)',
      occupation: 'Business',
      panNumber: 'ABCDE1234F',
      nameAsPerPan: 'AARAV SHARMA',
      aadhaarNumber: '123456789012',
      fatherName: 'Rajesh Sharma',
      dob: '1990-01-01',
      address: '123 Marine Drive',
      courierAddress: '123 Marine Drive',
      country: 'India',
      state: 'Maharashtra',
      city: 'Mumbai',
      pincode: '400001',
      aadhaarDoc: { name: 'aadhaar.pdf', size: '1MB', type: 'application/pdf', url: 'https://ex.com/a.pdf' },
      panDoc: { name: 'pan.pdf', size: '1MB', type: 'application/pdf', url: 'https://ex.com/p.pdf' },
      bankName: 'HDFC Bank',
      accountNumber: '1234567890',
      ifscCode: 'HDFC0001234',
      accountHolderName: 'AARAV SHARMA',
      accountType: 'Savings Account',
      bankProofDoc: { name: 'cheque.pdf', size: '1MB', type: 'application/pdf', url: 'https://ex.com/b.pdf' },
      hasNoDemat: true,
      hasNominee: false,
      nominees: [],
    };
    localStorage.setItem('nexus_kyc_data_deal-101', JSON.stringify(fullForm));
    localStorage.setItem('nexus_kyc_draft_deal-101', JSON.stringify({ step: 5, savedAt: '2026-03-01' }));

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (String(url).includes('/irm/kyc/assisted-submit')) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: async () => ({ message: 'Invalid PAN signature' }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: [] }),
      });
    });

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Aarav Sharma' }));
    await waitFor(() => {
      expect(screen.getByTitle(/Update or submit Assisted KYC details/i)).toBeDefined();
    });
    fireEvent.click(screen.getByTitle(/Update or submit Assisted KYC details/i));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Review & Submit on Behalf/i })).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /Review & Submit on Behalf/i }));

    await waitFor(() => {
      expect(screen.getByText('Review & Submit Assisted KYC')).toBeDefined();
    });

    const consentCheck = screen.getByLabelText(/Customer Consent & Authorization/i);
    fireEvent.click(consentCheck);

    const submitBtn = screen.getByRole('button', { name: /Confirm & Submit for Verification/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Failed to submit assisted KYC: Invalid PAN signature/i)).toBeDefined();
    });
  });


  it('navigates through all 5 steps of the KYC flow with form inputs', async () => {
    vi.mocked(ghlApiService.getDeals).mockResolvedValue(mockDeals);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue(mockLeads);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue(mockCustomers);

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Aarav Sharma' }));
    await waitFor(() => {
      expect(screen.getByTitle(/Update or submit Assisted KYC details/i)).toBeDefined();
    });
    fireEvent.click(screen.getByTitle(/Update or submit Assisted KYC details/i));

    // Step 1: Basic Details
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Step 1: Basic Details/i })).toBeDefined();
    });

    // Populate Step 1 inputs
    fireEvent.change(screen.getByLabelText(/Investor Full Name/i), { target: { value: 'Aarav Sharma' } });
    fireEvent.change(screen.getByLabelText(/Phone Number/i), { target: { value: '+91 9876543210' } });
    fireEvent.change(screen.getByLabelText(/Email Address/i), { target: { value: 'aarav@example.com' } });

    // Step 1 -> Step 2
    fireEvent.click(screen.getByRole('button', { name: /Continue to Identity Details/i }));

    // Step 2: Identity & Address
    await waitFor(() => {
      expect(screen.getByLabelText(/PAN Number/i)).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText(/PAN Number/i), { target: { value: 'ABCPE1234F' } });
    fireEvent.change(screen.getByLabelText(/Name \(As per PAN\)/i), { target: { value: 'AARAV SHARMA' } });
    fireEvent.change(screen.getByLabelText(/Aadhaar Number/i), { target: { value: '234567890123' } });
    fireEvent.change(screen.getByLabelText(/Father's Full Name/i), { target: { value: 'Rajesh Sharma' } });
    fireEvent.change(screen.getByLabelText(/Date of Birth/i), { target: { value: '1990-01-01' } });
    fireEvent.change(screen.getByLabelText(/^Permanent Address/i), { target: { value: '123 Marine Drive' } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: 'Mumbai' } });
    fireEvent.change(screen.getByLabelText(/Pincode/i), { target: { value: '400001' } });
    fireEvent.change(screen.getByLabelText(/State/i), { target: { value: 'Maharashtra' } });

    // Upload identity docs for Step 2
    const fileInputs = document.querySelectorAll('input[type="file"]');
    const mockFile = new File(['mock content'], 'id_proof.pdf', { type: 'application/pdf' });
    if (fileInputs[0]) fireEvent.change(fileInputs[0], { target: { files: [mockFile] } });
    if (fileInputs[1]) fireEvent.change(fileInputs[1], { target: { files: [mockFile] } });
    if (fileInputs[2]) fireEvent.change(fileInputs[2], { target: { files: [mockFile] } });

    // Step 2 -> Step 3
    fireEvent.click(screen.getByRole('button', { name: /Continue to Bank Details/i }));
    
    // Step 3: Bank Details
    await waitFor(() => {
      expect(screen.getByLabelText(/Account Number/i)).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText(/Account Number/i), { target: { value: '1234567890' } });
    fireEvent.change(screen.getByLabelText(/IFSC Code/i), { target: { value: 'HDFC0001234' } });
    fireEvent.change(screen.getByLabelText(/Account Holder Name/i), { target: { value: 'AARAV SHARMA' } });

    // Upload bank proof doc for Step 3
    const bankFileInputs = document.querySelectorAll('input[type="file"]');
    if (bankFileInputs[0]) fireEvent.change(bankFileInputs[0], { target: { files: [mockFile] } });

    // Step 3 -> Step 4
    fireEvent.click(screen.getByRole('button', { name: /Continue to Demat Details/i }));

    // Step 4: Demat Details
    await waitFor(() => {
      expect(screen.getByText(/I don't have a Demat account/i)).toBeDefined();
    });

    // Check "I don't have a Demat account" to skip demat docs
    fireEvent.click(screen.getByText(/I don't have a Demat account/i));

    // Step 4 -> Step 5
    fireEvent.click(screen.getByRole('button', { name: /Continue to Nominee Details/i }));

    // Step 5: Nominee Details
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Nominee Details/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /Review & Submit on Behalf/i })).toBeDefined();
    });

    // Test Previous Step button
    fireEvent.click(screen.getByRole('button', { name: /Previous Step/i }));
    await waitFor(() => {
      expect(screen.getByText(/I don't have a Demat account/i)).toBeDefined();
    });

    // Test Exit Flow button
    const backToListBtn = screen.getByTitle(/Exit KYC flow and return to Qualified Investors list/i);
    fireEvent.click(backToListBtn);

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeDefined();
    });
  });

  it('handles nominee declaration toggling, adding, and removing nominees in Step 5', async () => {
    vi.mocked(ghlApiService.getDeals).mockResolvedValue(mockDeals);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue(mockLeads);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue(mockCustomers);

    // Load straight into Step 5 with existing draft
    localStorage.setItem('nexus_kyc_draft_deal-101', JSON.stringify({ step: 5, savedAt: '2026-03-01' }));

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Aarav Sharma' }));
    await waitFor(() => {
      expect(screen.getByTitle(/Update or submit Assisted KYC details/i)).toBeDefined();
    });
    fireEvent.click(screen.getByTitle(/Update or submit Assisted KYC details/i));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Step 5: Nominee Details/i })).toBeDefined();
    });

    // Toggle Declare a Nominee
    const declareNomineeCheckbox = screen.getByRole('checkbox', { name: /Register Nominee/i });
    fireEvent.click(declareNomineeCheckbox);

    // Nominee form fields appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add Nominee/i })).toBeDefined();
    });

    // Add another nominee
    fireEvent.click(screen.getByRole('button', { name: /Add Nominee/i }));

    // Remove a nominee
    const removeBtns = screen.getAllByRole('button', { name: /Remove/i });
    expect(removeBtns.length).toBeGreaterThan(0);
    fireEvent.click(removeBtns[0]);
  });

  it('switches tabs in Customer Profile view and triggers copy actions', async () => {
    vi.mocked(ghlApiService.getDeals).mockResolvedValue(mockDeals);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue(mockLeads);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue(mockCustomers);

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeDefined();
    });

    // Open Profile
    fireEvent.click(screen.getByRole('button', { name: 'Aarav Sharma' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Personal Details' })).toBeDefined();
    });

    // Switch to Bank Details tab
    const bankTab = screen.getByRole('button', { name: /Bank Details/i });
    fireEvent.click(bankTab);

    // Switch to Demat Details tab
    const dematTab = screen.getByRole('button', { name: /Demat Account/i });
    fireEvent.click(dematTab);

    // Switch to All Sections tab
    const allTab = screen.getByRole('button', { name: /All Sections/i });
    fireEvent.click(allTab);

    // Click Copy Email button
    const copyEmailBtn = screen.getAllByTitle('Copy Email')[0];
    fireEvent.click(copyEmailBtn);

    // Click Copy Phone button
    const copyPhoneBtn = screen.getAllByTitle('Copy Phone')[0];
    fireEvent.click(copyPhoneBtn);
  });

  it('validates file uploads and rejects files exceeding MAX_KYC_UPLOAD_BYTES', async () => {
    vi.mocked(ghlApiService.getDeals).mockResolvedValue(mockDeals);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue(mockLeads);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue(mockCustomers);

    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});

    // Open Step 2
    localStorage.setItem('nexus_kyc_draft_deal-101', JSON.stringify({ step: 2, savedAt: '2026-03-01' }));

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Aarav Sharma')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Aarav Sharma' }));
    await waitFor(() => {
      expect(screen.getByTitle(/Update or submit Assisted KYC details/i)).toBeDefined();
    });
    fireEvent.click(screen.getByTitle(/Update or submit Assisted KYC details/i));

    await waitFor(() => {
      expect(screen.getByLabelText(/PAN Number/i)).toBeDefined();
    });

    // Find file inputs
    const fileInputs = document.querySelectorAll('input[type="file"]');
    expect(fileInputs.length).toBeGreaterThan(0);

    // Create an oversized file (> 10MB)
    const largeFile = new File(['x'.repeat(100)], 'huge.pdf', { type: 'application/pdf' });
    Object.defineProperty(largeFile, 'size', { value: 15 * 1024 * 1024 });

    fireEvent.change(fileInputs[0], { target: { files: [largeFile] } });
    expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('File is too large'));

    // Upload a valid file (< 10MB)
    const validFile = new File(['valid content'], 'pan_proof.pdf', { type: 'application/pdf' });
    Object.defineProperty(validFile, 'size', { value: 1024 * 500 });

    fireEvent.change(fileInputs[0], { target: { files: [validFile] } });

    // Expect the file card to render with uploaded status
    await waitFor(() => {
      expect(screen.getByText('pan_proof.pdf')).toBeDefined();
    });

    // Remove the uploaded file
    const removeBtn = screen.getByTitle('Remove document');
    fireEvent.click(removeBtn);
  });

});
