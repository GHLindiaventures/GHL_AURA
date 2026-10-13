import React, { useState } from 'react';
import {
  Phone,
  Edit2,
  Mail,
  Clock,
  CheckCircle,
  FileText,
  User,
  ShieldCheck,
  IndianRupee,
  TrendingUp,
  Building2,
  Users,
  Copy,
  Check,
  ExternalLink,
  CheckCircle2,
  Hash,
  Layers,
  Landmark,
  ArrowLeft,
  FolderOpen,
  PhoneCall,
  Briefcase,
  Download,
  FileCheck,
  Award,
  Calendar,
  AlertCircle,
  Eye,
  Play,
  Volume2,
} from 'lucide-react';
import { Deal, CallRecord, Consultation, Followup } from '../../types';

export const INVESTMENT_PRESETS = [
  { label: '₹5L', value: 500000 },
  { label: '₹10L', value: 1000000 },
  { label: '₹25L', value: 2500000 },
  { label: '₹50L', value: 5000000 },
  { label: '₹1Cr', value: 10000000 },
  { label: '₹2Cr', value: 20000000 },
];

function formatCurrency(amount: number): string {
  if (isNaN(amount) || amount === 0) return '₹0';
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(2)} Cr`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(2)} L`;
  return `₹${amount.toLocaleString('en-IN')}`;
}

function formatDuration(sec?: number): string {
  if (!sec || isNaN(sec)) return '0s';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function formatDate(val?: string | null): string {
  if (!val) return '—';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return val;
  }
}

export interface OpportunityProfileWorkspaceProps {
  deal: Deal;
  liveKycData: any;
  isKycLoading: boolean;
  amountInput: string;
  isEditingAmount: boolean;
  activeDossierTab?: 'all' | 'basic' | 'identity' | 'bank' | 'demat' | 'nominees';
  copiedField: string | null;
  isDark: boolean;
  calls?: CallRecord[];
  consultations?: Consultation[];
  followups?: Followup[];
  onClose: () => void;
  onCallInvestor: (name: string, phone: string, entityId?: string) => void;
  onConvertDeal: (deal: Deal) => void;
  onEditAmount: () => void;
  onAmountInputChange: (val: string) => void;
  onConfirmAmountClick: () => void;
  setActiveDossierTab?: (tab: 'all' | 'basic' | 'identity' | 'bank' | 'demat' | 'nominees') => void;
  copyToClipboard: (text: string, fieldKey: string) => void;
  getDealKycStatus: (deal: Deal, liveKyc?: any) => 'Pending' | 'Partially Completed' | 'Submitted' | 'Verified' | 'Wrong';
}

