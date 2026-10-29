import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
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

describe('KYCPage OriginalKYCView (Non-GHL Tenant) Tests', () => {
  const originalFetch = globalThis.fetch;
  const mockInitiateCall = vi.fn();

  const mockNonGhlUser = {
    id: 'user-sales-1',
    name: 'Rajesh Sharma',
    email: 'rajesh@acme.com',
    role: { code: 'sales_executive', name: 'Sales Executive' },
    companySlug: 'acme',
    companyName: 'Acme Capital',
  };

  const mockNonGhlTenant = {
    id: 't-acme-99',
    slug: 'acme',
    name: 'Acme Capital',
  };

  const sampleDeals: Deal[] = [
    {
      id: 'deal-acme-1',
      companyId: 't-acme-99',
      title: 'Commercial Office Space Pune',
      customerName: 'Rahul Kirloskar',
      customerId: 'cust-acme-1',
      stage: 'qualified_investor',
      status: 'In Progress',
      kycStatus: 'Verified',
      email: 'rahul.k@acme.com',
      phone: '+91 9876543210',
      location: 'Pune',
      investmentRange: '₹50,00,000 - ₹1,00,00,000',
      value: 7500000,
      assignedAgentId: 'agent-101',
      assignedAgentName: 'Ananya Iyer',
      stageEnteredAt: '2026-02-01T10:00:00Z',
      createdAt: '2026-02-01T10:00:00Z',
      notes: '',
    } as any,
    {
      id: 'deal-acme-2',
      companyId: 't-acme-99',
      title: 'Residential Villa Deal',
      customerName: 'Meera Nair',
      customerId: 'cust-acme-2',
      stage: 'qualified_investor',
      status: 'In Progress',
      kycStatus: 'Verified',
      email: 'meera.nair@acme.com',
      phone: '+91 9123456789',
      location: 'Kochi',
      value: 0,
      assignedAgentId: 'agent-102',
      assignedAgentName: 'Vikram Joshi',
      stageEnteredAt: '2026-02-10T10:00:00Z',
      createdAt: '2026-02-10T10:00:00Z',
      notes: '',
    } as any,
    {
      id: 'deal-acme-3-excluded',
      companyId: 't-acme-99',
      title: 'Excluded Won Deal',
      customerName: 'Excluded Investor',
      customerId: 'cust-acme-3',
      stage: 'deal_won',
      status: 'Won',
      kycStatus: 'Verified',
      value: 5000000,
      createdAt: '2026-02-01T10:00:00Z',
      notes: '',
    } as any,
  ];

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();

    vi.mocked(authContext.useAuth).mockReturnValue({
      user: mockNonGhlUser,
      tenant: mockNonGhlTenant,
      isAuthenticated: true,
      role: 'sales_executive',
      permissions: ['view_kyc', 'edit_kyc'],
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

    vi.spyOn(storageService, 'getDeals').mockReturnValue([...sampleDeals]);
    vi.spyOn(storageService, 'getLeads').mockReturnValue([] as Lead[]);
    vi.spyOn(storageService, 'getCustomers').mockReturnValue([] as Customer[]);
    vi.spyOn(storageService, 'addDealActivity').mockImplementation(() => undefined as any);

    vi.mocked(ghlApiService.persistDeal).mockResolvedValue({} as any);

    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: [] }),
      } as any)
    );
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it('renders OriginalKYCView table with qualified investors, contact details, badges, and action buttons', async () => {
    render(<KYCPage />);

    // Header check
    expect(screen.getByText(/Qualified Investor & KYC Verification/i)).toBeDefined();
    expect(screen.getByText(/SEBI compliance checked, ticket size verified/i)).toBeDefined();

    // Table rows check
    expect(screen.getByText('Rahul Kirloskar')).toBeDefined();
    expect(screen.getByText('Commercial Office Space Pune')).toBeDefined();
    expect(screen.getByText('Meera Nair')).toBeDefined();
    expect(screen.getByText('Residential Villa Deal')).toBeDefined();

    // Excluded stage check
    expect(screen.queryByText('Excluded Investor')).toBeNull();

    // Contact details check
    expect(screen.getByText('+91 9876543210')).toBeDefined();
    expect(screen.getByText('rahul.k@acme.com')).toBeDefined();

    // Location check
    expect(screen.getByText('Pune')).toBeDefined();
    expect(screen.getByText('Kochi')).toBeDefined();

    // Capacity badges
    expect(screen.getByText('₹50,00,000 - ₹1,00,00,000')).toBeDefined();
    expect(screen.getAllByText(/Not Specified/i).length).toBeGreaterThan(0);

    // Assigned IRM check
    expect(screen.getAllByText('Ananya Iyer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Vikram Joshi').length).toBeGreaterThan(0);

    // Advance buttons exist
    const advanceButtons = screen.getAllByRole('button', { name: /^Advance$/i });
    expect(advanceButtons.length).toBe(2);
  }, 15000);

  it('filters deals by text search across investor name, phone, title, and location', async () => {
    render(<KYCPage />);

    expect(screen.getByText('Rahul Kirloskar')).toBeDefined();
    expect(screen.getByText('Meera Nair')).toBeDefined();

    const searchInput = screen.getByPlaceholderText(/Search by investor, phone, city.../i);

    // 1. Search by name
    fireEvent.change(searchInput, { target: { value: 'Rahul' } });
    expect(screen.getByText('Rahul Kirloskar')).toBeDefined();
    expect(screen.queryByText('Meera Nair')).toBeNull();

    // 2. Search by phone
    fireEvent.change(searchInput, { target: { value: '9123456789' } });
    expect(screen.queryByText('Rahul Kirloskar')).toBeNull();
    expect(screen.getByText('Meera Nair')).toBeDefined();

    // 3. Search by title
    fireEvent.change(searchInput, { target: { value: 'Commercial Office' } });
    expect(screen.getByText('Rahul Kirloskar')).toBeDefined();
    expect(screen.queryByText('Meera Nair')).toBeNull();

    // 4. Search by location
    fireEvent.change(searchInput, { target: { value: 'Kochi' } });
    expect(screen.queryByText('Rahul Kirloskar')).toBeNull();
    expect(screen.getByText('Meera Nair')).toBeDefined();

    // 5. Non-matching search query shows empty state
    fireEvent.change(searchInput, { target: { value: 'NonExistentQuery' } });
    expect(screen.queryByText('Rahul Kirloskar')).toBeNull();
    expect(screen.queryByText('Meera Nair')).toBeNull();
    expect(screen.getByText('No Qualified Investors')).toBeDefined();
    expect(screen.getByText('No investors currently in the Qualified Investor / KYC stage.')).toBeDefined();
  }, 15000);

  it('filters deals by assigned IRM agent and clears filter via onClearAll', async () => {
    render(<KYCPage />);

    expect(screen.getByText('Rahul Kirloskar')).toBeDefined();
    expect(screen.getByText('Meera Nair')).toBeDefined();

    // Locate the select menu for agent filter
    const agentSelect = screen.getByRole('combobox');
    expect(agentSelect).toBeDefined();

    // Filter by Ananya Iyer
    fireEvent.change(agentSelect, { target: { value: 'Ananya Iyer' } });
    expect(screen.getByText('Rahul Kirloskar')).toBeDefined();
    expect(screen.queryByText('Meera Nair')).toBeNull();

    // Filter by Vikram Joshi
    fireEvent.change(agentSelect, { target: { value: 'Vikram Joshi' } });
    expect(screen.queryByText('Rahul Kirloskar')).toBeNull();
    expect(screen.getByText('Meera Nair')).toBeDefined();

    // Clear all filters via Clear All button
    const clearButton = screen.queryByRole('button', { name: /Clear Filters/i }) || screen.queryByText(/Clear/i);
    if (clearButton) {
      fireEvent.click(clearButton);
      expect(screen.getByText('Rahul Kirloskar')).toBeDefined();
      expect(screen.getByText('Meera Nair')).toBeDefined();
    }
  }, 15000);

  it('advances stage from table action button, logs deal activity, and shows success toast', async () => {
    render(<KYCPage />);

    const advanceButtons = screen.getAllByRole('button', { name: /^Advance$/i });
    expect(advanceButtons.length).toBeGreaterThan(0);

    // Advance the first deal (Rahul Kirloskar)
    fireEvent.click(advanceButtons[0]);

    await waitFor(() => {
      expect(ghlApiService.persistDeal).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'deal-acme-1',
          stage: 'investment_opportunity',
        })
      );
      expect(storageService.addDealActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          dealId: 'deal-acme-1',
          fromStage: 'qualified_investor',
          toStage: 'investment_opportunity',
          type: 'stage_change',
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Investor "Rahul Kirloskar" advanced to Investment Opportunity!/i)).toBeDefined();
    });
  }, 15000);

  it('handles persistDeal rejection in handleAdvanceStage and shows error toast', async () => {
    vi.mocked(ghlApiService.persistDeal).mockRejectedValueOnce(new Error('Persistence failed'));

    render(<KYCPage />);

    const advanceButtons = screen.getAllByRole('button', { name: /^Advance$/i });
    fireEvent.click(advanceButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Error saving deal:/i)).toBeDefined();
    });
  }, 15000);

  it('initiates phone consultation when clicking call button in table column', async () => {
    render(<KYCPage />);

    const callButtons = screen.getAllByRole('button', { name: /Call Rahul Kirloskar/i });
    expect(callButtons.length).toBeGreaterThan(0);

    fireEvent.click(callButtons[0]);

    expect(mockInitiateCall).toHaveBeenCalledWith(
      'Rahul Kirloskar',
      '+91 9876543210',
      'customer',
      'cust-acme-1',
      undefined,
      'kyc'
    );
  }, 15000);

  it('opens KYC Dossier modal, interacts with modal actions, and closes modal', async () => {
    render(<KYCPage />);

    // Click the row actions menu button for Rahul Kirloskar
    const moreButtons = document.querySelectorAll('button > svg.lucide-more-vertical, button > svg.lucide-ellipsis-vertical');
    expect(moreButtons.length).toBeGreaterThan(0);

    fireEvent.click(moreButtons[0].parentElement!);

    // Click 'View KYC Dossier'
    const viewDossierOption = screen.getByText('View KYC Dossier');
    fireEvent.click(viewDossierOption);

    // Modal should now be open
    await waitFor(() => {
      expect(screen.getByText('Verified & Eligible')).toBeDefined();
    });

    // Advance deal from inside the modal
    const confirmAdvanceBtn = screen.getByRole('button', { name: /Confirm KYC & Advance to Opportunity/i });
    fireEvent.click(confirmAdvanceBtn);

    await waitFor(() => {
      expect(ghlApiService.persistDeal).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'deal-acme-1',
          stage: 'investment_opportunity',
        })
      );
    });

    // Open modal again for second deal and test close button
    const moreButtons2 = document.querySelectorAll('button > svg.lucide-more-vertical, button > svg.lucide-ellipsis-vertical');
    fireEvent.click(moreButtons2[1].parentElement!);
    fireEvent.click(screen.getByText('View KYC Dossier'));

    await waitFor(() => {
      expect(screen.getByText('Verified & Eligible')).toBeDefined();
    });

    const closeBtns = screen.getAllByRole('button', { name: /Close/i });
    fireEvent.click(closeBtns[0]);

    await waitFor(() => {
      expect(screen.queryByText('Verified & Eligible')).toBeNull();
    });
  }, 15000);

  it('triggers row action Advance to Opportunity and Call Investor from menu', async () => {
    render(<KYCPage />);

    const moreButtons = document.querySelectorAll('button > svg.lucide-more-vertical, button > svg.lucide-ellipsis-vertical');
    fireEvent.click(moreButtons[0].parentElement!);

    // Click 'Call Investor'
    const callInvestorOption = screen.getByText('Call Investor');
    fireEvent.click(callInvestorOption);

    expect(mockInitiateCall).toHaveBeenCalledWith(
      'Rahul Kirloskar',
      '+91 9876543210',
      'customer',
      'cust-acme-1',
      undefined,
      'kyc'
    );

    // Re-open menu and click 'Advance to Opportunity'
    fireEvent.click(moreButtons[0].parentElement!);
    const advanceOption = screen.getByText('Advance to Opportunity');
    fireEvent.click(advanceOption);

    await waitFor(() => {
      expect(ghlApiService.persistDeal).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'deal-acme-1',
          stage: 'investment_opportunity',
        })
      );
    });
  }, 15000);

  it('reloads data on nexus_storage_updated event with debounce', async () => {
    render(<KYCPage />);

    expect(storageService.getDeals).toHaveBeenCalled();

    // Dispatch custom event
    act(() => {
      window.dispatchEvent(new Event('nexus_storage_updated'));
    });

    await waitFor(() => {
      expect(storageService.getDeals).toHaveBeenCalledTimes(2);
    }, { timeout: 1000 });
  }, 15000);
});
