import { describe, expect, it } from 'vitest';
import { getSafeDocumentUrl } from './documentPreview';

describe('getSafeDocumentUrl', () => {
  it('allows supported remote documents and inline previews', () => {
    expect(getSafeDocumentUrl('https://files.example.com/identity.pdf')).toBe(
      'https://files.example.com/identity.pdf',
    );
    expect(getSafeDocumentUrl('data:application/pdf;base64,Zm9v')).toBe(
      'data:application/pdf;base64,Zm9v',
    );
    expect(getSafeDocumentUrl('data:image/jpeg;base64,Zm9v')).toBe(
      'data:image/jpeg;base64,Zm9v',
    );
  });

  it('rejects executable, unsupported, and protocol-relative URLs', () => {
    expect(getSafeDocumentUrl('javascript:alert(1)')).toBeNull();
    expect(getSafeDocumentUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(getSafeDocumentUrl('file:///etc/passwd')).toBeNull();
    expect(getSafeDocumentUrl('//malicious.example/file.pdf')).toBeNull();
  });
});
