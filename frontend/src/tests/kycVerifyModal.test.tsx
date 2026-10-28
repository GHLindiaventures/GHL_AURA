import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { KycVerifyModal } from '../pages/KYC/components/KycVerifyModal';
import { Deal } from '../types';

// Mock AuthContext
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'admin-1', name: 'Compliance Officer', role: { code: 'company_admin', permissions: ['verify_kyc'] } },
    permissions: ['verify_kyc'],
    tenant: { id: 't-ghl-01', slug: 'ghl' },
  }),
}));

// Mock openDocumentPreview
vi.mock('../utils/documentPreview', () => ({
  openDocumentPreview: vi.fn(),
}));

const mockDeal = {
  id: 'deal-verify-1',
  title: 'Cat-II AIF Growth Unit',
  customerId: 'cust-1',
  customerName: 'Aarav Sharma',
  phone: '9876543210',
  email: 'aarav@example.com',
  companyId: 't-ghl-01',
  stage: 'qualified_investor',
  value: 25000000,
  expectedCloseDate: '2026-12-31',
  assignedAgentId: 'agent-1',
  assignedAgentName: 'Agent One',
  notes: '',
  customerKycStatus: 'Submitted' as any,
  createdAt: new Date().toISOString(),
} as unknown as Deal;

const mockProfileKycData = {
  investorName: 'Aarav Sharma',
  panNumber: 'ABCPE1234F',
  nameAsPerPan: 'Aarav Sharma',
  panDoc: { name: 'pan.pdf', url: 'https://example.com/pan.pdf' },
  aadhaarNumber: '234567890123',
  aadhaarDoc: { name: 'aadhaar.pdf', url: 'https://example.com/aadhaar.pdf' },
  dob: '1990-05-15',
  address: '123 MG Road, Bangalore',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560001',
  bankName: 'HDFC Bank',
  accountNumber: '123456789012',
  ifscCode: 'HDFC0001234',
  accountType: 'Savings Account',
  bankProofDoc: { name: 'cheque.pdf', url: 'https://example.com/cheque.pdf' },
  hasNoDemat: false,
  dematAccountNumber: '1234567890123456',
  dematDoc: { name: 'demat.pdf', url: 'https://example.com/demat.pdf' },
  hasNominee: true,
  nominees: [
    {
      name: 'Priya Sharma',
      relationship: 'Spouse',
      dob: '1992-04-10',
      allocationPercentage: 100,
    },
  ],
  photoDoc: { name: 'photo.jpg', url: 'https://example.com/photo.jpg' },
};

describe('KycVerifyModal Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: null }),
    } as any);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders modal when open and displays customer KYC info', () => {
    const handleClose = vi.fn();
    const handleSave = vi.fn().mockResolvedValue(undefined);
    const handleToast = vi.fn();

    render(
      <KycVerifyModal
        isOpen={true}
        onClose={handleClose}
        deal={mockDeal}
        profileKycData={mockProfileKycData}
        onSaveVerification={handleSave}
        onShowToast={handleToast}
      />
    );

    expect(screen.getByText(/KYC Verification & Document Review/i)).toBeDefined();
    expect(screen.getAllByText(/Aarav Sharma/i).length).toBeGreaterThan(0);
  });

  it('does not render content when isOpen is false', () => {
    render(
      <KycVerifyModal
        isOpen={false}
        onClose={vi.fn()}
        deal={mockDeal}
        profileKycData={mockProfileKycData}
        onSaveVerification={vi.fn().mockResolvedValue(undefined)}
        onShowToast={vi.fn()}
      />
    );

    expect(screen.queryByText(/KYC Verification & Document Review/i)).toBeNull();
  });

  it('toggles sensitive field visibility between masked and unmasked after expanding section', () => {
    render(
      <KycVerifyModal
        isOpen={true}
        onClose={vi.fn()}
        deal={mockDeal}
        profileKycData={mockProfileKycData}
        onSaveVerification={vi.fn().mockResolvedValue(undefined)}
        onShowToast={vi.fn()}
      />
    );

    // Expand Aadhaar section
    const expandAadhaarBtn = screen.getByRole('button', { name: /Expand Aadhaar/i });
    fireEvent.click(expandAadhaarBtn);

    // Look for Show buttons inside SensitiveField
    const showBtns = screen.getAllByRole('button', { name: /Show/i });
    expect(showBtns.length).toBeGreaterThan(0);

    // Toggle Show on the first masked element
    fireEvent.click(showBtns[0]);
    expect(screen.getAllByRole('button', { name: /Hide/i }).length).toBeGreaterThan(0);
  });

  it('handles section expand and collapse toggle', () => {
    render(
      <KycVerifyModal
        isOpen={true}
        onClose={vi.fn()}
        deal={mockDeal}
        profileKycData={mockProfileKycData}
        onSaveVerification={vi.fn().mockResolvedValue(undefined)}
        onShowToast={vi.fn()}
      />
    );

    const expandPanBtn = screen.getByRole('button', { name: /Expand PAN/i });
    fireEvent.click(expandPanBtn);
    expect(expandPanBtn.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(expandPanBtn);
    expect(expandPanBtn.getAttribute('aria-expanded')).toBe('false');
  });

  it('handles clicking view document buttons after expanding section', async () => {
    const { openDocumentPreview } = await import('../utils/documentPreview');

    render(
      <KycVerifyModal
        isOpen={true}
        onClose={vi.fn()}
        deal={mockDeal}
        profileKycData={mockProfileKycData}
        onSaveVerification={vi.fn().mockResolvedValue(undefined)}
        onShowToast={vi.fn()}
      />
    );

    // Expand PAN section
    const expandPanBtn = screen.getByRole('button', { name: /Expand PAN/i });
    fireEvent.click(expandPanBtn);

    const viewDocBtns = screen.getAllByText(/View Document/i);
    expect(viewDocBtns.length).toBeGreaterThan(0);
    fireEvent.click(viewDocBtns[0]);
    expect(openDocumentPreview).toHaveBeenCalled();
  });

  it('allows quick verifying all sections and confirming verification', async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(
      <KycVerifyModal
        isOpen={true}
        onClose={handleClose}
        deal={mockDeal}
        profileKycData={mockProfileKycData}
        onSaveVerification={handleSave}
        onShowToast={vi.fn()}
      />
    );

    // Click "Verify All Sections"
    const quickVerifyBtn = screen.getByText(/Verify All Sections/i);
    fireEvent.click(quickVerifyBtn);

    // Click "Approve & Mark Verified"
    const approveBtn = screen.getByRole('button', { name: /Approve & Mark Verified/i });
    fireEvent.click(approveBtn);

    // Click confirm button
    const confirmBtn = screen.getByRole('button', { name: /Confirm — Approve & Mark Verified/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledWith('Verified', undefined, undefined, expect.any(Object));
    });

    // Close button in modal header
    const closeBtn = screen.getByRole('button', { name: /Close modal/i });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalled();
  });
});
