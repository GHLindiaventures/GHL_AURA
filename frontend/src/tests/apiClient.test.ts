import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from '../services/apiClient';

describe('ApiClient', () => {
  const originalFetch = globalThis.fetch;
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    // Reset static isLoggingOut flag
    (apiClient as any).constructor.isLoggingOut = false;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  it('getBaseUrl returns API_BASE_URL', () => {
    expect(typeof apiClient.getBaseUrl()).toBe('string');
  });

  it('isMockMode returns a boolean', () => {
    expect(typeof apiClient.isMockMode()).toBe('boolean');
  });

  describe('HTTP methods with successful responses', () => {
    it('executes GET request and returns JSON data', async () => {
      const mockData = { id: 1, name: 'Test' };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockData,
      });

      const result = await apiClient.get('/test-endpoint');
      expect(result).toEqual(mockData);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/test-endpoint'),
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });

    it('serializes query params correctly in GET request', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });

      await apiClient.get('/search', { query: 'test', page: 2, empty: '', ignored: null, missing: undefined });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/search\?query=test&page=2$/),
        expect.any(Object)
      );

      // Endpoint with existing question mark
      await apiClient.get('/search?existing=1', { page: 3 });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/\/search\?existing=1&page=3$/),
        expect.any(Object)
      );
    });

    it('attaches auth token from sessionStorage or localStorage', async () => {
      sessionStorage.setItem('nexus_auth_token', 'session-jwt-token');
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });

      await apiClient.get('/protected');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer session-jwt-token',
          }),
        })
      );

      sessionStorage.removeItem('nexus_auth_token');
      localStorage.setItem('nexus_auth_token', 'local-jwt-token');

      await apiClient.get('/protected-local');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer local-jwt-token',
          }),
        })
      );
    });

    it('executes POST request with json body', async () => {
      const responseData = { id: 101, created: true };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => responseData,
      });

      const body = { title: 'New Item' };
      const res = await apiClient.post('/items', body);
      expect(res).toEqual(responseData);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/items'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(body),
        })
      );
    });

    it('executes POST request without body', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });

      await apiClient.post('/trigger');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/trigger'),
        expect.objectContaining({
          method: 'POST',
          body: undefined,
        })
      );
    });

    it('executes PUT request with serialized body', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ updated: true }),
      });

      const body = { name: 'Updated' };
      const res = await apiClient.put('/items/1', body);
      expect(res).toEqual({ updated: true });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/items/1'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify(body),
        })
      );
    });

    it('executes PATCH request with and without body', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ patched: true }),
      });

      await apiClient.patch('/items/1', { status: 'active' });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/items/1'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ status: 'active' }),
        })
      );

      await apiClient.patch('/items/1/toggle');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/items/1/toggle'),
        expect.objectContaining({
          method: 'PATCH',
          body: undefined,
        })
      );
    });

    it('executes DELETE request', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ deleted: true }),
      });

      const res = await apiClient.delete('/items/1');
      expect(res).toEqual({ deleted: true });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/items/1'),
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });

    it('executes postFormData passing FormData directly', async () => {
      localStorage.setItem('nexus_auth_token', 'form-token');
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ uploaded: true }),
      });

      const formData = new FormData();
      formData.append('file', 'sample-content');

      const res = await apiClient.postFormData('/upload', formData);
      expect(res).toEqual({ uploaded: true });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/upload'),
        expect.objectContaining({
          method: 'POST',
          body: formData,
          headers: expect.objectContaining({
            Authorization: 'Bearer form-token',
          }),
        })
      );
    });
  });

  describe('401 Unauthorized handling', () => {
    it('throws invalid credentials message when 401 occurs on /auth/login', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        url: 'http://localhost:5106/api/auth/login',
        json: async () => ({ message: 'Bad email or password' }),
      });

      await expect(apiClient.post('/auth/login', {})).rejects.toThrow('Bad email or password');
    });

    it('uses fallback message on /auth/login if response json fails to parse', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        url: 'http://localhost:5106/api/auth/login',
        json: async () => {
          throw new Error('parse error');
        },
      });

      await expect(apiClient.post('/auth/login', {})).rejects.toThrow('Invalid credentials.');
    });

    it('clears storage, dispatches nexus_auth_unauthorized event, and returns never-resolving promise on non-login 401', async () => {
      sessionStorage.setItem('nexus_auth_token', 'test-token');
      sessionStorage.setItem('nexus_current_user', '{"id":1}');
      localStorage.setItem('nexus_auth_token', 'test-token');
      localStorage.setItem('nexus_current_user', '{"id":1}');

      const eventSpy = vi.fn();
      window.addEventListener('nexus_auth_unauthorized', eventSpy);

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        url: 'http://localhost:5106/api/deals',
        json: async () => ({ message: 'Token expired' }),
      });

      // apiClient.get should return a Promise that never resolves
      const promise = apiClient.get('/deals');
      
      // Allow microtasks to run
      await new Promise(r => setTimeout(r, 20));

      expect(sessionStorage.getItem('nexus_auth_token')).toBeNull();
      expect(sessionStorage.getItem('nexus_current_user')).toBeNull();
      expect(localStorage.getItem('nexus_auth_token')).toBeNull();
      expect(localStorage.getItem('nexus_current_user')).toBeNull();
      expect(eventSpy).toHaveBeenCalledTimes(1);

      window.removeEventListener('nexus_auth_unauthorized', eventSpy);
    });
  });

  describe('Error response parsing', () => {
    it('parses dictionary validation errors from err.errors', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        url: '/api/leads',
        json: async () => ({
          message: 'Validation failed',
          errors: {
            email: ['Email is invalid', 'Email must be unique'],
            phone: ['Phone number required'],
          },
        }),
      });

      await expect(apiClient.post('/leads', {})).rejects.toThrow(
        'Email is invalid; Email must be unique; Phone number required'
      );
    });

    it('parses array validation errors and ignores inner exception messages', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        url: '/api/leads',
        json: async () => ({
          message: 'Server error',
          errors: [
            'Specific business validation error',
            'See the inner exception for details',
          ],
        }),
      });

      await expect(apiClient.post('/leads', {})).rejects.toThrow(
        'Specific business validation error'
      );
    });

    it('falls back to err.title or HTTP status when no message exists', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        url: '/api/items/99',
        json: async () => ({
          title: 'Item not found in database',
        }),
      });

      await expect(apiClient.get('/items/99')).rejects.toThrow('Item not found in database');

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        url: '/api/crash',
        json: async () => ({}),
      });

      await expect(apiClient.get('/crash')).rejects.toThrow('HTTP Error 500');
    });

    it('attaches errors, data, and response to thrown error', async () => {
      const errPayload = {
        message: 'Custom error',
        data: { extra: 123 },
        errors: ['err1'],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        url: '/api/test',
        json: async () => errPayload,
      });

      try {
        await apiClient.get('/test');
        expect.unreachable();
      } catch (err: any) {
        expect(err.message).toBe('err1');
        expect(err.errors).toEqual(['err1']);
        expect(err.data).toEqual({ extra: 123 });
        expect(err.response).toEqual(errPayload);
      }
    });
  });

  describe('Offline and network failure handling', () => {
    it('throws immediate offline error if navigator.onLine is false', async () => {
      Object.defineProperty(window.navigator, 'onLine', {
        value: false,
        configurable: true,
      });

      await expect(apiClient.get('/deals')).rejects.toThrow(
        'Network unavailable: Your browser is currently offline. Please check your internet connection.'
      );
    });

    it('handles AbortError as network timeout', async () => {
      Object.defineProperty(window.navigator, 'onLine', {
        value: true,
        configurable: true,
      });

      globalThis.fetch = vi.fn().mockRejectedValue({
        name: 'AbortError',
        message: 'The operation was aborted',
      });

      await expect(apiClient.get('/long-running')).rejects.toThrow(
        'Network timeout: The server took too long to respond. Please try again.'
      );
    });

    it('handles Failed to fetch or NetworkError as network unavailable', async () => {
      Object.defineProperty(window.navigator, 'onLine', {
        value: true,
        configurable: true,
      });

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Failed to fetch'));

      await expect(apiClient.get('/down')).rejects.toThrow(
        'Network unavailable: Unable to reach the server. Please verify your connection.'
      );

      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Load failed'));

      await expect(apiClient.get('/down')).rejects.toThrow(
        'Network unavailable: Unable to reach the server. Please verify your connection.'
      );
    });

    it('rethrows generic unexpected errors', async () => {
      Object.defineProperty(window.navigator, 'onLine', {
        value: true,
        configurable: true,
      });

      const customErr = new Error('Unexpected crash inside runtime');
      globalThis.fetch = vi.fn().mockRejectedValue(customErr);

      await expect(apiClient.get('/crash')).rejects.toThrow('Unexpected crash inside runtime');
    });
  });
});
