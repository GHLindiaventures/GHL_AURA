import React, { useState, useEffect, useMemo } from 'react';
import { FileCheck, Download, RefreshCw, Filter, Shield } from 'lucide-react';
import { AuditLog } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { getAuditLogs } from '../../services/ghlApiService';
import { DataTable, Column } from '../../components/common/DataTable';
import './CompanyAuditPage.css';

export const CompanyAuditPage: React.FC = () => {
  const { tenant } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const loadData = async () => {
    setIsLoading(true);
    try {
      const data = await getAuditLogs(tenant?.id);
      setLogs(data);
    } catch (err) {
      console.error('Failed to load audit logs', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const handleUpdate = () => loadData();
    window.addEventListener('nexus_storage_updated', handleUpdate);
    return () => window.removeEventListener('nexus_storage_updated', handleUpdate);
  }, [tenant?.id]);

  const filteredLogs = useMemo(() => {
    if (activeFilter === 'all') return logs;
    if (activeFilter === 'leads') {
      return logs.filter(l => {
        const et = (l.entityType || '').toLowerCase();
        const a = (l.action || '').toLowerCase();
        return et.includes('lead') || a.includes('lead') || a.includes('assign');
      });
    }
    if (activeFilter === 'calls') {
      return logs.filter(l => {
        const et = (l.entityType || '').toLowerCase();
        const a = (l.action || '').toLowerCase();
        return et.includes('call') || a.includes('call') || a.includes('disposition');
      });
    }
    if (activeFilter === 'followups') {
      return logs.filter(l => {
        const et = (l.entityType || '').toLowerCase();
        const a = (l.action || '').toLowerCase();
        return et.includes('followup') || a.includes('followup');
      });
    }
    if (activeFilter === 'consultations') {
      return logs.filter(l => {
        const et = (l.entityType || '').toLowerCase();
        const a = (l.action || '').toLowerCase();
        return et.includes('consultation') || a.includes('consultation');
      });
    }
    if (activeFilter === 'kyc') {
      return logs.filter(l => {
        const et = (l.entityType || '').toLowerCase();
        const a = (l.action || '').toLowerCase();
        return et.includes('kyc') || a.includes('kyc');
      });
    }
    if (activeFilter === 'deals') {
      return logs.filter(l => {
        const et = (l.entityType || '').toLowerCase();
        const a = (l.action || '').toLowerCase();
        return et.includes('deal') || et.includes('pipeline') || a.includes('stage') || a.includes('opportunity');
      });
    }
    if (activeFilter === 'leaves') {
      return logs.filter(l => {
        const et = (l.entityType || '').toLowerCase();
        const a = (l.action || '').toLowerCase();
        return et.includes('leave') || et.includes('handover') || a.includes('leave') || a.includes('handover');
      });
    }
    return logs;
  }, [logs, activeFilter]);

  const extractTargetPersonName = (log: AuditLog): string | null => {
    if (log.entityName && log.entityName.trim() !== '') {
      return log.entityName.trim();
    }

    const details = log.details || '';
    // 1. "for investor 'karan'" or "for investor karan"
    let match = details.match(/for investor ['"]([^'"]+)['"]/i) || details.match(/for investor\s+([A-Za-z0-9_ -]+?)(?:\s*\(|,|\.|$)/i);
    if (match && match[1]?.trim()) return match[1].trim();

    // 2. "corrected for dhina"
    match = details.match(/corrected for\s+([A-Za-z0-9_ -]+?)(?:\s*\.|\s*,|$)/i);
    if (match && match[1]?.trim()) return match[1].trim();

    // 3. "lead 'Rajesh Kumar'" or "lead record Rajesh Kumar"
    match = details.match(/(?:assigned|created|updated)\s+lead ['"]([^'"]+)['"]/i) || details.match(/lead ['"]([^'"]+)['"]/i) || details.match(/lead record\s+([^(]+)/i);
    if (match && match[1]?.trim()) return match[1].trim();

    // 4. "investor 'Rajesh Kumar'"
    match = details.match(/investor ['"]([^'"]+)['"]/i);
    if (match && match[1]?.trim()) return match[1].trim();

    // 5. "contact 'Rajesh Kumar'"
    match = details.match(/contact ['"]([^'"]+)['"]/i);
    if (match && match[1]?.trim()) return match[1].trim();

    // 6. "leave request for Naveen" or "leave request by Naveen"
    match = details.match(/leave request (?:for|by|from)\s+([A-Za-z0-9_ -]+?)(?:\s*\(|\.|\s*,|$)/i);
    if (match && match[1]?.trim()) return match[1].trim();

    // 7. "handover from Yanosh to Dhinakaran"
    match = details.match(/handover from\s+([A-Za-z0-9_ -]+?)\s+to/i);
    if (match && match[1]?.trim()) return match[1].trim();

    return null;
  };

  const formatEntityType = (type: string): string => {
    if (!type) return 'Entity';
    const lower = type.toLowerCase();
    if (lower === 'investorkyc' || lower === 'kyc') return 'Investor KYC';
    if (lower === 'lead' || lower === 'leads') return 'Lead';
    if (lower === 'customer' || lower === 'customers') return 'Customer';
    if (lower === 'investor' || lower === 'investors' || lower === 'ghlinvestor') return 'Investor';
    if (lower === 'followup' || lower === 'followups') return 'Follow-up';
    if (lower === 'callrecord' || lower === 'call') return 'Call Record';
    if (lower === 'consultation') return 'Consultation';
    if (lower === 'leaverequest' || lower === 'leave') return 'Leave Request';
    if (lower === 'workhandover' || lower === 'handover') return 'Work Handover';
    if (lower === 'ghldeal' || lower === 'deal') return 'Deal / Opportunity';
    if (lower === 'user') return 'User';
    return type;
  };

  const handleExportCsv = () => {
    if (!filteredLogs.length) return;
    const headers = ['Timestamp', 'Actor Name', 'Actor Email', 'Action', 'Target Person Name', 'Target Entity', 'Entity ID', 'Details'];
    const rows = filteredLogs.map(l => {
      const person = extractTargetPersonName(l) || '';
      return [
        `"${l.timestamp}"`,
        `"${(l.actorName || '').replace(/"/g, '""')}"`,
        `"${(l.actorEmail || '').replace(/"/g, '""')}"`,
        `"${(l.action || '').replace(/"/g, '""')}"`,
        `"${person.replace(/"/g, '""')}"`,
        `"${(formatEntityType(l.entityType)).replace(/"/g, '""')}"`,
        `"${(l.entityId || '').replace(/"/g, '""')}"`,
        `"${(l.details || '').replace(/"/g, '""')}"`
      ];
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Audit_Log_${tenant?.slug || 'company'}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatTimestamp = (ts: string) => {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return ts;
      return d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch {
      return ts;
    }
  };

  const getActionBadgeClass = (action: string) => {
    const act = (action || '').toUpperCase();
    if (act.includes('CREATE') || act.includes('IMPORT')) return 'action-tag-success';
    if (act.includes('ASSIGN') || act.includes('REASSIGN')) return 'action-tag-purple';
    if (act.includes('CALL') || act.includes('DISPOSITION')) return 'action-tag-blue';
    if (act.includes('FOLLOWUP') || act.includes('RESCHEDULE')) return 'action-tag-warning';
    if (act.includes('KYC')) return 'action-tag-emerald';
    if (act.includes('CONSULTATION')) return 'action-tag-indigo';
    if (act.includes('STAGE')) return 'action-tag-teal';
    if (act.includes('DELETE') || act.includes('REJECT')) return 'action-tag-danger';
    return 'action-tag-default';
  };

  const columns: Column<AuditLog>[] = [
    {
      key: 'timestamp',
      header: 'Timestamp',
      sortable: true,
      render: l => (
        <span className="company-audit-cell-timestamp" title={l.timestamp}>
          {formatTimestamp(l.timestamp)}
        </span>
      ),
    },
    {
      key: 'actorName',
      header: 'Actor',
      sortable: true,
      render: l => (
        <div>
          <div className="company-audit-actor-name">{l.actorName || 'System'}</div>
          <div className="company-audit-actor-email">{l.actorEmail || '—'}</div>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Event Action',
      sortable: true,
      render: l => (
        <span className={`company-audit-action-tag ${getActionBadgeClass(l.action)}`}>
          {l.action}
        </span>
      ),
    },
    {
      key: 'entityType',
      header: 'Target Entity & Person',
      sortable: true,
      render: l => {
        const personName = extractTargetPersonName(l);
        return (
          <div className="company-audit-target-entity-cell">
            <div className="company-audit-target-person-name" title={personName || l.entityType}>
              {personName || <span className="company-audit-person-fallback">{formatEntityType(l.entityType)}</span>}
            </div>
            <div className="company-audit-entity-subtext">
              <span className="company-audit-entity-type-badge">{formatEntityType(l.entityType)}</span>
              {l.entityId && l.entityId !== '0' && (
                <span className="company-audit-entity-id-tag">#{l.entityId}</span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'details',
      header: 'Audit Trail Details',
      render: l => <span className="company-audit-details-text">{l.details}</span>,
    },
  ];

  return (
    <div className="company-audit-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <FileCheck size={24} color="var(--primary-600)" /> Security & Audit Log
          </h1>
          <p className="page-subtitle">
            Immutable traceability ledger for data mutations, call dispositions, and plot reservations for {tenant?.name}.
          </p>
        </div>
        <div className="company-audit-header-actions">
          <button className="company-audit-btn" onClick={loadData} disabled={isLoading} title="Reload audit logs">
            <RefreshCw size={15} className={isLoading ? 'spinning' : ''} /> Refresh
          </button>
          <button className="company-audit-btn" onClick={handleExportCsv} title="Export CSV report">
            <Download size={15} /> Export Report
          </button>
        </div>
      </div>

      <div className="company-audit-filter-pills">
        <button
          className={`audit-filter-pill ${activeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setActiveFilter('all')}
        >
          All Activities ({logs.length})
        </button>
        <button
          className={`audit-filter-pill ${activeFilter === 'leads' ? 'active' : ''}`}
          onClick={() => setActiveFilter('leads')}
        >
          Leads & Assignments
        </button>
        <button
          className={`audit-filter-pill ${activeFilter === 'calls' ? 'active' : ''}`}
          onClick={() => setActiveFilter('calls')}
        >
          Calls & Dispositions
        </button>
        <button
          className={`audit-filter-pill ${activeFilter === 'followups' ? 'active' : ''}`}
          onClick={() => setActiveFilter('followups')}
        >
          Follow-ups
        </button>
        <button
          className={`audit-filter-pill ${activeFilter === 'consultations' ? 'active' : ''}`}
          onClick={() => setActiveFilter('consultations')}
        >
          Consultations
        </button>
        <button
          className={`audit-filter-pill ${activeFilter === 'kyc' ? 'active' : ''}`}
          onClick={() => setActiveFilter('kyc')}
        >
          KYC
        </button>
        <button
          className={`audit-filter-pill ${activeFilter === 'deals' ? 'active' : ''}`}
          onClick={() => setActiveFilter('deals')}
        >
          Pipeline & Deals
        </button>
        <button
          className={`audit-filter-pill ${activeFilter === 'leaves' ? 'active' : ''}`}
          onClick={() => setActiveFilter('leaves')}
        >
          Leaves & Handovers
        </button>
      </div>

      <DataTable
        columns={columns}
        data={filteredLogs}
        keyExtractor={l => l.id}
        searchPlaceholder="Search audit events by actor or action..."
      />
    </div>
  );
};
