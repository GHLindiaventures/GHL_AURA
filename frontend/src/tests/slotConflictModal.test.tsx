import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SlotConflictModal, SlotConflictData } from '../components/common/SlotConflictModal';

describe('SlotConflictModal', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const mockConflictData: SlotConflictData = {
    contactName: 'Rohit Verma',
    conflictTime: '10:30 AM',
    suggestedTime: '10:50 AM',
    suggestedDateIso: '2026-02-15T10:50:00.000Z',
  };

  it('renders modal when open with conflict details and suggestions', () => {
    render(
      <SlotConflictModal
        isOpen={true}
        onClose={vi.fn()}
        conflictData={mockConflictData}
      />
    );

    expect(screen.getAllByText('Time Slot Already Booked').length).toBeGreaterThan(0);
    expect(screen.getByText('Rohit Verma')).toBeDefined();
    expect(screen.getByText('10:30 AM')).toBeDefined();
    expect(screen.getByText('10:50 AM')).toBeDefined();
    expect(screen.getByText('Choose Another Time')).toBeDefined();
    expect(screen.getByText('Use Suggested (+20m)')).toBeDefined();
  });

  it('calls onClose when Choose Another Time button is clicked', () => {
    const handleClose = vi.fn();
    render(
      <SlotConflictModal
        isOpen={true}
        onClose={handleClose}
        conflictData={mockConflictData}
      />
    );

    fireEvent.click(screen.getByText('Choose Another Time'));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onUseSuggestedSlot and onClose when Use Suggested button is clicked', () => {
    const handleClose = vi.fn();
    const handleUseSuggested = vi.fn();
    render(
      <SlotConflictModal
        isOpen={true}
        onClose={handleClose}
        conflictData={mockConflictData}
        onUseSuggestedSlot={handleUseSuggested}
      />
    );

    fireEvent.click(screen.getByText('Use Suggested (+20m)'));
    expect(handleUseSuggested).toHaveBeenCalledWith('2026-02-15T10:50:00.000Z');
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('does not render suggested button when suggestedDateIso is missing', () => {
    const dataWithoutIso: SlotConflictData = {
      contactName: 'Ananya Iyer',
      conflictTime: '02:00 PM',
    };

    render(
      <SlotConflictModal
        isOpen={true}
        onClose={vi.fn()}
        conflictData={dataWithoutIso}
      />
    );

    expect(screen.getByText('Ananya Iyer')).toBeDefined();
    expect(screen.queryByText('Use Suggested (+20m)')).toBeNull();
  });

  it('renders suggested button and calls onUseSuggestedSlot when suggestedTimeValue is provided', () => {
    const handleUseSuggested = vi.fn();
    const dataWithTimeVal: SlotConflictData = {
      contactName: 'Existing Appointment',
      conflictTime: '11:00 AM, Feb 15, 2026',
      suggestedTime: '11:20 AM (Feb 15)',
      suggestedTimeValue: '11:20',
    };

    render(
      <SlotConflictModal
        isOpen={true}
        onClose={vi.fn()}
        conflictData={dataWithTimeVal}
        onUseSuggestedSlot={handleUseSuggested}
      />
    );

    const btn = screen.getByText('Use Suggested (+20m)');
    expect(btn).toBeDefined();
    fireEvent.click(btn);
    expect(handleUseSuggested).toHaveBeenCalledWith('11:20');
  });

  it('renders custom titles, messages, and labels when provided', () => {
    render(
      <SlotConflictModal
        isOpen={true}
        onClose={vi.fn()}
        conflictData={mockConflictData}
        title="Custom Slot Warning"
        subtitle="Custom Subtitle"
        conflictMessage="Another advisor is booked at this hour:"
        contactLabel="Investor Name:"
        scheduledTimeLabel="Reserved Hour:"
        adviceTitle="Pro Advisory Buffer"
        adviceText="Please allow 30 minutes between high-value sessions."
        suggestedButtonText="Apply 30m Buffer"
      />
    );

    expect(screen.getAllByText('Custom Slot Warning').length).toBeGreaterThan(0);
    expect(screen.getByText('Another advisor is booked at this hour:')).toBeDefined();
    expect(screen.getByText('Investor Name:')).toBeDefined();
    expect(screen.getByText('Reserved Hour:')).toBeDefined();
    expect(screen.getByText('Pro Advisory Buffer')).toBeDefined();
    expect(screen.getByText('Please allow 30 minutes between high-value sessions.')).toBeDefined();
    expect(screen.getByText('Apply 30m Buffer')).toBeDefined();
  });

  it('does not render content when closed and conflictData is null', () => {
    const { container } = render(
      <SlotConflictModal
        isOpen={false}
        onClose={vi.fn()}
        conflictData={null}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
