import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as ghlApiService from '../services/ghlApiService';
import { apiClient } from '../services/apiClient';
import { storageService } from '../services/storageService';
import type { Deal, Lead, Followup, Customer, CallRecord, Investor, InvestmentOpportunity } from '../types';

vi.mock('../services/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    patch: vi.fn(),
  },
}));

describe('ghlApiService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. Tenant Matching Logic ──────────────────────────────────────────────
  describe('isTenantMatch', () => {
    it('returns true if targetTenant is not provided', () => {
      expect(ghlApiService.isTenantMatch('1', undefined)).toBe(true);
      expect(ghlApiService.isTenantMatch('2', null)).toBe(true);
      expect(ghlApiService.isTenantMatch(undefined, '')).toBe(true);
    });

    it('identifies Jamin target tenant across variants', () => {
      const jaminTargets = ['2', 't-jamin-02', 'jamin', 'jaminbazaar', 'JAMIN'];
      const jaminItems = ['2', 't-jamin-02', 'jamin', 'jaminbazaar'];

      for (const target of jaminTargets) {
        for (const item of jaminItems) {
          expect(ghlApiService.isTenantMatch(item, target)).toBe(true);
        }
        expect(ghlApiService.isTenantMatch('1', target)).toBe(false);
        expect(ghlApiService.isTenantMatch('t-ghl-01', target)).toBe(false);
      }
    });

    it('identifies GHL target tenant across variants', () => {
      const ghlTargets = ['1', 't-ghl-01', 'ghl', 'ghlindiatrust', 'GHL'];
      const ghlItems = ['1', 't-ghl-01', 'ghl', 'ghlindiatrust'];

      for (const target of ghlTargets) {
        for (const item of ghlItems) {
          expect(ghlApiService.isTenantMatch(item, target)).toBe(true);
        }
        expect(ghlApiService.isTenantMatch('2', target)).toBe(false);
        expect(ghlApiService.isTenantMatch('t-jamin-02', target)).toBe(false);
      }
    });

    it('matches arbitrary company strings case-insensitively', () => {
      expect(ghlApiService.isTenantMatch('TENANT-ABC', 'tenant-abc')).toBe(true);
      expect(ghlApiService.isTenantMatch('TENANT-ABC', 'tenant-xyz')).toBe(false);
    });
  });

  // ── 2. Deals Management ───────────────────────────────────────────────────
  describe('Deals Service', () => {
    it('fetches and maps deals successfully with deduplication', async () => {
      const mockApiDeals = [
        {
          id: 101,
          companyId: 1,
          title: 'AIF Series 1',
          customerId: 501,
          customerName: 'Aarav Sharma',
          stage: 'qualified_investor',
          value: 5000000,
          phone: '+91 9876543210',
          investorType: 'AIF Direct',
        },
        {
          id: 101, // duplicate id
          companyId: 1,
          title: 'AIF Series 1 Duplicate',
        },
      ];

      vi.mocked(apiClient.get).mockResolvedValueOnce({
        success: true,
        data: { items: mockApiDeals, totalCount: 1, page: 1, pageSize: 200 },
      });

      const deals = await ghlApiService.getDeals('t-ghl-01');
      expect(deals.length).toBe(1);
      expect(deals[0].id).toBe('101');
      expect(deals[0].customerName).toBe('Aarav Sharma');
      expect(deals[0].investmentRoute).toBe('direct_aif');
    });

    it('falls back to local storage when server fetch fails', async () => {
      vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('Network error'));
      const localDeals: Deal[] = [
        {
          id: 'deal-local-1',
          companyId: 't-ghl-01',
          title: 'Local Deal',
          customerId: 'cust-1',
          customerName: 'Local Customer',
          stage: 'qualified_investor',
          value: 1000000,
          expectedCloseDate: '2026-03-01',
          createdAt: '2026-01-01T00:00:00Z',
          assignedAgentId: 'agent-1',
          assignedAgentName: 'Agent 1',
          notes: '',
        },
      ];
      vi.spyOn(storageService, 'getDeals').mockReturnValueOnce(localDeals);

      const deals = await ghlApiService.getDeals('t-ghl-01');
      expect(deals.length).toBe(1);
      expect(deals[0].title).toBe('Local Deal');
    });

    it('creates a new deal when id starts with deal- prefix', async () => {
      const newDeal: Deal = {
        id: 'deal-temp-123',
        companyId: '1',
        title: 'High Yield Opportunity',
        customerId: '502',
        customerName: 'Priya Patel',
        stage: 'new',
        value: 2500000,
        expectedCloseDate: '2026-04-15',
        assignedAgentId: 'agent-2',
        assignedAgentName: 'Agent 2',
        notes: 'Interested in bonds',
        createdAt: '2026-02-01T00:00:00Z',
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce({
        success: true,
        data: {
          id: 777,
          companyId: 1,
          title: newDeal.title,
          customerId: 502,
          customerName: newDeal.customerName,
          stage: newDeal.stage,
          value: newDeal.value,
        },
      });

      const spyStorage = vi.spyOn(storageService, 'saveDeal');
      const saved = await ghlApiService.saveDeal(newDeal);

      expect(apiClient.post).toHaveBeenCalledWith(
        '/ghl/deals',
        expect.objectContaining({
          title: 'High Yield Opportunity',
          customerId: 502,
        })
      );
      expect(saved.id).toBe('777');
      expect(spyStorage).toHaveBeenCalled();
    });

    it('updates an existing deal when id is numeric', async () => {
      const existingDeal: Deal = {
        id: '777',
        companyId: '1',
        title: 'High Yield Opportunity Updated',
        customerId: '502',
        customerName: 'Priya Patel',
        stage: 'completed',
        value: 3000000,
        expectedCloseDate: '2026-04-15',
        assignedAgentId: 'agent-2',
        assignedAgentName: 'Agent 2',
        notes: 'Finalized',
        createdAt: '2026-02-01T00:00:00Z',
      };

      vi.mocked(apiClient.put).mockResolvedValueOnce({
        success: true,
        data: {
          id: 777,
          title: existingDeal.title,
          stage: 'completed',
          value: 3000000,
        },
      });

      const updated = await ghlApiService.saveDeal(existingDeal);
      expect(apiClient.put).toHaveBeenCalledWith(
        '/ghl/deals/777',
        expect.objectContaining({ stage: 'completed', value: 3000000 })
      );
      expect(updated.stage).toBe('completed');
    });

    it('deletes deal and synchronizes with storageService', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce({ success: true });
      const spyDelete = vi.spyOn(storageService, 'deleteDeal');

      await ghlApiService.deleteDeal('777');
      expect(apiClient.delete).toHaveBeenCalledWith('/ghl/deals/777');
      expect(spyDelete).toHaveBeenCalledWith('777');
    });
  });

  // ── 3. Leads Management ───────────────────────────────────────────────────
  describe('Leads Service', () => {
    it('fetches leads with optional status parameter', async () => {
      const mockLead = {
        id: 201,
        companyId: 1,
        name: 'Suresh Raina',
        phone: '+91 9988776655',
        status: 'Interested',
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce({
        success: true,
        data: { items: [mockLead], totalCount: 1, page: 1, pageSize: 200 },
      });

      const leads = await ghlApiService.getLeads('1', 'Interested');
      expect(apiClient.get).toHaveBeenCalledWith(
        expect.stringContaining('/sales-executive/leads?pageSize=200&status=Interested')
      );
      expect(leads.length).toBe(1);
      expect(leads[0].name).toBe('Suresh Raina');
      expect(leads[0].status).toBe('Interested');
    });

    it('fetches Not Interested leads directly, falling back on error', async () => {
      vi.mocked(apiClient.get)
        .mockRejectedValueOnce(new Error('404 Not Found'))
        .mockResolvedValueOnce({
          success: true,
          data: { items: [{ id: 301, name: 'Lead NI', status: 'Not Interested' }] },
        });

      const leads = await ghlApiService.getNotInterestedLeads('1');
      expect(leads.length).toBe(1);
      expect(leads[0].status).toBe('Not Interested');
    });

    it('fetches Junk leads directly, falling back to parallel Junk + Wrong Number', async () => {
      vi.mocked(apiClient.get)
        .mockRejectedValueOnce(new Error('Junk endpoint missing'))
        .mockResolvedValueOnce({
          success: true,
          data: { items: [{ id: 401, name: 'Junk Lead', status: 'Junk' }] },
        })
        .mockResolvedValueOnce({
          success: true,
          data: { items: [{ id: 402, name: 'Wrong Number Lead', status: 'Wrong Number' }] },
        });

      const leads = await ghlApiService.getJunkLeads('1');
      expect(leads.length).toBe(2);
      expect(leads.some(l => l.status === 'Junk')).toBe(true);
      expect(leads.some(l => l.status === 'Wrong Number')).toBe(true);
    });

    it('saves a new lead via POST and updates storage', async () => {
      const newLead: Lead = {
        id: '',
        companyId: '1',
        name: 'Kavita Menon',
        phone: '+91 9123456789',
        email: 'kavita@example.com',
        location: 'Delhi',
        source: 'Website',
        status: 'New',
        priority: 'High',
        notes: 'Inquiry on corporate bonds',
        createdAt: '2026-02-10T00:00:00Z',
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce({
        success: true,
        data: {
          id: 505,
          name: newLead.name,
          phone: newLead.phone,
          status: 'New',
        },
      });

      const saved = await ghlApiService.saveLead(newLead);
      expect(apiClient.post).toHaveBeenCalledWith(
        '/sales-executive/leads',
        expect.objectContaining({ name: 'Kavita Menon' })
      );
      expect(saved.id).toBe('505');
    });
  });

  // ── 4. Followups Management ───────────────────────────────────────────────
  describe('Followups Service', () => {
    it('fetches followups through apiClient.get', async () => {
      const mockFollowup = {
        id: 601,
        contactName: 'Vikram Seth',
        contactPhone: '+91 9876500000',
        contactType: 'lead',
        status: 'Pending',
        scheduledAt: '2026-02-20T10:00:00Z',
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce({
        success: true,
        data: { items: [mockFollowup] },
      });

      const followups = await ghlApiService.getFollowups('1');
      expect(followups.length).toBe(1);
      expect(followups[0].contactName).toBe('Vikram Seth');
    });

    it('creates new followup via POST', async () => {
      const followup: Followup = {
        id: 'flw-temp-1',
        contactId: 'lead-1',
        contactName: 'Anil Gupta',
        contactPhone: '+91 9876511111',
        contactType: 'lead',
        scheduledAt: '2026-02-21T11:00:00Z',
        priority: 'Medium',
        status: 'Pending',
        notes: 'Call to review proposal',
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce({
        success: true,
        data: {
          id: 701,
          contactName: followup.contactName,
          status: 'Pending',
        },
      });

      const saved = await ghlApiService.saveFollowup(followup);
      expect(apiClient.post).toHaveBeenCalledWith(
        '/sales-executive/followups',
        expect.objectContaining({ contactName: 'Anil Gupta' })
      );
      expect(saved.id).toBe('701');
    });

    it('propagates errors array when followup creation receives conflict error', async () => {
      const followup: Followup = {
        id: 'flw-temp-2',
        contactName: 'Conflict User',
        contactPhone: '+91 9876522222',
        scheduledAt: '2026-02-21T11:00:00Z',
        priority: 'High',
        status: 'Pending',
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce({
        success: false,
        message: 'Time slot conflict',
        errors: ['SUGGESTED_TIME:2026-02-21T11:20:00Z'],
      });

      await expect(ghlApiService.saveFollowup(followup)).rejects.toThrow('Time slot conflict');
    });

    it('completes a followup via PATCH', async () => {
      vi.mocked(apiClient.patch).mockResolvedValueOnce({ success: true });

      await ghlApiService.completeFollowup('701');
      expect(apiClient.patch).toHaveBeenCalledWith(
        '/sales-executive/followups/701/complete',
        {}
      );
    });
  });

  // ── 5. Customers Management ───────────────────────────────────────────────
  describe('Customers Service', () => {
    it('fetches customer directory correctly', async () => {
      const mockCustomer = {
        id: 801,
        companyId: 1,
        name: 'Rajesh Exports',
        phone: '+91 9988001122',
        email: 'rajesh@example.com',
        status: 'Active',
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce({
        success: true,
        data: { items: [mockCustomer] },
      });

      const customers = await ghlApiService.getCustomers('1');
      expect(customers.length).toBe(1);
      expect(customers[0].name).toBe('Rajesh Exports');
    });

    it('rejects manual creation for new customer', async () => {
      const newCust: Customer = {
        id: '',
        companyId: '1',
        name: 'New Company',
        phone: '+91 9999999999',
        email: 'new@example.com',
        status: 'Active',
        totalValue: 0,
      };

      await expect(ghlApiService.saveCustomer(newCust)).rejects.toThrow(
        /Manual customer creation is disabled/i
      );
    });

    it('updates an existing customer via PUT', async () => {
      const existingCust: Customer = {
        id: '801',
        companyId: '1',
        name: 'Rajesh Exports Updated',
        phone: '+91 9988001122',
        email: 'rajesh@example.com',
        status: 'VIP',
        totalValue: 50000000,
      };

      vi.mocked(apiClient.put).mockResolvedValueOnce({
        success: true,
        data: {
          id: 801,
          name: existingCust.name,
          status: 'VIP',
          totalValue: 50000000,
        },
      });

      const updated = await ghlApiService.saveCustomer(existingCust);
      expect(apiClient.put).toHaveBeenCalledWith(
        '/sales-executive/customers/801',
        expect.objectContaining({ name: 'Rajesh Exports Updated', status: 'VIP' })
      );
      expect(updated.status).toBe('VIP');
    });
  });

  // ── 6. Calls Management ───────────────────────────────────────────────────
  describe('Calls Service', () => {
    it('fetches call records successfully', async () => {
      const mockCall = {
        id: 901,
        contactName: 'Nisha Pillai',
        contactPhone: '+91 9876543299',
        direction: 'Outbound',
        disposition: 'Interested',
        agentRole: 'sales_executive',
      };

      vi.mocked(apiClient.get).mockResolvedValueOnce({
        success: true,
        data: { items: [mockCall] },
      });

      const calls = await ghlApiService.getCalls('1');
      expect(calls.length).toBe(1);
      expect(calls[0].contactName).toBe('Nisha Pillai');
      expect(calls[0].callerType).toBe('Agent');
    });

    it('logs an outbound call and unblocks other record if disposition is Other', async () => {
      const callRecord: CallRecord = {
        id: 'call-1',
        contactName: 'Nisha Pillai',
        contactPhone: '+91 9876543299',
        contactType: 'lead',
        leadId: 'lead-100',
        direction: 'Outbound',
        disposition: 'Other',
        duration: 120,
        notes: 'Follow up next week',
        startTime: '2026-02-15T10:00:00Z',
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce({
        success: true,
        data: {
          id: 999,
          contactName: callRecord.contactName,
          contactPhone: callRecord.contactPhone,
          disposition: 'Other',
        },
      });

      const logged = await ghlApiService.logCall(callRecord);
      expect(apiClient.post).toHaveBeenCalledWith(
        '/sales-executive/calls',
        expect.objectContaining({ contactName: 'Nisha Pillai' })
      );
      expect(logged.id).toBe('999');
    });

    it('fetches call by id', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        success: true,
        data: {
          id: 999,
          contactName: 'Deepak Rao',
          contactPhone: '+91 9876543200',
        },
      });

      const call = await ghlApiService.getCallById(999);
      expect(call.contactName).toBe('Deepak Rao');
      expect(apiClient.get).toHaveBeenCalledWith('/sales-executive/calls/999');
    });
  });

  // ── 7. Opportunities & Investors ──────────────────────────────────────────
  describe('Opportunities and Investors Service', () => {
    it('fetches and creates investors', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        success: true,
        data: { items: [{ id: 10, name: 'Ananya Birla', status: 'Active' }] },
      });

      const investors = await ghlApiService.getInvestors('1');
      expect(investors.length).toBe(1);
      expect(investors[0].name).toBe('Ananya Birla');

      const newInv: Investor = {
        id: 'inv-temp-1',
        name: 'Gautam Singhania',
        phone: '+91 9820012345',
        status: 'Active',
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce({
        success: true,
        data: { id: 11, name: newInv.name, status: 'Active' },
      });

      const savedInv = await ghlApiService.saveInvestor(newInv);
      expect(savedInv.id).toBe('11');

      vi.mocked(apiClient.delete).mockResolvedValueOnce({ success: true });
      await ghlApiService.deleteInvestor('11');
      expect(apiClient.delete).toHaveBeenCalledWith('/ghl/investors/11');
    });

    it('fetches and saves investment opportunities', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        success: true,
        data: { items: [{ id: 20, title: 'Real Estate Credit Fund', stage: 'Prospect' }] },
      });

      const opps = await ghlApiService.getOpportunities('1');
      expect(opps.length).toBe(1);
      expect(opps[0].title).toBe('Real Estate Credit Fund');

      const newOpp: InvestmentOpportunity = {
        id: 'opp-temp-1',
        title: 'Tech Debt Fund II',
        stage: 'Due Diligence',
        targetAmount: 50000000,
        committedAmount: 25000000,
      };

      vi.mocked(apiClient.post).mockResolvedValueOnce({
        success: true,
        data: { id: 21, title: newOpp.title, stage: 'Due Diligence' },
      });

      const savedOpp = await ghlApiService.saveOpportunity(newOpp);
      expect(savedOpp.id).toBe('21');

      vi.mocked(apiClient.delete).mockResolvedValueOnce({ success: true });
      await ghlApiService.deleteOpportunity('21');
      expect(apiClient.delete).toHaveBeenCalledWith('/ghl/investment-opportunities/21');
    });
  });

  // ── 8. Other Records, Messaging Channels & IRM Pipelines ──────────────────
  describe('Other Records & Messaging Channels', () => {
    it('unblocks and filters other records from local storage blacklist', () => {
      localStorage.setItem(
        'nexus_dismissed_other_records',
        JSON.stringify(['9876543210', 'lead_100', 'keep_this'])
      );

      ghlApiService.unblockOtherRecord({ phone: '+91 9876543210', leadId: 100 });
      const raw = localStorage.getItem('nexus_dismissed_other_records');
      const parsed = JSON.parse(raw || '[]');
      expect(parsed).toEqual(['keep_this']);
    });

    it('fetches messaging channels status', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        success: true,
        data: [
          { channel: 'whatsapp', configured: true, active: true },
          { channel: 'sms', configured: true, active: false },
        ],
      });

      const channels = await ghlApiService.getMessagingChannels();
      expect(channels.length).toBe(2);
      expect(channels[0].channel).toBe('whatsapp');
    });

    it('fetches company IRM profiles', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        success: true,
        data: [{ id: 1, name: 'IRM Lead Officer', email: 'irm@ghl.com' }],
      });

      const irms = await ghlApiService.getCompanyIrms('1');
      expect(irms.length).toBe(1);
      expect(irms[0].name).toBe('IRM Lead Officer');
    });
  });
});
