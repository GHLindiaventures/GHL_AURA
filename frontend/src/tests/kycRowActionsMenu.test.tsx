import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { KycRowActionsMenu } from '../pages/KYC/components/KycRowActionsMenu';
import { Deal } from '../types';

const mockDeal: Deal = {
  id: 'deal-menu-1',
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
  customerKycStatus: 'Pending',
};

describe('KycRowActionsMenu Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders trigger button and toggles dropdown menu open and closed', () => {
    const onShowToast = vi.fn();
    render(<KycRowActionsMenu deal={mockDeal} onShowToast={onShowToast} />);

    const trigger = screen.getByLabelText('Actions');
    expect(trigger).toBeDefined();

    // Open menu
    fireEvent.click(trigger);
    expect(screen.getByText('Copy Link')).toBeDefined();
    expect(screen.getByText('Revoke Link')).toBeDefined();

    // Close menu by clicking again
    fireEvent.click(trigger);
    expect(screen.queryByText('Copy Link')).toBeNull();
  });

  it('triggers onEditKyc, onAssistedKyc, onCallInvestor, onAdvanceStage callbacks', () => {
    const onShowToast = vi.fn();
    const onEditKyc = vi.fn();
    const onAssistedKyc = vi.fn();
    const onCallInvestor = vi.fn();
    const onAdvanceStage = vi.fn();

    render(
      <KycRowActionsMenu
        deal={mockDeal}
        onShowToast={onShowToast}
        onEditKyc={onEditKyc}
        onAssistedKyc={onAssistedKyc}
        onCallInvestor={onCallInvestor}
        onAdvanceStage={onAdvanceStage}
      />
    );

    fireEvent.click(screen.getByLabelText('Actions'));
    fireEvent.click(screen.getByText('Edit KYC Details'));
    expect(onEditKyc).toHaveBeenCalledWith(mockDeal);

    fireEvent.click(screen.getByLabelText('Actions'));
    fireEvent.click(screen.getByText('Fill KYC on Behalf (Assisted)'));
    expect(onAssistedKyc).toHaveBeenCalledWith(mockDeal);

    fireEvent.click(screen.getByLabelText('Actions'));
    fireEvent.click(screen.getByText('Call Investor'));
    expect(onCallInvestor).toHaveBeenCalledWith(mockDeal);

    fireEvent.click(screen.getByLabelText('Actions'));
    fireEvent.click(screen.getByText('Advance to Opportunity'));
    expect(onAdvanceStage).toHaveBeenCalledWith(mockDeal);
  });

  it('copies KYC link to clipboard from existing token', async () => {
    const onShowToast = vi.fn();
    const dealWithToken = { ...mockDeal, kycId: 42 } as any;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { kycLinkToken: 'token-xyz-123' },
      }),
    } as any);

    render(<KycRowActionsMenu deal={dealWithToken} onShowToast={onShowToast} />);

    fireEvent.click(screen.getByLabelText('Actions'));
    fireEvent.click(screen.getByText('Copy Link'));

    await vi.waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('token-xyz-123'));
      expect(onShowToast).toHaveBeenCalledWith(expect.stringContaining('KYC Link copied'));
    });
  });

  it('revokes active KYC link when revoke clicked', async () => {
    const onShowToast = vi.fn();
    const dealWithToken = { ...mockDeal, kycId: 42 } as any;

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        message: 'Link revoked',
      }),
    } as any);

    render(<KycRowActionsMenu deal={dealWithToken} onShowToast={onShowToast} />);

    fireEvent.click(screen.getByLabelText('Actions'));
    fireEvent.click(screen.getByText('Revoke Link'));

    await vi.waitFor(() => {
      expect(onShowToast).toHaveBeenCalledWith(expect.stringContaining('KYC Link revoked'));
    });
  });
});
