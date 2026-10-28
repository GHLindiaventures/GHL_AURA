import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { KycReviewDrawer } from '../pages/KYC/components/KycReviewDrawer';
import { Deal } from '../types';

const mockDeal: Deal = {
  id: 'deal-review-1',
  title: 'Cat-II Growth Unit',
  customerId: 'cust-1',
  customerName: 'Aarav Sharma',
  phone: '9876543210',
  email: 'aarav@example.com',
  companyId: 't-ghl-01',
  stage: 'qualified_investor',
  value: 10000000,
  expectedCloseDate: '2026-12-31',
  assignedAgentId: 'a-1',
  assignedAgentName: 'Agent One',
  notes: '',
  createdAt: '2026-01-01',
  customerKycStatus: 'Submitted',
};

const mockLiveKyc = {
  id: 101,
  investorName: 'Aarav Sharma',
  panNumber: 'ABCPE1234F',
  aadhaarNumber: '123456789012',
  bankName: 'HDFC Bank',
  accountNumber: '1234567890',
  ifscCode: 'HDFC0001234',
  dematDpId: 'IN300123',
  dematClientId: '12345678',
  status: 'PendingReview',
  submittedAt: '2026-02-15T10:00:00Z',
  nominees: [],
};

describe('KycReviewDrawer Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: mockLiveKyc,
      }),
    } as any);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <KycReviewDrawer
        isOpen={false}
        onClose={vi.fn()}
        deal={mockDeal}
        onShowToast={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders drawer when open and displays KYC details and checklist', async () => {
    render(
      <KycReviewDrawer
        isOpen={true}
        onClose={vi.fn()}
        deal={mockDeal}
        onShowToast={vi.fn()}
      />
    );

    expect(screen.getAllByText('Aarav Sharma').length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(screen.getByText('HDFC Bank')).toBeDefined();
    });
  });

  it('allows checking all checklist items and approving KYC', async () => {
    const onChangeKycStatus = vi.fn().mockResolvedValue(undefined);
    const onShowToast = vi.fn();
    const onClose = vi.fn();

    render(
      <KycReviewDrawer
        isOpen={true}
        onClose={onClose}
        deal={mockDeal}
        onChangeKycStatus={onChangeKycStatus}
        onShowToast={onShowToast}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('HDFC Bank')).toBeDefined();
    });

    // Check all checklist checkboxes
    const checkboxes = screen.getAllByRole('checkbox');
    checkboxes.forEach((cb) => fireEvent.click(cb));

    // Click Approve & Confirm KYC button
    const approveBtn = screen.getByText(/Approve & Confirm KYC/i);
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(onChangeKycStatus).toHaveBeenCalledWith(
        mockDeal,
        'Verified',
        expect.any(String),
        undefined,
        expect.any(Object)
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('opens request correction modal and submits correction instructions', async () => {
    const onChangeKycStatus = vi.fn().mockResolvedValue(undefined);
    const onShowToast = vi.fn();
    const onClose = vi.fn();

    render(
      <KycReviewDrawer
        isOpen={true}
        onClose={onClose}
        deal={mockDeal}
        onChangeKycStatus={onChangeKycStatus}
        onShowToast={onShowToast}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('HDFC Bank')).toBeDefined();
    });

    const requestCorrectionBtn = screen.getByText(/Request Correction/i);
    fireEvent.click(requestCorrectionBtn);

    // Confirm sending correction instructions
    const confirmSendBtn = screen.getByText(/Send Correction Request/i);
    fireEvent.click(confirmSendBtn);

    await waitFor(() => {
      expect(onShowToast).toHaveBeenCalledWith(expect.stringContaining('Correction request sent'));
      expect(onClose).toHaveBeenCalled();
    });
  });
});
