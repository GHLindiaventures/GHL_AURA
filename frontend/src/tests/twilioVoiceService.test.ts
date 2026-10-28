import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { twilioVoiceService } from '../services/twilioVoiceService';
import { apiClient } from '../services/apiClient';
import { storageService } from '../services/storageService';
import { Device, Call } from '@twilio/voice-sdk';

// Mock @twilio/voice-sdk
vi.mock('@twilio/voice-sdk', () => {
  const mockCall = {
    parameters: { From: '+919876543210' },
    disconnect: vi.fn(),
  };

  class MockDevice {
    state = 'registered';
    listeners = new Map<string, Function[]>();

    constructor(public token: string, public options?: any) {}

    on(event: string, handler: Function) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event)!.push(handler);
    }

    emit(event: string, ...args: any[]) {
      const handlers = this.listeners.get(event) || [];
      handlers.forEach(h => h(...args));
    }

    register = vi.fn().mockImplementation(async () => {
      this.state = 'registered';
      this.emit('registered');
    });

    unregister = vi.fn().mockImplementation(async () => {
      this.state = 'unregistered';
      this.emit('unregistered');
    });

    updateToken = vi.fn().mockResolvedValue(undefined);
    connect = vi.fn().mockResolvedValue(mockCall);
    destroy = vi.fn().mockImplementation(() => {
      this.listeners.clear();
    });
  }

  const MockCallClass = {
    Codec: { Opus: 'opus', PCMU: 'pcmu' },
  };

  return {
    Device: MockDevice,
    Call: MockCallClass,
  };
});

