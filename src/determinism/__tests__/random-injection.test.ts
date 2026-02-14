/**
 * ri-sandbox — Random injection (PRNG) unit tests
 */

import { describe, it, expect } from 'vitest';
import { createPrng } from '../random-injection.js';

describe('createPrng', () => {
  describe('determinism', () => {
    it('same seed produces identical first value', () => {
      const p1 = createPrng(42);
      const p2 = createPrng(42);
      expect(p1.next()).toBe(p2.next());
    });

    it('same seed produces identical sequence of 100 values', () => {
      const p1 = createPrng(12345);
      const p2 = createPrng(12345);
      const seq1: number[] = [];
      const seq2: number[] = [];
      for (let i = 0; i < 100; i++) {
        seq1.push(p1.next());
        seq2.push(p2.next());
      }
      expect(seq1).toEqual(seq2);
    });

    it('different seeds produce different sequences', () => {
      const p1 = createPrng(1);
      const p2 = createPrng(2);
      const v1 = p1.next();
      const v2 = p2.next();
      expect(v1).not.toBe(v2);
    });
  });

  describe('output quality', () => {
    it('returns unsigned 32-bit integers', () => {
      const prng = createPrng(42);
      for (let i = 0; i < 50; i++) {
        const val = prng.next();
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(0xffffffff);
        expect(Number.isInteger(val)).toBe(true);
      }
    });

    it('distributes values across the 32-bit range', () => {
      const prng = createPrng(42);
      let hasLow = false;
      let hasMid = false;
      let hasHigh = false;
      const midLow = 0x40000000;
      const midHigh = 0xbfffffff;

      for (let i = 0; i < 1000; i++) {
        const val = prng.next();
        if (val < midLow) {
          hasLow = true;
        }
        if (val >= midLow && val <= midHigh) {
          hasMid = true;
        }
        if (val > midHigh) {
          hasHigh = true;
        }
      }

      expect(hasLow).toBe(true);
      expect(hasMid).toBe(true);
      expect(hasHigh).toBe(true);
    });

    it('produces non-zero values from zero seed', () => {
      const prng = createPrng(0);
      const firstFive = Array.from({ length: 5 }, () => prng.next());
      // At least some values should be non-zero
      expect(firstFive.some((v) => v !== 0)).toBe(true);
    });
  });

  describe('state management', () => {
    it('getState returns serializable state', () => {
      const prng = createPrng(42);
      prng.next();
      const state = prng.getState();
      expect(typeof state.current).toBe('number');
    });

    it('setState restores exact sequence', () => {
      const prng = createPrng(42);
      // Advance a few steps
      prng.next();
      prng.next();
      prng.next();

      // Capture state
      const saved = prng.getState();

      // Continue generating
      const after1 = prng.next();
      const after2 = prng.next();

      // Restore and verify same continuation
      prng.setState(saved);
      expect(prng.next()).toBe(after1);
      expect(prng.next()).toBe(after2);
    });

    it('reset re-seeds the generator', () => {
      const prng = createPrng(42);
      const first = prng.next();

      prng.reset(42);
      expect(prng.next()).toBe(first);
    });

    it('reset to different seed produces different sequence', () => {
      const prng = createPrng(42);
      const first42 = prng.next();

      prng.reset(99);
      const first99 = prng.next();

      expect(first42).not.toBe(first99);
    });

    it('getState/setState round-trips correctly', () => {
      const p1 = createPrng(42);
      p1.next();
      p1.next();
      const state = p1.getState();

      const p2 = createPrng(0); // different initial seed
      p2.setState(state);

      // p1 and p2 should now produce the same next values
      expect(p1.next()).toBe(p2.next());
      expect(p1.next()).toBe(p2.next());
    });
  });
});
