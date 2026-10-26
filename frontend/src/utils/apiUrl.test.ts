import { describe, it, expect } from 'vitest';
import { apiUrl, buildApiUrl } from './apiUrl';

describe('apiUrl and buildApiUrl normalization', () => {
  it('formats paths with the default API URL (/api)', () => {
    expect(buildApiUrl('/api', '/irm/kyc/all')).toBe('/api/irm/kyc/all');
    expect(buildApiUrl('/api', 'irm/kyc/all')).toBe('/api/irm/kyc/all');
  });

  it('formats paths when given an external API origin', () => {
    expect(buildApiUrl('http://localhost:5106/api', '/irm/kyc/all')).toBe(
      'http://localhost:5106/api/irm/kyc/all'
    );
    expect(buildApiUrl('https://api.domain.com/api', '/documents')).toBe(
      'https://api.domain.com/api/documents'
    );
  });

  it('strips one or more trailing slashes from the base URL', () => {
    expect(buildApiUrl('http://localhost:5106/api/', '/irm/kyc/all')).toBe(
      'http://localhost:5106/api/irm/kyc/all'
    );
    expect(buildApiUrl('http://localhost:5106/api///', '/irm/kyc/all')).toBe(
      'http://localhost:5106/api/irm/kyc/all'
    );
    expect(buildApiUrl('/api/', '/irm/kyc/send-link')).toBe('/api/irm/kyc/send-link');
  });

  it('falls back to /api when base is empty or whitespace', () => {
    expect(buildApiUrl('', '/irm/kyc/all')).toBe('/api/irm/kyc/all');
    expect(buildApiUrl('   ', 'irm/kyc/all')).toBe('/api/irm/kyc/all');
  });

  it('handles query parameters and special characters in path', () => {
    expect(
      buildApiUrl('/api', '/irm/kyc/by-email?email=test%40example.com')
    ).toBe('/api/irm/kyc/by-email?email=test%40example.com');
  });

  it('apiUrl exports a function that produces a valid path', () => {
    const url = apiUrl('/irm/kyc/all');
    expect(url.endsWith('/irm/kyc/all')).toBe(true);
    expect(url.includes('//irm')).toBe(false);
  });
});
