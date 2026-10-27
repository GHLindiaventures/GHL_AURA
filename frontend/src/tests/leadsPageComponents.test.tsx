import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { LeadsPage } from '../pages/Leads/LeadsPage';
import * as ghlApiService from '../services/ghlApiService';
import * as authContext from '../context/AuthContext';
import * as callContext from '../context/CallContext';
import { apiClient } from '../services/apiClient';
import { Lead } from '../types';

vi.mock('../services/ghlApiService', () => ({
  getLeads: vi.fn(),
  getDeals: vi.fn(),
  getCustomers: vi.fn(),
  getCalls: vi.fn().mockResolvedValue([]),
  getFollowups: vi.fn(),
  getCompanyIrms: vi.fn(),
  saveLead: vi.fn(),
  saveCustomer: vi.fn(),
  saveOpportunity: vi.fn(),
  saveFollowup: vi.fn(),
  isTenantMatch: vi.fn().mockReturnValue(true),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../context/CallContext', () => ({
  useCall: vi.fn(),
}));

describe('LeadsPage Component Tests', () => {
  const mockUser = {
    id: 'agent-1',
    name: 'Agent Smith',
    email: 'agent@ghl.com',
    role: { code: 'sales_executive', name: 'Sales Executive' },
    companySlug: 'ghl',
    companyName: 'GHL India Ventures',
  };

  const mockTenant = {
    id: 't-ghl-01',
    slug: 'ghl',
    name: 'GHL India Ventures',
  };

  const mockLeads: Lead[] = [
    {
      id: 'lead-1',
      name: 'Siddharth Varma',
      phone: '+91 9123456789',
      email: 'siddharth@example.com',
      status: 'New',
      source: 'Inbound',
      priority: 'High',
      companyId: 't-ghl-01',
      location: 'Mumbai',
      createdAt: '2026-01-15T09:00:00Z',
      assignedAgentId: 'agent-1',
      assignedAgentName: 'Agent Smith',
      notes: 'Inbound enquiry via website',
      customFields: {},
    },
    {
      id: 'lead-2',
      name: 'Meera Nambiar',
      phone: '+91 9123456790',
      email: 'meera@example.com',
      status: 'New',
      source: 'Inbound',
      priority: 'High',
      companyId: 't-ghl-01',
      location: 'Chennai',
      createdAt: '2026-01-16T11:00:00Z',
      assignedAgentId: 'agent-1',
      assignedAgentName: 'Agent Smith',
      notes: 'Requested product details',
      customFields: {},
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();

    vi.spyOn(apiClient, 'isMockMode').mockReturnValue(false);

    vi.mocked(authContext.useAuth).mockReturnValue({
      user: mockUser,
      tenant: mockTenant,
      permissions: ['view_leads', 'manage_leads'],
      isAuthenticated: true,
      token: 'jwt-token',
      login: vi.fn(),
      logout: vi.fn(),
      switchTenant: vi.fn(),
      availableTenants: [mockTenant],
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

    vi.mocked(ghlApiService.getLeads).mockResolvedValue(mockLeads);
    vi.mocked(ghlApiService.getDeals).mockResolvedValue([]);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue([]);
    vi.mocked(ghlApiService.getCalls).mockResolvedValue([]);
    vi.mocked(ghlApiService.getFollowups).mockResolvedValue([]);
    vi.mocked(ghlApiService.getCompanyIrms).mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders leads in DataTable with representative data', async () => {
    render(<LeadsPage />);

    await waitFor(() => {
      expect(screen.getByText('Siddharth Varma')).toBeDefined();
    });

    expect(screen.getByText('Meera Nambiar')).toBeDefined();
    expect(screen.getByText(/Capture, qualify, call, and convert inbound prospects/i)).toBeDefined();
  });

  it('filters leads when searching in the search bar', async () => {
    render(<LeadsPage />);

    await waitFor(() => {
      expect(screen.getByText('Siddharth Varma')).toBeDefined();
    });

    const searchInput = screen.getByPlaceholderText(/Search leads by name, phone, or location\.\.\./i);
    fireEvent.change(searchInput, { target: { value: 'Chennai' } });

    await waitFor(() => {
      expect(screen.getByText('Meera Nambiar')).toBeDefined();
      expect(screen.queryByText('Siddharth Varma')).toBeNull();
    });
  });

  it('renders empty state when there are no leads', async () => {
    vi.mocked(ghlApiService.getLeads).mockResolvedValue([]);

    render(<LeadsPage />);

    await waitFor(() => {
      expect(screen.getByText('No leads matching criteria')).toBeDefined();
    });
    expect(screen.getByText(/Create a new lead or clear your filters to display inbound leads\./i)).toBeDefined();
  });

  it('renders error banner when getLeads fails', async () => {
    vi.mocked(ghlApiService.getLeads).mockRejectedValue(new Error('Network failure loading leads'));

    render(<LeadsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Network failure loading leads/i)).toBeDefined();
    });
  });

  it('triggers manual refresh on clicking Refresh button', async () => {
    render(<LeadsPage />);

    await waitFor(() => {
      expect(screen.getByText('Siddharth Varma')).toBeDefined();
    });

    const refreshBtn = screen.getByRole('button', { name: /refresh/i });
    expect(refreshBtn).toBeDefined();

    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(ghlApiService.getLeads).toHaveBeenCalledTimes(2);
    });
  });

  it('opens detail drawer when clicking a lead row', async () => {
    render(<LeadsPage />);

    await waitFor(() => {
      expect(screen.getByText('Siddharth Varma')).toBeDefined();
    });

    // Click on Siddharth Varma's name
    const leadNameBtn = screen.getByText('Siddharth Varma');
    fireEvent.click(leadNameBtn);

    // Detail drawer opens and displays lead information
    await waitFor(() => {
      expect(screen.getAllByText('Siddharth Varma').length).toBeGreaterThan(1);
    });
  });
});
