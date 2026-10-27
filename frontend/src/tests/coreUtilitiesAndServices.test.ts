import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getSecureRandomInt, getSecureRandomString, getSecureRandomId } from '../utils/crypto';
import { getAuthHeaders } from '../utils/authHeaders';
import {
  formatSmartScheduleDate,
  isDateToday,
  isDateOverdue,
  isDateDueTodayOrOverdue,
} from '../utils/dateUtils';
import {
  playChatNotificationChime,
  showDesktopNotification,
} from '../utils/chatNotificationSound';
import {
  getKycReviewData,
  getCustomerKycStatus,
  patchKycStatus,
} from '../services/kycService';

// Storage mock for Node/Vitest test environment
const createStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value.toString(); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
};

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = createStorageMock() as any;
}
if (typeof globalThis.sessionStorage === 'undefined') {
  globalThis.sessionStorage = createStorageMock() as any;
}
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = globalThis;
}

describe('Core Utilities & Service Coverage Batch', () => {
  // ── 1. src/utils/crypto.ts ──────────────────────────────────────────────────
  describe('crypto.ts CSPRNG utilities', () => {
    it('generates an integer within the requested [min, max] range', () => {
      for (let i = 0; i < 50; i++) {
        const val = getSecureRandomInt(10, 20);
        expect(val).toBeGreaterThanOrEqual(10);
        expect(val).toBeLessThanOrEqual(20);
      }
    });

    it('returns min when min === max', () => {
      expect(getSecureRandomInt(7, 7)).toBe(7);
    });

    it('throws when min > max', () => {
      expect(() => getSecureRandomInt(10, 5)).toThrow('min must be less than or equal to max');
    });

    it('generates a secure random alphanumeric string of expected length', () => {
      const s6 = getSecureRandomString();
      expect(s6).toHaveLength(6);
      expect(s6).toMatch(/^[a-z0-9]+$/);

      const s12 = getSecureRandomString(12);
      expect(s12).toHaveLength(12);
      expect(s12).toMatch(/^[a-z0-9]+$/);
    });

    it('generates a secure unique ID with prefix using randomUUID or fallback', () => {
      const id1 = getSecureRandomId('meet');
      expect(id1.startsWith('meet-')).toBe(true);

      const id2 = getSecureRandomId('toast');
      expect(id2.startsWith('toast-')).toBe(true);
      expect(id1).not.toBe(id2);
    });

    it('uses fallback math when crypto getRandomValues is unavailable', () => {
      const originalCrypto = globalThis.crypto;
      try {
        Object.defineProperty(globalThis, 'crypto', {
          value: undefined,
          configurable: true,
          writable: true,
        });

        const intVal = getSecureRandomInt(100, 200);
        expect(intVal).toBeGreaterThanOrEqual(100);
        expect(intVal).toBeLessThanOrEqual(200);

        const strVal = getSecureRandomString(8);
        expect(strVal).toHaveLength(8);

        const idVal = getSecureRandomId('fallback');
        expect(idVal.startsWith('fallback-')).toBe(true);
      } finally {
        Object.defineProperty(globalThis, 'crypto', {
          value: originalCrypto,
          configurable: true,
          writable: true,
        });
      }
    });
  });

  // ── 2. src/utils/authHeaders.ts ─────────────────────────────────────────────
  describe('authHeaders.ts', () => {
    beforeEach(() => {
      globalThis.sessionStorage.clear();
      globalThis.localStorage.clear();
    });

    it('returns Authorization header from sessionStorage if present', () => {
      globalThis.sessionStorage.setItem('nexus_auth_token', 'test-session-jwt');
      expect(getAuthHeaders()).toEqual({ Authorization: 'Bearer test-session-jwt' });
    });

    it('returns Authorization header from localStorage if sessionStorage is empty', () => {
      globalThis.localStorage.setItem('nexus_auth_token', 'test-local-jwt');
      expect(getAuthHeaders()).toEqual({ Authorization: 'Bearer test-local-jwt' });
    });

    it('returns empty object when no token is in storage', () => {
      expect(getAuthHeaders()).toEqual({});
    });
  });

  // ── 3. src/utils/dateUtils.ts ───────────────────────────────────────────────
  describe('dateUtils.ts', () => {
    it('returns empty string for falsy date', () => {
      expect(formatSmartScheduleDate(null)).toBe('');
      expect(formatSmartScheduleDate(undefined)).toBe('');
      expect(formatSmartScheduleDate('')).toBe('');
    });

    it('returns raw string for invalid date values', () => {
      expect(formatSmartScheduleDate('invalid-date-xyz')).toBe('invalid-date-xyz');
    });

    it('formats today correctly', () => {
      const now = new Date();
      const res = formatSmartScheduleDate(now);
      expect(res.startsWith('Today •')).toBe(true);
      expect(isDateToday(now)).toBe(true);
      expect(isDateDueTodayOrOverdue(now)).toBe(true);
    });

    it('formats tomorrow correctly', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const res = formatSmartScheduleDate(tomorrow);
      expect(res.startsWith('Tomorrow •')).toBe(true);
      expect(isDateToday(tomorrow)).toBe(false);
      expect(isDateOverdue(tomorrow)).toBe(false);
    });

    it('formats yesterday correctly', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const res = formatSmartScheduleDate(yesterday);
      expect(res.startsWith('Yesterday •')).toBe(true);
      expect(isDateToday(yesterday)).toBe(false);
      expect(isDateOverdue(yesterday)).toBe(true);
    });

    it('formats overdue dates in the past with (Overdue)', () => {
      const past = new Date();
      past.setDate(past.getDate() - 5);
      const res = formatSmartScheduleDate(past);
      expect(res.includes('(Overdue)')).toBe(true);
      expect(isDateOverdue(past)).toBe(true);
      expect(isDateDueTodayOrOverdue(past)).toBe(true);
    });

    it('formats future dates beyond tomorrow without (Overdue)', () => {
      const future = new Date();
      future.setDate(future.getDate() + 5);
      const res = formatSmartScheduleDate(future);
      expect(res.includes('•')).toBe(true);
      expect(res.includes('(Overdue)')).toBe(false);
      expect(isDateOverdue(future)).toBe(false);
    });

    it('handles special string representations for isDateToday and isDateOverdue', () => {
      expect(isDateToday('Scheduled Today at 3pm')).toBe(true);
      expect(isDateToday(null)).toBe(false);
      expect(isDateToday('not-a-date')).toBe(false);

      expect(isDateOverdue('Follow up from yesterday')).toBe(true);
      expect(isDateOverdue('Status: overdue by 2 days')).toBe(true);
      expect(isDateOverdue('Call tomorrow morning')).toBe(false);
      expect(isDateOverdue('Due today')).toBe(false);
      expect(isDateOverdue(null)).toBe(false);
      expect(isDateOverdue('invalid')).toBe(false);
    });
  });

  // ── 4. src/utils/chatNotificationSound.ts ───────────────────────────────────
  describe('chatNotificationSound.ts', () => {
    it('handles playChatNotificationChime without throwing even if AudioContext is unsupported', () => {
      expect(() => playChatNotificationChime()).not.toThrow();
    });

    it('plays chime using mocked AudioContext when available', () => {
      const startFn = vi.fn();
      const stopFn = vi.fn();
      const setValueAtTimeFn = vi.fn();
      const exponentialRampFn = vi.fn();
      const connectFn = vi.fn();

      class MockAudioContext {
        currentTime = 0;
        destination = {};
        createOscillator() {
          return {
            type: 'sine',
            frequency: { setValueAtTime: setValueAtTimeFn },
            connect: connectFn,
            start: startFn,
            stop: stopFn,
          };
        }
        createGain() {
          return {
            gain: {
              setValueAtTime: setValueAtTimeFn,
              exponentialRampToValueAtTime: exponentialRampFn,
            },
            connect: connectFn,
          };
        }
      }

      (globalThis as any).AudioContext = MockAudioContext;
      (window as any).AudioContext = MockAudioContext;
      playChatNotificationChime();

      expect(startFn).toHaveBeenCalled();
      expect(stopFn).toHaveBeenCalled();
    });

    it('safely handles showDesktopNotification without throwing', () => {
      expect(() => showDesktopNotification('Title', 'Body')).not.toThrow();

      // Mock Notification API
      const notificationSpy = vi.fn();
      class MockNotification {
        static permission = 'granted';
        static requestPermission = vi.fn().mockResolvedValue('granted');
        constructor(title: string, options: any) {
          notificationSpy(title, options);
        }
      }

      (globalThis as any).Notification = MockNotification;
      (window as any).Notification = MockNotification;

      showDesktopNotification('Hello', 'Test Notification');
      expect(notificationSpy).toHaveBeenCalledWith('Hello', { body: 'Test Notification', icon: '/vite.svg' });

      // Permission default -> requestPermission
      MockNotification.permission = 'default';
      showDesktopNotification('Request', 'Permission Test');
      expect(MockNotification.requestPermission).toHaveBeenCalled();
    });
  });

  // ── 5. src/services/kycService.ts additional coverage ───────────────────────
  describe('kycService.ts full branch coverage', () => {
    it('returns null for getKycReviewData', () => {
      expect(getKycReviewData({})).toBeNull();
    });

    it('returns Verified when status is completed', () => {
      expect(getCustomerKycStatus('deal-1', 'completed')).toBe('Verified');
      expect(getCustomerKycStatus('deal-1', 'Verified')).toBe('Verified');
      expect(getCustomerKycStatus('deal-1', undefined)).toBe('Pending');
    });

    it('patches KYC status successfully via API', async () => {
      const mockSuccessJson = { success: true, data: { id: 101, status: 'Verified' } };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockSuccessJson,
      } as any);

      const result = await patchKycStatus(101, {
        status: 'Verified',
        comment: 'All documents approved',
      });

      expect(result).toEqual(mockSuccessJson);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/irm/kyc/101/status'),
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        })
      );
    });

    it('throws formatted error when patchKycStatus returns non-OK response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Cannot verify with missing PAN document' }),
      } as any);

      await expect(
        patchKycStatus(101, { status: 'Verified' })
      ).rejects.toThrow('Cannot verify with missing PAN document');
    });

    it('throws fallback status error when patchKycStatus non-OK response is not JSON', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('Bad Gateway HTML');
        },
      } as any);

      await expect(
        patchKycStatus(101, { status: 'Verified' })
      ).rejects.toThrow('Failed to update KYC status (502)');
    });
  });
});
