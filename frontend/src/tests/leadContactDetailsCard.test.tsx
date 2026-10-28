import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { LeadContactDetailsCard } from '../components/common/LeadContactDetailsCard';

describe('LeadContactDetailsCard Component Tests', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders contact details including phone, email, location, and calls count', () => {
    render(
      <LeadContactDetailsCard
        phone="+919876543210"
        email="john.doe@example.com"
        location="Bangalore, India"
        callsCount={5}
      />
    );

    expect(screen.getByText('Contact Details')).toBeDefined();
    expect(screen.getByText('+919876543210')).toBeDefined();
    expect(screen.getByText('john.doe@example.com')).toBeDefined();
    expect(screen.getByText('Bangalore, India')).toBeDefined();
    expect(screen.getByText('5')).toBeDefined();
  });

  it('renders fallback dash when email or location is absent', () => {
    render(
      <LeadContactDetailsCard
        phone="+919876543210"
        callsCount={0}
      />
    );

    expect(screen.getByText('+919876543210')).toBeDefined();
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('0')).toBeDefined();
  });
});
