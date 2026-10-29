import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { KYCPage } from '../pages/KYC/KYCPage';
import * as ghlApiService from '../services/ghlApiService';
import * as authContext from '../context/AuthContext';
import * as callContext from '../context/CallContext';
import { storageService } from '../services/storageService';
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

describe('KYCPage Flow Tests - Status Change, Advance Stage & IFSC Handlers', () => {
  const originalFetch = globalThis.fetch;

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

  const mockVerifiedDeal: Deal = {
    id: 'deal-verified-1',
    companyId: 't-ghl-01',
    title: 'Cat-II AIF Growth Fund',
    customerName: 'Rajesh Verma',
    customerId: 'cust-ver-1',
    phone: '+91 9876543210',
    email: 'rajesh@example.com',
    location: 'Bangalore',
    stage: 'qualified_investor',
    value: 10000000,
    investmentRange: '₹1 Cr – ₹2 Cr',
    expectedCloseDate: '2026-06-30',
    notes: '',
    createdAt: '2026-01-15T10:00:00Z',
    assignedAgentId: 'irm-1',
    assignedAgentName: 'IRM Officer',
    customerKycStatus: 'Verified',
    kycStatus: 'Verified',
    kycId: 101,
  };

  const mockPendingDeal: Deal = {
    id: 'deal-pending-2',
    companyId: 't-ghl-01',
    title: 'Real Estate Opportunity',
    customerName: 'Ananya Roy',
    customerId: 'cust-pend-2',
    phone: '+91 9123456780',
    email: 'ananya@example.com',
    location: 'Mumbai',
    stage: 'qualified_investor',
    value: 20000000,
    investmentRange: '₹2 Cr – ₹5 Cr',
    expectedCloseDate: '2026-08-15',
    notes: '',
    createdAt: '2026-02-10T10:00:00Z',
    assignedAgentId: 'irm-1',
    assignedAgentName: 'IRM Officer',
    customerKycStatus: 'Submitted',
    kycStatus: 'Pending',
    kycId: 202,
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();

    vi.mocked(authContext.useAuth).mockReturnValue({
      user: mockUserIrm as any,
      tenant: mockTenantGhl as any,
      token: 'mock-jwt-token',
      isAuthenticated: true,
      hasPermission: () => true,
    } as any);

    vi.mocked(callContext.useCall).mockReturnValue({
      initiateCall: vi.fn(),
      activeCall: null,
      callState: 'idle',
      isMuted: false,
      toggleMute: vi.fn(),
      endCall: vi.fn(),
    } as any);

    vi.mocked(ghlApiService.getDeals).mockResolvedValue([mockVerifiedDeal, mockPendingDeal]);
    vi.mocked(ghlApiService.getLeads).mockResolvedValue([]);
    vi.mocked(ghlApiService.getCustomers).mockResolvedValue([]);
    vi.mocked(ghlApiService.persistDeal).mockResolvedValue({} as any);
    vi.mocked(ghlApiService.addDealActivity).mockResolvedValue({} as any);

    globalThis.fetch = vi.fn().mockImplementation((url: unknown, _options?: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/irm/kyc/all')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: [
              { id: 101, email: 'rajesh@example.com', phone: '9876543210', status: 'Verified' },
              { id: 202, email: 'ananya@example.com', phone: '9123456780', status: 'Pending' },
            ],
          }),
        } as any);
      }
      if (urlStr.includes('/documents')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { fileUrl: 'https://cdn.example.com/mock.pdf' },
          }),
        } as any);
      }
      if (urlStr.includes('/status')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, message: 'Status updated' }),
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

  it('handles KYC status verification through KycVerifyModal and updates deal status', async () => {
    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Ananya Roy')).toBeDefined();
    });

    // Click on customer row to open Customer Profile
    fireEvent.click(screen.getByText('Ananya Roy'));

    // In profile view, find "Verify Dossier" button
    await waitFor(() => {
      expect(screen.getByText(/Verify Dossier/i)).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Verify Dossier/i));

    // Verify modal should be open
    await waitFor(() => {
      expect(screen.getByText(/Verify All Sections/i)).toBeDefined();
    });

    // Click "Verify All Sections"
    fireEvent.click(screen.getByText(/Verify All Sections/i));

    // Click "Approve & Mark Verified"
    const approveBtn = screen.getByRole('button', { name: /Approve & Mark Verified/i });
    fireEvent.click(approveBtn);

    // Confirm dialog button
    const confirmBtn = screen.getByRole('button', { name: /Confirm — Approve & Mark Verified/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/irm/kyc/202/status'),
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"status":"Verified"'),
        })
      );
      expect(ghlApiService.persistDeal).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'deal-pending-2',
          kycStatus: 'Verified',
          customerKycStatus: 'Verified',
        })
      );
    });
  });

  it('handles backend error when updating KYC status via PATCH', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/irm/kyc/all')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: [{ id: 202, email: 'ananya@example.com', phone: '9123456780', status: 'Pending' }],
          }),
        } as any);
      }
      if (urlStr.includes('/documents')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: { fileUrl: 'https://cdn.example.com/mock.pdf' },
          }),
        } as any);
      }
      if (urlStr.includes('/status')) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: async () => ({ message: 'Database failure during status patch' }),
        } as any);
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data: [] }) } as any);
    });

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Ananya Roy')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Ananya Roy'));

    await waitFor(() => {
      expect(screen.getByText(/Verify Dossier/i)).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Verify Dossier/i));

    await waitFor(() => {
      expect(screen.getByText(/Verify All Sections/i)).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Verify All Sections/i));
    fireEvent.click(screen.getByRole('button', { name: /Approve & Mark Verified/i }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm — Approve & Mark Verified/i }));

    await waitFor(() => {
      expect(screen.getByText(/Database failure during status patch/i)).toBeDefined();
    });
  });

  it('handles status change when no matching backend KYC submission exists', async () => {
    const orphanDeal: Deal = {
      ...mockPendingDeal,
      id: 'deal-orphan-99',
      kycId: undefined as any,
      email: 'no-match@example.com',
      phone: '+91 1111111111',
      customerName: 'Orphan Investor',
    } as any;

    vi.mocked(ghlApiService.getDeals).mockResolvedValue([orphanDeal]);

    globalThis.fetch = vi.fn().mockImplementation((url: unknown) => {
      const urlStr = String(url);
      if (urlStr.includes('/irm/kyc/all')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: [] }),
        } as any);
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ success: true, data: [] }) } as any);
    });

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Orphan Investor')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Orphan Investor'));

    await waitFor(() => {
      expect(screen.getByText(/Verify Dossier/i)).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Verify Dossier/i));

    await waitFor(() => {
      expect(screen.getByText(/Verify All Sections/i)).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Verify All Sections/i));
    fireEvent.click(screen.getByRole('button', { name: /Approve & Mark Verified/i }));
    fireEvent.click(screen.getByRole('button', { name: /Confirm — Approve & Mark Verified/i }));

    await waitFor(() => {
      expect(screen.getByText(/no matching backend KYC submission found/i)).toBeDefined();
    });
  });

  it('advances deal stage to investment_opportunity and logs deal activity', async () => {
    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Rajesh Verma')).toBeDefined();
    });

    // In Table View, open actions menu for the verified deal
    const actionBtns = screen.getAllByRole('button', { name: /Actions/i });
    fireEvent.click(actionBtns[0]);

    await waitFor(() => {
      expect(screen.getByText(/Advance to Opportunity/i)).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Advance to Opportunity/i));

    await waitFor(() => {
      expect(ghlApiService.persistDeal).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'deal-verified-1',
          stage: 'investment_opportunity',
        })
      );
      expect(ghlApiService.addDealActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          dealId: 'deal-verified-1',
          type: 'stage_change',
          toStage: 'investment_opportunity',
        })
      );
      expect(screen.getByText(/moved to Investment Opportunities!/i)).toBeDefined();
    });
  });

  it('handles persistDeal failure and addDealActivity fallback during handleAdvanceStage', async () => {
    const storageSpy = vi.spyOn(storageService, 'addDealActivity').mockImplementation(() => undefined as any);
    vi.mocked(ghlApiService.persistDeal).mockRejectedValueOnce(new Error('Network error on stage save'));
    vi.mocked(ghlApiService.addDealActivity).mockRejectedValueOnce(new Error('Activity API failure'));

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Rajesh Verma')).toBeDefined();
    });

    const actionBtns = screen.getAllByRole('button', { name: /Actions/i });
    fireEvent.click(actionBtns[0]);

    await waitFor(() => {
      expect(screen.getByText(/Advance to Opportunity/i)).toBeDefined();
    });

    fireEvent.click(screen.getByText(/Advance to Opportunity/i));

    await waitFor(() => {
      expect(storageSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          dealId: 'deal-verified-1',
          type: 'stage_change',
        })
      );
    });

    storageSpy.mockRestore();
  });

  it('handles handleIfscChange input, deduction of bank name, and clearing ifscCode error', async () => {
    const unstartedDeal: Deal = {
      ...mockPendingDeal,
      id: 'deal-unstarted-1',
      customerName: 'Kavita Patel',
      customerKycStatus: 'Not Started',
      kycStatus: 'Pending',
    };
    vi.mocked(ghlApiService.getDeals).mockResolvedValue([unstartedDeal]);

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Kavita Patel')).toBeDefined();
    });

    // Click customer row to open profile
    fireEvent.click(screen.getByText('Kavita Patel'));

    await waitFor(() => {
      expect(screen.getByText(/Update Dossier/i)).toBeDefined();
    });

    // Click "Update Dossier" to start Assisted KYC Flow
    fireEvent.click(screen.getByText(/Update Dossier/i));

    await waitFor(() => {
      expect(screen.getByText(/Step 1 of 5/i)).toBeDefined();
    });

    // Step 1 -> Step 2
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 2 of 5/i)).toBeDefined();
    });

    // Populate required Step 2 fields
    fireEvent.change(screen.getByLabelText(/PAN Number/i), { target: { value: 'ABCPE1234F' } });
    fireEvent.change(screen.getByLabelText(/Name \(As per PAN\)/i), { target: { value: 'Ananya Roy' } });
    fireEvent.change(screen.getByLabelText(/Aadhaar Number/i), { target: { value: '234567890123' } });
    fireEvent.change(screen.getByLabelText(/Father's Full Name/i), { target: { value: 'Sunil Roy' } });
    fireEvent.change(screen.getByLabelText(/Date of Birth/i), { target: { value: '1992-04-10' } });
    const permAddressInput = document.getElementById('kyc-permanent-address')!;
    fireEvent.change(permAddressInput, { target: { value: '45 Lake View Road' } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: 'Mumbai' } });
    fireEvent.change(screen.getByLabelText(/State/i), { target: { value: 'Maharashtra' } });
    fireEvent.change(screen.getByLabelText(/Pincode/i), { target: { value: '400001' } });

    // Upload required documents for Step 2
    const fileInputs = document.querySelectorAll('input[type="file"]');
    const mockFile = new File(['dummy-content'], 'test.pdf', { type: 'application/pdf' });
    if (fileInputs[0]) fireEvent.change(fileInputs[0], { target: { files: [mockFile] } });
    if (fileInputs[1]) fireEvent.change(fileInputs[1], { target: { files: [mockFile] } });
    if (fileInputs[2]) fireEvent.change(fileInputs[2], { target: { files: [mockFile] } });

    // Step 2 -> Step 3
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 3 of 5/i)).toBeDefined();
    });

    // Now test handleIfscChange:
    // First trigger Continue with empty fields to trigger validation error on IFSC
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/Enter a valid IFSC code/i)).toBeDefined();
    });

    // Type a known bank prefix IFSC (HDFC0001234)
    const ifscInput = screen.getByLabelText(/IFSC Code/i);
    fireEvent.change(ifscInput, { target: { value: 'hdfc0001234' } });

    // Value should be upper-cased
    expect((ifscInput as HTMLInputElement).value).toBe('HDFC0001234');

    // The validation error should be cleared by handleIfscChange
    await waitFor(() => {
      expect(screen.queryByText(/Enter a valid IFSC code/i)).toBeNull();
    });
  });

  it('handles Step 1 field inputs, select menus, and clearing validation errors', async () => {
    const unstartedDeal: Deal = {
      ...mockPendingDeal,
      id: 'deal-step1-err',
      customerName: 'Vikram Joshi',
      customerKycStatus: 'Not Started',
    };
    vi.mocked(ghlApiService.getDeals).mockResolvedValue([unstartedDeal]);

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Vikram Joshi')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Vikram Joshi'));
    await waitFor(() => {
      expect(screen.getByText(/Update Dossier/i)).toBeDefined();
    });
    fireEvent.click(screen.getByText(/Update Dossier/i));

    await waitFor(() => {
      expect(screen.getByText(/Step 1 of 5/i)).toBeDefined();
    });

    // Clear required fields to trigger validation errors
    const nameInput = screen.getByLabelText(/Investor Full Name/i);
    const phoneInput = screen.getByLabelText(/Phone Number/i);
    const emailInput = screen.getByLabelText(/Email Address/i);

    fireEvent.change(nameInput, { target: { value: '' } });
    fireEvent.change(phoneInput, { target: { value: '' } });
    fireEvent.change(emailInput, { target: { value: '' } });

    // Click Continue to trigger error state
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/Full Name is required/i)).toBeDefined();
      expect(screen.getByText(/Enter a valid 10-digit mobile number/i)).toBeDefined();
      expect(screen.getByText(/Enter a valid email address/i)).toBeDefined();
    });

    // Re-type into inputs to trigger error clearing
    fireEvent.change(nameInput, { target: { value: 'Vikram Joshi' } });
    fireEvent.change(phoneInput, { target: { value: '9876543210' } });
    fireEvent.change(emailInput, { target: { value: 'vikram@example.com' } });

    // Test select inputs
    fireEvent.change(screen.getByLabelText(/Gender/i), { target: { value: 'Female' } });
    fireEvent.change(screen.getByLabelText(/Investor Type/i), { target: { value: 'Corporate / Private Ltd' } });
    fireEvent.change(screen.getByLabelText(/Resident Type/i), { target: { value: 'Non-Resident Indian (NRI)' } });
    fireEvent.change(screen.getByLabelText(/Occupation/i), { target: { value: 'Software Architect' } });

    await waitFor(() => {
      expect(screen.queryByText(/Full Name is required/i)).toBeNull();
      expect(screen.queryByText(/Enter a valid 10-digit mobile number/i)).toBeNull();
      expect(screen.queryByText(/Enter a valid email address/i)).toBeNull();
    });
  });

  it('handles Step 2 sameAsPermanent checkbox, clearing errors, and dropzone drag/drop/remove', async () => {
    const unstartedDeal: Deal = {
      ...mockPendingDeal,
      id: 'deal-step2-ui',
      customerName: 'Meera Nambiar',
      customerKycStatus: 'Not Started',
    };
    vi.mocked(ghlApiService.getDeals).mockResolvedValue([unstartedDeal]);

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Meera Nambiar')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Meera Nambiar'));
    await waitFor(() => {
      expect(screen.getByText(/Update Dossier/i)).toBeDefined();
    });
    fireEvent.click(screen.getByText(/Update Dossier/i));

    // Move to Step 2
    await waitFor(() => {
      expect(screen.getByText(/Step 1 of 5/i)).toBeDefined();
    });
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 2 of 5/i)).toBeDefined();
    });

    // Test dropzone drag over and drop
    const dropzones = document.querySelectorAll('.kyc-upload-dropzone');
    expect(dropzones.length).toBeGreaterThan(0);

    const mockFile = new File(['mock content'], 'aadhaar.pdf', { type: 'application/pdf' });
    fireEvent.dragOver(dropzones[0]);
    fireEvent.drop(dropzones[0], {
      dataTransfer: { files: [mockFile] },
    });

    // Test dropzone click
    fireEvent.click(dropzones[1]);

    // Test sameAsPermanent address toggle
    const permTextarea = document.getElementById('kyc-permanent-address')!;
    fireEvent.change(permTextarea, { target: { value: '100 Marine Drive' } });

    const sameAsPermCheckbox = document.getElementById('kyc-same-as-perm')! as HTMLInputElement;
    fireEvent.click(sameAsPermCheckbox);
    expect(sameAsPermCheckbox.checked).toBe(true);

    const courierTextarea = document.getElementById('kyc-courier-address')! as HTMLTextAreaElement;
    expect(courierTextarea.value).toBe('100 Marine Drive');

    // Trigger Step 2 validation errors to test clearing handlers
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/Enter a valid 10-character PAN/i)).toBeDefined();
    });

    // Clear PAN error
    fireEvent.change(screen.getByLabelText(/PAN Number/i), { target: { value: 'ABCPE1234F' } });
    await waitFor(() => {
      expect(screen.queryByText(/Enter a valid 10-character PAN/i)).toBeNull();
    });

    // Clear State, City, Pincode errors
    fireEvent.change(screen.getByLabelText(/State/i), { target: { value: 'Maharashtra' } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: 'Mumbai' } });
    fireEvent.change(screen.getByLabelText(/Pincode/i), { target: { value: '400001' } });

    // Test document remove button
    const removeBtns = screen.queryAllByTitle('Remove document');
    if (removeBtns.length > 0) {
      fireEvent.click(removeBtns[0]);
    }
  });

  it('handles Step 4 Demat bypass toggle, demat fields, and Step 5 multi-nominee allocation pill variants', async () => {
    const unstartedDeal: Deal = {
      ...mockPendingDeal,
      id: 'deal-step45-ui',
      customerName: 'Sanjay Gupta',
      customerKycStatus: 'Not Started',
    };
    vi.mocked(ghlApiService.getDeals).mockResolvedValue([unstartedDeal]);

    render(<KYCPage />);

    await waitFor(() => {
      expect(screen.getByText('Sanjay Gupta')).toBeDefined();
    });

    fireEvent.click(screen.getByText('Sanjay Gupta'));
    await waitFor(() => {
      expect(screen.getByText(/Update Dossier/i)).toBeDefined();
    });
    fireEvent.click(screen.getByText(/Update Dossier/i));

    // Step 1 -> Step 2
    await waitFor(() => {
      expect(screen.getByText(/Step 1 of 5/i)).toBeDefined();
    });
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    // Step 2 inputs
    await waitFor(() => {
      expect(screen.getByText(/Step 2 of 5/i)).toBeDefined();
    });
    fireEvent.change(screen.getByLabelText(/PAN Number/i), { target: { value: 'ABCPE1234F' } });
    fireEvent.change(screen.getByLabelText(/Name \(As per PAN\)/i), { target: { value: 'Sanjay Gupta' } });
    fireEvent.change(screen.getByLabelText(/Aadhaar Number/i), { target: { value: '234567890123' } });
    fireEvent.change(screen.getByLabelText(/Father's Full Name/i), { target: { value: 'Ramesh Gupta' } });
    fireEvent.change(screen.getByLabelText(/Date of Birth/i), { target: { value: '1985-08-20' } });
    const permAddr = document.getElementById('kyc-permanent-address')!;
    fireEvent.change(permAddr, { target: { value: 'Sector 15, Vashi' } });
    fireEvent.change(screen.getByLabelText(/City/i), { target: { value: 'Navi Mumbai' } });
    fireEvent.change(screen.getByLabelText(/State/i), { target: { value: 'Maharashtra' } });
    fireEvent.change(screen.getByLabelText(/Pincode/i), { target: { value: '400703' } });

    const fileInputs = document.querySelectorAll('input[type="file"]');
    const mockFile = new File(['dummy-content'], 'test.pdf', { type: 'application/pdf' });
    if (fileInputs[0]) fireEvent.change(fileInputs[0], { target: { files: [mockFile] } });
    if (fileInputs[1]) fireEvent.change(fileInputs[1], { target: { files: [mockFile] } });
    if (fileInputs[2]) fireEvent.change(fileInputs[2], { target: { files: [mockFile] } });

    // Step 2 -> Step 3
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 3 of 5/i)).toBeDefined();
    });

    // Step 3 inputs
    fireEvent.change(screen.getByLabelText(/Account Number/i), { target: { value: '123456789012' } });
    fireEvent.change(screen.getByLabelText(/IFSC Code/i), { target: { value: 'HDFC0001234' } });
    fireEvent.change(screen.getByLabelText(/Account Holder Name/i), { target: { value: 'Sanjay Gupta' } });
    fireEvent.change(screen.getByLabelText(/Bank Name/i), { target: { value: 'HDFC Bank' } });

    const bankFileInputs = document.querySelectorAll('input[type="file"]');
    if (bankFileInputs[0]) fireEvent.change(bankFileInputs[0], { target: { files: [mockFile] } });

    // Step 3 -> Step 4
    fireEvent.click(screen.getByRole('button', { name: /Continue to Demat Details/i }));

    await waitFor(() => {
      const errEls = document.querySelectorAll('.kyc-field-error');
      if (errEls.length > 0) {
        console.error('STEP 3 ERRORS:', Array.from(errEls).map(e => e.textContent));
      }
      expect(screen.getByText(/Step 4 of 5/i)).toBeDefined();
    });

    // Step 4: Toggle Demat bypass
    const bypassDemat = screen.getByLabelText(/I don't have a Demat account/i);
    expect(bypassDemat).toBeDefined();

    // Check Demat bypass: Demat Details card should hide and notice appear
    fireEvent.click(bypassDemat);
    await waitFor(() => {
      expect(screen.getByText(/You have elected to skip the Demat step/i)).toBeDefined();
    });

    // Uncheck Demat bypass: Demat details card should re-appear
    fireEvent.click(bypassDemat);
    await waitFor(() => {
      expect(screen.getByLabelText(/Demat Account Number/i)).toBeDefined();
    });

    // Enter Demat number and file
    const dematInput = screen.getByLabelText(/Demat Account Number/i);
    fireEvent.change(dematInput, { target: { value: '1208160012345678' } });

    const dematFiles = document.querySelectorAll('input[type="file"]');
    if (dematFiles[0]) fireEvent.change(dematFiles[0], { target: { files: [mockFile] } });

    // Step 4 -> Step 5
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));

    await waitFor(() => {
      expect(screen.getByText(/Step 5 of 5/i)).toBeDefined();
    });

    // Step 5: Initially hasNominee is false, so "No Nominee Appointed" is shown
    expect(screen.getByText(/No Nominee Appointed \(Opted Out\)/i)).toBeDefined();

    // Check nominee registration to enable nominees
    const registerNomineeCheckbox = screen.getByRole('checkbox', { name: /Register Nominee/i });
    fireEvent.click(registerNomineeCheckbox);

    // Now 1 nominee with 100%: pill is valid
    await waitFor(() => {
      expect(screen.getByText(/Total Allocation: 100% \/ 100% \(Valid\)/i)).toBeDefined();
    });

    // Change allocation to 60%: pill should show "Needs 40% more"
    const allocInput = screen.getByLabelText(/Allocation Percentage/i);
    fireEvent.change(allocInput, { target: { value: '60' } });

    await waitFor(() => {
      expect(screen.getByText(/Needs 40% more/i)).toBeDefined();
    });

    // Click "Add Nominee"
    const addNomineeBtn = screen.getByRole('button', { name: /Add Nominee/i });
    fireEvent.click(addNomineeBtn);

    await waitFor(() => {
      expect(screen.getByText(/Nominee #2/i)).toBeDefined();
    });

    // Set Nominee #2 allocation to 70%: total is 130%, should show "Needs 30% less"
    const allAllocInputs = screen.getAllByLabelText(/Allocation Percentage/i);
    fireEvent.change(allAllocInputs[1], { target: { value: '70' } });

    await waitFor(() => {
      expect(screen.getByText(/Needs 30% less/i)).toBeDefined();
    });

    // Edit Nominee #2 name, relationship, address, guardianName
    const nom2Name = screen.getAllByLabelText(/Nominee Full Name/i)[1];
    fireEvent.change(nom2Name, { target: { value: 'Aryan Gupta' } });

    const nom2Rel = screen.getAllByLabelText(/Relationship with Investor/i)[1];
    fireEvent.change(nom2Rel, { target: { value: 'Son' } });

    const nom2Dob = screen.getAllByLabelText(/Date of Birth \/ Age/i)[1];
    fireEvent.change(nom2Dob, { target: { value: '2015-06-10' } });

    const nom2Addr = screen.getAllByLabelText(/Nominee Address/i)[1];
    fireEvent.change(nom2Addr, { target: { value: 'Same address' } });

    const nom2Guardian = screen.getAllByLabelText(/Guardian Name/i)[1];
    fireEvent.change(nom2Guardian, { target: { value: 'Sunita Gupta' } });

    // Remove Nominee #2
    const removeNomBtns = screen.getAllByRole('button', { name: /Remove/i });
    fireEvent.click(removeNomBtns[1] || removeNomBtns[0]);

    await waitFor(() => {
      expect(screen.queryByText(/Nominee #2/i)).toBeNull();
    });

    // Reset allocation of Nominee #1 back to 100%
    fireEvent.change(allocInput, { target: { value: '100' } });

    // Uncheck nominee registration: should clear nominee errors and show opted out
    fireEvent.click(registerNomineeCheckbox);

    await waitFor(() => {
      expect(screen.getByText(/No Nominee Appointed \(Opted Out\)/i)).toBeDefined();
    });
  });
});
