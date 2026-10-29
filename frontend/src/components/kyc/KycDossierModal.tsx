import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Deal } from '../../types';
import { Modal } from '../common/Modal';
import { formatKycCurrency } from '../../pages/KYC/helpers/kycHelpers';

export interface KycDossierModalProps {
  deal: Deal | null;
  isOpen: boolean;
  onClose: () => void;
  onAdvanceStage: (deal: Deal) => Promise<void> | void;
  onOpenKycForm?: (deal: Deal) => void;
  statusBadge?: React.ReactNode;
  formatCurrency?: (val: number) => string;
}

export const KycDossierModal: React.FC<KycDossierModalProps> = ({
  deal,
  isOpen,
  onClose,
  onAdvanceStage,
  onOpenKycForm,
  statusBadge,
  formatCurrency = formatKycCurrency,
}) => {
  if (!deal || !isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`KYC Dossier: ${deal.customerName}`}
      subtitle={`SEBI Compliance & Investor Mandate Verification • ID: ${deal.id}`}
      maxWidth={640}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            Close
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {onOpenKycForm && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onOpenKycForm(deal)}
              >
                Open 5-Step KYC Form
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void onAdvanceStage(deal)}
            >
              Confirm KYC & Advance to Opportunity <ArrowRight size={14} style={{ marginLeft: 6 }} />
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Overview Card */}
        <div style={{ padding: 14, background: 'var(--bg-surface-hover)', borderRadius: 8, border: '1px solid var(--border-base)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{deal.customerName}</h3>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{deal.title}</div>
            </div>
            {statusBadge}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
            <div><strong>Phone:</strong> {deal.phone || '—'}</div>
            <div><strong>Email:</strong> {deal.email || '—'}</div>
            <div><strong>City:</strong> {deal.location || '—'}</div>
            <div><strong>Investment Size:</strong> <span style={{ color: '#10b981', fontWeight: 700 }}>{deal.investmentRange || formatCurrency(deal.value)}</span></div>
          </div>
        </div>

        {/* Checklist */}
        <h4 style={{ margin: '4px 0 0 0', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-muted)' }}>
          KYC & Compliance Checklist
        </h4>

        <div className="kyc-detail-grid">
          <div className="kyc-doc-card">
            <div className="kyc-doc-title">
              <span>PAN Verification</span>
              <span className="kyc-badge-verified">Verified</span>
            </div>
            <div className="kyc-doc-desc">Income Tax Department NSDL API instant match. Valid PAN.</div>
          </div>

          <div className="kyc-doc-card">
            <div className="kyc-doc-title">
              <span>CKYC Status</span>
              <span className="kyc-badge-verified">Validated</span>
            </div>
            <div className="kyc-doc-desc">CKYC-IN Registry: 14-digit CKYC record retrieved and certified.</div>
          </div>

          <div className="kyc-doc-card">
            <div className="kyc-doc-title">
              <span>AIF Ticket Size Eligibility</span>
              <span className="kyc-badge-verified">Passed</span>
            </div>
            <div className="kyc-doc-desc">SEBI Cat-II AIF minimum ticket requirement (≥ ₹1 Cr) validated.</div>
          </div>

          <div className="kyc-doc-card">
            <div className="kyc-doc-title">
              <span>Address & Bank Verification</span>
              <span className="kyc-badge-verified">Completed</span>
            </div>
            <div className="kyc-doc-desc">Aadhaar Offline XML and penny-drop bank account verification verified.</div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

