import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { KYCPage } from '../pages/KYC/KYCPage';
import * as ghlApiService from '../services/ghlApiService';
import * as authContext from '../context/AuthContext';
import * as callContext from '../context/CallContext';
import { Deal } from '../types';

vi.mock('../services/ghlApiService', () => ({
  getDeals: vi.fn(),
  getLeads: vi.fn(),
  getCustomers: vi.fn(),
  addDealActivity: vi.fn(),
  persistDeal: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../context/CallContext', () => ({
  useCall: vi.fn(),
}));

describe('KYCPage Customer Profile Dossier & Table KPI Tests', () => {
  const originalFetch = globalThis.fetch;
  const mockInitiateCall = vi.fn();

  const mockUserIrm = {
    id: 'irm-1',
    name: 'IRM Officer',
    email: 'irm@ghl.com',
    role: { code: 'irm', name: 'IRM' },
    companySlug: 'ghl',
    companyName: 'GHL India Ventures',
  };

  const mockTenantGhl = {
    id: 't-ghl-01',
    slug: 'ghl',
    name: 'GHL India Ventures',
  };

  const fullyPopulatedDeal: Deal = {
    id: 'deal-full-1',
    companyId: 't-ghl-01',
    title: 'Cat-II AIF Growth Fund',
    customerName: 'Aditya Birla',
    customerId: 'cust-full-1',
    phone: '+91 9876543210',
    email: 'aditya@example.com',
    location: 'Mumbai',
    stage: 'qualified_investor',
    value: 50000000,
    investmentRange: '₹5 Cr – ₹10 Cr',
    expectedCloseDate: '2026-06-30',
    notes: 'Comprehensive investor portfolio',
    createdAt: '2026-01-10T10:00:00Z',
    assignedAgentId: 'irm-1',
    assignedAgentName: 'IRM Officer',
    customerKycStatus: 'Submitted',
    kycStatus: 'Pending',
    kycId: 501,
  };

  const emptyDeal: Deal = {
    id: 'deal-empty-2',
    companyId: 't-ghl-01',
    title: 'Unspecified Opportunity',
    customerName: 'Minimal Investor',
    customerId: 'cust-empty-2',
    phone: '',
    email: '',
    location: '',
    stage: 'qualified_investor',
    value: 0,
    investmentRange: '',
    expectedCloseDate: '',
    notes: '',
    createdAt: '2026-02-01T10:00:00Z',
    assignedAgentId: 'irm-1',
    assignedAgentName: 'IRM Officer',
    customerKycStatus: 'Not Started',
    kycStatus: 'Pending',
  };

  const draftDeal: Deal = {
    id: 'deal-draft-3',
    companyId: 't-ghl-01',
    title: 'Draft Incomplete Deal',
    customerName: 'Priya Sharma',
    customerId: 'cust-draft-3',
    phone: '+91 9811122233',
    email: 'priya@example.com',
    location: 'Delhi',
    stage: 'qualified_investor',
    value: 10000000,
    investmentRange: '₹1 Cr – ₹2 Cr',
    expectedCloseDate: '2026-05-20',
    notes: '',
    createdAt: '2026-02-15T10:00:00Z',
    assignedAgentId: 'irm-1',
    assignedAgentName: 'IRM Officer',
    customerKycStatus: 'Assisted Draft',
    kycStatus: 'Pending',
  };

  const wrongDeal: Deal = {
    id: 'deal-wrong-4',
    companyId: 't-ghl-01',
    title: 'Correction Required Deal',
    customerName: 'Kunal Kapoor',
    customerId: 'cust-wrong-4',
    phone: '+91 9833344455',
    email: 'kunal@example.com',
    location: 'Pune',
    stage: 'qualified_investor',
    value: 15000000,
    investmentRange: '₹1 Cr – ₹2 Cr',
    expectedCloseDate: '2026-07-01',
    notes: '',
    createdAt: '2026-02-20T10:00:00Z',
    assignedAgentId: 'irm-1',
    assignedAgentName: 'IRM Officer',
    customerKycStatus: 'Needs Correction',
    kycStatus: 'Wrong',
    kycId: 504,
  };

  const fullyPopulatedKycData = {
    investorName: 'Aditya Birla',
    email: 'aditya@example.com',
    phone: '+91 9876543210',
    panNumber: 'ABCPE1234F',
    city: 'Mumbai',
    dob: '1980-04-12',
    occupation: 'Industrialist',
    gender: 'Male',
    investorType: 'Individual / Retail HNW',
    residentType: 'Resident Indian (RI)',
    nameAsPerPan: 'Aditya Kumar Birla',
    fatherName: 'Ghanshyam Das Birla',
    aadhaarNumber: '234567890123',
    address: 'Birla House, Malabar Hill',
    courierAddress: 'Birla House, Malabar Hill',
    state: 'Maharashtra',
    pincode: '400006',
    country: 'India',
    panDoc: { name: 'pan_aditya.pdf', url: 'https://cdn.example.com/pan.pdf' },
    aadhaarDoc: { name: 'aadhaar_aditya.pdf', url: 'https://cdn.example.com/aadhaar.pdf' },
    photoDoc: { name: 'photo_aditya.jpg', url: 'https://cdn.example.com/photo.jpg' },
    bankName: 'HDFC Bank Ltd',
    accountNumber: '987654321098',
    ifscCode: 'HDFC0000060',
    accountType: 'Savings Account',
    bankProofDoc: { name: 'cheque_aditya.pdf', url: 'https://cdn.example.com/cheque.pdf' },
    hasNoDemat: false,
    dematAccountNumber: '1208160098765432',
    dematDepository: 'CDSL',
    dematDpId: '12081600',
    dematClientId: '98765432',
    dematDoc: { name: 'demat_aditya.pdf', url: 'https://cdn.example.com/demat.pdf' },
    hasNominee: true,
    nominees: [
      {
        id: 'nom-1',
        name: 'Sunita Birla',
        relationship: 'Spouse',
        guardianName: 'G. D. Birla',
        allocationPercentage: 100,
        dob: '1982-08-15',
        address: 'Birla House, Malabar Hill',
      },
    ],
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();

    vi.mocked(authContext.useAuth).mockReturnValue({
      user: mockUserIrm as any,
      tenant: mockTenantGhl as any,
      token: 'mock-token',
      isAuthenticated: true,
      hasPermission: () => true,
      permissions: ['verify_kyc', 'call_make'],
    } as any);

    vi.mocked(callContext.useCall).mockReturnValue({
      initiateCall: mockInitiateCall,
      activeCall: null,
      callState: 'idle',
      isMuted: false,
      toggleMute: vi.fn(),
      endCall: vi.fn(),
    } as any);

    vi.mocked(ghlApiService.getDeals).mockResolvedValue([
      fullyPopulatedDeal,
      emptyDeal,
      draftDeal,
      wrongDeal,
    ]);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue([]);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue([]);
    vi.mocked(ghlApiService.persistDeal).mockResolvedValue({} as any);
    vi.mocked(ghlApiService.addDealActivity).mockResolvedValue({} as any);

    globalThis.fetch = vi.fn().mockImplementation((url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/irm/kyc/all')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: [
              {
                id: 501,
                status: 'PendingReview',
                submittedAt: '2026-02-01T10:00:00Z',
                ...fullyPopulatedKycData,
              },
              {
                id: 504,
                email: 'kunal@example.com',
                phone: '9833344455',
                status: 'Wrong',
              },
            ],
          }),
        } as any);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: [] }),
      } as any);
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
    globalThis.fetch = originalFetch;
  });

  it('renders Customer Profile dossier with FULLY populated fixture, copyable buttons, verify links, and tab switching', async () => {
    // Pre-populate localStorage with fully populated data for deal-full-1
    localStorage.setItem(`nexus_kyc_data_${fullyPopulatedDeal.id}`, JSON.stringify(fullyPopulatedKycData));

    // Mock clipboard writeText
    const writeTextSpy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: writeTextSpy },
    });

    // Mock window.open
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Aditya Birla')).toBeDefined();
    });

    // Click on Aditya Birla row to open Customer Profile dossier
    fireEvent.click(screen.getByText('Aditya Birla'));

    await waitFor(() => {
      expect(screen.getAllByText(/Birla House, Malabar Hill/i).length).toBeGreaterThan(0);
    });

    // Verify all populated section fields render real values
    expect(screen.getByText('Industrialist')).toBeDefined();
    expect(screen.getByText('HDFC Bank Ltd')).toBeDefined();
    expect(screen.getByText('HDFC0000060')).toBeDefined();
    expect(screen.getByText('1208160098765432')).toBeDefined();
    expect(screen.getByText('Sunita Birla')).toBeDefined();
    expect(screen.getByText('Guardian: G. D. Birla')).toBeDefined();
    expect(screen.getByText(/\d+% Complete/i)).toBeDefined();

    // Click "Copy PAN" in hero section
    const copyPanBtn = screen.getByTitle('Copy PAN');
    fireEvent.click(copyPanBtn);
    expect(writeTextSpy).toHaveBeenCalledWith('ABCPE1234F');

    // Click "Verify PAN on Income Tax portal" external link
    const verifyPanBtns = screen.getAllByLabelText('Verify PAN on Income Tax portal');
    fireEvent.click(verifyPanBtns[0]);
    expect(windowOpenSpy).toHaveBeenCalledWith(expect.stringContaining('incometax.gov.in'), '_blank', expect.any(String));

    // Click "Verify Aadhaar on UIDAI portal"
    const verifyAadhaarBtn = screen.getByLabelText('Verify Aadhaar on UIDAI portal');
    fireEvent.click(verifyAadhaarBtn);
    expect(windowOpenSpy).toHaveBeenCalledWith(expect.stringContaining('uidai.gov.in'), '_blank', expect.any(String));

    // Test copy buttons for IFSC Code and Demat Account Number
    const copyIfscBtn = screen.getByTitle('Copy IFSC Code');
    fireEvent.click(copyIfscBtn);
    expect(writeTextSpy).toHaveBeenCalledWith('HDFC0000060');

    const copyDematBtn = screen.getByTitle('Copy Demat Account Number');
    fireEvent.click(copyDematBtn);
    expect(writeTextSpy).toHaveBeenCalledWith('1208160098765432');

    // Test Tab Switching: Personal Details -> Address & Identity -> Bank Details -> Demat -> Nominees -> All
    fireEvent.click(screen.getByRole('button', { name: /Personal Details/i }));
    expect(screen.getByText('Investor demographics, capacity & asset preferences')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Address & Identity/i }));
    expect(screen.getByText('Statutory Aadhaar, PAN documents & residence')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Bank Details/i }));
    expect(screen.getByText('Verified payout & subscription settlement account')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Demat Account/i }));
    expect(screen.getByText('Depository participant details for securities allotment')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Nominees/i }));
    expect(screen.getByText('Primary succession & legal beneficiaries')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /All Sections/i }));
    expect(screen.getByText('Investor demographics, capacity & asset preferences')).toBeDefined();

    // Test "Call Investor" button in header
    const callBtn = screen.getByTitle(/Initiate direct phone consultation with Aditya Birla/i);
    fireEvent.click(callBtn);
    expect(mockInitiateCall).toHaveBeenCalledWith(
      'Aditya Birla',
      '+91 9876543210',
      'customer',
      'cust-full-1',
      undefined,
      'kyc'
    );

    // Return to Table View
    fireEvent.click(screen.getByTitle('Return to Qualified Investors list'));
    await waitFor(() => {
      expect(screen.getByText('Qualified Investor & KYC Verification')).toBeDefined();
    });

    windowOpenSpy.mockRestore();
  }, 15000);

  it('renders Customer Profile dossier with EMPTY / minimal fixture and verifies Not Specified pills and fallback branches', async () => {
    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Minimal Investor')).toBeDefined();
    });

    // Click on Minimal Investor row
    fireEvent.click(screen.getByText('Minimal Investor'));

    await waitFor(() => {
      expect(screen.getByText(/\d+% Complete/i)).toBeDefined();
    });

    // Verify empty state pill branches: multiple "Not Specified" tags render
    const notSpecifiedPills = screen.getAllByText('Not Specified');
    expect(notSpecifiedPills.length).toBeGreaterThan(5);

    // Hero CTA button should be disabled with tooltip "Customer has not submitted KYC yet"
    const ctaBtn = screen.getByRole('button', { name: /Verify Dossier/i });
    expect(ctaBtn).toBeDefined();
    expect((ctaBtn as HTMLButtonElement).disabled).toBe(true);

    // Return to Table View
    fireEvent.click(screen.getByTitle('Return to Qualified Investors list'));
  });

  it('filters table rows when clicking KPI metric cards (Total, Awaiting, Verified, Needs Correction)', async () => {
    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Aditya Birla')).toBeDefined();
      expect(screen.getByText('Minimal Investor')).toBeDefined();
    });

    // Click "Awaiting Verification" card
    const awaitingCard = screen.getByTitle(/Click to filter awaiting verification/i);
    fireEvent.click(awaitingCard);

    await waitFor(() => {
      expect(screen.getByText('Aditya Birla')).toBeDefined();
    });

    // Click "Pending Submission" card
    const pendingCard = screen.getByTitle(/Click to filter pending submission/i);
    fireEvent.click(pendingCard);

    await waitFor(() => {
      expect(screen.getByText('Priya Sharma')).toBeDefined();
    });

    // Click "Verified & Qualified" card
    const verifiedCard = screen.getByTitle(/Click to filter verified & qualified/i);
    fireEvent.click(verifiedCard);

    // Click "Total in KYC" card to reset filter
    const totalCard = screen.getByTitle(/Click to show all investors|Showing all investors/i);
    fireEvent.click(totalCard);

    await waitFor(() => {
      expect(screen.getByText('Aditya Birla')).toBeDefined();
      expect(screen.getByText('Priya Sharma')).toBeDefined();
    });
  });

  it('handles table action buttons: Resume Draft, Correct Details, and Send KYC Link', async () => {
    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Priya Sharma')).toBeDefined();
      expect(screen.getByText('Kunal Kapoor')).toBeDefined();
    });

    // Priya Sharma has status 'Assisted Draft': should have Resume Draft button
    const resumeDraftBtn = screen.getByLabelText('Resume Draft');
    fireEvent.click(resumeDraftBtn);

    await waitFor(() => {
      expect(screen.getByText(/Step 1 of 5/i)).toBeDefined();
    });

    // Exit back to table
    fireEvent.click(screen.getByTitle(/Exit KYC flow/i));

    await waitFor(() => {
      expect(screen.getByText('Kunal Kapoor')).toBeDefined();
    });

    // Kunal Kapoor has status 'Needs Correction': should have "Correct Details" button
    const correctDetailsBtn = screen.getByRole('button', { name: /Correct Details/i });
    fireEvent.click(correctDetailsBtn);

    await waitFor(() => {
      expect(screen.getByText(/Step 1 of 5|Step 2 of 5/i)).toBeDefined();
    });

    // Exit back to table
    fireEvent.click(screen.getByTitle(/Exit KYC flow/i));

    await waitFor(() => {
      expect(screen.getByText('Aditya Birla')).toBeDefined();
    });

    // Test "Send KYC Link" action
    const sendLinkBtns = screen.getAllByLabelText('Send KYC Link');
    if (sendLinkBtns.length > 0) {
      fireEvent.click(sendLinkBtns[0]);
      await waitFor(() => {
        expect(screen.getByText(/Send Customer KYC Link|Resend Customer KYC Link/i)).toBeDefined();
      });
      // Close modal via Cancel button
      const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
      fireEvent.click(cancelBtn);
    }
  }, 15000);
});