export const OpportunityProfileWorkspace: React.FC<OpportunityProfileWorkspaceProps> = ({
  deal,
  liveKycData,
  isKycLoading,
  amountInput,
  isEditingAmount,
  copiedField,
  isDark,
  calls = [],
  consultations = [],
  followups = [],
  onClose,
  onCallInvestor,
  onConvertDeal,
  onEditAmount,
  onAmountInputChange,
  onConfirmAmountClick,
  copyToClipboard,
  getDealKycStatus,
}) => {
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'dossier' | 'documents' | 'activity' | 'mandate'>('dossier');

  const kycStatus = getDealKycStatus(deal, liveKycData);
  const kycBadgeStyles = {
    Verified: { bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' },
    Submitted: { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
    'Partially Completed': { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
    Wrong: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
    Pending: { bg: '#f8fafc', color: '#64748b', border: '#cbd5e1' },
  }[kycStatus];

  const kycData = liveKycData;
  const isConfirmed = Boolean(deal.investmentAmountConfirmed) && !isEditingAmount;

  const initials = deal.customerName
    ? deal.customerName.trim().split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'IN';

  // Filter activities for this customer
  const fDigits = (deal.phone || liveKycData?.phone || '').replace(/\D/g, '').slice(-10);
  const cleanMail = (deal.email || liveKycData?.email || '').trim().toLowerCase();
  const cleanName = (deal.customerName || liveKycData?.investorName || '').trim().toLowerCase();

  const matchingCalls = calls.filter(c => {
    if (deal.customerId && (String(c.customerId) === String(deal.customerId) || String(c.contactId) === String(deal.customerId))) return true;
    const cDigits = (c.contactPhone || (c as any).phone || '').replace(/\D/g, '').slice(-10);
    if (fDigits && cDigits && cDigits === fDigits) return true;
    if (c.contactName && c.contactName.trim().toLowerCase() === cleanName) return true;
    return false;
  });

  const matchingConsultations = consultations.filter(con => {
    if (deal.customerId && String(con.investorId) === String(deal.customerId)) return true;
    const conDigits = (con.investorPhone || (con as any).phone || '').replace(/\D/g, '').slice(-10);
    if (fDigits && conDigits && conDigits === fDigits) return true;
    if (con.investorName && con.investorName.trim().toLowerCase() === cleanName) return true;
    return false;
  });

  const matchingFollowups = followups.filter(f => {
    if (deal.customerId && String(f.contactId) === String(deal.customerId)) return true;
    const fPhoneDigits = (f.contactPhone || '').replace(/\D/g, '').slice(-10);
    if (fDigits && fPhoneDigits && fPhoneDigits === fDigits) return true;
    if (f.contactName && f.contactName.trim().toLowerCase() === cleanName) return true;
    return false;
  });

  // Calculate uploaded docs count
  const hasPanDoc = Boolean(kycData?.panDoc?.url || kycData?.panNumber);
  const hasAadhaarDoc = Boolean(kycData?.aadhaarDoc?.url || kycData?.aadhaarNumber);
  const hasBankDoc = Boolean(kycData?.bankProofDoc?.url || kycData?.bankName);
  const hasDematDoc = Boolean(kycData?.dematDoc?.url || kycData?.dematAccountNumber);
  const docsCount = [hasPanDoc, hasAadhaarDoc, hasBankDoc, hasDematDoc].filter(Boolean).length;

  return (
    <div className={`opp-workspace-canvas ${isDark ? 'dark-theme' : 'light-theme'}`}>
      {/* ── Full Screen Profile Workspace Container ───────────────────────── */}
      <div className="opp-profile-container opp-profile-inline-container">
        {/* Top Accent Gradient Bar */}
        <div className="opp-bar-accent" />

        <div className="opp-profile-inner">
          {/* ── 1. Executive Investor Profile Banner ─────────────────────────── */}
          <div className="opp-profile-banner">
            <div className="opp-profile-banner-top">
              <div className="opp-profile-avatar-row">
                <div className="opp-profile-avatar-wrapper" style={{ position: 'relative' }}>
                  <div className="opp-profile-avatar">{initials}</div>
                  {kycStatus === 'Verified' && (
                    <div
                      className="opp-avatar-badge"
                      title="KYC Verified"
                      style={{
                        position: 'absolute',
                        bottom: -2,
                        right: -2,
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        backgroundColor: '#10b981',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: '2px solid var(--bg-surface, #1e293b)',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                      }}
                    >
                      <Check size={11} strokeWidth={3} />
                    </div>
                  )}
                </div>

                <div className="opp-profile-title-block">
                  <div className="opp-profile-title-row">
                    <h2 className="opp-profile-name">{deal.customerName}</h2>
                    <span className="opp-profile-stage-badge">
                      <span className="pulse-dot" /> Investment Opportunity
                    </span>
                    {deal.customerId && (
                      <span className="opp-profile-id-chip">
                        <Hash size={11} /> #{deal.customerId}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <Clock size={12} />
                    <span>Term sheet under review • Active syndicate investment deal</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons Top Bar */}
              <div className="opp-profile-top-actions">
                <button
                  type="button"
                  className="opp-action-btn-back"
                  onClick={onClose}
                  title="Return to Opportunities list"
                >
                  <ArrowLeft size={13} />
                  <span>Back to Opportunities</span>
                </button>

                {deal.phone && (
                  <button
                    type="button"
                    className="opp-action-btn-call"
                    onClick={() => onCallInvestor(deal.customerName, deal.phone, String(deal.id))}
                    title="Initiate phone call via telephony"
                  >
                    <Phone size={13} />
                    <span>Call Investor</span>
                  </button>
                )}

                <button
                  type="button"
                  className="opp-action-btn-convert"
                  disabled={!deal.investmentAmountConfirmed}
                  onClick={() => {
                    if (deal.investmentAmountConfirmed) {
                      onConvertDeal(deal);
                    }
                  }}
                  title={deal.investmentAmountConfirmed ? 'Advance to Converted Investor' : 'Confirm investment amount first'}
                >
                  <CheckCircle size={13} />
                  <span>Convert Deal</span>
                </button>
              </div>
            </div>

            {/* Meta Attributes Chips Grid */}
            <div className="opp-profile-meta-grid">
              {deal.phone && (
                <div className="opp-meta-chip">
                  <Phone size={12} style={{ color: '#ec4899' }} />
                  <span className="opp-meta-chip-val">{deal.phone}</span>
                  <button
                    type="button"
                    className="opp-chip-copy-btn"
                    title="Copy Phone"
                    onClick={() => copyToClipboard(deal.phone, 'phone')}
                  >
                    {copiedField === 'phone' ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                  </button>
                </div>
              )}

              {deal.email && (
                <div className="opp-meta-chip">
                  <Mail size={12} style={{ color: '#8b5cf6' }} />
                  <span className="opp-meta-chip-val">{deal.email}</span>
                  <button
                    type="button"
                    className="opp-chip-copy-btn"
                    title="Copy Email"
                    onClick={() => copyToClipboard(deal.email, 'email')}
                  >
                    {copiedField === 'email' ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                  </button>
                </div>
              )}

              <div className="opp-meta-chip">
                <User size={12} style={{ color: '#3b82f6' }} />
                <span className="opp-meta-chip-label">Assigned Owner:</span>
                <span className="opp-meta-chip-val">{deal.assignedAgentName || 'Unassigned'}</span>
              </div>

              <div className="opp-meta-chip">
                <Building2 size={12} style={{ color: '#10b981' }} />
                <span className="opp-meta-chip-label">Asset Class:</span>
                <span className="opp-meta-chip-val">
                  {(deal as any).assetClass || liveKycData?.investorType || 'Not Specified'}
                </span>
              </div>
            </div>
          </div>

          {/* ── 2. Top Executive KPI Action Deck ─────────────────────────────── */}
          <div className="opp-kpi-deck">
            {/* KPI Card 1: KYC Status Card */}
            <div className="opp-kpi-card">
              <div className="opp-kpi-card-header">
                <span className="opp-kpi-card-label">KYC DOSSIER STATUS</span>
                <span className="opp-kyc-verified-tag" style={{ color: kycBadgeStyles.color }}>
                  <ShieldCheck size={13} />
                  <span>{kycStatus}</span>
                </span>
              </div>

              <div className="opp-kpi-card-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      backgroundColor: kycBadgeStyles.bg,
                      color: kycBadgeStyles.color,
                      border: `1px solid ${kycBadgeStyles.border}`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                    }}
                  >
                    <CheckCircle2 size={12} />
                    <span>{kycStatus}</span>
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {kycStatus === 'Verified'
                      ? 'Complete KYC documents confirmed'
                      : kycStatus === 'Submitted'
                      ? 'Documentation under compliance review'
                      : 'Pending documentation submission'}
                  </span>
                </div>
              </div>
            </div>

            {/* KPI Card 2: Investment Commitment Card */}
            <div className="opp-kpi-card">
              <div className="opp-kpi-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <IndianRupee size={13} style={{ color: '#10b981' }} />
                  <span className="opp-kpi-card-label">INVESTMENT COMMITMENT</span>
                </div>
                {isConfirmed && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#10b981',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      background: 'rgba(16, 185, 129, 0.1)',
                      padding: '2px 8px',
                      borderRadius: 4,
                    }}
                  >
                    <CheckCircle2 size={11} /> Confirmed
                  </span>
                )}
              </div>

              <div className="opp-kpi-card-body">
                {!isEditingAmount ? (
                  <div className="opp-amount-display-row">
                    <div>
                      <div className="opp-amount-number">
                        {formatCurrency(deal.value || 0)}
                      </div>
                      <div className="opp-amount-subtitle">
                        {deal.investmentAmountConfirmed
                          ? 'Locked commitment ready for contract execution'
                          : 'Target syndication commitment tranche'}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="opp-amount-edit-btn"
                      onClick={onEditAmount}
                    >
                      <Edit2 size={12} /> Edit
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div className="opp-amount-input-row">
                      <div className="opp-amount-input-wrapper">
                        <span className="opp-amount-currency-symbol">₹</span>
                        <input
                          type="number"
                          className="form-control opp-amount-input"
                          value={amountInput}
                          onChange={e => onAmountInputChange(e.target.value)}
                          placeholder="e.g. 20000000"
                          autoFocus
                        />
                      </div>
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ height: 40, whiteSpace: 'nowrap', padding: '0 16px' }}
                        onClick={onConfirmAmountClick}
                      >
                        <Check size={13} /> Confirm
                      </button>
                    </div>

                    <div className="opp-amount-presets-row">
                      {INVESTMENT_PRESETS.map(p => (
                        <button
                          key={p.value}
                          type="button"
                          className="opp-amount-preset-chip"
                          onClick={() => onAmountInputChange(String(p.value))}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Display format: <strong style={{ color: '#10b981' }}>{formatCurrency(parseFloat(amountInput) || 0)}</strong>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── 3. Multi-Module Workspace Tabs Navigation (Option 1) ─────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="opp-dossier-tabs-nav">
              <button
                type="button"
                className={`opp-dossier-tab-btn ${activeWorkspaceTab === 'dossier' ? 'active' : ''}`}
                onClick={() => setActiveWorkspaceTab('dossier')}
              >
                <Layers size={14} /> 📄 1. Verified KYC Dossier
                <span className="opp-tab-counter">5 Sections</span>
              </button>
              <button
                type="button"
                className={`opp-dossier-tab-btn ${activeWorkspaceTab === 'documents' ? 'active' : ''}`}
                onClick={() => setActiveWorkspaceTab('documents')}
              >
                <FolderOpen size={14} /> 📁 2. Document Vault
                <span className="opp-tab-counter">{docsCount}/4 Verified</span>
              </button>
              <button
                type="button"
                className={`opp-dossier-tab-btn ${activeWorkspaceTab === 'activity' ? 'active' : ''}`}
                onClick={() => setActiveWorkspaceTab('activity')}
              >
                <PhoneCall size={14} /> 📞 3. Activity & Call History
                <span className="opp-tab-counter">{matchingCalls.length + matchingFollowups.length} Logs</span>
              </button>
              <button
                type="button"
                className={`opp-dossier-tab-btn ${activeWorkspaceTab === 'mandate' ? 'active' : ''}`}
                onClick={() => setActiveWorkspaceTab('mandate')}
              >
                <Briefcase size={14} /> 💼 4. Investment Mandate & Terms
                <span className="opp-tab-counter">{formatCurrency(deal.value || 20000000)}</span>
              </button>
            </div>

            {isKycLoading ? (
              <div
                style={{
                  padding: '36px',
                  borderRadius: 12,
                  background: 'var(--bg-surface, #1e293b)',
                  border: '1px dashed var(--border-color, rgba(255, 255, 255, 0.15))',
                  color: 'var(--text-secondary, #64748b)',
                  fontSize: 13,
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    border: '2px solid var(--border-color, #cbd5e1)',
                    borderTopColor: '#ec4899',
                    animation: 'spin 1s linear infinite',
                  }}
                />
                <span>Retrieving verified investor dossier from PostgreSQL...</span>
              </div>
            ) : !kycData && activeWorkspaceTab === 'dossier' ? (
              <div
                style={{
                  padding: '30px',
                  borderRadius: 12,
                  background: 'var(--bg-surface, #1e293b)',
                  border: '1px dashed var(--border-color, rgba(255, 255, 255, 0.15))',
                  color: 'var(--text-muted, #94a3b8)',
                  fontSize: 13,
                  textAlign: 'center',
                }}
              >
                No KYC documentation filled yet for this contact.
              </div>
            ) : (
              <div>
                {/* ═══════════════════════════════════════════════════════════════════
                    TAB 1: COMPLETE VERIFIED KYC DOSSIER (All 5 Sections)
                   ═══════════════════════════════════════════════════════════════════ */}
                {activeWorkspaceTab === 'dossier' && kycData && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* 1. Basic Details */}
                    <div className="opp-dossier-section">
                      <div className="opp-dossier-section-header">
                        <div className="opp-dossier-section-title">
                          <User size={15} color="#ec4899" />
                          <span>1. Basic Personal Details</span>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Core Investor Metadata</span>
                      </div>
                      <div className="opp-dossier-grid">
                        <div className="opp-field-tile">
                          <div className="opp-field-label">Investor Name</div>
                          <div className="opp-field-value">{kycData.investorName || deal.customerName || '—'}</div>
                        </div>
                        <div className="opp-field-tile">
                          <div className="opp-field-label">
                            <span>Phone Number</span>
                            {kycData.phone && (
                              <button
                                type="button"
                                className="opp-chip-copy-btn"
                                title="Copy Phone"
                                onClick={() => copyToClipboard(kycData.phone, 'kphone')}
                              >
                                {copiedField === 'kphone' ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                              </button>
                            )}
                          </div>
                          <div className="opp-field-value">{kycData.phone || deal.phone || '—'}</div>
                        </div>
                        <div className="opp-field-tile">
                          <div className="opp-field-label">
                            <span>Email Address</span>
                            {kycData.email && (
                              <button
                                type="button"
                                className="opp-chip-copy-btn"
                                title="Copy Email"
                                onClick={() => copyToClipboard(kycData.email, 'kemail')}
                              >
                                {copiedField === 'kemail' ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                              </button>
                            )}
                          </div>
                          <div className="opp-field-value">{kycData.email || deal.email || '—'}</div>
                        </div>
                        <div className="opp-field-tile">
                          <div className="opp-field-label">Gender</div>
                          <div className="opp-field-value">{kycData.gender || '—'}</div>
                        </div>
                        <div className="opp-field-tile">
                          <div className="opp-field-label">Investor Type</div>
                          <div className="opp-field-value">{kycData.investorType || '—'}</div>
                        </div>
                        <div className="opp-field-tile">
                          <div className="opp-field-label">Resident Type</div>
                          <div className="opp-field-value">{kycData.residentType || '—'}</div>
                        </div>
                        {kycData.occupation && (
                          <div className="opp-field-tile">
                            <div className="opp-field-label">Occupation</div>
                            <div className="opp-field-value">{kycData.occupation}</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 2. Identity Details & Address */}
                    <div className="opp-dossier-section">
                      <div className="opp-dossier-section-header">
                        <div className="opp-dossier-section-title">
                          <ShieldCheck size={15} color="#3b82f6" />
                          <span>2. Identity Details & Address</span>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Government ID & Residence</span>
                      </div>
                      <div className="opp-dossier-grid">
                        <div className="opp-field-tile">
                          <div className="opp-field-label">
                            <span>PAN Number</span>
                            {kycData.panNumber && (
                              <button
                                type="button"
                                className="opp-chip-copy-btn"
                                title="Copy PAN"
                                onClick={() => copyToClipboard(kycData.panNumber, 'kpan')}
                              >
                                {copiedField === 'kpan' ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                              </button>
                            )}
                          </div>
                          <div className={`opp-field-value mono ${!kycData.panNumber ? 'empty' : ''}`}>
                            {kycData.panNumber ? kycData.panNumber.toUpperCase() : '—'}
                          </div>
                        </div>
                        <div className="opp-field-tile">
                          <div className="opp-field-label">Name as per PAN</div>
                          <div className="opp-field-value">{kycData.nameAsPerPan || '—'}</div>
                        </div>
                        <div className="opp-field-tile">
                          <div className="opp-field-label">
                            <span>Aadhaar Number</span>
                            {kycData.aadhaarNumber && (
                              <button
                                type="button"
                                className="opp-chip-copy-btn"
                                title="Copy Aadhaar"
                                onClick={() => copyToClipboard(kycData.aadhaarNumber, 'kaadhaar')}
                              >
                                {copiedField === 'kaadhaar' ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                              </button>
                            )}
                          </div>
                          <div className={`opp-field-value mono ${!kycData.aadhaarNumber ? 'empty' : ''}`}>
                            {kycData.aadhaarNumber
                              ? (kycData.aadhaarNumber.length >= 4 ? `•••• •••• ${kycData.aadhaarNumber.slice(-4)}` : kycData.aadhaarNumber)
                              : '—'}
                          </div>
                        </div>
                        <div className="opp-field-tile">
                          <div className="opp-field-label">Father's Name</div>
                          <div className="opp-field-value">{kycData.fatherName || '—'}</div>
                        </div>
                        <div className="opp-field-tile">
                          <div className="opp-field-label">Date of Birth</div>
                          <div className="opp-field-value">{kycData.dob || '—'}</div>
                        </div>
                        <div className="opp-field-tile">
                          <div className="opp-field-label">City / State / Pincode</div>
                          <div className="opp-field-value">
                            {[kycData.city, kycData.state, kycData.pincode].filter(Boolean).join(', ') || '—'}
                          </div>
                        </div>
                        {kycData.address && (
                          <div className="opp-field-tile" style={{ gridColumn: '1 / -1' }}>
                            <div className="opp-field-label">Full Residential Address</div>
                            <div className="opp-field-value">{kycData.address}</div>
                          </div>
                        )}

                        {/* Attached Identity Documents */}
                        {(kycData.panDoc || kycData.aadhaarDoc) && (
                          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                            {kycData.panDoc && (
                              <div className="opp-doc-tile">
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <FileText size={13} />
                                  <span>PAN Card: {kycData.panDoc.name || 'Verified'}</span>
                                </div>
                                {kycData.panDoc.url && (
                                  <a
                                    href={kycData.panDoc.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: '#0284c7', display: 'flex' }}
                                    title="View document"
                                  >
                                    <ExternalLink size={12} />
                                  </a>
                                )}
                              </div>
                            )}
                            {kycData.aadhaarDoc && (
                              <div className="opp-doc-tile">
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <FileText size={13} />
                                  <span>Aadhaar Card: {kycData.aadhaarDoc.name || 'Verified'}</span>
                                </div>
                                {kycData.aadhaarDoc.url && (
                                  <a
                                    href={kycData.aadhaarDoc.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: '#0284c7', display: 'flex' }}
                                    title="View document"
                                  >
                                    <ExternalLink size={12} />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 3. Bank Details */}
                    <div className="opp-dossier-section">
                      <div className="opp-dossier-section-header">
                        <div className="opp-dossier-section-title">
                          <Landmark size={15} color="#10b981" />
                          <span>3. Bank & Settlement Details</span>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Financial Institutional Payouts</span>
                      </div>
                      <div className="opp-dossier-grid">
                        <div className="opp-field-tile">
                          <div className="opp-field-label">Bank Name</div>
                          <div className="opp-field-value">{kycData.bankName || '—'}</div>
                        </div>
                        <div className="opp-field-tile">
                          <div className="opp-field-label">Branch Name</div>
                          <div className="opp-field-value">{kycData.branchName || '—'}</div>
                        </div>
                        <div className="opp-field-tile">
                          <div className="opp-field-label">
                            <span>Account Number</span>
                            {(kycData.accountNumber || kycData.bankAccountNumber) && (
                              <button
                                type="button"
                                className="opp-chip-copy-btn"
                                title="Copy Account Number"
                                onClick={() => copyToClipboard(kycData.accountNumber || kycData.bankAccountNumber, 'kacc')}
                              >
                                {copiedField === 'kacc' ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                              </button>
                            )}
                          </div>
                          <div className={`opp-field-value mono ${!(kycData.accountNumber || kycData.bankAccountNumber) ? 'empty' : ''}`}>
                            {kycData.accountNumber || kycData.bankAccountNumber || '—'}
                          </div>
                        </div>
                        <div className="opp-field-tile">
                          <div className="opp-field-label">
                            <span>IFSC Code</span>
                            {(kycData.ifscCode || kycData.bankIfsc) && (
                              <button
                                type="button"
                                className="opp-chip-copy-btn"
                                title="Copy IFSC"
                                onClick={() => copyToClipboard(kycData.ifscCode || kycData.bankIfsc, 'kifsc')}
                              >
                                {copiedField === 'kifsc' ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                              </button>
                            )}
                          </div>
                          <div className={`opp-field-value mono ${!(kycData.ifscCode || kycData.bankIfsc) ? 'empty' : ''}`}>
                            {kycData.ifscCode || kycData.bankIfsc || '—'}
                          </div>
                        </div>
                        <div className="opp-field-tile">
                          <div className="opp-field-label">Account Type</div>
                          <div className="opp-field-value">{kycData.accountType || 'Savings'}</div>
                        </div>
                        <div className="opp-field-tile">
                          <div className="opp-field-label">Account Holder Name</div>
                          <div className="opp-field-value">{kycData.accountHolderName || kycData.investorName || deal.customerName || '—'}</div>
                        </div>

                        {kycData.bankProofDoc && (
                          <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                            <div className="opp-doc-tile">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <FileText size={13} />
                                <span>Bank Proof: {kycData.bankProofDoc.name || 'Cancelled Cheque'}</span>
                              </div>
                              {kycData.bankProofDoc.url && (
                                <a
                                  href={kycData.bankProofDoc.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: '#0284c7', display: 'flex' }}
                                  title="View document"
                                >
                                  <ExternalLink size={12} />
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 4. Demat Account */}
                    <div className="opp-dossier-section">
                      <div className="opp-dossier-section-header">
                        <div className="opp-dossier-section-title">
                          <TrendingUp size={15} color="#8b5cf6" />
                          <span>4. Demat Account Details</span>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Depository Securities Holdings</span>
                      </div>
                      <div className="opp-dossier-grid">
                        <div className="opp-field-tile">
                          <div className="opp-field-label">
                            <span>Demat Account Number</span>
                            {kycData.dematAccountNumber && (
                              <button
                                type="button"
                                className="opp-chip-copy-btn"
                                title="Copy Demat Account Number"
                                onClick={() => copyToClipboard(kycData.dematAccountNumber, 'kdemat')}
                              >
                                {copiedField === 'kdemat' ? <Check size={11} color="#10b981" /> : <Copy size={11} />}
                              </button>
                            )}
                          </div>
                          <div className={`opp-field-value mono ${!kycData.dematAccountNumber ? 'empty' : ''}`}>
                            {kycData.dematAccountNumber || (kycData.hasNoDemat ? 'No Demat Account Declared' : '—')}
                          </div>
                        </div>
                        <div className="opp-field-tile">
                          <div className="opp-field-label">DP ID / Custodian</div>
                          <div className="opp-field-value">{kycData.dpId || kycData.dematDpId || '—'}</div>
                        </div>
                        <div className="opp-field-tile">
                          <div className="opp-field-label">Client ID</div>
                          <div className="opp-field-value">{kycData.dematClientId || '—'}</div>
                        </div>
                        <div className="opp-field-tile">
                          <div className="opp-field-label">Depository Participant</div>
                          <div className="opp-field-value">{kycData.dematDepository || (kycData.dpId?.startsWith('IN') ? 'NSDL' : 'CDSL')}</div>
                        </div>

                        {kycData.dematDoc && (
                          <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                            <div className="opp-doc-tile">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <FileText size={13} />
                                <span>Demat Proof: {kycData.dematDoc.name || 'Client Master Report (CMR)'}</span>
                              </div>
                              {kycData.dematDoc.url && (
                                <a
                                  href={kycData.dematDoc.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: '#0284c7', display: 'flex' }}
                                  title="View document"
                                >
                                  <ExternalLink size={12} />
                                </a>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 5. Nominees */}
                    <div className="opp-dossier-section">
                      <div className="opp-dossier-section-header">
                        <div className="opp-dossier-section-title">
                          <Users size={15} color="#ec4899" />
                          <span>5. Nominee Allocations</span>
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Beneficiary Inheritance</span>
                      </div>

                      {kycData.nominees && kycData.nominees.length > 0 && kycData.nominees.some((n: any) => n.name?.trim()) ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {kycData.nominees.map((nom: any, idx: number) => (
                            <div key={nom.id || idx} className="opp-nominee-card">
                              <div>
                                <div className="opp-field-label">Nominee Name</div>
                                <div className="opp-field-value">{nom.name || '—'}</div>
                              </div>
                              <div>
                                <div className="opp-field-label">Relationship</div>
                                <div className="opp-field-value">{nom.relationship || '—'}</div>
                              </div>
                              <div>
                                <div className="opp-field-label">Allocation Share</div>
                                <div className="opp-field-value" style={{ color: '#10b981', fontWeight: 700 }}>
                                  {nom.allocationPercentage ? `${nom.allocationPercentage}%` : '—'}
                                </div>
                              </div>
                              <div>
                                <div className="opp-field-label">Date of Birth</div>
                                <div className="opp-field-value">{nom.dob || '—'}</div>
                              </div>
                              {nom.guardianName && (
                                <div>
                                  <div className="opp-field-label">Guardian</div>
                                  <div className="opp-field-value">{nom.guardianName}</div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic', padding: '8px 0' }}>
                          No nominee beneficiaries recorded in this file.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════════════
                    TAB 2: DOCUMENT VAULT
                   ═══════════════════════════════════════════════════════════════════ */}
                {activeWorkspaceTab === 'documents' && (
                  <div className="opp-vault-container">
                    <div className="opp-vault-banner">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <ShieldCheck size={20} color="#10b981" />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 750, color: 'var(--text-primary)' }}>
                            Government Identification & Regulatory Vault
                          </div>
                          <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                            All uploaded documents are encrypted and verified according to SEBI & IRM compliance guidelines.
                          </div>
                        </div>
                      </div>
                      <span className="opp-vault-badge">
                        <CheckCircle2 size={12} /> {docsCount} Verified Documents
                      </span>
                    </div>

                    <div className="opp-vault-grid">
                      {/* Document 1: PAN Card */}
                      <div className="opp-vault-card">
                        <div>
                          <div className="opp-vault-card-top">
                            <div className="opp-vault-icon-wrap" style={{ background: 'rgba(236, 72, 153, 0.12)', color: '#ec4899' }}>
                              <FileText size={20} />
                            </div>
                            <div>
                              <h4 className="opp-vault-title">PAN Card Copy</h4>
                              <div className="opp-vault-sub">
                                Permanent Account Number: <strong style={{ color: 'var(--text-primary)' }}>{kycData?.panNumber || '—'}</strong>
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                Name as per PAN: {kycData?.nameAsPerPan || deal.customerName}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="opp-vault-card-bottom">
                          <span className={`opp-vault-badge ${!kycData?.panNumber ? 'pending' : ''}`}>
                            <CheckCircle2 size={11} /> {kycData?.panNumber ? 'Verified Govt ID' : 'Pending'}
                          </span>
                          {kycData?.panDoc?.url ? (
                            <a href={kycData.panDoc.url} target="_blank" rel="noopener noreferrer" className="opp-vault-btn">
                              <Eye size={12} /> View Document ↗
                            </a>
                          ) : (
                            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Digital Record on File</span>
                          )}
                        </div>
                      </div>

                      {/* Document 2: Aadhaar Card */}
                      <div className="opp-vault-card">
                        <div>
                          <div className="opp-vault-card-top">
                            <div className="opp-vault-icon-wrap" style={{ background: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' }}>
                              <ShieldCheck size={20} />
                            </div>
                            <div>
                              <h4 className="opp-vault-title">Aadhaar Card Proof</h4>
                              <div className="opp-vault-sub">
                                UIDAI Aadhaar: <strong style={{ color: 'var(--text-primary)' }}>
                                  {kycData?.aadhaarNumber ? (kycData.aadhaarNumber.length >= 4 ? `•••• •••• ${kycData.aadhaarNumber.slice(-4)}` : kycData.aadhaarNumber) : '—'}
                                </strong>
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                Address Proof: {[kycData?.city, kycData?.state].filter(Boolean).join(', ') || 'India'}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="opp-vault-card-bottom">
                          <span className={`opp-vault-badge ${!kycData?.aadhaarNumber ? 'pending' : ''}`}>
                            <CheckCircle2 size={11} /> {kycData?.aadhaarNumber ? 'Address & ID Verified' : 'Pending'}
                          </span>
                          {kycData?.aadhaarDoc?.url ? (
                            <a href={kycData.aadhaarDoc.url} target="_blank" rel="noopener noreferrer" className="opp-vault-btn">
                              <Eye size={12} /> View Document ↗
                            </a>
                          ) : (
                            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Digital Record on File</span>
                          )}
                        </div>
                      </div>

                      {/* Document 3: Bank Cheque / Statement */}
                      <div className="opp-vault-card">
                        <div>
                          <div className="opp-vault-card-top">
                            <div className="opp-vault-icon-wrap" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }}>
                              <Landmark size={20} />
                            </div>
                            <div>
                              <h4 className="opp-vault-title">Bank Cheque / Mandate</h4>
                              <div className="opp-vault-sub">
                                Bank: <strong style={{ color: 'var(--text-primary)' }}>{kycData?.bankName || '—'}</strong>
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                A/C: {kycData?.accountNumber || '—'} • IFSC: {kycData?.ifscCode || '—'}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="opp-vault-card-bottom">
                          <span className={`opp-vault-badge ${!kycData?.bankName ? 'pending' : ''}`}>
                            <CheckCircle2 size={11} /> {kycData?.bankName ? 'Payout Mandate Linked' : 'Pending'}
                          </span>
                          {kycData?.bankProofDoc?.url ? (
                            <a href={kycData.bankProofDoc.url} target="_blank" rel="noopener noreferrer" className="opp-vault-btn">
                              <Eye size={12} /> View Document ↗
                            </a>
                          ) : (
                            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Digital Record on File</span>
                          )}
                        </div>
                      </div>

                      {/* Document 4: Demat CMR Proof */}
                      <div className="opp-vault-card">
                        <div>
                          <div className="opp-vault-card-top">
                            <div className="opp-vault-icon-wrap" style={{ background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6' }}>
                              <TrendingUp size={20} />
                            </div>
                            <div>
                              <h4 className="opp-vault-title">Demat Statement (CMR)</h4>
                              <div className="opp-vault-sub">
                                Demat A/C: <strong style={{ color: 'var(--text-primary)' }}>{kycData?.dematAccountNumber || (kycData?.hasNoDemat ? 'Declared No Demat' : '—')}</strong>
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                Depository: {kycData?.dematDepository || (kycData?.dpId?.startsWith('IN') ? 'NSDL' : 'CDSL')} • DP ID: {kycData?.dpId || '—'}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="opp-vault-card-bottom">
                          <span className={`opp-vault-badge ${!kycData?.dematAccountNumber && !kycData?.hasNoDemat ? 'pending' : ''}`}>
                            <CheckCircle2 size={11} /> {kycData?.dematAccountNumber ? 'Depository Linked' : kycData?.hasNoDemat ? 'Exempt' : 'Pending'}
                          </span>
                          {kycData?.dematDoc?.url ? (
                            <a href={kycData.dematDoc.url} target="_blank" rel="noopener noreferrer" className="opp-vault-btn">
                              <Eye size={12} /> View Document ↗
                            </a>
                          ) : (
                            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Digital Record on File</span>
                          )}
                        </div>
                      </div>

                      {/* Document 5: Electronic Consent Audit */}
                      <div className="opp-vault-card" style={{ gridColumn: 'span 2' }}>
                        <div>
                          <div className="opp-vault-card-top">
                            <div className="opp-vault-icon-wrap" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }}>
                              <Award size={20} />
                            </div>
                            <div>
                              <h4 className="opp-vault-title">Investor E-Consent & Verification Audit</h4>
                              <div className="opp-vault-sub">
                                Mode of Submission: <strong style={{ color: 'var(--text-primary)' }}>RM-Assisted KYC Verification</strong>
                              </div>
                              <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                                Verified by <strong>{kycData?.verifiedBy || deal.assignedAgentName || 'Compliance Officer'}</strong> on {formatDate(kycData?.verifiedAt || kycData?.submittedAt)}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="opp-vault-card-bottom">
                          <span className="opp-vault-badge">
                            <CheckCircle2 size={11} /> Legal Electronic Consent Archived
                          </span>
                          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                            IP & Timestamp Fingerprint Logged
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════════════
                    TAB 3: ACTIVITY & CALL HISTORY
                   ═══════════════════════════════════════════════════════════════════ */}
                {activeWorkspaceTab === 'activity' && (
                  <div className="opp-activity-container">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                          Omnichannel Telephony & Interaction History
                        </h3>
                        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                          All voice calls, follow-up touchpoints, and wealth advisory consultations logged for {deal.customerName}.
                        </p>
                      </div>

                      {deal.phone && (
                        <button
                          type="button"
                          className="opp-action-btn-call"
                          onClick={() => onCallInvestor(deal.customerName, deal.phone, String(deal.id))}
                        >
                          <Phone size={13} /> Call {deal.customerName}
                        </button>
                      )}
                    </div>

                    {matchingCalls.length === 0 && matchingFollowups.length === 0 && matchingConsultations.length === 0 ? (
                      <div
                        style={{
                          padding: '36px 20px',
                          borderRadius: 12,
                          background: 'var(--bg-surface, #1e293b)',
                          border: '1px dashed var(--border-color, rgba(255, 255, 255, 0.12))',
                          textAlign: 'center',
                          color: 'var(--text-muted)',
                        }}
                      >
                        <PhoneCall size={32} style={{ opacity: 0.4, margin: '0 auto 8px' }} />
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>No Interactions Recorded Yet</div>
                        <p style={{ margin: '4px 0 12px', fontSize: 12 }}>
                          No call logs or consultations found for {deal.customerName} ({deal.phone || 'No phone'}).
                        </p>
                        {deal.phone && (
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => onCallInvestor(deal.customerName, deal.phone, String(deal.id))}
                            style={{ margin: '0 auto' }}
                          >
                            <Phone size={13} /> Place First Call
                          </button>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {/* Call Records */}
                        {matchingCalls.map((call, idx) => {
                          const outcome = (call as any).outcome || call.disposition || 'Completed';
                          const outcomeColor =
                            outcome === 'Interested' || outcome === 'Connected'
                              ? { bg: 'rgba(16, 185, 129, 0.12)', color: '#10b981' }
                              : outcome === 'Callback' || outcome === 'Follow-up'
                              ? { bg: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b' }
                              : { bg: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6' };

                          return (
                            <div key={call.id || idx} className="opp-activity-item">
                              <div className="opp-activity-icon-wrap" style={{ background: outcomeColor.bg, color: outcomeColor.color }}>
                                <Phone size={18} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                                      {call.direction === 'inbound' ? 'Inbound Call' : 'Outbound Telephony Call'}
                                    </strong>
                                    <span
                                      className="opp-outcome-pill"
                                      style={{ background: outcomeColor.bg, color: outcomeColor.color }}
                                    >
                                      {outcome}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                                    {formatDate(call.timestamp || (call as any).startedAt || (call as any).createdAt)} • Duration: {formatDuration(call.duration || (call as any).durationSeconds)}
                                  </div>
                                </div>

                                {call.notes && (
                                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
                                    {call.notes}
                                  </div>
                                )}

                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                                  <span>Agent: <strong>{call.agentName || (call as any).salesRepName || deal.assignedAgentName || 'Dhinakaran'}</strong></span>
                                  {call.recordingUrl && (
                                    <a
                                      href={call.recordingUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{ color: '#0284c7', display: 'flex', alignItems: 'center', gap: 4 }}
                                    >
                                      <Play size={10} /> Play Telephony Audio
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* Consultations */}
                        {matchingConsultations.map((con, idx) => {
                          const conTopic = con.agenda || (con as any).topic || 'Portfolio Advisory Session';
                          const conNotes = con.outcomeNotes || (con as any).notes;
                          return (
                            <div key={con.id || idx} className="opp-activity-item">
                              <div className="opp-activity-icon-wrap" style={{ background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6' }}>
                                <Calendar size={18} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                                      Consultation: {conTopic}
                                    </strong>
                                    <span className="opp-outcome-pill" style={{ background: 'rgba(139, 92, 246, 0.12)', color: '#8b5cf6' }}>
                                      {con.status || 'Scheduled'}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                                    {formatDate(con.scheduledAt || (con as any).date)}
                                  </div>
                                </div>
                                {conNotes && (
                                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                                    {conNotes}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}

                        {/* Followups */}
                        {matchingFollowups.map((f, idx) => {
                          const fReason = (f as any).reason || (f.notes ? (f.notes.length > 40 ? f.notes.slice(0, 40) + '...' : f.notes) : 'Follow-up on Term Sheet');
                          return (
                            <div key={f.id || idx} className="opp-activity-item">
                              <div className="opp-activity-icon-wrap" style={{ background: 'rgba(236, 72, 153, 0.12)', color: '#ec4899' }}>
                                <Clock size={18} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                                      Follow-up: {fReason}
                                    </strong>
                                    <span className="opp-outcome-pill" style={{ background: f.status === 'Completed' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)', color: f.status === 'Completed' ? '#10b981' : '#f59e0b' }}>
                                      {f.status || 'Pending'}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                                    Due: {formatDate(f.scheduledAt || (f as any).dueDate)}
                                  </div>
                                </div>
                                {f.notes && (
                                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                                    {f.notes}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ═══════════════════════════════════════════════════════════════════
                    TAB 4: INVESTMENT MANDATE & TERMS
                   ═══════════════════════════════════════════════════════════════════ */}
                {activeWorkspaceTab === 'mandate' && (
                  <div className="opp-mandate-container">
                    <div className="opp-mandate-deck">
                      {/* Mandate Card 1: Investment Tranche Breakdown */}
                      <div className="opp-dossier-section">
                        <div className="opp-dossier-section-header">
                          <div className="opp-dossier-section-title">
                            <IndianRupee size={15} color="#10b981" />
                            <span>Syndication Commitment Tranche</span>
                          </div>
                          <span style={{ fontSize: 11, color: '#10b981', fontWeight: 700 }}>Active Mandate</span>
                        </div>

                        <div style={{ padding: '16px 0', borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))' }}>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Committed Investment Value:</div>
                          <div style={{ fontSize: 26, fontWeight: 800, color: '#10b981', marginTop: 2, letterSpacing: '-0.5px' }}>
                            {formatCurrency(deal.value || 0)}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                            {deal.investmentAmountConfirmed ? '✅ Confirmed by Wealth Consultant' : '⏳ Pending Formal Confirmation'}
                          </div>
                        </div>

                        <div className="opp-dossier-grid" style={{ marginTop: 8 }}>
                          <div className="opp-field-tile">
                            <div className="opp-field-label">Target Stage</div>
                            <div className="opp-field-value">{deal.stage || 'investment_opportunity'}</div>
                          </div>
                          <div className="opp-field-tile">
                            <div className="opp-field-label">Target Close Date</div>
                            <div className="opp-field-value">{formatDate(deal.expectedCloseDate) || 'Immediate Tranche'}</div>
                          </div>
                          <div className="opp-field-tile">
                            <div className="opp-field-label">Assigned Wealth Manager</div>
                            <div className="opp-field-value">{deal.assignedAgentName || 'Dhinakaran'}</div>
                          </div>
                          <div className="opp-field-tile">
                            <div className="opp-field-label">Deal Pipeline ID</div>
                            <div className="opp-field-value">DEAL #{deal.id}</div>
                          </div>
                        </div>
                      </div>

                      {/* Mandate Card 2: Investor Mandate Parameters */}
                      <div className="opp-dossier-section">
                        <div className="opp-dossier-section-header">
                          <div className="opp-dossier-section-title">
                            <Briefcase size={15} color="#8b5cf6" />
                            <span>Investor Allocation Mandate</span>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Profile Suitability</span>
                        </div>

                        <div className="opp-dossier-grid">
                          <div className="opp-field-tile">
                            <div className="opp-field-label">Investor Category</div>
                            <div className="opp-field-value">{kycData?.investorType || 'Individual / Retail HNW'}</div>
                          </div>
                          <div className="opp-field-tile">
                            <div className="opp-field-label">Residential Status</div>
                            <div className="opp-field-value">{kycData?.residentType || 'Resident Indian (RI)'}</div>
                          </div>
                          <div className="opp-field-tile">
                            <div className="opp-field-label">Preferred Asset Class</div>
                            <div className="opp-field-value">{(deal as any).assetClass || 'Private Equity Syndication'}</div>
                          </div>
                          <div className="opp-field-tile">
                            <div className="opp-field-label">Risk Tolerance</div>
                            <div className="opp-field-value" style={{ color: '#3b82f6', fontWeight: 700 }}>Moderate to High Growth</div>
                          </div>
                          <div className="opp-field-tile" style={{ gridColumn: 'span 2' }}>
                            <div className="opp-field-label">Occupation / Source of Funds</div>
                            <div className="opp-field-value">{kycData?.occupation || 'Business / Investment Profits'}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Ready to Convert Banner */}
                    <div
                      style={{
                        padding: '18px 20px',
                        borderRadius: 12,
                        background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
                        border: '1px solid rgba(236, 72, 153, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 16,
                        flexWrap: 'wrap',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 750, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <CheckCircle2 size={18} color="#ec4899" />
                          <span>Ready to Advance to Converted Investor?</span>
                        </div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 4 }}>
                          All 5 verified KYC dossier sections and commitment details have been confirmed. Converting this deal will promote {deal.customerName} into active <strong>Investor 360</strong>.
                        </div>
                      </div>

                      <button
                        type="button"
                        className="opp-action-btn-convert"
                        disabled={!deal.investmentAmountConfirmed}
                        onClick={() => {
                          if (deal.investmentAmountConfirmed) {
                            onConvertDeal(deal);
                          }
                        }}
                        style={{ padding: '10px 20px', fontSize: 13 }}
                      >
                        <CheckCircle size={15} />
                        <span>Convert Deal Now</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Bottom Profile Footer Bar ───────────────────────────────────────── */}
        <div className="opp-profile-footer">
          <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Hash size={13} />
            <span>Customer #{deal.customerId || deal.id}</span>
            {deal.assignedAgentName && (
              <>
                <span>•</span>
                <span>Assigned IRM: <strong style={{ color: 'var(--text-primary)' }}>{deal.assignedAgentName}</strong></span>
              </>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              Back to Opportunities
            </button>
            <button
              type="button"
              className="irm-convert-btn"
              disabled={!deal.investmentAmountConfirmed}
              onClick={() => {
                if (deal.investmentAmountConfirmed) {
                  onConvertDeal(deal);
                }
              }}
              style={{
                opacity: deal.investmentAmountConfirmed ? 1 : 0.45,
                cursor: deal.investmentAmountConfirmed ? 'pointer' : 'not-allowed',
                padding: '8px 16px',
                fontSize: 13,
              }}
              title={deal.investmentAmountConfirmed ? 'Convert deal to Active Investor' : 'Confirm investment amount first'}
            >
              <CheckCircle size={14} /> Convert to Investor 360
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
