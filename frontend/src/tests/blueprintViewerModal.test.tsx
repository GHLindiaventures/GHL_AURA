import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { BlueprintViewerModal } from '../components/common/BlueprintViewerModal';

describe('BlueprintViewerModal Component Tests', () => {
  afterEach(() => {
    cleanup();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <BlueprintViewerModal
        isOpen={false}
        onClose={vi.fn()}
        projectName="Green Meadows"
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with project name, zoom controls, and image when open', () => {
    const onClose = vi.fn();
    render(
      <BlueprintViewerModal
        isOpen={true}
        onClose={onClose}
        projectName="Green Meadows"
        projectLocation="North Bangalore"
        imageUrl="https://example.com/layout.jpg"
        availableCount={12}
        holdCount={3}
        soldCount={5}
      />
    );

    expect(screen.getByText(/Green Meadows — Master Layout Blueprint/i)).toBeDefined();
    expect(screen.getByText(/12 Available/i)).toBeDefined();
    expect(screen.getByText(/Hold \(3\)/i)).toBeDefined();
    expect(screen.getByText(/Sold \(5\)/i)).toBeDefined();

    const img = screen.getByAltText(/Green Meadows Master Layout/i);
    expect(img).toBeDefined();
    expect(img.getAttribute('src')).toBe('https://example.com/layout.jpg');
  });

  it('handles zoom in, zoom out, rotate, and reset actions', () => {
    render(
      <BlueprintViewerModal
        isOpen={true}
        onClose={vi.fn()}
        projectName="Sunset Ridge"
        imageUrl="https://example.com/blueprint.png"
      />
    );

    expect(screen.getByText('100%')).toBeDefined();

    const zoomInBtn = screen.getByTitle('Zoom In (+25%)');
    fireEvent.click(zoomInBtn);
    expect(screen.getByText('125%')).toBeDefined();

    const rotateBtn = screen.getByTitle('Rotate 90° Clockwise');
    fireEvent.click(rotateBtn);
    expect(screen.getByText('90°')).toBeDefined();

    const resetBtn = screen.getByTitle('Reset Zoom (100%) and Rotation (0°)');
    fireEvent.click(resetBtn);
    expect(screen.getByText('100%')).toBeDefined();
  });

  it('opens and closes fullscreen view', () => {
    render(
      <BlueprintViewerModal
        isOpen={true}
        onClose={vi.fn()}
        projectName="Sunset Ridge"
        imageUrl="https://example.com/blueprint.png"
      />
    );

    const fullScreenBtn = screen.getByTitle('Open Full Screen View');
    fireEvent.click(fullScreenBtn);

    expect(screen.getByTitle('Exit Full Screen')).toBeDefined();

    const exitBtn = screen.getByTitle('Exit Full Screen');
    fireEvent.click(exitBtn);

    expect(screen.queryByTitle('Exit Full Screen')).toBeNull();
  });

  it('renders upload button when image is missing and canManage is true', () => {
    const onUpload = vi.fn();
    render(
      <BlueprintViewerModal
        isOpen={true}
        onClose={vi.fn()}
        projectName="Lakeview Haven"
        canManage={true}
        onUploadBlueprint={onUpload}
      />
    );

    expect(screen.getByText(/No Master Layout Blueprint Uploaded/i)).toBeDefined();
    const uploadBtn = screen.getByRole('button', { name: /Upload Blueprint Now/i });
    fireEvent.click(uploadBtn);
    expect(onUpload).toHaveBeenCalledTimes(1);
  });
});
