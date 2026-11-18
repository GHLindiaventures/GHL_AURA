import { describe, it, expect, beforeEach } from 'vitest';

const createStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
};

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = createStorageMock() as any;
}
if (typeof globalThis.sessionStorage === 'undefined') {
  globalThis.sessionStorage = createStorageMock() as any;
}
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = {
    dispatchEvent: () => true,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

import { storageService } from '../services/storageService';
import { apiClient } from '../services/apiClient';
import { getSeenIds, markSeenIds, clearChatUnreadForCompany, isAssignedToIrm, getArchivedLeadKey, markRouteSeen, countUnseenItems, setLastSeenTime, getLastSeenTime, syncBadgeStateWithServer } from '../components/layout/Sidebar';

describe('Sidebar Badges for Sales Executive', () => {
  const tenantId = 't-ghl-01';
  const salesExecUser = {
    id: 'usr-ghl-exec-1',
    name: 'Ananya Iyer',
    role: { code: 'sales_executive', name: 'Sales Executive' },
    companyId: '1',
  };

  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('correctly tracks pending follow-ups count for sales executive', () => {
    const followups = [
      {
        id: 'flw-1',
        companyId: tenantId,
        contactName: 'Ramesh Patel',
        status: 'Pending',
        assignedAgentId: salesExecUser.id,
        assignedAgentName: salesExecUser.name,
      },
      {
        id: 'flw-2',
        companyId: tenantId,
        contactName: 'Suresh Kumar',
        status: 'Completed',
        assignedAgentId: salesExecUser.id,
        assignedAgentName: salesExecUser.name,
      },
      {
        id: 'flw-3',
        companyId: tenantId,
        contactName: 'Priya Sharma',
        status: 'Pending',
        assignedAgentId: 'other-user',
        assignedAgentName: 'Other Agent',
      },
    ];

    storageService.set('followups', followups);

    const pendingForUser = (storageService.getFollowups(tenantId) || []).filter(
      (f: any) =>
        f.status === 'Pending' &&
        (String(f.assignedAgentId) === salesExecUser.id || f.assignedAgentName === salesExecUser.name)
    );

    expect(pendingForUser.length).toBe(1);
    expect(pendingForUser[0].id).toBe('flw-1');
  });

  it('correctly tracks active leads for sales executive excluding moved and follow-up leads', () => {
    const leads = [
      {
        id: 'lead-1',
        companyId: tenantId,
        name: 'Aarav Mehta',
        status: 'New',
        assignedAgentId: salesExecUser.id,
        assignedAgentName: salesExecUser.name,
      },
      {
        id: 'lead-2',
        companyId: tenantId,
        name: 'Diya Sen',
        status: 'Contacted',
        assignedAgentId: salesExecUser.id,
        assignedAgentName: salesExecUser.name,
      },
      {
        id: 'lead-3',
        companyId: tenantId,
        name: 'Karan Verma',
        status: 'Interested', // Moved to Customer 360 / IRM
        assignedAgentId: salesExecUser.id,
        assignedAgentName: salesExecUser.name,
      },
      {
        id: 'lead-4',
        companyId: tenantId,
        name: 'Vikram Joshi',
        status: 'Not Interested',
        assignedAgentId: salesExecUser.id,
        assignedAgentName: salesExecUser.name,
      },
      {
        id: 'lead-5',
        companyId: tenantId,
        name: 'Deepak Rao',
        status: 'New',
        assignedAgentId: 'other-user',
        assignedAgentName: 'Other Agent',
      },
    ];

    storageService.set('leads', leads);
    storageService.set('followups', []);

    const MOVED_LEAD_STATUSES = ['interested', 'converted', 'follow-up required', 'callback', 'not interested', 'junk'];

    const activeScopedLeads = (storageService.getLeads(tenantId) || []).filter((l: any) => {
      const isAssigned =
        String(l.assignedAgentId) === salesExecUser.id || l.assignedAgentName === salesExecUser.name;
      if (!isAssigned) return false;
      const s = (l.status || '').toLowerCase();
      if (MOVED_LEAD_STATUSES.includes(s)) return false;
      return true;
    });

    expect(activeScopedLeads.length).toBe(2);
    expect(activeScopedLeads.map(l => l.id)).toEqual(['lead-1', 'lead-2']);
  });

  it('correctly tracks scheduled consultations for sales executive', () => {
    const consultations = [
      {
        id: 'cons-1',
        companyId: tenantId,
        investorName: 'Anita Roy',
        scheduledAt: '2026-11-01T10:00:00',
        consultantId: salesExecUser.id,
        consultantName: salesExecUser.name,
        status: 'Scheduled',
      },
      {
        id: 'cons-2',
        companyId: tenantId,
        investorName: 'Manish Paul',
        scheduledAt: '2026-11-02T14:00:00',
        referredByAgentName: salesExecUser.name,
        consultantName: 'Sunil Advisor',
        status: 'Scheduled',
      },
      {
        id: 'cons-3',
        companyId: tenantId,
        investorName: 'Chetan Bhagat',
        scheduledAt: '2026-10-20T10:00:00',
        consultantId: salesExecUser.id,
        status: 'Completed',
      },
      {
        id: 'cons-4',
        companyId: tenantId,
        investorName: 'Other Person',
        consultantId: 'other-user',
        consultantName: 'Other Consultant',
        status: 'Scheduled',
      },
    ];

    storageService.set('consultations', consultations);

    const scoped = (storageService.getConsultations(tenantId) || []).filter((c: any) => {
      const refName = (c.referredByAgentName || '').trim().toLowerCase();
      const cName = (c.consultantName || '').trim().toLowerCase();
      const cId = String(c.consultantId || '');
      return (
        refName === salesExecUser.name.toLowerCase() ||
        cName === salesExecUser.name.toLowerCase() ||
        cId === salesExecUser.id
      );
    });

    const activeScheduled = scoped.filter(
      (c: any) => (c.status || '').toLowerCase() === 'scheduled' || !c.status
    );

    expect(activeScheduled.length).toBe(2);
    expect(activeScheduled.map(c => c.id)).toEqual(['cons-1', 'cons-2']);
  });

  it('correctly tracks Not-Interested and Junk leads counts for sales executive', () => {
    const leads = [
      {
        id: 'lead-ni-1',
        companyId: tenantId,
        name: 'NI Lead 1',
        status: 'Not Interested',
        assignedAgentId: salesExecUser.id,
      },
      {
        id: 'lead-ni-2',
        companyId: tenantId,
        name: 'NI Lead 2',
        status: 'Not Interested',
        assignedAgentId: salesExecUser.id,
      },
      {
        id: 'lead-junk-1',
        companyId: tenantId,
        name: 'Junk Lead 1',
        status: 'Junk',
        assignedAgentId: salesExecUser.id,
      },
      {
        id: 'lead-junk-2',
        companyId: tenantId,
        name: 'Junk Lead 2',
        status: 'Wrong Number',
        assignedAgentId: salesExecUser.id,
      },
      {
        id: 'lead-other',
        companyId: tenantId,
        name: 'Other Agent Lead',
        status: 'Not Interested',
        assignedAgentId: 'other-agent',
      },
    ];

    storageService.set('leads', leads);

    const allLeads = storageService.getLeads(tenantId);
    const niCount = allLeads.filter(
      (l: any) =>
        (l.status || '').toLowerCase() === 'not interested' &&
        String(l.assignedAgentId) === salesExecUser.id
    ).length;

    const junkCount = allLeads.filter((l: any) => {
      const s = (l.status || '').toLowerCase();
      return (s === 'junk' || s === 'wrong number') && String(l.assignedAgentId) === salesExecUser.id;
    }).length;

    expect(niCount).toBe(2);
    expect(junkCount).toBe(2);
  });

  it('correctly tracks unread notifications and chat conversations', () => {
    const notifs = [
      { id: 'notif-1', title: 'New lead assigned', read: false, recipientUserId: salesExecUser.id },
      { id: 'notif-2', title: 'Meeting reminder', read: true, recipientUserId: salesExecUser.id },
      { id: 'notif-3', title: 'System alert', read: false, recipientUserId: salesExecUser.id },
    ];
    globalThis.localStorage.setItem('nexus_notifications', JSON.stringify(notifs));

    const storedNotifs = (JSON.parse(globalThis.localStorage.getItem('nexus_notifications') || '[]')).filter(
      (n: any) => !n.read && n.recipientUserId === salesExecUser.id
    );
    expect(storedNotifs.length).toBe(2);

    const chatConvs = [
      { id: 'conv-1', companyId: '1', unreadCount: 3 },
      { id: 'conv-2', companyId: '1', unreadCount: 1 },
      { id: 'conv-3', companyId: '2', unreadCount: 5 }, // Different company
    ];
    globalThis.localStorage.setItem('nexus_chat_conversations', JSON.stringify(chatConvs));

    const currentCompanyChatUnread = chatConvs
      .filter(c => c.companyId === '1')
      .reduce((sum, c) => sum + (c.unreadCount || 0), 0);

    expect(currentCompanyChatUnread).toBe(4);
  });

  it('marks items as seen when page is visited, clearing the badge count until new entries arrive', () => {
    // 1. Initial followups: 2 pending followups exist
    const initialFollowups = [
      { id: 'fu-1', companyId: tenantId, status: 'Pending', assignedAgentId: salesExecUser.id },
      { id: 'fu-2', companyId: tenantId, status: 'Pending', assignedAgentId: salesExecUser.id },
    ];
    storageService.set('followups', initialFollowups);

    // Initial state: not seen yet, active IDs = ['fu-1', 'fu-2']
    let activeIds = initialFollowups.map(f => f.id);
    let seenIds = getSeenIds(tenantId, salesExecUser.id, 'followups');
    let unseenCount = activeIds.filter(id => !seenIds.has(id)).length;
    expect(unseenCount).toBe(2);

    // 2. User visits the followups page ('followups')
    markSeenIds(tenantId, salesExecUser.id, 'followups', activeIds);
    seenIds = getSeenIds(tenantId, salesExecUser.id, 'followups');
    unseenCount = activeIds.filter(id => !seenIds.has(id)).length;

    // Badge clears (disappears)!
    expect(unseenCount).toBe(0);

    // 3. User navigates away to dashboard. Existing followups are already seen, so unseenCount stays 0.
    const activeAgain = (storageService.getFollowups(tenantId) || []).map((f: any) => f.id);
    seenIds = getSeenIds(tenantId, salesExecUser.id, 'followups');
    unseenCount = activeAgain.filter(id => !seenIds.has(id)).length;
    expect(unseenCount).toBe(0);

    // 4. A new follow-up arrives ('fu-3')
    const updatedFollowups = [...initialFollowups, { id: 'fu-3', companyId: tenantId, status: 'Pending', assignedAgentId: salesExecUser.id }];
    storageService.set('followups', updatedFollowups);

    activeIds = updatedFollowups.map(f => f.id);
    seenIds = getSeenIds(tenantId, salesExecUser.id, 'followups');
    unseenCount = activeIds.filter(id => !seenIds.has(id)).length;

    // Only the 1 new entry shows as badge count!
    expect(unseenCount).toBe(1);

    // 5. User visits the followups page again
    markSeenIds(tenantId, salesExecUser.id, 'followups', activeIds);
    seenIds = getSeenIds(tenantId, salesExecUser.id, 'followups');
    unseenCount = activeIds.filter(id => !seenIds.has(id)).length;

    // Badge disappears again!
    expect(unseenCount).toBe(0);
  });

  it('clears chat unread count for company when chat is visited', () => {
    const chatConvs = [
      { id: 'conv-1', companyId: '1', unreadCount: 3 },
      { id: 'conv-2', companyId: '1', unreadCount: 2 },
    ];
    globalThis.localStorage.setItem('nexus_chat_conversations', JSON.stringify(chatConvs));

    clearChatUnreadForCompany('1');

    const updated = JSON.parse(globalThis.localStorage.getItem('nexus_chat_conversations') || '[]');
    const totalUnread = updated.reduce((acc: number, c: any) => acc + (c.unreadCount || 0), 0);
    expect(totalUnread).toBe(0);
  });
});

describe('Sidebar Badges for Admin Role', () => {
  const tenantId = 't-ghl-01';
  const adminUser = {
    id: 'usr-admin-1',
    name: 'GHL Admin',
    role: { code: 'company_admin', name: 'Company Admin' },
    companyId: '1',
  };

  beforeEach(() => {
    globalThis.localStorage.clear();
  });

  it('correctly validates isAssignedToIrm for Sales Exec vs IRM lead assignments', () => {
    // 1. Lead assigned by admin to a Sales Executive (No IRM assigned)
    const salesExecLead = {
      id: 'lead-se-1',
      name: 'Rohan Sharma',
      assignedAgentId: 'usr-se-1',
      assignedAgentName: 'Naveen Kumar',
      assignedAgentRole: 'sales_executive',
    };
    expect(isAssignedToIrm(salesExecLead)).toBe(false);

    // 2. Lead assigned/transferred by Sales Executive to an IRM (assignedIrmId / assignedIrmName)
    const irmAssignedLead = {
      id: 'lead-irm-1',
      name: 'Kavita Patel',
      assignedAgentId: 'usr-se-1',
      assignedAgentName: 'Naveen Kumar',
      assignedIrmId: '5',
      assignedIrmName: 'Dhinakaran',
      transferredBySalesExecutiveName: 'Naveen Kumar',
    };
    expect(isAssignedToIrm(irmAssignedLead)).toBe(true);

    // 3. Lead with customFields containing IRM assignment
    const customFieldsIrmLead = {
      id: 'lead-cf-1',
      name: 'Amitabh Joshi',
      customFields: {
        assignedIrmId: '5',
        assignedIrmName: 'Dhinakaran',
      },
    };
    expect(isAssignedToIrm(customFieldsIrmLead)).toBe(true);

    // 4. Lead where assignedAgentRole is explicitly IRM
    const directIrmLead = {
      id: 'lead-direct-irm',
      name: 'Meera Nair',
      assignedAgentId: '5',
      assignedAgentName: 'Dhinakaran',
      assignedAgentRole: 'irm',
    };
    expect(isAssignedToIrm(directIrmLead)).toBe(true);
  });

  it('assigned-leads badge displays count ONLY when leads are assigned to IRM, and clears when visited', () => {
    // Lead 1: Admin assigns to Sales Executive Naveen -> No badge count needed!
    const leadAssignedToSalesExec = {
      id: 'l-1',
      companyId: tenantId,
      name: 'Sales Exec Assigned Lead',
      assignedAgentId: '3',
      assignedAgentName: 'Naveen',
      assignedAgentRole: 'sales_executive',
    };

    const initialLeads = [leadAssignedToSalesExec];
    storageService.set('leads', initialLeads);

    // Verify: Only leads where isAssignedToIrm(l) is true produce badge entries for assigned-leads
    let irmLeads = initialLeads.filter(isAssignedToIrm);
    let activeIds = irmLeads.map(l => l.id);
    let seenIds = getSeenIds(tenantId, adminUser.id, 'assigned-leads');
    let badgeCount = activeIds.filter(id => !seenIds.has(id)).length;

    // Zero badge when only assigned to sales executive
    expect(badgeCount).toBe(0);

    // Lead 2: Sales Executive Naveen qualifies and assigns/transfers to IRM Dhinakaran
    const leadAssignedToIrm = {
      id: 'l-2',
      companyId: tenantId,
      name: 'IRM Assigned Lead',
      assignedAgentId: '3',
      assignedAgentName: 'Naveen',
      assignedIrmId: '5',
      assignedIrmName: 'Dhinakaran',
      transferredBySalesExecutiveName: 'Naveen',
    };

    const updatedLeads = [...initialLeads, leadAssignedToIrm];
    storageService.set('leads', updatedLeads);

    irmLeads = updatedLeads.filter(isAssignedToIrm);
    activeIds = irmLeads.map(l => l.id);
    seenIds = getSeenIds(tenantId, adminUser.id, 'assigned-leads');
    badgeCount = activeIds.filter(id => !seenIds.has(id)).length;

    // Badge now shows 1 for the IRM assignment
    expect(badgeCount).toBe(1);
    expect(activeIds).toEqual(['l-2']);

    // Admin visits the assigned leads page ('assigned-leads')
    markSeenIds(tenantId, adminUser.id, 'assigned-leads', activeIds);
    seenIds = getSeenIds(tenantId, adminUser.id, 'assigned-leads');
    badgeCount = activeIds.filter(id => !seenIds.has(id)).length;

    // Badge count clears to 0 after viewing!
    expect(badgeCount).toBe(0);

    // Admin navigates away; previously seen IRM lead does not trigger badge
    seenIds = getSeenIds(tenantId, adminUser.id, 'assigned-leads');
    badgeCount = activeIds.filter(id => !seenIds.has(id)).length;
    expect(badgeCount).toBe(0);

    // A 3rd lead is assigned to IRM
    const anotherIrmLead = {
      id: 'l-3',
      companyId: tenantId,
      name: 'Second IRM Lead',
      assignedIrmId: '5',
      assignedIrmName: 'Dhinakaran',
    };
    const latestLeads = [...updatedLeads, anotherIrmLead];
    storageService.set('leads', latestLeads);

    irmLeads = latestLeads.filter(isAssignedToIrm);
    activeIds = irmLeads.map(l => l.id);
    seenIds = getSeenIds(tenantId, adminUser.id, 'assigned-leads');
    badgeCount = activeIds.filter(id => !seenIds.has(id)).length;

    // Badge shows only the new unseen lead (count = 1)
    expect(badgeCount).toBe(1);
  });

  it('tracks company-wide active leads, follow-ups, and customer 360 for admin', () => {
    // 1. Leads: Admin sees all active company leads (regardless of assigned agent)
    const companyLeads = [
      { id: 'lead-a1', companyId: tenantId, name: 'Lead 1', status: 'New', assignedAgentId: '3' },
      { id: 'lead-a2', companyId: tenantId, name: 'Lead 2', status: 'Contacted', assignedAgentId: '4' },
      { id: 'lead-a3', companyId: tenantId, name: 'Lead 3', status: 'Junk', assignedAgentId: '3' }, // moved
    ];
    storageService.set('leads', companyLeads);
    storageService.set('followups', []);

    const MOVED_LEAD_STATUSES = ['interested', 'converted', 'follow-up required', 'callback', 'not interested', 'junk'];
    const activeAdminLeads = (storageService.getLeads(tenantId) || []).filter((l: any) => {
      const s = (l.status || '').toLowerCase();
      return !MOVED_LEAD_STATUSES.includes(s);
    });
    expect(activeAdminLeads.length).toBe(2);

    let activeLeadIds = activeAdminLeads.map(l => l.id);
    let seenLeadIds = getSeenIds(tenantId, adminUser.id, 'leads');
    expect(activeLeadIds.filter(id => !seenLeadIds.has(id)).length).toBe(2);

    // Visiting /leads marks them seen
    markSeenIds(tenantId, adminUser.id, 'leads', activeLeadIds);
    seenLeadIds = getSeenIds(tenantId, adminUser.id, 'leads');
    expect(activeLeadIds.filter(id => !seenLeadIds.has(id)).length).toBe(0);

    // 2. Follow-ups: Admin sees all pending followups company-wide
    const companyFollowups = [
      { id: 'fu-a1', companyId: tenantId, status: 'Pending', assignedAgentId: '3' },
      { id: 'fu-a2', companyId: tenantId, status: 'Pending', assignedAgentId: '4' },
      { id: 'fu-a3', companyId: tenantId, status: 'Completed', assignedAgentId: '3' },
    ];
    storageService.set('followups', companyFollowups);

    const pendingAdminFollowups = (storageService.getFollowups(tenantId) || []).filter((f: any) => f.status === 'Pending');
    expect(pendingAdminFollowups.length).toBe(2);

    let activeFuIds = pendingAdminFollowups.map(f => f.id);
    let seenFuIds = getSeenIds(tenantId, adminUser.id, 'followups');
    expect(activeFuIds.filter(id => !seenFuIds.has(id)).length).toBe(2);

    markSeenIds(tenantId, adminUser.id, 'followups', activeFuIds);
    seenFuIds = getSeenIds(tenantId, adminUser.id, 'followups');
    expect(activeFuIds.filter(id => !seenFuIds.has(id)).length).toBe(0);

    // 3. Customers 360: Admin sees company customers
    const companyCustomers = [
      { id: 'cust-1', companyId: tenantId, name: 'Corp A' },
      { id: 'cust-2', companyId: tenantId, name: 'Corp B' },
    ];
    storageService.set('customers', companyCustomers);

    let activeCustIds = companyCustomers.map(c => c.id);
    let seenCustIds = getSeenIds(tenantId, adminUser.id, 'customers');
    expect(activeCustIds.filter(id => !seenCustIds.has(id)).length).toBe(2);

    markSeenIds(tenantId, adminUser.id, 'customers', activeCustIds);
    seenCustIds = getSeenIds(tenantId, adminUser.id, 'customers');
    expect(activeCustIds.filter(id => !seenCustIds.has(id)).length).toBe(0);
  });

  it('tracks archived leads, consultations, kyc leads, opportunities, investors 360, leave requests, support', () => {
    // Archived leads: Junk, Wrong Number, Not Interested
    const allLeads = [
      { id: 'arch-1', companyId: tenantId, status: 'Junk' },
      { id: 'arch-2', companyId: tenantId, status: 'Wrong Number' },
      { id: 'arch-3', companyId: tenantId, status: 'Not Interested' },
      { id: 'active-1', companyId: tenantId, status: 'New' },
    ];
    const archived = allLeads.filter(l => ['junk', 'wrong number', 'not interested'].includes(l.status.toLowerCase()));
    expect(archived.length).toBe(3);

    let activeArchIds = archived.map(l => l.id);
    let seenArchIds = getSeenIds(tenantId, adminUser.id, 'archived-leads');
    expect(activeArchIds.filter(id => !seenArchIds.has(id)).length).toBe(3);

    markSeenIds(tenantId, adminUser.id, 'archived-leads', activeArchIds);
    seenArchIds = getSeenIds(tenantId, adminUser.id, 'archived-leads');
    expect(activeArchIds.filter(id => !seenArchIds.has(id)).length).toBe(0);

    // Consultations
    const scheduledConsultations = [
      { id: 'c-1', companyId: tenantId, status: 'Scheduled' },
      { id: 'c-2', companyId: tenantId, status: 'Rescheduled' },
    ];
    let activeConsIds = scheduledConsultations.map(c => c.id);
    let seenConsIds = getSeenIds(tenantId, adminUser.id, 'consultations');
    expect(activeConsIds.filter(id => !seenConsIds.has(id)).length).toBe(2);
    markSeenIds(tenantId, adminUser.id, 'consultations', activeConsIds);
    seenConsIds = getSeenIds(tenantId, adminUser.id, 'consultations');
    expect(activeConsIds.filter(id => !seenConsIds.has(id)).length).toBe(0);

    // KYC Leads
    const kycDeals = [
      { id: 'deal-kyc-1', stage: 'qualified_investor' },
      { id: 'deal-kyc-2', stage: 'kyc' },
    ];
    let activeKycIds = kycDeals.map(d => d.id);
    let seenKycIds = getSeenIds(tenantId, adminUser.id, 'kyc');
    expect(activeKycIds.filter(id => !seenKycIds.has(id)).length).toBe(2);
    markSeenIds(tenantId, adminUser.id, 'kyc', activeKycIds);
    seenKycIds = getSeenIds(tenantId, adminUser.id, 'kyc');
    expect(activeKycIds.filter(id => !seenKycIds.has(id)).length).toBe(0);

    // Opportunities
    const opps = [{ id: 'opp-1' }, { id: 'opp-2' }];
    let activeOppIds = opps.map(o => o.id);
    let seenOppIds = getSeenIds(tenantId, adminUser.id, 'opportunities');
    expect(activeOppIds.filter(id => !seenOppIds.has(id)).length).toBe(2);
    markSeenIds(tenantId, adminUser.id, 'opportunities', activeOppIds);
    seenOppIds = getSeenIds(tenantId, adminUser.id, 'opportunities');
    expect(activeOppIds.filter(id => !seenOppIds.has(id)).length).toBe(0);

    // Investors 360
    const investors = [{ id: 'inv-1' }, { id: 'inv-2' }];
    let activeInvIds = investors.map(i => i.id);
    let seenInvIds = getSeenIds(tenantId, adminUser.id, 'investors');
    expect(activeInvIds.filter(id => !seenInvIds.has(id)).length).toBe(2);
    markSeenIds(tenantId, adminUser.id, 'investors', activeInvIds);
    seenInvIds = getSeenIds(tenantId, adminUser.id, 'investors');
    expect(activeInvIds.filter(id => !seenInvIds.has(id)).length).toBe(0);

    // Leave Requests
    const leaveRequests = [
      { id: 'lr-1', status: 'Pending' },
      { id: 'lr-2', status: 'Pending' },
    ];
    let activeLrIds = leaveRequests.map(r => r.id);
    let seenLrIds = getSeenIds(tenantId, adminUser.id, 'leave-requests');
    expect(activeLrIds.filter(id => !seenLrIds.has(id)).length).toBe(2);
    markSeenIds(tenantId, adminUser.id, 'leave-requests', activeLrIds);
    seenLrIds = getSeenIds(tenantId, adminUser.id, 'leave-requests');
    expect(activeLrIds.filter(id => !seenLrIds.has(id)).length).toBe(0);

    // Support Tickets
    const supportTickets = [
      { id: 't-1', status: 'open' },
      { id: 't-2', status: 'in_progress' },
    ];
    let activeTicketIds = supportTickets.map(t => t.id);
    let seenTicketIds = getSeenIds(tenantId, adminUser.id, 'support');
    expect(activeTicketIds.filter(id => !seenTicketIds.has(id)).length).toBe(2);
    markSeenIds(tenantId, adminUser.id, 'support', activeTicketIds);
    seenTicketIds = getSeenIds(tenantId, adminUser.id, 'support');
    expect(activeTicketIds.filter(id => !seenTicketIds.has(id)).length).toBe(0);
  });

  it('increments admin Archived Leads badge when Sales Exec marks lead as Not Interested, then resets when seen', () => {
    // 1. Initial seen archived leads
    const initialArchived = [
      { id: '101', companyId: tenantId, status: 'Not Interested', name: 'Existing Lead 1' },
      { id: '102', companyId: tenantId, status: 'Junk', name: 'Existing Lead 2' },
    ];
    markSeenIds(tenantId, adminUser.id, 'archived-leads', initialArchived.map(l => getArchivedLeadKey(l)));

    let seen = getSeenIds(tenantId, adminUser.id, 'archived-leads');
    let unseenCount = initialArchived.filter(l => !seen.has(getArchivedLeadKey(l))).length;
    expect(unseenCount).toBe(0);

    // 2. Naveen (Sales Exec) marks lead 205 as 'Not Interested'
    const updatedArchived = [
      ...initialArchived,
      { id: '205', companyId: tenantId, status: 'Not Interested', name: 'Naveen Contact', assignedAgentName: 'Naveen' },
    ];

    seen = getSeenIds(tenantId, adminUser.id, 'archived-leads');
    unseenCount = updatedArchived.filter(l => !seen.has(getArchivedLeadKey(l))).length;
    expect(unseenCount).toBe(1);

    // 3. Admin visits Archived Leads page
    markSeenIds(tenantId, adminUser.id, 'archived-leads', updatedArchived.map(l => getArchivedLeadKey(l)));
    seen = getSeenIds(tenantId, adminUser.id, 'archived-leads');
    unseenCount = updatedArchived.filter(l => !seen.has(getArchivedLeadKey(l))).length;
    expect(unseenCount).toBe(0);
  });

  it('handles user workflow: lead -> wrong number -> admin badge -> reengage -> not interested -> admin badge again', () => {
    const adminId = adminUser.id;
    // 1. Start clean: clear any seen IDs for this user
    localStorage.removeItem(`nexus_seen_ids_${tenantId}_${adminId}_archived-leads`);

    // 2. Lead created and assigned to Naveen, then marked 'Wrong Number' (Junk)
    const leadV1 = {
      id: 'lead-test-999',
      companyId: tenantId,
      name: 'Rohan Sharma',
      phone: '+91 98765 43210',
      status: 'Wrong Number',
      assignedAgentName: 'Naveen',
      updatedAt: '2026-10-28T10:00:00Z',
    };

    let currentArchivedList = [leadV1];
    let seen = getSeenIds(tenantId, adminId, 'archived-leads');
    let unseenCount = currentArchivedList.filter(l => !seen.has(getArchivedLeadKey(l))).length;
    expect(unseenCount).toBe(1); // Admin sees badge 1 for Archived Leads!

    // 3. Admin visits Archived Leads page -> marks seen
    markSeenIds(tenantId, adminId, 'archived-leads', currentArchivedList.map(l => getArchivedLeadKey(l)));
    seen = getSeenIds(tenantId, adminId, 'archived-leads');
    unseenCount = currentArchivedList.filter(l => !seen.has(getArchivedLeadKey(l))).length;
    expect(unseenCount).toBe(0); // Badge disappears!

    // 4. Lead is re-engaged back to Follow-up Required (removed from archived list)
    currentArchivedList = [];
    unseenCount = currentArchivedList.filter(l => !seen.has(getArchivedLeadKey(l))).length;
    expect(unseenCount).toBe(0); // Still 0

    // 5. From follow-up, lead is now marked as 'Not Interested' (re-enters archived leads with updated status & timestamp)
    const leadV2 = {
      id: 'lead-test-999',
      companyId: tenantId,
      name: 'Rohan Sharma',
      phone: '+91 98765 43210',
      status: 'Not Interested',
      assignedAgentName: 'Naveen',
      updatedAt: '2026-10-28T10:15:00Z',
    };
    currentArchivedList = [leadV2];

    seen = getSeenIds(tenantId, adminId, 'archived-leads');
    unseenCount = currentArchivedList.filter(l => !seen.has(getArchivedLeadKey(l))).length;
    expect(unseenCount).toBe(1); // Admin sees badge 1 again!

    // 6. Admin visits Archived Leads page again -> marks seen
    markSeenIds(tenantId, adminId, 'archived-leads', currentArchivedList.map(l => getArchivedLeadKey(l)));
    seen = getSeenIds(tenantId, adminId, 'archived-leads');
    unseenCount = currentArchivedList.filter(l => !seen.has(getArchivedLeadKey(l))).length;
    expect(unseenCount).toBe(0); // Badge cleared!
  });

  it('WhatsApp-style behavior: viewing 4 archived leads vanishes badge, navigating away keeps it 0, and 1 new lead shows badge 1 (not 5)', () => {
    const adminId = adminUser.id;
    const baseTime = 1700000000000;

    // 1. Initial system state: 4 archived leads exist in database
    const leads4 = [
      { id: '1', status: 'Junk', updatedAt: new Date(baseTime + 1000).toISOString() },
      { id: '2', status: 'Wrong Number', updatedAt: new Date(baseTime + 2000).toISOString() },
      { id: '3', status: 'Not Interested', updatedAt: new Date(baseTime + 3000).toISOString() },
      { id: '4', status: 'Wrong Number', updatedAt: new Date(baseTime + 4000).toISOString() },
    ];

    // Admin has never seen them before (fresh login or state)
    let unseen = countUnseenItems(leads4, 'archived-leads', getArchivedLeadKey, tenantId, adminId);
    expect(unseen).toBe(4);

    // 2. Admin visits Archived Leads page at time baseTime + 5000
    // The page marks all 4 leads as seen
    markRouteSeen(tenantId, adminId, 'archived-leads', leads4, getArchivedLeadKey, baseTime + 5000);

    // While on that page or right after viewing:
    expect(getLastSeenTime(tenantId, adminId, 'archived-leads')).toBeGreaterThanOrEqual(baseTime + 4000);

    // 3. Admin navigates away to other page (e.g., Dashboard or Leads)
    // BUG FIX VERIFICATION: Badge must NOT return to 4! It must vanish (0 unseen)!
    unseen = countUnseenItems(leads4, 'archived-leads', getArchivedLeadKey, tenantId, adminId);
    expect(unseen).toBe(0);

    // 4. Sales exec Naveen marks 1 new lead as 'Wrong Number' at time baseTime + 10000
    const lead5 = {
      id: '5',
      status: 'Wrong Number',
      updatedAt: new Date(baseTime + 10000).toISOString(),
    };
    const leads5 = [...leads4, lead5];

    // BUG FIX VERIFICATION: Must show 1, NOT 5 (not collective all data count!)
    unseen = countUnseenItems(leads5, 'archived-leads', getArchivedLeadKey, tenantId, adminId);
    expect(unseen).toBe(1);

    // 5. Admin visits Archived Leads page again to see the new lead
    markRouteSeen(tenantId, adminId, 'archived-leads', leads5, getArchivedLeadKey, baseTime + 15000);

    // Admin goes back to Dashboard -> badge vanishes again (0)
    unseen = countUnseenItems(leads5, 'archived-leads', getArchivedLeadKey, tenantId, adminId);
    expect(unseen).toBe(0);
  });
  it('Tenant alias resolution: seen items marked under "t-ghl-01" remain seen when queried under "1" or "ghl"', () => {
    const userId = '3'; // Naveen
    const yesterdayTime = Date.now() - 86400000;
    const leads = [
      { id: '101', name: 'Lead 101', createdAt: new Date(yesterdayTime - 5000).toISOString() },
      { id: '102', name: 'Lead 102', createdAt: new Date(yesterdayTime - 4000).toISOString() },
      { id: '103', name: 'Lead 103', createdAt: new Date(yesterdayTime - 3000).toISOString() },
    ];

    // Yesterday: Naveen viewed leads when tenant context was 't-ghl-01'
    markRouteSeen('t-ghl-01', userId, 'leads', leads, (l) => String(l.id), yesterdayTime);

    // Today: Naveen logs in fresh. PostgreSQL / API reports tenant.id = '1'
    let unseenCount = countUnseenItems(leads, 'leads', (l) => String(l.id), '1', userId);
    expect(unseenCount).toBe(0); // MUST stay 0, badges must not reappear!

    // Also check when tenant is slug 'ghl'
    unseenCount = countUnseenItems(leads, 'leads', (l) => String(l.id), 'ghl', userId);
    expect(unseenCount).toBe(0);

    // Now today a brand new lead arrives
    const newLeadToday = { id: '104', name: 'Lead 104', createdAt: new Date().toISOString() };
    const updatedLeads = [...leads, newLeadToday];

    // Naveen should see badge count 1 (only the new lead), not 4!
    unseenCount = countUnseenItems(updatedLeads, 'leads', (l) => String(l.id), '1', userId);
    expect(unseenCount).toBe(1);
  });

  it('Admin role: seen items marked under "1" remain seen when queried under "t-ghl-01" on subsequent login', () => {
    const adminId = 'usr-admin-1';
    const yesterdayTime = Date.now() - 86400000;
    const opps = [
      { id: 'opp-1', title: 'Opp 1', createdAt: new Date(yesterdayTime - 10000).toISOString() },
      { id: 'opp-2', title: 'Opp 2', createdAt: new Date(yesterdayTime - 5000).toISOString() },
    ];

    // Admin views opportunities under tenant '1'
    markRouteSeen('1', adminId, 'opportunities', opps, (o) => String(o.id), yesterdayTime);

    // Next day login under tenant 't-ghl-01'
    let unseen = countUnseenItems(opps, 'opportunities', (o) => String(o.id), 't-ghl-01', adminId);
    expect(unseen).toBe(0);

    // New opportunity added today
    const newOpp = { id: 'opp-3', title: 'Opp 3', createdAt: new Date().toISOString() };
    unseen = countUnseenItems([...opps, newOpp], 'opportunities', (o) => String(o.id), 't-ghl-01', adminId);
    expect(unseen).toBe(1);
  });
  it('Cross-browser synchronization: Browser 1 (Edge) seen items sync to Browser 2 (Chrome) via backend badge state API', async () => {
    const userId = '3'; // Naveen
    const mockServerDb: Record<string, any> = {};

    // Mock apiClient for cross-browser sync test
    const origPost = apiClient.post;
    apiClient.post = async (url: string, body: any): Promise<any> => {
      if (url === '/user/badge-state') {
        const routes = body?.routes || {};
        for (const [r, state] of Object.entries<any>(routes)) {
          if (!mockServerDb[r]) mockServerDb[r] = { seenIds: [], lastSeenTime: 0 };
          const set = new Set([...mockServerDb[r].seenIds, ...(state.seenIds || [])]);
          mockServerDb[r].seenIds = Array.from(set);
          if (state.lastSeenTime > mockServerDb[r].lastSeenTime) {
            mockServerDb[r].lastSeenTime = state.lastSeenTime;
          }
        }
        return { success: true, data: mockServerDb };
      }
      return { success: true, data: {} };
    };

    // 1. Browser 1 (Edge) has seen 4 Not-Interested leads and 3 Junk leads
    const notInterestedLeads = [
      { id: 'ni-1', name: 'Lead 1', updatedAt: '2026-10-28T10:00:00Z' },
      { id: 'ni-2', name: 'Lead 2', updatedAt: '2026-10-28T10:00:00Z' },
      { id: 'ni-3', name: 'Lead 3', updatedAt: '2026-10-28T10:00:00Z' },
      { id: 'ni-4', name: 'Lead 4', updatedAt: '2026-10-28T10:00:00Z' },
    ];
    markRouteSeen('1', userId, 'not-interested', notInterestedLeads, l => String(l.id), 1730178400000);

    // Edge pushes state to server
    await syncBadgeStateWithServer('1', userId);
    expect(mockServerDb['not-interested']?.seenIds).toContain('ni-1');

    // 2. Browser 2 (Chrome) simulation: localStorage is completely cleared (new browser / incognito)
    globalThis.localStorage.clear();

    // Prior to sync, Chrome would see 4 unseen leads
    let chromeUnseen = countUnseenItems(notInterestedLeads, 'not-interested', l => String(l.id), '1', userId);
    expect(chromeUnseen).toBe(4);

    // Chrome performs syncBadgeStateWithServer upon login or tab focus
    await syncBadgeStateWithServer('1', userId);

    // After sync, Chrome has received Edge's seen state from the backend!
    chromeUnseen = countUnseenItems(notInterestedLeads, 'not-interested', l => String(l.id), '1', userId);
    expect(chromeUnseen).toBe(0); // Badge cleared in Chrome as well!

    // Restore apiClient.post
    apiClient.post = origPost;
  });
});
