import { describe, it, expect } from 'vitest';
import {
  toCode,
  fromCode,
  hasElevated,
  hasManagement,
  hasQuality,
  hasOperational,
  canPerformImport,
  canManageConfig,
} from '@/lib/roleMap';

describe('roleMap', () => {
  describe('toCode', () => {
    it('maps admin to s1', () => expect(toCode('admin')).toBe('s1'));
    it('maps gestao to s2', () => expect(toCode('gestao')).toBe('s2'));
    it('maps qualidade to s3', () => expect(toCode('qualidade')).toBe('s3'));
    it('maps operacional to s4', () => expect(toCode('operacional')).toBe('s4'));
    it('returns null for unknown', () => expect(toCode('unknown')).toBeNull());
    it('returns null for null', () => expect(toCode(null)).toBeNull());
  });

  describe('fromCode', () => {
    it('maps s1 to admin', () => expect(fromCode('s1')).toBe('admin'));
    it('maps s2 to gestao', () => expect(fromCode('s2')).toBe('gestao'));
    it('returns null for unknown', () => expect(fromCode('xyz')).toBeNull());
    it('returns null for null', () => expect(fromCode(null)).toBeNull());
  });

  describe('permission checks', () => {
    it('hasElevated true only for s1', () => {
      expect(hasElevated('s1')).toBe(true);
      expect(hasElevated('s2')).toBe(false);
      expect(hasElevated(null)).toBe(false);
    });

    it('hasManagement true for s1 and s2', () => {
      expect(hasManagement('s1')).toBe(true);
      expect(hasManagement('s2')).toBe(true);
      expect(hasManagement('s3')).toBe(false);
    });

    it('hasQuality true only for s3', () => {
      expect(hasQuality('s3')).toBe(true);
      expect(hasQuality('s1')).toBe(false);
    });

    it('hasOperational true only for s4', () => {
      expect(hasOperational('s4')).toBe(true);
      expect(hasOperational('s1')).toBe(false);
    });

    it('canPerformImport true for s1 and s2', () => {
      expect(canPerformImport('s1')).toBe(true);
      expect(canPerformImport('s2')).toBe(true);
      expect(canPerformImport('s3')).toBe(false);
    });

    it('canManageConfig true only for s1', () => {
      expect(canManageConfig('s1')).toBe(true);
      expect(canManageConfig('s2')).toBe(false);
    });
  });
});
