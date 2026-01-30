/**
 * Teste do serviço de token de sessão da API Flag
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  isTokenValid,
  getStoredToken,
  storeToken,
  clearToken,
} from '@/services/apiSessionToken';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('apiSessionToken', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('storeToken', () => {
    it('should store token in localStorage', () => {
      const token = 'test-token-123';
      const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1 hour from now

      storeToken(token, expiresAt);

      const stored = getStoredToken();
      expect(stored).not.toBeNull();
      expect(stored?.token).toBe(token);
      expect(stored?.expiresAt).toBe(expiresAt);
    });
  });

  describe('getStoredToken', () => {
    it('should return null when no token is stored', () => {
      const stored = getStoredToken();
      expect(stored).toBeNull();
    });

    it('should return stored token', () => {
      const token = 'test-token';
      const expiresAt = new Date().toISOString();
      storeToken(token, expiresAt);

      const stored = getStoredToken();
      expect(stored?.token).toBe(token);
    });
  });

  describe('clearToken', () => {
    it('should remove token from localStorage', () => {
      storeToken('test', new Date().toISOString());
      expect(getStoredToken()).not.toBeNull();

      clearToken();
      expect(getStoredToken()).toBeNull();
    });
  });

  describe('isTokenValid', () => {
    it('should return false for null token', () => {
      expect(isTokenValid(null)).toBe(false);
    });

    it('should return false for expired token', () => {
      const expiredToken = {
        token: 'expired',
        expiresAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        createdAt: new Date(Date.now() - 7200000).toISOString(),
      };
      expect(isTokenValid(expiredToken)).toBe(false);
    });

    it('should return true for valid token', () => {
      const validToken = {
        token: 'valid',
        expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
        createdAt: new Date().toISOString(),
      };
      expect(isTokenValid(validToken)).toBe(true);
    });

    it('should return false for token expiring within 60 seconds', () => {
      const almostExpiredToken = {
        token: 'almost-expired',
        expiresAt: new Date(Date.now() + 30000).toISOString(), // 30 seconds from now
        createdAt: new Date().toISOString(),
      };
      expect(isTokenValid(almostExpiredToken)).toBe(false);
    });
  });
});
