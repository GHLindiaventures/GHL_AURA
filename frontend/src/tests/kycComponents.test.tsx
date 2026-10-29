import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  KycToast,
  KycDossierModal,
  NotSpecifiedBadge,
  SpecifiedValueBadge,
  PreferredAssetBadge,
  KycStatusPill,
} from '../components/kyc';
import { Deal } from '../types';

describe('KYC Components Unit Tests', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('KycToast', () => {
    it('renders null when message is null or empty', () => {
      const { container } = render(<KycToast message={null} />);
      expect(container.firstChild).toBeNull();
    });

    it('renders success toast with correct text and styling', () => {
      render(<KycToast message="Deal updated successfully" />);
      const toast = screen.getByRole('status');
      expect(toast).toBeTruthy();
      expect(toast.textContent).toContain('Deal updated successfully');
      expect(toast.style.backgroundColor).toBe('rgb(5, 150, 105)'); // #059669
    });

    it('renders error toast with red background for error messages', () => {
      render(<KycToast message="Failed to save KYC draft" />);
      const toast = screen.getByRole('status');
      expect(toast).toBeTruthy();
      expect(toast.textContent).toContain('Failed to save KYC draft');
      expect(toast.style.backgroundColor).toBe('rgb(220, 38, 38)'); // #dc2626
    });
  });

  describe('KycFieldBadges', () => {
    describe('NotSpecifiedBadge', () => {
      it('renders Not Specified text with correct CSS class', () => {
        render(<NotSpecifiedBadge />);
        const badge = screen.getByText('Not Specified');
        expect(badge).toBeTruthy();
        expect(badge.className).toBe('kyc-not-specified-badge');
      });
    });

    describe('SpecifiedValueBadge', () => {
      it('renders NotSpecifiedBadge when value is null, empty, or placeholder', () => {
        const { rerender } = render(<SpecifiedValueBadge value={null} />);
        expect(screen.getByText('Not Specified')).toBeTruthy();

        rerender(<SpecifiedValueBadge value="—" />);
        expect(screen.getByText('Not Specified')).toBeTruthy();

        rerender(<SpecifiedValueBadge value="not specified" />);
        expect(screen.getByText('Not Specified')).toBeTruthy();
      });

      it('renders the formatted value when specified', () => {
        render(<SpecifiedValueBadge value="₹2.50 Cr" />);
        const valSpan = screen.getByText('₹2.50 Cr');
        expect(valSpan).toBeTruthy();
        expect(valSpan.style.color).toBe('rgb(16, 185, 129)');
      });
    });

    describe('PreferredAssetBadge', () => {
      it('renders NotSpecifiedBadge when asset class is missing or placeholder', () => {
        const { rerender } = render(<PreferredAssetBadge preferredAssetClass="" />);
        expect(screen.getByText('Not Specified')).toBeTruthy();

        rerender(<PreferredAssetBadge preferredAssetClass="—" />);
        expect(screen.getByText('Not Specified')).toBeTruthy();
      });

      it('renders badge with class kyc-pref-badge when valid asset class is provided', () => {
        render(<PreferredAssetBadge preferredAssetClass="Commercial Real Estate" />);
        const badge = screen.getByText('Commercial Real Estate');
        expect(badge).toBeTruthy();
        expect(badge.className).toBe('kyc-pref-badge');
      });
    });
  });

  describe('KycStatusPill', () => {
    it('renders Assisted Submitted pill with UserCheck icon', () => {
      render(<KycStatusPill status="Assisted KYC – Submitted for Verification" />);
      const pill = screen.getByTitle('Assisted KYC submitted — awaiting IRM verification');
      expect(pill).toBeTruthy();
      expect(pill.textContent).toContain('Assisted Submitted');
    });

    it('renders KYC Submitted pill for Submitted status', () => {
      render(<KycStatusPill status="Submitted" />);
      const pill = screen.getByTitle('Customer has submitted KYC form — awaiting IRM review');
      expect(pill).toBeTruthy();
      expect(pill.textContent).toContain('KYC Submitted');
    });

    it('renders Assisted Draft pill', () => {
      render(<KycStatusPill status="Assisted Draft" />);
      const pill = screen.getByTitle('Assisted KYC is in draft state');
      expect(pill).toBeTruthy();
      expect(pill.textContent).toContain('Assisted Draft');
    });

    it('renders Link Sent / In Progress pill', () => {
      render(<KycStatusPill status="Link Sent" />);
      const pill = screen.getByTitle('Status: Link Sent');
      expect(pill).toBeTruthy();
      expect(pill.textContent).toContain('Link Sent');
    });

    it('falls back to Pending Submission for unknown status', () => {
      render(<KycStatusPill status="unknown_status" />);
      expect(screen.getByText('Pending Submission')).toBeTruthy();
    });

    it('allows titleOverride prop', () => {
      render(<KycStatusPill status="Submitted" titleOverride="Custom review title" />);
      expect(screen.getByTitle('Custom review title')).toBeTruthy();
    });
  });

  describe('KycDossierModal', () => {
    const mockDeal: Deal = {
      id: 'deal-99',
      customerName: 'Ananya Deshmukh',
      title: 'HNI Growth Fund Deal',
      phone: '+91 9988776655',
      email: 'ananya@example.com',
      location: 'Pune',
      value: 15000000,
      investmentRange: '₹1.50 Cr',
    } as any;

    it('renders null when closed or deal is null', () => {
      const { container, rerender } = render(
        <KycDossierModal
          deal={null}
          isOpen={true}
          onClose={vi.fn()}
          onAdvanceStage={vi.fn()}
        />
      );
      expect(container.firstChild).toBeNull();

      rerender(
        <KycDossierModal
          deal={mockDeal}
          isOpen={false}
          onClose={vi.fn()}
          onAdvanceStage={vi.fn()}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders modal details, overview card, checklist, and triggers handlers', () => {
      const onClose = vi.fn();
      const onAdvanceStage = vi.fn();
      const onOpenKycForm = vi.fn();

      render(
        <KycDossierModal
          deal={mockDeal}
          isOpen={true}
          onClose={onClose}
          onAdvanceStage={onAdvanceStage}
          onOpenKycForm={onOpenKycForm}
          statusBadge={<span>STATUS_BADGE</span>}
        />
      );

      expect(screen.getByText('KYC Dossier: Ananya Deshmukh')).toBeTruthy();
      expect(screen.getByText('STATUS_BADGE')).toBeTruthy();
      expect(screen.getByText('+91 9988776655')).toBeTruthy();
      expect(screen.getByText('ananya@example.com')).toBeTruthy();
      expect(screen.getByText('Pune')).toBeTruthy();
      expect(screen.getByText('₹1.50 Cr')).toBeTruthy();

      // Check compliance checklist items
      expect(screen.getByText('PAN Verification')).toBeTruthy();
      expect(screen.getByText('CKYC Status')).toBeTruthy();
      expect(screen.getByText('AIF Ticket Size Eligibility')).toBeTruthy();
      expect(screen.getByText('Address & Bank Verification')).toBeTruthy();

      // Test Close button
      fireEvent.click(screen.getByText('Close'));
      expect(onClose).toHaveBeenCalled();

      // Test Open 5-Step KYC Form button
      fireEvent.click(screen.getByText('Open 5-Step KYC Form'));
      expect(onOpenKycForm).toHaveBeenCalledWith(mockDeal);

      // Test Advance Stage button
      fireEvent.click(screen.getByText(/Confirm KYC & Advance to Opportunity/i));
      expect(onAdvanceStage).toHaveBeenCalledWith(mockDeal);
    });
  });
});
