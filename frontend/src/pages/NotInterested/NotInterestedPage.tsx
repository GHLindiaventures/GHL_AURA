import React, { useState, useEffect } from 'react';
import { Phone, ExternalLink, XCircle, RefreshCw } from 'lucide-react';
import { Lead, CallRecord } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useCall } from '../../context/CallContext';
import {
  getLeads,
  getNotInterestedLeads,
  saveLead as apiSaveLead,
  saveFollowup as apiSaveFollowup,
  getCalls,
} from '../../services/ghlApiService';
import { apiClient } from '../../services/apiClient';
import { storageService } from '../../services/storageService';
import { DataTable, Column, RowAction } from '../../components/common/DataTable';
import { Drawer } from '../../components/common/Drawer';
import { Timeline, TimelineEvent } from '../../components/common/Timeline';
import { LeadDetailDrawerContent } from '../../components/common/LeadDetailDrawerContent';
import { LeadContactDetailsCard } from '../../components/common/LeadContactDetailsCard';
import { filterScopedLeads, getLeadCallTimelineEvents, reengageLead, renderLeadNameAndContact, renderLeadSourceBadge, ReengageButton } from '../../utils/leadHelpers';
import { canPlaceCalls } from '../../utils/agentRoleUtils';
import './NotInterestedPage.css';

