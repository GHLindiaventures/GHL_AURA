import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { CustomersPage } from '../pages/Customers/CustomersPage';
import * as ghlApiService from '../services/ghlApiService';
import * as authContext from '../context/AuthContext';
import { adminUserService } from '../services/adminUserService';
import { Customer, CallRecord, Followup, Deal } from '../types';

vi.mock('../services/ghlApiService', () => ({
  getCustomers: vi.fn(),
  getCalls: vi.fn(),
  getFollowups: vi.fn(),
  getDeals: vi.fn(),
  getLeads: vi.fn(),
  getCompanyIrms: vi.fn(),
  saveCustomer: vi.fn(),
  saveFollowup: vi.fn(),
  saveLead: vi.fn(),
}));

vi.mock('../services/adminUserService', () => ({
  adminUserService: {
    getUsers: vi.fn(),
  },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

describe('CustomersPage Component Tests', () => {
  const mockSalesExecUser = {
    id: 'exec-1',
    name: 'Sales Exec',
    email: 'exec@ghl.com',
    role: { code: 'sales_executive', name: 'Sales Executive' },
    companySlug: 'ghl',
    companyName: 'GHL India Ventures',
  };

  const mockTenantGhl = {
    id: 't-ghl-01',
    slug: 'ghl',
    name: 'GHL India Ventures',
  };

  const mockCustomers: Customer[] = [
    {
      id: 'cust-1',
      companyId: 't-ghl-01',
      name: 'Rajesh Kumar',
      phone: '+91 9876543201',
      email: 'rajesh@example.com',
      status: 'Interested',
      assignedAgentId: 'exec-1',
      assignedAgentName: 'Sales Exec',
      location: 'Mumbai',
      lastContacted: '2026-01-20',
      openDealsCount: 2,
      totalValue: 15000000,
      createdAt: '2026-01-10T10:00:00Z',
      notes: 'Very interested in high-yield debt',
      customFields: {},
    },
    {
      id: 'cust-2',
      companyId: 't-ghl-01',
      name: 'Anita Desai',
      phone: '+91 9876543202',
      email: 'anita@example.com',
      status: 'Active',
      assignedAgentId: 'exec-1',
      assignedAgentName: 'Sales Exec',
      location: 'Delhi',
      lastContacted: '2026-01-21',
      openDealsCount: 1,
      totalValue: 5000000,
      createdAt: '2026-01-11T10:00:00Z',
      notes: 'Follow up next week',
      customFields: {},
    },
  ];

  const mockCalls: CallRecord[] = [
    {
      id: 'call-1',
      companyId: 't-ghl-01',
      contactName: 'Rajesh Kumar',
      contactPhone: '+91 9876543201',
      agentId: 'exec-1',
      agentName: 'Sales Exec',
      direction: 'outbound',
      duration: 180,
      disposition: 'Interested',
      timestamp: '2026-01-20T14:30:00Z',
      notes: 'Discussed fund structure with client',
    },
  ];

  const mockFollowups: Followup[] = [
    {
      id: 'fu-1',
      companyId: 't-ghl-01',
      contactId: 'cust-1',
      contactName: 'Rajesh Kumar',
      contactPhone: '+91 9876543201',
      contactType: 'customer',
      assignedAgentId: 'exec-1',
      assignedAgentName: 'Sales Exec',
      status: 'Pending',
      scheduledAt: '2026-01-25T11:00:00Z',
      priority: 'High',
      notes: 'Send presentation pitch deck',
    },
  ];

  const mockDeals: Deal[] = [
    {
      id: 'deal-1',
      companyId: 't-ghl-01',
      title: 'Senior Secured Credit',
      customerId: 'cust-1',
      customerName: 'Rajesh Kumar',
      stage: 'qualified_investor',
      value: 10000000,
      expectedCloseDate: '2026-02-15',
      createdAt: '2026-01-15T10:00:00Z',
      assignedAgentId: 'exec-1',
      assignedAgentName: 'Sales Exec',
      notes: 'Promising prospect',
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();

    vi.mocked(authContext.useAuth).mockReturnValue({
      user: mockSalesExecUser,
      tenant: mockTenantGhl,
      permissions: ['view_customers', 'manage_customers'],
      isAuthenticated: true,
      token: 'jwt-token',
      login: vi.fn(),
      logout: vi.fn(),
      switchTenant: vi.fn(),
      availableTenants: [mockTenantGhl],
      refreshSession: vi.fn(),
      loading: false,
    } as any);

    vi.mocked(ghlApiService.getCustomers).mockResolvedValue(mockCustomers);
    vi.mocked(ghlApiService.getCalls).mockResolvedValue(mockCalls);
    vi.mocked(ghlApiService.getFollowups).mockResolvedValue(mockFollowups);
    vi.mocked(ghlApiService.getDeals).mockResolvedValue(mockDeals);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue([]);
    vi.mocked(ghlApiService.getCompanyIrms).mockResolvedValue([]);
    vi.mocked(adminUserService.getUsers).mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders customer accounts in directory and selects first customer by default', async () => {
    render(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Rajesh Kumar').length).toBeGreaterThan(0);
    });

    expect(screen.getByText('Anita Desai')).toBeDefined();

    // Check cockpit 360 header displays selected customer
    expect(screen.getByRole('heading', { name: 'Rajesh Kumar' })).toBeDefined();
    expect(screen.getByText('Customer Accounts')).toBeDefined();
  });

  it('switches selected customer when clicking on another customer item in the sidebar', async () => {
    render(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Rajesh Kumar').length).toBeGreaterThan(0);
    });

    // Click Anita Desai in the sidebar directory
    const anitaItem = screen.getByText('Anita Desai');
    fireEvent.click(anitaItem);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Anita Desai' })).toBeDefined();
    });
  });

  it('navigates through Customer 360 cockpit tabs (overview, calls, followups, timeline, documents)', async () => {
    render(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Rajesh Kumar' })).toBeDefined();
    });

    // Overview is active initially
    expect(screen.getByText(/Account & Commercial Profile/i)).toBeDefined();

    // Click Calls tab
    const callsTab = screen.getByRole('button', { name: /calls/i });
    fireEvent.click(callsTab);

    await waitFor(() => {
      expect(screen.getByText(/Customer Call History/i)).toBeDefined();
    });

    // Click Follow-ups tab
    const followupsTab = screen.getByRole('button', { name: /follow-ups/i });
    fireEvent.click(followupsTab);

    await waitFor(() => {
      expect(screen.getByText(/Send presentation pitch deck/i)).toBeDefined();
    });

    // Click Timeline tab
    const timelineTab = screen.getByRole('button', { name: /activity timeline/i });
    fireEvent.click(timelineTab);

    await waitFor(() => {
      expect(document.querySelector('.timeline-container') || document.querySelector('.timeline-empty')).toBeDefined();
    });

    // Click Documents tab
    const docsTab = screen.getByRole('button', { name: /documents/i });
    fireEvent.click(docsTab);

    await waitFor(() => {
      expect(screen.getByText(/Customer Documents/i)).toBeDefined();
    });
  });

  it('renders gracefully when customer list is empty', async () => {
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue([]);
    vi.mocked(ghlApiService.getCalls).mockResolvedValue([]);
    vi.mocked(ghlApiService.getFollowups).mockResolvedValue([]);
    vi.mocked(ghlApiService.getDeals).mockResolvedValue([]);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue([]);

    render(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText('Customer Accounts')).toBeDefined();
    });

    // No customer is selected, heading for customer name is absent
    expect(screen.queryByRole('heading', { name: 'Rajesh Kumar' })).toBeNull();
  });

  it('renders error alert banner when getCustomers fails', async () => {
    vi.mocked(ghlApiService.getCustomers).mockRejectedValue(new Error('Database connection failed'));

    render(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getByText(/Database connection failed/i)).toBeDefined();
    });
  });

  it('toggles Assign to IRM mode for Sales Executive in GHL tenant', async () => {
    render(<CustomersPage />);

    await waitFor(() => {
      expect(screen.getAllByText('Rajesh Kumar').length).toBeGreaterThan(0);
    });

    // Sales Executive in GHL sees Assign Leads to IRM button
    const assignBtn = screen.getByRole('button', { name: /assign.*irm/i });
    expect(assignBtn).toBeDefined();

    fireEvent.click(assignBtn);

    // In assign mode, checkbox is rendered for eligible customers
    await waitFor(() => {
      const checkbox = screen.getByLabelText(/Select Rajesh Kumar/i);
      expect(checkbox).toBeDefined();
    });
  });
});
