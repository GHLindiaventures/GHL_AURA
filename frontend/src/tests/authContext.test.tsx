import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor, cleanup } from '@testing-library/react';
import {
  AuthProvider,
  useAuth,
  isJwtExpired,
  getStoredTenants,
  getStoredUsers,
  saveStoredUser,
} from '../context/AuthContext';
import { apiClient } from '../services/apiClient';
import { authService } from '../services/authService';
import { User, Tenant } from '../types';

// Helper component to consume useAuth
const AuthConsumer: React.FC = () => {
  const auth = useAuth();
  return (
    <div>
      <div data-testid="auth-status">{auth.isAuthenticated ? 'AUTHENTICATED' : 'ANONYMOUS'}</div>
      <div data-testid="user-name">{auth.user?.name || 'none'}</div>
      <div data-testid="user-email">{auth.user?.email || 'none'}</div>
      <div data-testid="tenant-name">{auth.tenant?.name || 'none'}</div>
      <div data-testid="is-superadmin">{auth.isSuperAdmin ? 'YES' : 'NO'}</div>
      <div data-testid="login-error">{auth.loginError || 'none'}</div>
      <div data-testid="mfa-active">{auth.mfaChallenge ? 'MFA_PENDING' : 'NO_MFA'}</div>
      <button onClick={() => void auth.login('test@example.com', 'password123')}>Login</button>
      <button onClick={() => void auth.login('', '')}>Login Invalid</button>
      <button onClick={() => void auth.verifyMfaCode('123456')}>Verify MFA</button>
      <button onClick={() => void auth.verifyMfaRecovery('REC-123')}>Verify Recovery</button>
      <button onClick={auth.cancelMfa}>Cancel MFA</button>
      <button onClick={() => auth.logout('Session timed out')}>Logout</button>
      <button onClick={() => auth.switchPersona('sales_executive')}>Switch Persona</button>
      <button onClick={() => void auth.revalidateSession()}>Revalidate</button>
    </div>
  );
};