describe('TwilioVoiceService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    twilioVoiceService.destroy();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    twilioVoiceService.destroy();
  });

  describe('Initial State and Status', () => {
    it('returns default uninitialized status', () => {
      const status = twilioVoiceService.getStatus();
      expect(status.isConfigured).toBe(false);
      expect(status.isRegistered).toBe(false);
      expect(status.deviceState).toBe('uninitialized');
      expect(status.lastError).toBeNull();
    });

    it('manages currentCall getter and setter', () => {
      expect(twilioVoiceService.getCurrentCall()).toBeNull();
      const fakeCall = { id: 'call-1' } as any;
      twilioVoiceService.setCurrentCall(fakeCall);
      expect(twilioVoiceService.getCurrentCall()).toBe(fakeCall);
    });

    it('manages listeners and unsubscribes properly', () => {
      const incomingSpy = vi.fn();
      const stateSpy = vi.fn();

      const unsubIncoming = twilioVoiceService.onIncomingCall(incomingSpy);
      const unsubState = twilioVoiceService.onDeviceStateChange(stateSpy);

      expect(typeof unsubIncoming).toBe('function');
      expect(typeof unsubState).toBe('function');

      unsubIncoming();
      unsubState();
    });
  });

  describe('checkBackendStatus', () => {
    it('returns status from backend when configured', async () => {
      vi.spyOn(apiClient, 'get').mockResolvedValue({
        success: true,
        data: {
          isConfigured: true,
          hasAccountSid: true,
          hasTwiMLApp: true,
          hasCallerNumber: true,
          message: 'Voice service ready',
        },
      });

      const res = await twilioVoiceService.checkBackendStatus();
      expect(res.isConfigured).toBe(true);
      expect(res.hasAccountSid).toBe(true);
      expect(twilioVoiceService.getStatus().isConfigured).toBe(true);
    });

    it('handles backend returning null data gracefully', async () => {
      vi.spyOn(apiClient, 'get').mockResolvedValue(null as any);
      const res = await twilioVoiceService.checkBackendStatus();
      expect(res.isConfigured).toBe(false);
      expect(res.message).toContain('Unable to verify');
    });

    it('handles backend exception', async () => {
      vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('Network down'));
      const res = await twilioVoiceService.checkBackendStatus();
      expect(res.isConfigured).toBe(false);
      expect(res.message).toBe('Network down');
      expect(twilioVoiceService.getStatus().lastError).toBe('Network down');
    });
  });

  describe('initializeDevice', () => {
    it('rejects initialization if user role is not authorized', async () => {
      vi.spyOn(storageService, 'getUser').mockReturnValue({
        id: 'usr-guest',
        name: 'Guest',
        email: 'guest@example.com',
        phone: '123',
        status: 'Active',
        role: { id: 'r-viewer', name: 'Viewer', code: 'viewer', permissions: [] },
      } as any);

      const result = await twilioVoiceService.initializeDevice();
      expect(result.success).toBe(false);
      expect(result.error).toContain('not authorized');
    });

    it('handles unconfigured voice credentials on backend', async () => {
      vi.spyOn(storageService, 'getUser').mockReturnValue({
        id: 'usr-admin',
        role: { code: 'sales_executive', permissions: ['place_calls'] },
      } as any);

      vi.spyOn(apiClient, 'get').mockResolvedValue({
        success: false,
        message: 'No Account SID found',
        data: { isConfigured: false },
      });

      const result = await twilioVoiceService.initializeDevice();
      expect(result.success).toBe(false);
      expect(result.error).toBe('No Account SID found');
    });

    it('successfully initializes, registers Device, and wires up event handlers', async () => {
      vi.spyOn(storageService, 'getUser').mockReturnValue({
        id: 'usr-agent',
        role: { code: 'sales_executive', permissions: ['place_calls'] },
      } as any);

      vi.spyOn(apiClient, 'get').mockResolvedValue({
        success: true,
        data: {
          isConfigured: true,
          token: 'valid.voice.jwt',
          identity: 'agent_007',
          ttlSeconds: 3600,
        },
      });

      const stateEvents: string[] = [];
      twilioVoiceService.onDeviceStateChange((state) => stateEvents.push(state));

      const incomingCalls: any[] = [];
      twilioVoiceService.onIncomingCall((call) => incomingCalls.push(call));

      const result = await twilioVoiceService.initializeDevice();
      expect(result.success).toBe(true);
      expect(twilioVoiceService.getStatus().isRegistered).toBe(true);

      // Access internal device to trigger events
      const rawDevice = (twilioVoiceService as any).device;
      expect(rawDevice).toBeDefined();

      // Trigger incoming call event
      const fakeCall = { parameters: { From: '+919999988888' } };
      rawDevice.emit('incoming', fakeCall);
      expect(incomingCalls).toHaveLength(1);
      expect(incomingCalls[0].parameters.From).toBe('+919999988888');

      // Trigger error event
      rawDevice.emit('error', { message: 'Network disconnected' });
      expect(twilioVoiceService.getStatus().lastError).toBe('Network disconnected');

      // Trigger unregistered event
      rawDevice.emit('unregistered');
      expect(twilioVoiceService.getStatus().isRegistered).toBe(false);

      // Trigger tokenWillExpire event (refreshes token)
      rawDevice.emit('tokenWillExpire');

      // Re-calling initializeDevice when device exists should updateToken
      const reinitResult = await twilioVoiceService.initializeDevice();
      expect(reinitResult.success).toBe(true);
    });

    it('handles 403 Forbidden error during initialization', async () => {
      vi.spyOn(storageService, 'getUser').mockReturnValue(null);
      vi.spyOn(apiClient, 'get').mockRejectedValue({
        status: 403,
        message: 'Forbidden',
      });

      const result = await twilioVoiceService.initializeDevice();
      expect(result.success).toBe(false);
      expect(result.error).toContain('not authorized');
    });
  });

  describe('makeCall', () => {
    it('throws error when user is not authorized', async () => {
      vi.spyOn(storageService, 'getUser').mockReturnValue({
        id: 'usr-readonly',
        role: { code: 'viewer', permissions: [] },
      } as any);

      await expect(twilioVoiceService.makeCall('+919876543210')).rejects.toThrow('Current user role is not permitted');
    });

    it('initiates call when device is initialized and registered', async () => {
      vi.spyOn(storageService, 'getUser').mockReturnValue({
        id: 'usr-agent',
        role: { code: 'sales_executive', permissions: ['place_calls'] },
      } as any);

      vi.spyOn(apiClient, 'get').mockResolvedValue({
        success: true,
        data: { isConfigured: true, token: 'token-123' },
      });

      const call = await twilioVoiceService.makeCall('+919876543210', { customTag: 'test' });
      expect(call).toBeDefined();
      expect(twilioVoiceService.getCurrentCall()).toBe(call);
    });

    it('throws when device connection fails', async () => {
      vi.spyOn(storageService, 'getUser').mockReturnValue({
        id: 'usr-agent',
        role: { code: 'sales_executive', permissions: ['place_calls'] },
      } as any);

      vi.spyOn(apiClient, 'get').mockResolvedValue({
        success: true,
        data: { isConfigured: true, token: 'token-123' },
      });

      await twilioVoiceService.initializeDevice();
      const rawDevice = (twilioVoiceService as any).device;
      rawDevice.connect.mockRejectedValueOnce(new Error('Call dropped by carrier'));

      await expect(twilioVoiceService.makeCall('+919876543210')).rejects.toThrow('Call dropped by carrier');
    });
  });

  describe('destroy', () => {
    it('cleans up device, current call, and listeners', async () => {
      const mockCall = { disconnect: vi.fn() };
      twilioVoiceService.setCurrentCall(mockCall as any);

      twilioVoiceService.destroy();
      expect(mockCall.disconnect).toHaveBeenCalled();
      expect(twilioVoiceService.getCurrentCall()).toBeNull();
      expect(twilioVoiceService.getStatus().isRegistered).toBe(false);
    });
  });
});
