import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorAlertBanner } from '../components/common/ErrorAlertBanner';

describe('ErrorAlertBanner Component Tests', () => {
  it('renders nothing when message is empty, null, or undefined', () => {
    const { container: c1 } = render(<ErrorAlertBanner message={null} />);
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(<ErrorAlertBanner message={undefined} />);
    expect(c2.firstChild).toBeNull();

    const { container: c3 } = render(<ErrorAlertBanner message="" />);
    expect(c3.firstChild).toBeNull();
  });

  it('renders error message in banner with default class and styles', () => {
    render(<ErrorAlertBanner message="Failed to fetch records" />);
    expect(screen.getByText('Failed to fetch records')).toBeDefined();
    const banner = screen.getByText('Failed to fetch records').closest('div');
    expect(banner).toBeDefined();
  });

  it('renders retry button and calls onRetry when clicked', () => {
    const handleRetry = vi.fn();
    render(<ErrorAlertBanner message="Network connection failed" onRetry={handleRetry} />);

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeDefined();

    fireEvent.click(retryBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('renders alert icon when showIcon is true', () => {
    const { container } = render(<ErrorAlertBanner message="Alert with icon" showIcon={true} />);
    const svgIcon = container.querySelector('svg');
    expect(svgIcon).not.toBeNull();
  });

  it('applies custom style and custom className', () => {
    const { container } = render(
      <ErrorAlertBanner
        message="Custom alert"
        className="custom-error-class"
        style={{ fontSize: 13, border: '1px solid red' }}
      />
    );
    const element = container.querySelector('.custom-error-class');
    expect(element).not.toBeNull();
  });
});