describe('AuthContext & Utilities Unit Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('JWT Expiry Check (isJwtExpired)', () => {
    it('returns true for falsy or empty tokens', () => {
      expect(isJwtExpired(null)).toBe(true);
      expect(isJwtExpired(undefined)).toBe(true);
      expect(isJwtExpired('')).toBe(true);
    });

    it('returns false for non-JWT strings without 3 dot-separated parts', () => {
      expect(isJwtExpired('some-random-opaque-token')).toBe(false);
    });

    it('accurately identifies expired and unexpired tokens', () => {
      const createToken = (expSeconds: number) => {
        const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
        const payload = btoa(JSON.stringify({ exp: expSeconds, sub: 'user-1' }));
        return `${header}.${payload}.signature`;
      };

      const pastExp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      expect(isJwtExpired(createToken(pastExp))).toBe(true);

      const futureExp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      expect(isJwtExpired(createToken(futureExp))).toBe(false);
    });

    it('returns false when exp is missing or token is malformed JSON payload', () => {
      expect(isJwtExpired('aaa.badjson.ccc')).toBe(false);
    });
  });

  describe('Stored Tenants and Users Helpers', () => {
    it('retrieves default tenants or parsed stored tenants', () => {
      const defaults = getStoredTenants();
      expect(defaults.length).toBe(2);

      const customTenants = [{ id: 't-99', name: 'Custom Tenant', slug: 'custom' }] as unknown as Tenant[];
      localStorage.setItem('nexus_tenants', JSON.stringify(customTenants));
      expect(getStoredTenants()[0].id).toBe('t-99');

      localStorage.setItem('nexus_tenants', '{invalid-json');
      expect(getStoredTenants().length).toBe(2);
    });

    it('retrieves stored users and filters by tenantSlug', () => {
      expect(getStoredUsers()).toHaveLength(0);

      const users = [
        { id: 'u1', name: 'User 1', email: 'u1@ghl.com', companySlug: 'ghl' },
        { id: 'u2', name: 'User 2', email: 'u2@jamin.com', companySlug: 'jamin' },
      ] as unknown as User[];
      localStorage.setItem('nexus_users', JSON.stringify(users));

      expect(getStoredUsers()).toHaveLength(2);
      expect(getStoredUsers('ghl')).toHaveLength(1);
      expect(getStoredUsers('ghl')[0].id).toBe('u1');

      localStorage.setItem('nexus_users', '{bad');
      expect(getStoredUsers()).toHaveLength(0);
    });

    it('saves a new user or updates an existing one', () => {
      const u = { id: 'u-10', name: 'Test New User', email: 'test@example.com' } as unknown as User;
      saveStoredUser(u);
      expect(getStoredUsers().some(user => user.id === 'u-10')).toBe(true);

      saveStoredUser({ ...u, name: 'Updated Name' });
      expect(getStoredUsers().find(user => user.id === 'u-10')?.name).toBe('Updated Name');
    });
  });

  describe('useAuth Hook Exception', () => {
    it('throws error when useAuth is consumed outside AuthProvider', () => {
      const BrokenComponent = () => {
        useAuth();
        return null;
      };

      // Suppress React boundary console.error during expected throw
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => render(<BrokenComponent />)).toThrow('useAuth must be used within an AuthProvider');
      consoleError.mockRestore();
    });
  });

  describe('AuthProvider Component & Workflow', () => {
    it('renders with initial anonymous state when no storage exists', () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      expect(screen.getByTestId('auth-status').textContent).toBe('ANONYMOUS');
      expect(screen.getByTestId('user-name').textContent).toBe('none');
      expect(screen.getByTestId('is-superadmin').textContent).toBe('NO');
    });

    it('restores user and tenant from storage and synchronizes state', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify({ exp: futureExp, sub: 'usr-admin-1' }));
      const validToken = `${header}.${payload}.sig`;

      const mockUser = {
        id: 'usr-admin-1',
        name: 'Company Administrator',
        email: 'admin@ghl.com',
        phone: '+919876543210',
        status: 'Active',
        role: { id: 'r-admin', name: 'Company Admin', code: 'company_admin', permissions: ['view_deals'] },
      } as unknown as User;
      const mockTenant = {
        id: 't-ghl-01',
        name: 'GHL India Ventures',
        slug: 'ghl',
      } as unknown as Tenant;

      sessionStorage.setItem('nexus_auth_token', validToken);
      sessionStorage.setItem('nexus_current_user', JSON.stringify(mockUser));
      sessionStorage.setItem('nexus_current_tenant', JSON.stringify(mockTenant));

      vi.spyOn(apiClient, 'get').mockResolvedValue({
        success: true,
        data: {
          user: mockUser,
          tenant: mockTenant,
        },
      });

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      expect(screen.getByTestId('auth-status').textContent).toBe('AUTHENTICATED');
      expect(screen.getByTestId('user-name').textContent).toBe('Company Administrator');
      expect(screen.getByTestId('tenant-name').textContent).toBe('GHL India Ventures');
    });

    it('handles super_admin session restoration with null tenant unless support mode is active', async () => {
      const futureExp = Math.floor(Date.now() / 1000) + 3600;
      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = btoa(JSON.stringify({ exp: futureExp, sub: 'usr-super' }));
      const validToken = `${header}.${payload}.sig`;

      const superUser = {
        id: 'usr-super',
        name: 'Super Admin',
        email: 'super@system.com',
        phone: '+919999999999',
        status: 'Active',
        role: { id: 'r-super', name: 'Super Admin', code: 'super_admin', permissions: [] },
      } as unknown as User;

      sessionStorage.setItem('nexus_auth_token', validToken);
      sessionStorage.setItem('nexus_current_user', JSON.stringify(superUser));

      vi.spyOn(apiClient, 'get').mockResolvedValue({
        success: true,
        data: {
          user: superUser,
          tenant: null,
        },
      });

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      expect(screen.getByTestId('is-superadmin').textContent).toBe('YES');
      expect(screen.getByTestId('tenant-name').textContent).toBe('none');
    });

    it('validates empty inputs and sets loginError on login', async () => {
      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      const invalidBtn = screen.getByText('Login Invalid');
      await act(async () => {
        invalidBtn.click();
      });

      expect(screen.getByTestId('login-error').textContent).toBe('Email is required.');
    });

    it('handles successful login and stores token and profile', async () => {
      vi.spyOn(apiClient, 'post').mockResolvedValue({
        success: true,
        data: {
          token: 'mock-jwt-token',
          user: { id: 'u-log', name: 'Logged In User', email: 'test@example.com' },
          tenant: { id: 't-log', name: 'Logged Tenant', slug: 'ghl' },
        },
      });

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      const loginBtn = screen.getByText('Login');
      await act(async () => {
        loginBtn.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('auth-status').textContent).toBe('AUTHENTICATED');
        expect(screen.getByTestId('user-name').textContent).toBe('Logged In User');
        expect(screen.getByTestId('tenant-name').textContent).toBe('Logged Tenant');
      });
      expect(sessionStorage.getItem('nexus_auth_token')).toBe('mock-jwt-token');
    });

    it('initiates MFA challenge when login requires two factor authentication', async () => {
      vi.spyOn(apiClient, 'post').mockResolvedValue({
        success: true,
        data: {
          requiresMfa: true,
          challengeToken: 'mfa-challenge-123',
        },
      });

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      const loginBtn = screen.getByText('Login');
      await act(async () => {
        loginBtn.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('mfa-active').textContent).toBe('MFA_PENDING');
      });

      // Verify MFA code success
      vi.spyOn(authService, 'verifyMfa').mockResolvedValue({
        success: true,
        data: {
          token: 'mfa-session-token',
          user: { id: 'u-mfa', name: 'MFA Verified User', email: 'mfa@example.com' },
          tenant: { id: 't-mfa', name: 'MFA Tenant', slug: 'ghl' },
        },
      });

      const verifyBtn = screen.getByText('Verify MFA');
      await act(async () => {
        verifyBtn.click();
      });

      await waitFor(() => {
        expect(screen.getByTestId('auth-status').textContent).toBe('AUTHENTICATED');
        expect(screen.getByTestId('mfa-active').textContent).toBe('NO_MFA');
      });

      // Verify Recovery Code failure and success
      await act(async () => {
        screen.getByText('Verify Recovery').click();
      });
      // No active challenge
      expect(screen.getByTestId('login-error').textContent).toBe('No active MFA challenge session found.');
    });

    it('cancels MFA challenge on cancelMfa click', async () => {
      vi.spyOn(apiClient, 'post').mockResolvedValue({
        success: true,
        data: {
          requiresMfa: true,
          challengeToken: 'mfa-challenge-123',
        },
      });

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      await act(async () => {
        screen.getByText('Login').click();
      });

      expect(screen.getByTestId('mfa-active').textContent).toBe('MFA_PENDING');

      await act(async () => {
        screen.getByText('Cancel MFA').click();
      });

      expect(screen.getByTestId('mfa-active').textContent).toBe('NO_MFA');
    });

    it('handles logout by clearing storage and resetting state', async () => {
      sessionStorage.setItem('nexus_current_user', JSON.stringify({ id: 'u1', name: 'Active User' }));
      sessionStorage.setItem('nexus_auth_token', 'token-123');

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      expect(screen.getByTestId('auth-status').textContent).toBe('AUTHENTICATED');

      const logoutBtn = screen.getByText('Logout');
      await act(async () => {
        logoutBtn.click();
      });

      expect(screen.getByTestId('auth-status').textContent).toBe('ANONYMOUS');
      expect(screen.getByTestId('login-error').textContent).toBe('Session timed out');
      expect(sessionStorage.getItem('nexus_auth_token')).toBeNull();
    });

    it('handles persona switching warning and session revalidation', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      render(
        <AuthProvider>
          <AuthConsumer />
        </AuthProvider>
      );

      await act(async () => {
        screen.getByText('Switch Persona').click();
        screen.getByText('Revalidate').click();
      });

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();

      // Trigger nexus_auth_unauthorized event
      await act(async () => {
        window.dispatchEvent(new Event('nexus_auth_unauthorized'));
      });
      expect(screen.getByTestId('auth-status').textContent).toBe('ANONYMOUS');
    });
  });
});
