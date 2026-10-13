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
  Landmark,
  ArrowLeft,
  FolderOpen,
  PhoneCall,
  Briefcase,
  Download,
  FileCheck,
  Calendar,
  AlertCircle,
  Shield,
  ArrowUpRight,
  ChevronRight,
  Layers,
  Percent,
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
  // Default to Investor Dossier & KYC as primary deal view
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'dossier' | 'activity' | 'documents'>('dossier');

  const kycStatus = getDealKycStatus(deal, liveKycData);
  const kycBadgeStyles = {
    Verified: { bg: 'rgba(132, 204, 22, 0.14)', color: '#84cc16', border: 'rgba(132, 204, 22, 0.35)' },
    Submitted: { bg: 'rgba(59, 130, 246, 0.12)', color: '#60a5fa', border: 'rgba(59, 130, 246, 0.3)' },
    'Partially Completed': { bg: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' },
    Wrong: { bg: 'rgba(220, 38, 38, 0.12)', color: '#ef4444', border: 'rgba(220, 38, 38, 0.3)' },
    Pending: { bg: 'rgba(148, 163, 184, 0.12)', color: '#94a3b8', border: 'rgba(148, 163, 184, 0.25)' },
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

  const dealValueNum = Number(deal.value || 0);

  return (
    <div className={`opp-dealroom-root ${isDark ? 'dark-theme' : 'light-theme'}`}>
      {/* ── 1. Top Executive Deal Room Ribbon (Zero Vertical Waste) ─────────── */}
      <header className="opp-dealroom-ribbon">
        <div className="opp-ribbon-left">
          <button
            type="button"
            className="opp-ribbon-back-btn"
            onClick={onClose}
            title="Return to Investment Opportunities list"
          >
            <ArrowLeft size={14} />
            <span>Opportunities</span>
          </button>
          
          <div className="opp-ribbon-divider" />

          <div className="opp-ribbon-identity">
            <span className="opp-ribbon-code">DEAL #{deal.id}</span>
            <h1 className="opp-ribbon-title">{deal.customerName}</h1>
            {deal.customerId && (
              <span className="opp-ribbon-cid">Cust ID: #{deal.customerId}</span>
            )}
          </div>
        </div>

        <div className="opp-ribbon-right">
          <div className="opp-ribbon-metric">
            <span className="opp-ribbon-metric-label">PIPELINE STATUS</span>
            <span className="opp-ribbon-stage-pill">
              <span className="opp-pulse-beacon" /> Syndicate Mandate
            </span>
          </div>

          <div className="opp-ribbon-metric">
            <span className="opp-ribbon-metric-label">TARGET TRANCHE</span>
            <span className="opp-ribbon-metric-val">{formatCurrency(dealValueNum)}</span>
          </div>

          {deal.phone && (
            <button
              type="button"
              className="opp-ribbon-btn-call"
              onClick={() => onCallInvestor(deal.customerName, deal.phone, String(deal.id))}
              title="Initiate direct phone consultation"
            >
              <Phone size={13} />
              <span>Call Investor</span>
            </button>
          )}

          <button
            type="button"
            className={`opp-ribbon-btn-convert ${deal.investmentAmountConfirmed ? 'is-pulse' : ''}`}
            disabled={!deal.investmentAmountConfirmed}
            onClick={() => {
              if (deal.investmentAmountConfirmed) {
                onConvertDeal(deal);
              }
            }}
            title={deal.investmentAmountConfirmed ? 'Convert Deal to Active Investor' : 'Confirm investment amount first'}
          >
            <CheckCircle size={14} />
            <span>Convert Deal</span>
          </button>
        </div>
      </header>

      {/* ── 2. Split-Screen Workstation (Left 38% Sticky Rail | Right 62% Workstation) */}
      <div className="opp-dealroom-body">
        {/* ═════════════════════════════════════════════════════════════════════
            LEFT EXECUTION RAIL (Sticky Deal Passport & Action Terminal)
           ═════════════════════════════════════════════════════════════════════ */}
        <aside className="opp-dealroom-rail">
          {/* Rail Card 1: Capital Mandate & Commitment Terminal */}
          <div className="opp-rail-terminal-card">
            <div className="opp-terminal-head">
              <div className="opp-terminal-badge-row">
                <span className="opp-terminal-title">SYNDICATE CAPITAL MANDATE</span>
                {deal.investmentAmountConfirmed ? (
                  <span className="opp-mandate-confirmed-chip">
                    <CheckCircle2 size={11} /> MANDATE LOCKED
                  </span>
                ) : (
                  <span className="opp-mandate-pending-chip">
                    <Clock size={11} /> PENDING LOCK
                  </span>
                )}
              </div>
            </div>

            {/* Live Bold Capital Ticker */}
            <div className="opp-terminal-ticker">
              <span className="opp-ticker-symbol">₹</span>
              <span className="opp-ticker-num">
                {dealValueNum > 0 ? dealValueNum.toLocaleString('en-IN') : '0'}
              </span>
            </div>

            {/* Amount Modification Console */}
            {!isEditingAmount ? (
              <div className="opp-ticker-footer">
                <span className="opp-ticker-hint">
                  {deal.investmentAmountConfirmed
                    ? 'Legally binding tranche commitment confirmed'
                    : 'Target allocation tranche under negotiation'}
                </span>
                <button
                  type="button"
                  className="opp-terminal-modify-btn"
                  onClick={onEditAmount}
                >
                  <Edit2 size={12} /> Modify Tranche
                </button>
              </div>
            ) : (
              <div className="opp-ticker-editor-box">
                <div className="opp-editor-input-row">
                  <div className="opp-editor-input-group">
                    <span className="opp-input-curr">₹</span>
                    <input
                      type="number"
                      className="opp-editor-input"
                      value={amountInput}
                      onChange={e => onAmountInputChange(e.target.value)}
                      placeholder="e.g. 2500000"
                      autoFocus
                    />
                  </div>
                  <button
                    type="button"
                    className="opp-editor-confirm-btn"
                    onClick={onConfirmAmountClick}
                  >
                    <Check size={13} /> Confirm
                  </button>
                </div>

                <div className="opp-editor-presets">
                  {INVESTMENT_PRESETS.map(p => (
                    <button
                      key={p.value}
                      type="button"
                      className="opp-preset-pill"
                      onClick={() => onAmountInputChange(String(p.value))}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Huge Conversion Command Button */}
            <button
              type="button"
              className={`opp-rail-convert-cta ${deal.investmentAmountConfirmed ? 'ready' : 'disabled'}`}
              disabled={!deal.investmentAmountConfirmed}
              onClick={() => {
                if (deal.investmentAmountConfirmed) {
                  onConvertDeal(deal);
                }
              }}
            >
              <div className="opp-convert-cta-icon">
                <CheckCircle2 size={18} />
              </div>
              <div className="opp-convert-cta-meta">
                <strong>{deal.investmentAmountConfirmed ? 'Execute Deal Conversion' : 'Confirm Amount to Convert'}</strong>
                <span>{deal.investmentAmountConfirmed ? 'Promote opportunity into active Investor 360' : 'Mandate tranche must be confirmed first'}</span>
              </div>
              <ArrowUpRight size={16} className="opp-cta-arrow" />
            </button>
          </div>

          {/* Rail Card 2: 4-Stage Visual Deal Pipeline Stepper */}
          <div className="opp-rail-pipeline-card">
            <div className="opp-pipeline-card-head">
              <span className="opp-card-section-label">DEAL CONVERSION PROGRESSION</span>
              <span className="opp-card-step-count">Stage 3 of 4</span>
            </div>

            <div className="opp-pipeline-stepper-track">
              {/* Step 1: Discovery & Lead Assignment */}
              <div className="opp-stepper-item completed">
                <div className="opp-stepper-dot">
                  <Check size={11} strokeWidth={3} />
                </div>
                <div className="opp-stepper-content">
                  <div className="opp-stepper-name">1. Lead Discovery</div>
                  <div className="opp-stepper-sub">Owner: {deal.assignedAgentName || 'Assigned IRM'}</div>
                </div>
              </div>

              {/* Step 2: Compliance & KYC */}
              <div className={`opp-stepper-item ${kycStatus === 'Verified' ? 'completed' : 'active'}`}>
                <div className="opp-stepper-dot">
                  {kycStatus === 'Verified' ? <Check size={11} strokeWidth={3} /> : '2'}
                </div>
                <div className="opp-stepper-content">
                  <div className="opp-stepper-name">2. Investor Compliance (KYC)</div>
                  <div className="opp-stepper-sub" style={{ color: kycBadgeStyles.color }}>
                    {kycStatus} Status
                  </div>
                </div>
              </div>

              {/* Step 3: Capital Mandate Commitment */}
              <div className={`opp-stepper-item ${deal.investmentAmountConfirmed ? 'completed' : 'active'}`}>
                <div className="opp-stepper-dot">
                  {deal.investmentAmountConfirmed ? <Check size={11} strokeWidth={3} /> : '3'}
                </div>
                <div className="opp-stepper-content">
                  <div className="opp-stepper-name">3. Capital Mandate Tranche</div>
                  <div className="opp-stepper-sub" style={{ color: deal.investmentAmountConfirmed ? '#84cc16' : 'inherit' }}>
                    {deal.investmentAmountConfirmed ? `Locked ${formatCurrency(dealValueNum)}` : 'Pending Amount Lock'}
                  </div>
                </div>
              </div>

              {/* Step 4: Final Conversion */}
              <div className="opp-stepper-item future">
                <div className="opp-stepper-dot">4</div>
                <div className="opp-stepper-content">
                  <div className="opp-stepper-name">4. Investor 360 Promotion</div>
                  <div className="opp-stepper-sub">Deal Execution & Onboarding</div>
                </div>
              </div>
            </div>
          </div>

          {/* Rail Card 3: Investor Relationship DNA */}
          <div className="opp-rail-passport-card">
            <div className="opp-passport-head">
              <div className="opp-passport-avatar">
                {initials}
              </div>
              <div className="opp-passport-titles">
                <h3 className="opp-passport-name">{deal.customerName}</h3>
                <span className="opp-passport-asset">
                  <Building2 size={11} /> {(deal as any).assetClass || liveKycData?.investorType || 'Private Equity'}
                </span>
              </div>
            </div>

            <div className="opp-passport-ledger">
              {deal.phone && (
                <div className="opp-passport-row">
                  <span className="opp-ledger-lbl">
                    <Phone size={12} color="#84cc16" /> Phone
                  </span>
                  <span className="opp-ledger-val">{deal.phone}</span>
                  <button
                    type="button"
                    className="opp-ledger-copy"
                    onClick={() => copyToClipboard(deal.phone, 'rail_phone')}
                    title="Copy Phone"
                  >
                    {copiedField === 'rail_phone' ? <Check size={11} color="#84cc16" /> : <Copy size={11} />}
                  </button>
                </div>
              )}

              {deal.email && (
                <div className="opp-passport-row">
                  <span className="opp-ledger-lbl">
                    <Mail size={12} color="#ef4444" /> Email
                  </span>
                  <span className="opp-ledger-val">{deal.email}</span>
                  <button
                    type="button"
                    className="opp-ledger-copy"
                    onClick={() => copyToClipboard(deal.email, 'rail_email')}
                    title="Copy Email"
                  >
                    {copiedField === 'rail_email' ? <Check size={11} color="#84cc16" /> : <Copy size={11} />}
                  </button>
                </div>
              )}

              <div className="opp-passport-row">
                <span className="opp-ledger-lbl">
                  <User size={12} /> Relationship IRM
                </span>
                <span className="opp-ledger-val">{deal.assignedAgentName || 'Unassigned'}</span>
              </div>

              {kycData?.panNumber && (
                <div className="opp-passport-row">
                  <span className="opp-ledger-lbl">
                    <ShieldCheck size={12} /> PAN Ref
                  </span>
                  <span className="opp-ledger-val mono">{kycData.panNumber}</span>
                  <button
                    type="button"
                    className="opp-ledger-copy"
                    onClick={() => copyToClipboard(kycData.panNumber, 'rail_pan')}
                    title="Copy PAN"
                  >
                    {copiedField === 'rail_pan' ? <Check size={11} color="#84cc16" /> : <Copy size={11} />}
                  </button>
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* ═════════════════════════════════════════════════════════════════════
            RIGHT SYNDICATION WORKSTATION (Deep Multi-Module Deal Hub)
           ═════════════════════════════════════════════════════════════════════ */}
        <main className="opp-dealroom-workstation">
          {/* Workstation Top Navigation Tabs */}
          <nav className="opp-workstation-tabs">
            <button
              type="button"
              className={`opp-ws-tab-btn ${activeWorkspaceTab === 'dossier' ? 'active' : ''}`}
              onClick={() => setActiveWorkspaceTab('dossier')}
            >
              <FileText size={14} />
              <span>1. Investor Dossier & KYC</span>
              <span className="opp-ws-tab-counter" style={{ color: kycBadgeStyles.color }}>
                {kycStatus}
              </span>
            </button>

            <button
              type="button"
              className={`opp-ws-tab-btn ${activeWorkspaceTab === 'activity' ? 'active' : ''}`}
              onClick={() => setActiveWorkspaceTab('activity')}
            >
              <PhoneCall size={14} />
              <span>2. Telephony & Activity</span>
              <span className="opp-ws-tab-counter">
                {matchingCalls.length + matchingFollowups.length}
              </span>
            </button>

            <button
              type="button"
              className={`opp-ws-tab-btn ${activeWorkspaceTab === 'documents' ? 'active' : ''}`}
              onClick={() => setActiveWorkspaceTab('documents')}
            >
              <FolderOpen size={14} />
              <span>3. Vault & Legal Binder</span>
              <span className="opp-ws-tab-counter">{docsCount}/4</span>
            </button>
          </nav>

          {/* TAB 2: INVESTOR PROFILE & KYC DOSSIER */}
          {activeWorkspaceTab === 'dossier' && (
            <div className="opp-ws-pane">
              {isKycLoading ? (
                <div className="opp-loading-box">
                  <div className="opp-spinner" />
                  <span>Retrieving verified investor profile from secure store...</span>
                </div>
              ) : !kycData ? (
                <div className="opp-empty-box">
                  No KYC dossier records found for this contact.
                </div>
              ) : (
                <div className="opp-ledger-container">
                  {/* Ledger Section 1: Statutory Identifiers */}
                  <div className="opp-formal-ledger-card">
                    <div className="opp-ledger-card-head">
                      <div className="opp-card-title-group">
                        <ShieldCheck size={16} color="#ef4444" />
                        <h3>1. Statutory & Identity Proofs</h3>
                      </div>
                      <span className="opp-compliance-tag" style={{ color: kycBadgeStyles.color }}>
                        {kycStatus}
                      </span>
                    </div>

                    <div className="opp-ledger-keyval-grid">
                      <div className="opp-kv-item">
                        <span className="opp-kv-label">Full Legal Name</span>
                        <span className="opp-kv-value">{kycData.investorName || deal.customerName || '—'}</span>
                      </div>
                      <div className="opp-kv-item">
                        <span className="opp-kv-label">PAN Number</span>
                        <span className="opp-kv-value mono">
                          {kycData.panNumber || '—'}
                          {kycData.panNumber && (
                            <button
                              type="button"
                              className="opp-kv-copy-btn"
                              onClick={() => copyToClipboard(kycData.panNumber, 'k_pan')}
                            >
                              {copiedField === 'k_pan' ? <Check size={11} color="#84cc16" /> : <Copy size={11} />}
                            </button>
                          )}
                        </span>
                      </div>
                      <div className="opp-kv-item">
                        <span className="opp-kv-label">Aadhaar Number</span>
                        <span className="opp-kv-value mono">{kycData.aadhaarNumber || '—'}</span>
                      </div>
                      <div className="opp-kv-item">
                        <span className="opp-kv-label">Date of Birth</span>
                        <span className="opp-kv-value">{formatDate(kycData.dateOfBirth)}</span>
                      </div>
                      <div className="opp-kv-item">
                        <span className="opp-kv-label">Gender</span>
                        <span className="opp-kv-value">{kycData.gender || '—'}</span>
                      </div>
                      <div className="opp-kv-item">
                        <span className="opp-kv-label">Residential Status</span>
                        <span className="opp-kv-value">{kycData.residentType || 'Resident Indian (RI)'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Ledger Section 2: Banking & Settlement Ledger */}
                  <div className="opp-formal-ledger-card">
                    <div className="opp-ledger-card-head">
                      <div className="opp-card-title-group">
                        <Landmark size={16} color="#84cc16" />
                        <h3>2. Banking & Settlement Accounts</h3>
                      </div>
                      <span className="opp-meta-pill">Direct RTGS Escrow</span>
                    </div>

                    <div className="opp-ledger-keyval-grid">
                      <div className="opp-kv-item">
                        <span className="opp-kv-label">Bank Name</span>
                        <span className="opp-kv-value">{kycData.bankName || '—'}</span>
                      </div>
                      <div className="opp-kv-item">
                        <span className="opp-kv-label">Account Number</span>
                        <span className="opp-kv-value mono">{kycData.accountNumber || '—'}</span>
                      </div>
                      <div className="opp-kv-item">
                        <span className="opp-kv-label">IFSC Code</span>
                        <span className="opp-kv-value mono">{kycData.ifscCode || '—'}</span>
                      </div>
                      <div className="opp-kv-item">
                        <span className="opp-kv-label">Demat Account Number</span>
                        <span className="opp-kv-value mono">{kycData.dematAccountNumber || '—'}</span>
                      </div>
                      <div className="opp-kv-item">
                        <span className="opp-kv-label">DP Name</span>
                        <span className="opp-kv-value">{kycData.dpName || '—'}</span>
                      </div>
                      <div className="opp-kv-item">
                        <span className="opp-kv-label">Account Type</span>
                        <span className="opp-kv-value">Savings / Resident Individual</span>
                      </div>
                    </div>
                  </div>

                  {/* Ledger Section 3: Nominee & Legal Heirs */}
                  <div className="opp-formal-ledger-card">
                    <div className="opp-ledger-card-head">
                      <div className="opp-card-title-group">
                        <Users size={16} color="#ef4444" />
                        <h3>3. Nominee & Succession Details</h3>
                      </div>
                      <span className="opp-meta-pill">100% Allocation</span>
                    </div>

                    <div className="opp-ledger-keyval-grid">
                      <div className="opp-kv-item">
                        <span className="opp-kv-label">Nominee Name</span>
                        <span className="opp-kv-value">{kycData.nomineeName || '—'}</span>
                      </div>
                      <div className="opp-kv-item">
                        <span className="opp-kv-label">Relationship with Investor</span>
                        <span className="opp-kv-value">{kycData.nomineeRelation || '—'}</span>
                      </div>
                      <div className="opp-kv-item">
                        <span className="opp-kv-label">Nominee Date of Birth</span>
                        <span className="opp-kv-value">{formatDate(kycData.nomineeDob)}</span>
                      </div>
                      <div className="opp-kv-item">
                        <span className="opp-kv-label">Nominee Allocation Share</span>
                        <span className="opp-kv-value highlight-green">100%</span>
                      </div>
                    </div>
                  </div>

                  {/* Ledger Section 4: Registered Address */}
                  <div className="opp-formal-ledger-card">
                    <div className="opp-ledger-card-head">
                      <div className="opp-card-title-group">
                        <Building2 size={16} color="#84cc16" />
                        <h3>4. Permanent Communication Address</h3>
                      </div>
                    </div>

                    <div className="opp-ledger-keyval-grid">
                      <div className="opp-kv-item" style={{ gridColumn: 'span 2' }}>
                        <span className="opp-kv-label">Full Residential Address</span>
                        <span className="opp-kv-value">{kycData.addressLine || '—'}</span>
                      </div>
                      <div className="opp-kv-item">
                        <span className="opp-kv-label">City</span>
                        <span className="opp-kv-value">{kycData.city || '—'}</span>
                      </div>
                      <div className="opp-kv-item">
                        <span className="opp-kv-label">State / Province</span>
                        <span className="opp-kv-value">{kycData.state || '—'}</span>
                      </div>
                      <div className="opp-kv-item">
                        <span className="opp-kv-label">PIN Code</span>
                        <span className="opp-kv-value mono">{kycData.pincode || '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Deal Room Ready Action */}
                  <div className="opp-termsheet-bottom-cta">
                    <div>
                      <h4 className="opp-ts-cta-title">Ready to Promote Deal to Converted Investor?</h4>
                      <p className="opp-ts-cta-desc">
                        Executing this will advance {deal.customerName} into active Investor 360 portfolio management.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="opp-termsheet-cta-btn"
                      disabled={!deal.investmentAmountConfirmed}
                      onClick={() => {
                        if (deal.investmentAmountConfirmed) {
                          onConvertDeal(deal);
                        }
                      }}
                    >
                      <CheckCircle size={15} />
                      <span>Convert Deal to Investor 360</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TELEPHONY & ACTIVITY STREAM */}
          {activeWorkspaceTab === 'activity' && (
            <div className="opp-ws-pane">
              <div className="opp-activity-stream">
                <div className="opp-stream-head">
                  <div>
                    <h3 className="opp-stream-title">Telephony History & Deal Interactions</h3>
                    <p className="opp-stream-sub">
                      Recorded consultations, phone touchpoints and follow-up activities
                    </p>
                  </div>
                  {deal.phone && (
                    <button
                      type="button"
                      className="opp-ribbon-btn-call"
                      onClick={() => onCallInvestor(deal.customerName, deal.phone, String(deal.id))}
                    >
                      <Phone size={13} />
                      <span>Dial Investor</span>
                    </button>
                  )}
                </div>

                {matchingCalls.length === 0 && matchingFollowups.length === 0 ? (
                  <div className="opp-empty-box">
                    No phone consultations or follow-up notes logged yet for this deal.
                  </div>
                ) : (
                  <div className="opp-stream-list">
                    {matchingCalls.map(c => (
                      <div key={c.id} className="opp-stream-item">
                        <div className="opp-stream-icon-box call">
                          <Phone size={14} color="#84cc16" />
                        </div>
                        <div className="opp-stream-body">
                          <div className="opp-stream-item-top">
                            <span className="opp-stream-action-name">
                              Outbound Telephony Consult ({c.disposition || c.callStatus || (c as any).status || 'Completed'})
                            </span>
                            <span className="opp-stream-time">{formatDate(c.timestamp || (c as any).createdAt)}</span>
                          </div>
                          <div className="opp-stream-notes">
                            {c.notes || 'Direct deal pitch and syndicated investment review call.'}
                          </div>
                          <div className="opp-stream-meta-row">
                            <span className="opp-stream-meta-chip">
                              Duration: {formatDuration(c.duration)}
                            </span>
                            <span className="opp-stream-meta-chip">
                              Agent: {c.agentName || (c as any).callerName || deal.assignedAgentName || 'IRM'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}

                    {matchingFollowups.map(f => (
                      <div key={f.id} className="opp-stream-item">
                        <div className="opp-stream-icon-box note">
                          <Calendar size={14} color="#ef4444" />
                        </div>
                        <div className="opp-stream-body">
                          <div className="opp-stream-item-top">
                            <span className="opp-stream-action-name">
                              Scheduled Follow-up: {(f as any).title || (f.followupType ? f.followupType.toUpperCase() : 'Term Sheet Discussion')}
                            </span>
                            <span className="opp-stream-time">{formatDate(f.scheduledAt || (f as any).createdAt)}</span>
                          </div>
                          <div className="opp-stream-notes">{f.notes || 'Follow-up regarding tranche confirmation'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: VAULT & LEGAL BINDER */}
          {activeWorkspaceTab === 'documents' && (
            <div className="opp-ws-pane">
              <div className="opp-vault-deck">
                <div className="opp-vault-head-box">
                  <div>
                    <h3 className="opp-vault-title">Compliance Document Vault</h3>
                    <p className="opp-vault-desc">
                      Verified statutory identity cards, banking proofs, and private syndication binders.
                    </p>
                  </div>
                  <span className="opp-vault-verified-tag">
                    <ShieldCheck size={14} color="#84cc16" />
                    <span>{docsCount} of 4 Documents Verified</span>
                  </span>
                </div>

                <div className="opp-vault-grid-list">
                  {/* PAN Proof */}
                  <div className="opp-vault-item-card">
                    <div className="opp-vault-item-top">
                      <div className="opp-vault-ico red">
                        <FileText size={16} />
                      </div>
                      <div>
                        <h4 className="opp-vault-doc-title">Permanent Account Number (PAN)</h4>
                        <span className="opp-vault-doc-sub">Statutory Tax Identification</span>
                      </div>
                    </div>
                    <div className="opp-vault-item-bottom">
                      <span className="opp-vault-status-pill verified">
                        <Check size={11} /> Verified
                      </span>
                      {kycData?.panDoc?.url ? (
                        <a href={kycData.panDoc.url} target="_blank" rel="noopener noreferrer" className="opp-vault-link">
                          <Download size={12} /> View File
                        </a>
                      ) : (
                        <span className="opp-vault-no-file">Stored via Compliance</span>
                      )}
                    </div>
                  </div>

                  {/* Aadhaar Proof */}
                  <div className="opp-vault-item-card">
                    <div className="opp-vault-item-top">
                      <div className="opp-vault-ico green">
                        <FileCheck size={16} />
                      </div>
                      <div>
                        <h4 className="opp-vault-doc-title">Aadhaar Identity Card</h4>
                        <span className="opp-vault-doc-sub">UIDAI Identity & Address Proof</span>
                      </div>
                    </div>
                    <div className="opp-vault-item-bottom">
                      <span className="opp-vault-status-pill verified">
                        <Check size={11} /> Verified
                      </span>
                      {kycData?.aadhaarDoc?.url ? (
                        <a href={kycData.aadhaarDoc.url} target="_blank" rel="noopener noreferrer" className="opp-vault-link">
                          <Download size={12} /> View File
                        </a>
                      ) : (
                        <span className="opp-vault-no-file">Stored via Compliance</span>
                      )}
                    </div>
                  </div>

                  {/* Bank Proof */}
                  <div className="opp-vault-item-card">
                    <div className="opp-vault-item-top">
                      <div className="opp-vault-ico green">
                        <Landmark size={16} />
                      </div>
                      <div>
                        <h4 className="opp-vault-doc-title">Bank Statement / Passbook</h4>
                        <span className="opp-vault-doc-sub">Settlement Bank Verification</span>
                      </div>
                    </div>
                    <div className="opp-vault-item-bottom">
                      <span className="opp-vault-status-pill verified">
                        <Check size={11} /> Verified
                      </span>
                      {kycData?.bankProofDoc?.url ? (
                        <a href={kycData.bankProofDoc.url} target="_blank" rel="noopener noreferrer" className="opp-vault-link">
                          <Download size={12} /> View File
                        </a>
                      ) : (
                        <span className="opp-vault-no-file">Stored via Compliance</span>
                      )}
                    </div>
                  </div>

                  {/* Demat Client Master */}
                  <div className="opp-vault-item-card">
                    <div className="opp-vault-item-top">
                      <div className="opp-vault-ico red">
                        <Briefcase size={16} />
                      </div>
                      <div>
                        <h4 className="opp-vault-doc-title">Demat / CML Statement</h4>
                        <span className="opp-vault-doc-sub">Securities Depository Record</span>
                      </div>
                    </div>
                    <div className="opp-vault-item-bottom">
                      <span className="opp-vault-status-pill verified">
                        <Check size={11} /> Verified
                      </span>
                      {kycData?.dematDoc?.url ? (
                        <a href={kycData.dematDoc.url} target="_blank" rel="noopener noreferrer" className="opp-vault-link">
                          <Download size={12} /> View File
                        </a>
                      ) : (
                        <span className="opp-vault-no-file">Stored via Compliance</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
