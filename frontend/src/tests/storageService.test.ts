import { describe, it, expect, beforeEach, vi } from 'vitest';
import { storageService } from '../services/storageService';
import {
  Lead,
  Customer,
  Deal,
  Followup,
  User,
  Tenant,
  CallRecord,
  SiteVisit,
  PropertyProject,
  Plot,
  Booking,
  Investor,
  Consultation,
  InvestmentOpportunity,
  DocumentItem,
  Department,
  Team,
  Queue,
  RoutingRule,
} from '../types';

describe('storageService Full CRUD & Business Logic Unit Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('Core get / set & Event Dispatching', () => {
    it('returns fallback value if key does not exist or JSON is invalid', () => {
      expect(storageService.get('non_existent', 'default')).toBe('default');

      localStorage.setItem('nexus_corrupt', '{not-valid-json');
      expect(storageService.get('corrupt', { safe: true })).toEqual({ safe: true });
    });

    it('sets and retrieves typed data and dispatches nexus_storage_updated event', () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      storageService.set('test_key', { count: 42 });

      expect(storageService.get('test_key', { count: 0 })).toEqual({ count: 42 });
      expect(dispatchSpy).toHaveBeenCalledWith(expect.any(Event));
      dispatchSpy.mockRestore();
    });

    it('checks mock mode flag', () => {
      expect(typeof storageService.isMockMode()).toBe('boolean');
    });
  });

  describe('Tenants Management', () => {
    it('retrieves default tenants when none are stored', () => {
      const tenants = storageService.getTenants();
      expect(tenants.length).toBeGreaterThan(0);
      expect(tenants[0]).toHaveProperty('id');
      expect(tenants[0]).toHaveProperty('name');
    });

    it('saves a new tenant or updates an existing one', () => {
      const newTenant = {
        id: 'cust-tenant-99',
        name: 'Custom Realty Group',
        slug: 'custom-realty',
        brandColor: '#123456',
        tagline: 'Premium Realty',
        enabledFeatures: [],
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        businessHours: '9am - 6pm',
      } as unknown as Tenant;

      storageService.saveTenant(newTenant);
      let list = storageService.getTenants();
      expect(list.some(t => t.id === 'cust-tenant-99')).toBe(true);

      const updated = { ...newTenant, name: 'Custom Realty Updated' };
      storageService.saveTenant(updated);
      list = storageService.getTenants();
      const match = list.find(t => t.id === 'cust-tenant-99');
      expect(match?.name).toBe('Custom Realty Updated');
    });
  });

  describe('User & Session Management', () => {
    it('returns null if no user is signed in', () => {
      expect(storageService.getUser()).toBeNull();
    });

    it('retrieves user from sessionStorage or localStorage, handling nested { user } payload', () => {
      const mockUser = {
        id: 'usr-1',
        name: 'Test Executive',
        email: 'exec@example.com',
        phone: '+919876543210',
        status: 'Active',
        role: { id: 'r1', name: 'Sales Executive', code: 'sales_executive', permissions: [] },
      } as unknown as User;

      // Wrapped in { user: ... }
      sessionStorage.setItem('nexus_current_user', JSON.stringify({ user: mockUser }));
      expect(storageService.getUser()?.email).toBe('exec@example.com');

      sessionStorage.clear();
      // Directly as user object in localStorage
      localStorage.setItem('nexus_current_user', JSON.stringify(mockUser));
      expect(storageService.getUser()?.name).toBe('Test Executive');
    });

    it('loads default seed users and sanitizes legacy manager roles', () => {
      const users = storageService.getUsers();
      expect(users.length).toBeGreaterThanOrEqual(6);
      expect(users.some(u => u.name === 'Yanosh')).toBe(true);
      expect(users.some(u => u.name === 'Dhinakaran')).toBe(true);

      // Filtering by companySlug
      const ghlUsers = storageService.getUsers('ghl');
      expect(ghlUsers.every(u => !u.companySlug || u.companySlug === 'ghl')).toBe(true);
    });

    it('saves and deletes users', () => {
      const newUser = {
        id: 'usr-new-100',
        name: 'Agent Smith',
        email: 'smith@matrix.com',
        phone: '+919876543211',
        status: 'Active',
        role: { id: 'r2', name: 'Sales Executive', code: 'sales_executive', permissions: [] },
      } as unknown as User;

      storageService.saveUser(newUser);
      let users = storageService.getUsers();
      expect(users.some(u => u.id === 'usr-new-100')).toBe(true);

      // Update
      storageService.saveUser({ ...newUser, name: 'Agent Smith Jr' });
      users = storageService.getUsers();
      expect(users.find(u => u.id === 'usr-new-100')?.name).toBe('Agent Smith Jr');

      // Delete
      storageService.deleteUser('usr-new-100');
      users = storageService.getUsers();
      expect(users.some(u => u.id === 'usr-new-100')).toBe(false);
    });

    it('performs handover reassignment when deleting a user with handover', () => {
      const targetAgent = {
        id: 'usr-target',
        name: 'Target Agent',
        email: 'target@example.com',
        phone: '+919876543212',
        status: 'Active',
        role: { id: 'r3', name: 'Sales Executive', code: 'sales_executive', permissions: [] },
      } as unknown as User;
      storageService.saveUser(targetAgent);

      const lead = {
        id: 'lead-ho-1',
        name: 'Handover Lead',
        phone: '9876543210',
        companyId: '1',
        status: 'New',
        assignedAgentId: 'usr-source',
        assignedAgentName: 'Source Agent',
        assignedAgentEmail: 'source@example.com',
        createdAt: new Date().toISOString(),
      } as unknown as Lead;
      storageService.saveLead(lead);

      storageService.deleteUserWithHandover('usr-source', 'usr-target');
      const recheckedLead = storageService.getLeads('1').find(l => l.id === 'lead-ho-1');
      expect(recheckedLead?.assignedAgentId).toBe('usr-target');
      expect(recheckedLead?.assignedAgentName).toBe('Target Agent');
    });
  });

  describe('Leads Management', () => {
    it('creates, updates, bulk saves, queries, and deletes leads', () => {
      const lead1 = {
        id: 'lead-test-1',
        name: 'Test Buyer',
        phone: '9845011111',
        email: 'buyer@example.com',
        companyId: 'comp-1',
        status: 'Interested',
        createdAt: new Date().toISOString(),
      } as unknown as Lead;

      storageService.saveLead(lead1);
      expect(storageService.findLeadByPhone('9845011111', 'comp-1')?.id).toBe('lead-test-1');
      expect(storageService.findLeadByPhone('+91 98450-11111', 'comp-1')?.id).toBe('lead-test-1');

      // Update lead
      storageService.saveLead({ ...lead1, name: 'Test Buyer Renamed' });
      const found = storageService.getLeads('comp-1');
      expect(found.find(l => l.id === 'lead-test-1')?.name).toBe('Test Buyer Renamed');

      // Bulk save
      const lead2 = {
        id: 'lead-test-2',
        name: 'Second Buyer',
        phone: '9845022222',
        companyId: 'comp-1',
        status: 'Site Visit Scheduled',
        createdAt: new Date().toISOString(),
      } as unknown as Lead;
      storageService.saveLeads([lead1, lead2]);
      expect(storageService.getLeads('comp-1')).toHaveLength(2);

      // Delete lead
      storageService.deleteLead('lead-test-1');
      expect(storageService.getLeads('comp-1')).toHaveLength(1);
    });

    it('cleans up duplicate leads by keeping only one per phone number', () => {
      const dup1 = { id: 'd1', name: 'Lead A', phone: '9900011111', companyId: 'c1', status: 'New', createdAt: '2026-01-01' } as unknown as Lead;
      const dup2 = { id: 'd2', name: 'Lead B', phone: '99000 11111', companyId: 'c1', status: 'Interested', createdAt: '2026-01-02' } as unknown as Lead;
      storageService.set('leads', [dup1, dup2]);

      storageService.cleanupDuplicateLeads();
      const deduped = storageService.get('leads', []);
      expect(deduped).toHaveLength(1);
    });
  });

  describe('Customers & Deals Management', () => {
    it('saves and retrieves customers', () => {
      const customer = {
        id: 'cust-101',
        name: 'Vipul Singhal',
        email: 'vipul@investors.com',
        phone: '9811122233',
        companyId: 'comp-1',
        status: 'Active',
        createdAt: new Date().toISOString(),
      } as unknown as Customer;

      storageService.saveCustomer(customer);
      const list = storageService.getCustomers('comp-1');
      expect(list.some(c => c.id === 'cust-101')).toBe(true);

      // Update customer
      storageService.saveCustomer({ ...customer, name: 'Vipul Singhal (HNW)' });
      expect(storageService.getCustomers('comp-1').find(c => c.id === 'cust-101')?.name).toBe('Vipul Singhal (HNW)');
    });

    it('manages deals, stage progression, and deal activities', () => {
      const deal = {
        id: 'deal-101',
        title: 'Commercial Suite Investment',
        companyId: 'comp-1',
        stage: 'qualified_investor',
        customerName: 'Aarav Sharma',
        value: 15000000,
        createdAt: new Date().toISOString(),
      } as unknown as Deal;

      storageService.saveDeal(deal);
      let deals = storageService.getDeals('comp-1');
      expect(deals.some(d => d.id === 'deal-101')).toBe(true);

      // Add activity
      storageService.addDealActivity({
        id: 'act-1',
        dealId: 'deal-101',
        companyId: 'comp-1',
        type: 'stage_change',
        text: 'Advanced to Investment Opportunity',
        loggedByName: 'Admin',
        loggedByRole: 'Company Admin',
        timestamp: new Date().toISOString(),
      });
      const acts = storageService.getDealActivities('deal-101');
      expect(acts).toHaveLength(1);
      expect(acts[0].text).toContain('Advanced');

      // Delete deal
      storageService.deleteDeal('deal-101');
      deals = storageService.getDeals('comp-1');
      expect(deals.some(d => d.id === 'deal-101')).toBe(false);
    });
  });

  describe('Calls & Followups Management', () => {
    it('manages call logs', () => {
      const call = {
        id: 'call-1',
        contactName: 'Priya Patel',
        contactPhone: '9876543210',
        direction: 'outbound',
        disposition: 'connected',
        agentId: 'a-1',
        agentName: 'Agent 1',
        duration: 120,
        companyId: 'comp-1',
        timestamp: new Date().toISOString(),
      } as unknown as CallRecord;

      storageService.addCall(call);
      const calls = storageService.getCalls('comp-1');
      expect(calls.some(c => c.id === 'call-1')).toBe(true);
    });

    it('manages followups, deletes, and purges by contact', () => {
      const followup = {
        id: 'flw-1',
        companyId: 'comp-1',
        contactId: 'contact-99',
        contactName: 'Rohit Verma',
        phone: '9811199999',
        type: 'call',
        scheduledTime: new Date().toISOString(),
        status: 'Pending',
        priority: 'High',
        createdAt: new Date().toISOString(),
      } as unknown as Followup;

      storageService.saveFollowup(followup);
      let list = storageService.getFollowups('comp-1');
      expect(list.some(f => f.id === 'flw-1')).toBe(true);

      // Update
      storageService.saveFollowup({ ...followup, notes: 'Followup note' });
      expect(storageService.getFollowups('comp-1').find(f => f.id === 'flw-1')?.notes).toBe('Followup note');

      // Purge for contact
      storageService.purgeFollowupsForContact('comp-1', 'contact-99');
      list = storageService.getFollowups('comp-1');
      expect(list.some(f => f.contactId === 'contact-99')).toBe(false);

      // Delete specific followup
      storageService.saveFollowup({
        id: 'flw-delete-me',
        companyId: 'comp-1',
        type: 'call',
        scheduledTime: new Date().toISOString(),
        status: 'Pending',
        priority: 'High',
        createdAt: new Date().toISOString(),
      } as unknown as Followup);
      storageService.deleteFollowup('flw-delete-me');
      expect(storageService.getFollowups('comp-1').some(f => f.id === 'flw-delete-me')).toBe(false);
    });
  });

  describe('Real Estate & Investment Entities (Projects, Plots, Visits, Bookings, Investors)', () => {
    it('manages projects, plots, site visits, and bookings', () => {
      const project = {
        id: 'proj-1',
        companyId: 'comp-1',
        name: 'Nexus Silicon Heights',
        location: 'Electronic City, Bengaluru',
        type: 'commercial',
        status: 'Active',
        totalUnits: 50,
        availableUnits: 20,
      } as unknown as PropertyProject;
      storageService.saveProject(project);
      expect(storageService.getProjects()).toHaveLength(1);

      const plot = {
        id: 'plot-1',
        companyId: 'comp-1',
        projectId: 'proj-1',
        plotNumber: 'P-101',
        size: '2400 sqft',
        dimensions: '40x60',
        facing: 'East',
        pricePerSqFt: 5500,
        totalPrice: 13200000,
        status: 'Available',
      } as unknown as Plot;
      storageService.savePlot(plot);
      expect(storageService.getPlots()).toHaveLength(1);

      const visit = {
        id: 'sv-1',
        companyId: 'comp-1',
        leadId: 'lead-1',
        leadName: 'Lead 1',
        projectId: 'proj-1',
        projectName: 'Nexus Silicon Heights',
        status: 'Completed',
        scheduledAt: new Date().toISOString(),
      } as unknown as SiteVisit;
      storageService.saveSiteVisit(visit);
      expect(storageService.getSiteVisits('comp-1')).toHaveLength(1);

      const booking = {
        id: 'bk-1',
        companyId: 'comp-1',
        projectId: 'proj-1',
        projectName: 'Nexus Silicon Heights',
        customerName: 'Buyer 1',
        customerPhone: '9876543210',
        totalAmount: 13200000,
        bookingAmount: 500000,
        status: 'Confirmed',
        createdAt: new Date().toISOString(),
      } as unknown as Booking;
      storageService.saveBooking(booking);
      expect(storageService.getBookings('comp-1')).toHaveLength(1);
    });

    it('manages investors, consultations, and investment opportunities', () => {
      const investor = {
        id: 'inv-test-1',
        name: 'Ananya Roy',
        email: 'ananya@roy.com',
        phone: '9845033333',
        companyId: 'comp-1',
        status: 'Active Investor',
        category: 'AIF Cat-II',
        totalInvested: 25000000,
        joinedDate: new Date().toISOString(),
      } as unknown as Investor;
      storageService.saveInvestor(investor);
      expect(storageService.getInvestors('comp-1')).toHaveLength(1);
      storageService.deleteInvestor('inv-test-1');
      expect(storageService.getInvestors('comp-1')).toHaveLength(0);

      const consultation = {
        id: 'cns-test-1',
        companyId: 'comp-1',
        investorName: 'Deepak Rao',
        phone: '9845044444',
        type: 'Portfolio Review',
        dateTime: new Date().toISOString(),
        status: 'Scheduled',
      } as unknown as Consultation;
      storageService.saveConsultation(consultation);
      expect(storageService.getConsultations('comp-1')).toHaveLength(1);
      storageService.deleteConsultation('cns-test-1');
      expect(storageService.getConsultations('comp-1')).toHaveLength(0);

      const opp = {
        id: 'opp-test-1',
        companyId: 'comp-1',
        title: 'Cat-II AIF Growth Fund Unit 4',
        investorId: 'inv-1',
        investorName: 'Deepak Rao',
        assignedAgentName: 'Agent 1',
        expectedCloseDate: '2026-12-31',
        notes: '',
        targetAmount: 10000000,
        committedAmount: 5000000,
        stage: 'Opportunity',
      } as unknown as InvestmentOpportunity;
      storageService.saveOpportunity(opp);
      expect(storageService.getOpportunities('comp-1')).toHaveLength(1);
      storageService.deleteOpportunity('opp-test-1');
      expect(storageService.getOpportunities('comp-1')).toHaveLength(0);
    });
  });

  describe('Audit Logs & Notifications', () => {
    it('records and queries audit logs', () => {
      storageService.addAuditLog({
        actorName: 'Admin',
        actorEmail: 'admin@system.com',
        action: 'UPDATE_KYC',
        entityType: 'Deal',
        entityId: 'deal-1',
        companyId: 'comp-1',
        details: 'Approved PAN and Aadhaar',
      } as any);
      const logs = storageService.getAuditLogs('comp-1');
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('UPDATE_KYC');
    });

    it('creates and marks notifications as read with tenant and user filters', () => {
      storageService.createNotification({
        id: 'notif-1',
        title: 'KYC Document Uploaded',
        message: 'Customer submitted PAN card',
        type: 'lead',
        companyId: 't-ghl-01',
        targetUserId: 'usr-target-1',
        read: false,
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });
      storageService.createNotification({
        id: 'notif-2',
        title: 'Jamin Notification',
        message: 'Plot booked',
        type: 'booking',
        companyId: 't-jamin-02',
        targetUserId: 'all',
        targetRole: 'sales_executive',
        read: false,
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      });

      expect(storageService.getNotifications('t-ghl-01')).toHaveLength(1);
      expect(storageService.getNotifications('t-jamin-02', 'u-any', 'sales_executive')).toHaveLength(1);

      storageService.markNotificationRead('notif-1');
      expect(storageService.getNotifications('t-ghl-01')[0].read).toBe(true);

      storageService.markAllNotificationsRead('t-ghl-01');
      expect(storageService.getNotifications('t-ghl-01').every(n => n.read)).toBe(true);
    });

    it('cleans up fake fixture data on initialization', () => {
      localStorage.setItem('nexus_followups', JSON.stringify([{ id: 'flw-se-ps-01' }, { id: 'real-flw' }]));
      localStorage.setItem('nexus_investors', JSON.stringify([{ id: 'inv-01' }, { id: 'real-inv' }]));
      localStorage.setItem('nexus_opportunities', JSON.stringify([{ id: 'opp-01' }, { id: 'real-opp' }]));
      localStorage.setItem('nexus_consultations', JSON.stringify([{ id: 'cns-01' }, { id: 'real-cns' }]));
      localStorage.setItem('nexus_calls', JSON.stringify([{ id: 'call-01' }, { id: 'real-call' }]));
      localStorage.setItem('nexus_dev_users', JSON.stringify([{ id: '28' }, { id: 'real-user' }]));
      localStorage.setItem('nexus_admin_kanban_cards_v1', JSON.stringify([{ id: 'kanban-se-01' }, { id: 'real-kanban' }]));

      // Instantiate
      const freshService = new (storageService.constructor as any)();
      expect(freshService.getFollowups().some((f: any) => f.id === 'flw-se-ps-01')).toBe(false);
      expect(freshService.getFollowups().some((f: any) => f.id === 'real-flw')).toBe(true);
    });
  });

  describe('Documents, Routing, and Settings', () => {
    it('manages documents', () => {
      const doc = {
        id: 'doc-1',
        name: 'PAN_Copy.pdf',
        size: '1.2 MB',
        mimeType: 'application/pdf',
        fileUrl: '/uploads/pan.pdf',
        entityType: 'deal',
        entityId: 'deal-1',
        uploadedBy: 'Aarav',
        uploadedAt: new Date().toISOString(),
      } as unknown as DocumentItem;
      storageService.saveDocument(doc);
      expect(storageService.getDocuments('deal', 'deal-1')).toHaveLength(1);

      storageService.deleteDocument('doc-1');
      expect(storageService.getDocuments('deal', 'deal-1')).toHaveLength(0);
    });

    it('manages organizational departments, teams, and queues', () => {
      const dept = { id: 'd-1', name: 'Sales', companyId: 'comp-1' } as unknown as Department;
      storageService.saveDepartment(dept);
      expect(storageService.getDepartments('comp-1')).toHaveLength(1);

      const team = { id: 't-1', name: 'Alpha Team', departmentId: 'd-1', companyId: 'comp-1' } as unknown as Team;
      storageService.saveTeam(team);
      expect(storageService.getTeams('comp-1')).toHaveLength(1);

      const queue: Queue = { id: 'q-1', name: 'Inbound Inquiries', departmentId: 'd-1', companyId: 'comp-1', routingStrategy: 'round_robin' };
      storageService.saveQueue(queue);
      expect(storageService.getQueues('comp-1')).toHaveLength(1);

      const rule = {
        id: 'rr-1',
        name: 'High Value Rule',
        companyId: 'comp-1',
        priority: 1,
        enabled: true,
      } as unknown as RoutingRule;
      storageService.saveRoutingRule(rule);
      expect(storageService.getRoutingRules('comp-1')).toHaveLength(1);

      storageService.saveLeadAssignment({
        id: 'la-1',
        leadId: 'lead-1',
        toAgentId: 'agent-1',
        companyId: 'comp-1',
        assignedAt: new Date().toISOString(),
      } as any);
      expect(storageService.getLeadAssignments('comp-1')).toHaveLength(1);

      storageService.saveAgentPresence({
        id: 'ap-1',
        userId: 'agent-1',
        companyId: 'comp-1',
        status: 'available',
      } as any);
      const presences = storageService.getAgentPresence();
      expect(presences.find(p => p.userId === 'agent-1')?.status).toBe('available');

      storageService.saveRoutingAttempt({
        id: 'ra-1',
        leadId: 'lead-1',
        companyId: 'comp-1',
        result: 'success',
      } as any);
      expect(storageService.getRoutingAttempts('comp-1')).toHaveLength(1);
    });

    it('manages custom fields, products, irms, and mock agents', () => {
      const fieldDef = {
        id: 'cf-1',
        name: 'Investment Preference',
        key: 'inv_pref',
        type: 'text' as const,
        entityType: 'deal' as const,
        required: false,
        companyId: 'comp-1',
      };
      storageService.saveCustomFieldDefinition(fieldDef as any);
      expect(storageService.getCustomFieldDefinitions()).toContainEqual(expect.objectContaining({ id: 'cf-1' }));

      const product = {
        id: 'prod-1',
        name: 'AIF Fund Series I',
        sku: 'AIF-01',
        category: 'AIF',
        price: 10000000,
        status: 'active' as const,
        companyId: 'comp-1',
      };
      storageService.saveProductService(product);
      expect(storageService.getProductsServices('comp-1')).toHaveLength(1);

      storageService.setIrms([{ id: 'irm-1', name: 'Deepak IRM', email: 'deepak@ghl.com', status: 'Available' } as any]);
      expect(storageService.getIrms()).toHaveLength(1);
      expect(storageService.getMockIrms().length).toBeGreaterThan(0);
      expect(storageService.getMockAgents().length).toBeGreaterThan(0);
      expect(storageService.getAgents().length).toBeGreaterThan(0);
    });

    it('cleans up GHL pending followups and purges duplicates', () => {
      storageService.saveFollowup({
        id: 'flw-pending-1',
        companyId: 't-ghl-01',
        contactId: 'lead-junk',
        contactName: 'Junk Lead',
        contactPhone: '9988776655',
        type: 'call',
        scheduledTime: new Date().toISOString(),
        status: 'Pending',
        priority: 'Low',
        createdAt: new Date().toISOString(),
      } as any);
      storageService.saveLead({
        id: 'lead-junk',
        name: 'Junk Lead',
        phone: '9988776655',
        companyId: 't-ghl-01',
        status: 'Junk',
        createdAt: new Date().toISOString(),
      } as unknown as Lead);

      storageService.cleanupGhlPendingFollowups('t-ghl-01');
      const followups = storageService.getFollowups('t-ghl-01');
      expect(followups.some(f => f.id === 'flw-pending-1')).toBe(false);
    });

    it('manages popup positions, admin call settings, call preferences, and resetData', () => {
      expect(storageService.getPopupPosition()).toBe('top-right');
      storageService.setPopupPosition('top-left');
      expect(storageService.getPopupPosition()).toBe('top-left');

      storageService.setCallPreferences({ autoBusyEnabled: true, defaultFollowupTime: '15m' });
      expect(storageService.getCallPreferences().autoBusyEnabled).toBe(true);
      expect(storageService.getCallPreferences().defaultFollowupTime).toBe('15m');

      storageService.setAdminCallSettings({ allowIrmDecline: false, allowSalesDecline: false });
      expect(storageService.getAdminCallSettings().allowIrmDecline).toBe(false);

      storageService.resetData();
      expect(localStorage.getItem('nexus_call_preferences')).toBeNull();
    });
  });
});
