import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { SendKycLinkModal } from '../pages/KYC/components/SendKycLinkModal';
import { Deal } from '../types';

const mockDeal: Deal = {
  id: 'deal-send-1',
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
};

describe('SendKycLinkModal Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
    vi.spyOn(window, 'open').mockImplementation(() => null);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { link: 'https://app.ghl.com/kyc/token-abc-123' },
      }),
    } as any);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <SendKycLinkModal isOpen={false} onClose={vi.fn()} deal={mockDeal} onShowToast={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with customer information and auto-fetches secure link', async () => {
    const onClose = vi.fn();
    const onShowToast = vi.fn();

    render(
      <SendKycLinkModal isOpen={true} onClose={onClose} deal={mockDeal} onShowToast={onShowToast} />
    );

    expect(screen.getByText('Aarav Sharma')).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('https://app.ghl.com/kyc/token-abc-123')).toBeDefined();
    });
  });

  it('allows copying the generated secure link to clipboard', async () => {
    const onShowToast = vi.fn();

    render(
      <SendKycLinkModal isOpen={true} onClose={vi.fn()} deal={mockDeal} onShowToast={onShowToast} />
    );

    await waitFor(() => {
      expect(screen.getByText('https://app.ghl.com/kyc/token-abc-123')).toBeDefined();
    });

    const copyBtn = screen.getByTitle('Copy secure link to clipboard');
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://app.ghl.com/kyc/token-abc-123');
    expect(onShowToast).toHaveBeenCalledWith(expect.stringContaining('copied to clipboard'));
  });

  it('handles expiry selection change and re-fetches link', async () => {
    render(
      <SendKycLinkModal isOpen={true} onClose={vi.fn()} deal={mockDeal} onShowToast={vi.fn()} />
    );

    await waitFor(() => {
      expect(screen.getByText('https://app.ghl.com/kyc/token-abc-123')).toBeDefined();
    });

    const select = screen.getByLabelText('Link Expiry Window');
    fireEvent.change(select, { target: { value: '72h' } });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/irm/kyc/send-link'),
        expect.objectContaining({
          body: expect.stringContaining('"expiry":"72h"'),
        })
      );
    });
  });

  it('sends via WhatsApp and opens WhatsApp web window', async () => {
    const onClose = vi.fn();
    const onShowToast = vi.fn();
    const onSent = vi.fn();

    render(
      <SendKycLinkModal
        isOpen={true}
        onClose={onClose}
        deal={mockDeal}
        onShowToast={onShowToast}
        onSent={onSent}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('https://app.ghl.com/kyc/token-abc-123')).toBeDefined();
    });

    // Select WhatsApp and click send
    const sendBtn = screen.getByText(/Send via WhatsApp Web/i);
    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(window.open).toHaveBeenCalledWith(
        expect.stringContaining('api.whatsapp.com'),
        '_blank',
        'noopener,noreferrer'
      );
      expect(onSent).toHaveBeenCalledWith(mockDeal);
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('sends via Email when email channel is selected', async () => {
    const onClose = vi.fn();
    const onShowToast = vi.fn();
    const onSent = vi.fn();

    render(
      <SendKycLinkModal
        isOpen={true}
        onClose={onClose}
        deal={mockDeal}
        onShowToast={onShowToast}
        onSent={onSent}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('https://app.ghl.com/kyc/token-abc-123')).toBeDefined();
    });

    // Click Email channel button
    const emailChannelBtn = screen.getByText(/Email \(SMTP\)/i);
    fireEvent.click(emailChannelBtn);

    // Mock fetch for send-link returning emailSent: true
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { link: 'https://app.ghl.com/kyc/token-email-123', emailSent: true },
      }),
    } as any);

    const sendEmailBtn = screen.getByText('Send Real-Time Email');
    fireEvent.click(sendEmailBtn);

    await waitFor(() => {
      expect(onSent).toHaveBeenCalledWith(mockDeal);
      expect(onShowToast).toHaveBeenCalledWith(expect.stringContaining('email delivered'));
      expect(onClose).toHaveBeenCalled();
    });
  });
});