export const NotInterestedPage: React.FC = () => {
  const { tenant, user } = useAuth();
  const { initiateCall } = useCall();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [reengaging, setReengaging] = useState(false);

  const roleCode = user?.role?.code;
  const isExec = roleCode === 'sales_executive';
  const isGhlSalesExec = tenant?.slug === 'ghl' && isExec;

  const loadData = async () => {
    try {
      const [niLeads, allCalls] = await Promise.all([
        getNotInterestedLeads(tenant?.id),
        getCalls(tenant?.id),
      ]);

      const scopedLeads = filterScopedLeads(niLeads, user, isExec);

      setLeads(scopedLeads);
      setCalls(allCalls);
    } catch (err) {
      console.error('Failed to load not-interested leads', err);
    }
  };

  useEffect(() => {
    loadData();
    const handleUpdate = () => loadData();
    window.addEventListener('nexus_storage_updated', handleUpdate);
    return () => window.removeEventListener('nexus_storage_updated', handleUpdate);
  }, [tenant?.id, user?.id, isExec]);

  // Re-engage: move lead from Not Interested → Follow-up Required and schedule follow-up entry
  const handleReengage = async (lead: Lead) => {
    if (!tenant || !user) return;
    setReengaging(true);
    try {
      await reengageLead({ lead, tenant, user, sourceLabel: 'Not Interested' });
      await loadData();
      window.dispatchEvent(new Event('nexus_storage_updated'));
      setIsDetailDrawerOpen(false);
      setSelectedLead(null);
    } catch (err) {
      console.error('Failed to reengage lead', err);
    } finally {
      setReengaging(false);
    }
  };

  const getNotInterestedReason = (lead: Lead): string => {
    // 1. Check customFields (saved during call disposition wrap-up)
    if (lead.customFields?.dispositionReason && typeof lead.customFields.dispositionReason === 'string' && lead.customFields.dispositionReason.trim()) {
      return lead.customFields.dispositionReason.trim();
    }

    // 2. Parse from lead notes if present
    if (lead.notes) {
      const match = lead.notes.match(/Not Interested Reason:\s*([^\n]+)/i);
      if (match && match[1]?.trim()) {
        return match[1].trim();
      }
      const match2 = lead.notes.match(/\[Reason\]:\s*([^\n]+)/i);
      if (match2 && match2[1]?.trim()) {
        return match2[1].trim();
      }
    }

    // 3. Fallback to latest call log with disposition 'Not Interested'
    const notInterestedCalls = calls
      .filter((c: any) => (c.contactPhone === lead.phone || c.contactName === lead.name) && c.disposition === 'Not Interested');
    if (notInterestedCalls.length > 0) {
      const latestCall = notInterestedCalls.sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
      if (latestCall.reason && typeof latestCall.reason === 'string' && latestCall.reason.trim()) {
        return latestCall.reason.trim();
      }
      if (latestCall.notes) {
        const reasonMatch = latestCall.notes.match(/Reason:\s*([^\n]+)/i) || latestCall.notes.match(/\[Reason\]:\s*([^\n]+)/i);
        if (reasonMatch && reasonMatch[1]?.trim()) {
          return reasonMatch[1].trim();
        }
        return latestCall.notes.trim();
      }
    }

    return 'No specific reason provided';
  };

  const getCustomerNotes = (lead: Lead): string => {
    if (lead.customFields?.customerNotes && typeof lead.customFields.customerNotes === 'string' && lead.customFields.customerNotes.trim()) {
      return lead.customFields.customerNotes.trim();
    }
    if (!lead.notes) return '';
    const cleaned = lead.notes
      .split(/\n\n?\[\d{1,2}\/\d{1,2}\/\d{4}[^\]]*\]\s*Not Interested Reason:?/i)[0]
      .replace(/(?:\[.*?\]\s*)?Not Interested Reason:[\s\S]*$/i, '')
      .trim();
    return cleaned;
  };

  const columns: Column<Lead>[] = [
    {
      key: 'name',
      header: 'Name & Contact',
      render: renderLeadNameAndContact,
    },
    {
      key: 'source',
      header: 'Source',
      render: renderLeadSourceBadge,
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (r: Lead) => {
        const reasonText = getNotInterestedReason(r);
        const hasReason = reasonText !== 'No specific reason provided';
        return (
          <div
            title={reasonText}
            style={{
              fontSize: 13,
              maxWidth: 280,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: hasReason ? 'var(--text-primary)' : 'var(--text-muted)',
              fontStyle: hasReason ? 'normal' : 'italic',
            }}
          >
            {reasonText}
          </div>
        );
      },
    },
  ];

  const actions: RowAction<Lead>[] = [
    {
      label: 'View',
      icon: <ExternalLink size={14} />,
      onClick: (row) => {
        setSelectedLead(row);
        setIsDetailDrawerOpen(true);
      },
    },
  ];

  const timelineEvents = selectedLead && !isGhlSalesExec ? getLeadCallTimelineEvents(selectedLead, calls) : [];
  const callsCount = selectedLead && !isGhlSalesExec
    ? calls.filter((c: any) => c.contactPhone === selectedLead.phone || c.contactName === selectedLead.name).length
    : 0;

  return (
    <div className="not-interested-page">
      <div>
        <h1 className="not-interested-title">
          <XCircle size={22} color="#f43f5e" />
          Not - Interested
        </h1>
        <p className="not-interested-subtitle">Leads who are not interested in proceeding</p>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <DataTable
          columns={columns}
          data={leads}
          keyExtractor={(r) => r.id}
          rowActions={actions}
          emptyTitle="No leads marked as Not Interested."
          searchPlaceholder="Search leads by name, phone, or reason..."
          searchFilter={(item, query) => {
            const q = query.toLowerCase();
            const reason = getNotInterestedReason(item).toLowerCase();
            return (
              item.name.toLowerCase().includes(q) ||
              item.phone.toLowerCase().includes(q) ||
              item.source.toLowerCase().includes(q) ||
              reason.includes(q)
            );
          }}
          onRowClick={isGhlSalesExec ? (row) => { setSelectedLead(row); setIsDetailDrawerOpen(true); } : undefined}
        />
      </div>

      {/* Details Drawer */}
      <Drawer
        isOpen={isDetailDrawerOpen}
        onClose={() => { setIsDetailDrawerOpen(false); setSelectedLead(null); }}
        title={selectedLead?.name || 'Lead Details'}
        subtitle={isGhlSalesExec
          ? `Phone: ${selectedLead?.phone || '—'} • ${tenant?.name}`
          : `Not Interested • Added on ${selectedLead?.createdAt}`
        }
        width={isGhlSalesExec ? 600 : 500}
      >
        {selectedLead && (
          isGhlSalesExec ? (
            // ── GHL Sales Exec: full parity drawer ──────────────────────────────
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Re-engage action banner */}
              <div
                style={{
                  backgroundColor: '#fdf2f8',
                  border: '1px solid #f0abfc',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#9d174d', textTransform: 'uppercase' }}>
                    Not Interested
                  </div>
                  <div style={{ fontSize: 13, color: '#831843', marginTop: 2 }}>
                    {getNotInterestedReason(selectedLead)}
                  </div>
                </div>
                <ReengageButton disabled={reengaging} onClick={() => handleReengage(selectedLead)} />
              </div>

              {/* Full GHL detail drawer content */}
              <LeadDetailDrawerContent
                contactName={selectedLead.name}
                contactPhone={selectedLead.phone}
                contactId={selectedLead.id}
                contactType="lead"
                tenantId={tenant?.id}
                tenantName={tenant?.name}
                onCall={canPlaceCalls(user) ? () => initiateCall(selectedLead.name, selectedLead.phone, 'lead', selectedLead.id) : undefined}
              />
            </div>
          ) : (
            // ── Non-GHL / non-exec: original lightweight drawer ──────────────────
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '16px 0' }}>
              {/* Core Details */}
              <LeadContactDetailsCard
                phone={selectedLead.phone}
                email={selectedLead.email}
                location={selectedLead.location}
                callsCount={callsCount}
              />

              {/* Notes & Requirements (Customer) and Reason (Agent) */}
              <div className="card">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em' }}>
                      NOTES & REQUIREMENTS
                    </span>
                    <div
                      style={{
                        backgroundColor: 'var(--bg-surface-hover)',
                        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
                        padding: '8px 12px',
                        borderRadius: 6,
                        marginTop: 4,
                        fontSize: 13,
                        color: 'var(--text-primary)',
                        lineHeight: 1.5,
                        wordBreak: 'break-word',
                      }}
                    >
                      {getCustomerNotes(selectedLead) || 'No notes submitted by customer.'}
                    </div>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 11, fontWeight: 600, letterSpacing: '0.04em' }}>
                      REASON
                    </span>
                    <div
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.04)',
                        border: '1px solid rgba(239, 68, 68, 0.35)',
                        padding: '8px 12px',
                        borderRadius: 6,
                        marginTop: 4,
                        fontSize: 13,
                        color: 'var(--text-primary)',
                        lineHeight: 1.5,
                        wordBreak: 'break-word',
                      }}
                    >
                      {getNotInterestedReason(selectedLead)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Activity History Timeline */}
              <div>
                <h4 style={{ fontSize: 13, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16, fontWeight: 700 }}>
                  Call History / Logs
                </h4>
                <Timeline events={timelineEvents} />
              </div>
            </div>
          )
        )}
      </Drawer>
    </div>
  );
};
