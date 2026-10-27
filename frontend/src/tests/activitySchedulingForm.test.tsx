import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ActivitySchedulingForm } from '../pages/Leads/LeadsPage';

describe('ActivitySchedulingForm', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  const defaultProps = {
    contactName: 'Sunita Mehra',
    followupDate: '2026-02-18T14:30',
    onFollowupDateChange: vi.fn(),
    followupPriority: 'High',
    onFollowupPriorityChange: vi.fn(),
    followupNotes: 'Initial conversation agenda',
    onFollowupNotesChange: vi.fn(),
    isSaving: false,
    onBack: vi.fn(),
    onSchedule: vi.fn(),
  };

  it('renders form with contact name and pre-populated values', () => {
    const { container } = render(<ActivitySchedulingForm {...defaultProps} />);

    expect(screen.getByText('Schedule Follow-up Activity for "Sunita Mehra"')).toBeDefined();
    const dateInput = container.querySelector('input[type="datetime-local"]');
    expect(dateInput).toHaveProperty('value', '2026-02-18T14:30');
    const prioritySelect = container.querySelector('select');
    expect(prioritySelect).toHaveProperty('value', 'High');
    expect(screen.getByPlaceholderText(/Enter details for this follow-up activity/i)).toHaveProperty(
      'value',
      'Initial conversation agenda'
    );
  });

  it('triggers change handlers when input fields are edited', () => {
    const { container } = render(<ActivitySchedulingForm {...defaultProps} />);

    const dateInput = container.querySelector('input[type="datetime-local"]')!;
    fireEvent.change(dateInput, { target: { value: '2026-02-20T16:00' } });
    expect(defaultProps.onFollowupDateChange).toHaveBeenCalledWith('2026-02-20T16:00');

    const prioritySelect = container.querySelector('select')!;
    fireEvent.change(prioritySelect, { target: { value: 'Urgent' } });
    expect(defaultProps.onFollowupPriorityChange).toHaveBeenCalledWith('Urgent');

    const notesTextarea = screen.getByPlaceholderText(/Enter details for this follow-up activity/i);
    fireEvent.change(notesTextarea, { target: { value: 'Updated notes' } });
    expect(defaultProps.onFollowupNotesChange).toHaveBeenCalledWith('Updated notes');
  });

  it('calls onBack when Back button is clicked', () => {
    render(<ActivitySchedulingForm {...defaultProps} />);

    fireEvent.click(screen.getByText('Back'));
    expect(defaultProps.onBack).toHaveBeenCalledTimes(1);
  });

  it('calls onSchedule when Save button is clicked', () => {
    render(<ActivitySchedulingForm {...defaultProps} />);

    fireEvent.click(screen.getByText('Save Follow-up Activity'));
    expect(defaultProps.onSchedule).toHaveBeenCalledTimes(1);
  });

  it('disables buttons and displays "Scheduling..." state while isSaving is true', () => {
    render(<ActivitySchedulingForm {...defaultProps} isSaving={true} />);

    const backButton = screen.getByText('Back');
    const scheduleButton = screen.getByText('Scheduling...');

    expect(backButton).toHaveProperty('disabled', true);
    expect(scheduleButton).toHaveProperty('disabled', true);
  });
});
