import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Lead } from '../types';
import { TimelineEvent } from '../components/common/Timeline';
import { apiClient } from '../services/apiClient';
import { storageService } from '../services/storageService';
import { saveLead as apiSaveLead, saveFollowup as apiSaveFollowup } from '../services/ghlApiService';

/**
 * Filter leads assigned to a sales executive or unassigned
 */
export function filterScopedLeads(leads: Lead[], user: any, isExec: boolean): Lead[] {
  if (!isExec) return leads;
  const uid = user?.id ? String(user.id) : '';
  const uname = user?.name ? user.name.trim().toLowerCase() : '';

  return leads.filter(l => {
    const agentId = l.assignedAgentId ? String(l.assignedAgentId) : '';
    const agentName = l.assignedAgentName ? l.assignedAgentName.trim().toLowerCase() : '';
    const salesExecId = l.assignedSalesExecutiveId ? String(l.assignedSalesExecutiveId) : '';
    const salesExecName = l.assignedSalesExecutiveName ? l.assignedSalesExecutiveName.trim().toLowerCase() : '';

    if (!agentId && !agentName) return true;
    if (uid && (agentId === uid || salesExecId === uid)) return true;
    if (uname && (agentName === uname || salesExecName === uname)) return true;
    return false;
  });
}

/**
 * Build timeline events combining lead creation and logged call records
 */
export function getLeadCallTimelineEvents(lead: Lead, calls: any[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({
    id: `ev-create-${lead.id}`,
    type: 'note',
    title: 'Lead Created',
    description: `Sourced from ${lead.source}`,
    timestamp: lead.createdAt,
    actorName: lead.assignedAgentName,
  });

  const leadCalls = calls.filter((c: any) => c.contactPhone === lead.phone || c.contactName === lead.name);

  leadCalls.forEach((c: any) => {
    events.push({
      id: `ev-call-${c.id}`,
      type: 'call',
      title: `Call Logged - ${c.disposition}`,
      description: `Duration: ${Math.trunc(c.duration / 60)}m ${c.duration % 60}s. ${c.notes || ''}`,
      timestamp: c.timestamp,
      actorName: c.agentName,
    });
  });

  return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/**
 * Re-engage a lead back to Follow-up Required status and schedule follow-up
 */
export async function reengageLead({
  lead,
  tenant,
  user,
  sourceLabel,
}: {
  lead: Lead;
  tenant: any;
  user: any;
  sourceLabel: string;
}): Promise<void> {
  const numId = parseInt(String(lead.id).replace(/\D/g, ''), 10);
  let backendSuccess = false;
  if (numId) {
    try {
      await apiClient.post(`/sales-executive/leads/${numId}/reengage`);
      backendSuccess = true;
      storageService.saveLead({ ...lead, status: 'Follow-up Required' });
    } catch (e) {
      console.warn('Backend reengage error, falling back to apiSaveLead', e);
      await apiSaveLead({ ...lead, status: 'Follow-up Required' });
    }
  } else {
    await apiSaveLead({ ...lead, status: 'Follow-up Required' });
  }

  if (!backendSuccess) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const newFlw = {
      id: `flw-${Date.now()}`,
      companyId: tenant.id,
      contactId: lead.id,
      contactName: lead.name,
      contactPhone: lead.phone,
      contactType: 'lead' as const,
      scheduledAt: tomorrow.toISOString(),
      priority: 'High' as const,
      status: 'Pending' as const,
      notes: `Re-engaged from ${sourceLabel} — follow-up required with ${lead.name}.`,
      assignedAgentId: user.id,
      assignedAgentName: user.name,
    };
    await apiSaveFollowup(newFlw);
  }
}

export const renderLeadNameAndContact = (r: Lead) => (
  <div>
    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{r.name}</div>
    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 2 }}>
      {r.phone} • {r.location || 'Unknown'}
    </div>
  </div>
);

export const renderLeadSourceBadge = (r: Lead) => (
  <span
    style={{
      display: "inline-flex",
      padding: "3px 10px",
      borderRadius: 100,
      fontSize: 11,
      fontWeight: 600,
      background: "rgba(100, 116, 139, 0.12)",
      color: "#94a3b8",
      border: "1px solid rgba(100, 116, 139, 0.2)",
    }}
  >
    {r.source}
  </span>
);

export const ReengageButton: React.FC<{
  disabled?: boolean;
  onClick: () => void;
}> = ({ disabled, onClick }) => (
  <button
    type="button"
    className="btn btn-sm"
    style={{
      backgroundColor: '#16a34a',
      color: '#fff',
      border: 'none',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      whiteSpace: 'nowrap',
      flexShrink: 0,
    }}
    disabled={disabled}
    onClick={onClick}
  >
    <RefreshCw size={13} />
    Re-engage → Follow-up
  </button>
);
