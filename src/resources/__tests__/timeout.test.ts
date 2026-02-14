/**
 * ri-sandbox — Timeout checker unit tests
 *
 * Tests the TimeoutChecker implementation and TimeoutSignal.
 * Uses injectable timer function for deterministic testing.
 */

import { describe, it, expect } from 'vitest';
import { createTimeoutChecker, TimeoutSignal } from '../timeout.js';

// ---------------------------------------------------------------------------
// TimeoutSignal
// ---------------------------------------------------------------------------

describe('TimeoutSignal', () => {
  it('extends Error', () => {
    const signal = new TimeoutSignal(100, 50);
    expect(signal).toBeInstanceOf(Error);
    expect(signal).toBeInstanceOf(TimeoutSignal);
  });

  it('stores elapsedMs and limitMs', () => {
    const signal = new TimeoutSignal(75, 50);
    expect(signal.elapsedMs).toBe(75);
    expect(signal.limitMs).toBe(50);
  });

  it('has descriptive message', () => {
    const signal = new TimeoutSignal(100, 50);
    expect(signal.message).toContain('100');
    expect(signal.message).toContain('50');
  });

  it('has name set to TimeoutSignal', () => {
    const signal = new TimeoutSignal(1, 1);
    expect(signal.name).toBe('TimeoutSignal');
  });
});

// ---------------------------------------------------------------------------
// createTimeoutChecker — deterministic timer
// ---------------------------------------------------------------------------

describe('createTimeoutChecker', () => {
  it('starts with zero elapsed time before start is called', () => {
    const checker = createTimeoutChecker(100, () => 0);
    expect(checker.elapsedMs).toBe(0);
    expect(checker.isTimedOut).toBe(false);
  });

  it('reports configured limitMs', () => {
    const checker = createTimeoutChecker(200, () => 0);
    expect(checker.limitMs).toBe(200);
  });

  it('tracks elapsed time from start', () => {
    let now = 0;
    const timer = (): number => now;

    const checker = createTimeoutChecker(100, timer);
    checker.start();
    now = 25;
    expect(checker.elapsedMs).toBe(25);
  });

  it('check passes when under limit', () => {
    let now = 0;
    const timer = (): number => now;

    const checker = createTimeoutChecker(100, timer);
    checker.start();
    now = 50;
    expect(() => { checker.check(); }).not.toThrow();
  });

  it('check throws TimeoutSignal when limit exceeded', () => {
    let now = 0;
    const timer = (): number => now;

    const checker = createTimeoutChecker(50, timer);
    checker.start();
    now = 51;
    expect(() => { checker.check(); }).toThrow(TimeoutSignal);
  });

  it('TimeoutSignal contains correct elapsed and limit values', () => {
    let now = 0;
    const timer = (): number => now;

    const checker = createTimeoutChecker(50, timer);
    checker.start();
    now = 75;

    try {
      checker.check();
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(TimeoutSignal);
      if (err instanceof TimeoutSignal) {
        expect(err.elapsedMs).toBe(75);
        expect(err.limitMs).toBe(50);
      }
    }
  });

  it('marks checker as timed out after exceeding limit', () => {
    let now = 0;
    const timer = (): number => now;

    const checker = createTimeoutChecker(50, timer);
    checker.start();
    now = 51;

    try {
      checker.check();
    } catch {
      // expected
    }

    expect(checker.isTimedOut).toBe(true);
  });

  it('throws on subsequent check calls after timeout', () => {
    let now = 0;
    const timer = (): number => now;

    const checker = createTimeoutChecker(50, timer);
    checker.start();
    now = 60;

    try {
      checker.check();
    } catch {
      // expected
    }

    // Even if time somehow goes back (shouldn't happen), still throws
    now = 10;
    expect(() => { checker.check(); }).toThrow(TimeoutSignal);
  });

  it('allows check at exactly the limit', () => {
    let now = 0;
    const timer = (): number => now;

    const checker = createTimeoutChecker(50, timer);
    checker.start();
    now = 50;
    expect(() => { checker.check(); }).not.toThrow();
  });

  it('produces deterministic results with same timer sequence', () => {
    const calls1: number[] = [];
    const calls2: number[] = [];

    let now1 = 0;
    const timer1 = (): number => {
      calls1.push(now1);
      return now1;
    };

    let now2 = 0;
    const timer2 = (): number => {
      calls2.push(now2);
      return now2;
    };

    const checker1 = createTimeoutChecker(100, timer1);
    const checker2 = createTimeoutChecker(100, timer2);

    checker1.start();
    checker2.start();

    now1 = 40;
    now2 = 40;

    checker1.check();
    checker2.check();

    expect(checker1.elapsedMs).toBe(checker2.elapsedMs);
    expect(checker1.isTimedOut).toBe(checker2.isTimedOut);
  });

  it('resets timed-out state when start is called again', () => {
    let now = 0;
    const timer = (): number => now;

    const checker = createTimeoutChecker(50, timer);
    checker.start();
    now = 60;

    try {
      checker.check();
    } catch {
      // expected
    }

    expect(checker.isTimedOut).toBe(true);

    // Re-start resets elapsed
    now = 100;
    checker.start();
    expect(checker.isTimedOut).toBe(false);

    now = 110;
    expect(checker.elapsedMs).toBe(10);
    expect(() => { checker.check(); }).not.toThrow();
  });
});
