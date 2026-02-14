/**
 * ri-sandbox — Time injection unit tests
 */

import { describe, it, expect } from 'vitest';
import { createTimeProvider } from '../time-injection.js';

describe('createTimeProvider', () => {
  it('returns configured timestamp from getTime()', () => {
    const provider = createTimeProvider(1700000000000);
    expect(provider.getTime()).toBe(1700000000000);
  });

  it('always returns the same value on repeated calls', () => {
    const provider = createTimeProvider(42);
    expect(provider.getTime()).toBe(42);
    expect(provider.getTime()).toBe(42);
    expect(provider.getTime()).toBe(42);
  });

  it('exposes eventTimestamp property', () => {
    const provider = createTimeProvider(9999);
    expect(provider.eventTimestamp).toBe(9999);
  });

  it('different timestamps produce different providers', () => {
    const p1 = createTimeProvider(100);
    const p2 = createTimeProvider(200);
    expect(p1.getTime()).not.toBe(p2.getTime());
  });

  it('handles zero timestamp', () => {
    const provider = createTimeProvider(0);
    expect(provider.getTime()).toBe(0);
  });

  it('handles negative timestamp', () => {
    const provider = createTimeProvider(-1);
    expect(provider.getTime()).toBe(-1);
  });

  it('handles large timestamp values', () => {
    const ts = Number.MAX_SAFE_INTEGER;
    const provider = createTimeProvider(ts);
    expect(provider.getTime()).toBe(ts);
  });
});
