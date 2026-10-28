import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LeadDetailDrawerContent } from '../components/common/LeadDetailDrawerContent';
import { CallRecord, Lead } from '../types';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'usr-1',
      role: { code: 'sales_executive', permissions: ['place_calls'] },
    },
  }),
}));

const mockCalls: CallRecord[] = [
  {
    id: 'call-rec-1',
    companyId: 't-ghl-01',
    contactName: 'Rohan Mehra',
    contactPhone: '9845012345',
    direction: 'outbound',
    duration: 180,
    agentId: 'a-1',
    agentName: 'Agent Alice',
    disposition: 'connected',
    timestamp: '2026-02-15T10:00:00Z',
    notes: 'Interested in commercial plot units',
    transcription: 'Customer confirmed interest in paying via direct debenture route.',
  },
];

const mockLead: Lead = {
  id: 'lead-drawer-1',
  companyId: 't-ghl-01',
  name: 'Rohan Mehra',
  phone: '9845012345',
  email: 'rohan@example.com',
  location: 'Bengaluru',
  source: 'Meta Ads',
  status: 'Interested',
  priority: 'High',
  assignedAgentId: 'a-1',
  assignedAgentName: 'Agent Alice',
  notes: 'Client looking for 2400 sqft',
  customFields: { preferredAssetClass: 'Commercial' },
  createdAt: '2026-01-01',
};

describe('LeadDetailDrawerContent Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders lead details, contact info, and notes', () => {
    render(
      <LeadDetailDrawerContent
        contactName="Rohan Mehra"
        contactPhone="9845012345"
        contactId="lead-drawer-1"
        lead={mockLead}
        calls={mockCalls}
      />
    );

    expect(screen.getByText('Rohan Mehra')).toBeDefined();
    expect(screen.getByText('9845012345')).toBeDefined();
    expect(screen.getByText(/Client looking for 2400 sqft/i)).toBeDefined();
  });

  it('renders past calls and allows expanding transcriptions', () => {
    render(
      <LeadDetailDrawerContent
        contactName="Rohan Mehra"
        contactPhone="9845012345"
        contactId="lead-drawer-1"
        lead={mockLead}
        calls={mockCalls}
      />
    );

    // Call duration formatted
    expect(screen.getByText(/Agent Alice/i)).toBeDefined();

    // Toggle transcript
    const transcriptToggle = screen.getByText(/View Automated Transcription/i);
    fireEvent.click(transcriptToggle);

    expect(
      screen.getByText(/Customer confirmed interest in paying via direct debenture route/i)
    ).toBeDefined();
  });

  it('triggers onCall callback when Call Now button is clicked', () => {
    const onCall = vi.fn();
    render(
      <LeadDetailDrawerContent
        contactName="Rohan Mehra"
        contactPhone="9845012345"
        contactId="lead-drawer-1"
        lead={mockLead}
        calls={mockCalls}
        onCall={onCall}
      />
    );

    const callBtn = screen.getByText('Call Now');
    fireEvent.click(callBtn);
    expect(onCall).toHaveBeenCalled();
  });
});
