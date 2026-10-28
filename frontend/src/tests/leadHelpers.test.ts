import { describe, it, expect, vi, beforeEach } from 'vitest';
import { filterScopedLeads, getLeadCallTimelineEvents, reengageLead } from '../utils/leadHelpers';
import { apiClient } from '../services/apiClient';
import { storageService } from '../services/storageService';
import * as ghlApiService from '../services/ghlApiService';
import { Lead } from '../types';

vi.mock('../services/apiClient', () => ({
  apiClient: {
    post: vi.fn(),
  },
}));

vi.mock('../services/storageService', () => ({
  storageService: {
    saveLead: vi.fn(),
  },
}));

vi.mock('../services/ghlApiService', () => ({
  saveLead: vi.fn(),
  saveFollowup: vi.fn(),
}));

describe('leadHelpers Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('filterScopedLeads', () => {
    const dummyLeads: Lead[] = [
      { id: '1', name: 'Lead 1', phone: '111', status: 'Junk', source: 'Web', assignedAgentId: 'agent-1' } as any,
      { id: '2', name: 'Lead 2', phone: '222', status: 'Junk', source: 'Referral', assignedSalesExecutiveId: 'agent-1' } as any,
      { id: '3', name: 'Lead 3', phone: '333', status: 'Junk', source: 'Facebook', assignedAgentId: 'agent-2' } as any,
      { id: '4', name: 'Unassigned', phone: '444', status: 'Junk', source: 'Walk-in' } as any,
    ];

    it('returns all leads if not sales_executive', () => {
      const result = filterScopedLeads(dummyLeads, { id: 'agent-1', name: 'Alice' }, false);
      expect(result).toHaveLength(dummyLeads.length);
    });

    it('filters leads by agent ID or sales executive ID', () => {
      const user = { id: 'agent-1', name: 'Alice' };
      const result = filterScopedLeads(dummyLeads, user, true);
      const ids = result.map(l => l.id);
      expect(ids).toContain('1');
      expect(ids).toContain('2');
      expect(ids).toContain('4'); // Unassigned lead is included
      expect(ids).not.toContain('3');
    });

    it('matches by agent name if ID is missing or mismatched', () => {
      const leads: Lead[] = [
        { id: '10', name: 'Lead 10', phone: '101', status: 'Junk', source: 'Web', assignedAgentName: 'Bob Smith' } as any,
        { id: '20', name: 'Lead 20', phone: '202', status: 'Junk', source: 'Web', assignedAgentName: 'Charlie' } as any,
      ];
      const user = { id: 'other-id', name: 'Bob Smith' };
      const result = filterScopedLeads(leads, user, true);
      expect(result.map(l => l.id)).toEqual(['10']);
    });
  });

  describe('getLeadCallTimelineEvents', () => {
    it('creates lead creation and sorted call events', () => {
      const lead: Lead = {
        id: 'lead-1',
        name: 'John Doe',
        phone: '+919999900000',
        createdAt: '2026-01-01T10:00:00Z',
        source: 'Google Ads',
        assignedAgentName: 'Agent Cooper',
      } as any;

      const calls = [
        {
          id: 'call-1',
          contactPhone: '+919999900000',
          contactName: 'John Doe',
          disposition: 'Wrong Number',
          duration: 75,
          notes: 'Wrong person answered',
          timestamp: '2026-01-02T12:00:00Z',
          agentName: 'Agent Cooper',
        },
        {
          id: 'call-2',
          contactPhone: '+918888800000', // unrelated
          contactName: 'Other',
          disposition: 'Connected',
          duration: 30,
          timestamp: '2026-01-02T13:00:00Z',
          agentName: 'Agent Cooper',
        },
      ];

      const events = getLeadCallTimelineEvents(lead, calls);
      expect(events).toHaveLength(2); // 1 creation + 1 call
      expect(events[0].id).toBe('ev-call-call-1');
      expect(events[0].title).toBe('Call Logged - Wrong Number');
      expect(events[0].description).toBe('Duration: 1m 15s. Wrong person answered');
      expect(events[1].id).toBe('ev-create-lead-1');
      expect(events[1].title).toBe('Lead Created');
    });
  });

  describe('reengageLead', () => {
    it('posts to backend endpoint when numeric id exists', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({ success: true } as any);

      const lead = { id: 'lead-123', name: 'Jane', phone: '1234567890' } as any;
      const tenant = { id: 'tenant-1' };
      const user = { id: 'usr-1', name: 'Agent' };

      await reengageLead({ lead, tenant, user, sourceLabel: 'Junk' });

      expect(apiClient.post).toHaveBeenCalledWith('/sales-executive/leads/123/reengage');
      expect(storageService.saveLead).toHaveBeenCalledWith(expect.objectContaining({
        id: 'lead-123',
        status: 'Follow-up Required',
      }));
    });

    it('falls back to apiSaveLead and creates follow-up entry when backend fails', async () => {
      vi.mocked(apiClient.post).mockRejectedValueOnce(new Error('Backend error'));

      const lead = { id: 'lead-456', name: 'Jane', phone: '1234567890' } as any;
      const tenant = { id: 'tenant-1' };
      const user = { id: 'usr-1', name: 'Agent' };

      await reengageLead({ lead, tenant, user, sourceLabel: 'Not Interested' });

      expect(ghlApiService.saveLead).toHaveBeenCalledWith(expect.objectContaining({
        id: 'lead-456',
        status: 'Follow-up Required',
      }));
      expect(ghlApiService.saveFollowup).toHaveBeenCalledWith(expect.objectContaining({
        contactId: 'lead-456',
        status: 'Pending',
        notes: expect.stringContaining('Re-engaged from Not Interested'),
      }));
    });
  });
});
