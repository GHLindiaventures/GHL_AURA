import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSafeDocumentUrl, openDocumentLink, openDocumentPreview } from './documentPreview';

describe('documentPreview', () => {
  const originalWindow = globalThis.window;

  beforeEach(() => {
    vi.restoreAllMocks();
    (globalThis as any).window = {
      location: { origin: 'http://localhost:5173' },
      open: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete (globalThis as any).window;
    }
  });

  describe('getSafeDocumentUrl', () => {
    it('accepts valid http, https, and relative URLs', () => {
      expect(getSafeDocumentUrl('https://example.com/doc.pdf')).toBe('https://example.com/doc.pdf');
      expect(getSafeDocumentUrl('http://example.com/doc.pdf')).toBe('http://example.com/doc.pdf');
      expect(getSafeDocumentUrl('/uploads/sample.pdf')).toBe('http://localhost:5173/uploads/sample.pdf');
    });

    it('accepts safe data URLs for pdf and images', () => {
      expect(getSafeDocumentUrl('data:application/pdf;base64,JVBERi0x...')).toBe('data:application/pdf;base64,JVBERi0x...');
      expect(getSafeDocumentUrl('data:image/png;base64,iVBORw0KGgo...')).toBe('data:image/png;base64,iVBORw0KGgo...');
      expect(getSafeDocumentUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg...')).toBe('data:image/jpeg;base64,/9j/4AAQSkZJRg...');
    });

    it('rejects unsafe schemes like javascript: or data:text/html', () => {
      expect(getSafeDocumentUrl('javascript:alert(1)')).toBeNull();
      expect(getSafeDocumentUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
      expect(getSafeDocumentUrl('vbscript:msgbox(1)')).toBeNull();
    });

    it('rejects blank or control-character containing strings', () => {
      expect(getSafeDocumentUrl('')).toBeNull();
      expect(getSafeDocumentUrl('   ')).toBeNull();
      expect(getSafeDocumentUrl('https://example.com/\u0000bad')).toBeNull();
    });
  });

  describe('openDocumentLink', () => {
    it('opens safe url with noopener and noreferrer', () => {
      const openSpy = vi.spyOn(window, 'open').mockReturnValue(null as any);
      const res = openDocumentLink('https://example.com/test.pdf');
      expect(res).toBe(true);
      expect(openSpy).toHaveBeenCalledWith('https://example.com/test.pdf', '_blank', 'noopener,noreferrer');
    });

    it('returns false for unsafe url', () => {
      const openSpy = vi.spyOn(window, 'open');
      const res = openDocumentLink('javascript:alert(1)');
      expect(res).toBe(false);
      expect(openSpy).not.toHaveBeenCalled();
    });
  });

  describe('openDocumentPreview', () => {
    it('returns invalid-url for invalid document URL', () => {
      const res = openDocumentPreview('javascript:alert(1)', 'Test Doc');
      expect(res).toBe('invalid-url');
    });

    it('returns blocked when window.open returns null', () => {
      vi.spyOn(window, 'open').mockReturnValue(null);
      const res = openDocumentPreview('https://example.com/test.pdf', 'Test Doc');
      expect(res).toBe('blocked');
    });
  });
});
