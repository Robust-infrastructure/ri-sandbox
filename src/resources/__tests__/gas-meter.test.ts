/**
 * ri-sandbox — Gas meter unit tests
 *
 * Tests the GasMeter implementation and GasExhaustedSignal.
 */

import { describe, it, expect } from 'vitest';
import { createGasMeter, GasExhaustedSignal } from '../gas-meter.js';

// ---------------------------------------------------------------------------
// GasExhaustedSignal
// ---------------------------------------------------------------------------

describe('GasExhaustedSignal', () => {
  it('extends Error', () => {
    const signal = new GasExhaustedSignal(100, 50);
    expect(signal).toBeInstanceOf(Error);
    expect(signal).toBeInstanceOf(GasExhaustedSignal);
  });

  it('stores gasUsed and gasLimit', () => {
    const signal = new GasExhaustedSignal(77, 50);
    expect(signal.gasUsed).toBe(77);
    expect(signal.gasLimit).toBe(50);
  });

  it('has descriptive message', () => {
    const signal = new GasExhaustedSignal(100, 50);
    expect(signal.message).toContain('100');
    expect(signal.message).toContain('50');
  });

  it('has name set to GasExhaustedSignal', () => {
    const signal = new GasExhaustedSignal(1, 1);
    expect(signal.name).toBe('GasExhaustedSignal');
  });
});

// ---------------------------------------------------------------------------
// createGasMeter
// ---------------------------------------------------------------------------

describe('createGasMeter', () => {
  it('starts with zero gasUsed', () => {
    const meter = createGasMeter(100);
    expect(meter.gasUsed).toBe(0);
    expect(meter.isExhausted).toBe(false);
  });

  it('reports configured gasLimit', () => {
    const meter = createGasMeter(500);
    expect(meter.gasLimit).toBe(500);
  });

  it('consumes gas with default amount of 1', () => {
    const meter = createGasMeter(100);
    meter.consume();
    expect(meter.gasUsed).toBe(1);
    expect(meter.isExhausted).toBe(false);
  });

  it('consumes gas with specified amount', () => {
    const meter = createGasMeter(100);
    meter.consume(25);
    expect(meter.gasUsed).toBe(25);
  });

  it('accumulates gas across multiple consume calls', () => {
    const meter = createGasMeter(100);
    meter.consume(10);
    meter.consume(20);
    meter.consume(30);
    expect(meter.gasUsed).toBe(60);
    expect(meter.isExhausted).toBe(false);
  });

  it('throws GasExhaustedSignal when budget exceeded', () => {
    const meter = createGasMeter(10);
    meter.consume(5);

    expect(() => { meter.consume(6); }).toThrow(GasExhaustedSignal);
  });

  it('records gasUsed including the exceeding amount', () => {
    const meter = createGasMeter(10);
    meter.consume(5);

    try {
      meter.consume(6);
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(GasExhaustedSignal);
      if (err instanceof GasExhaustedSignal) {
        expect(err.gasUsed).toBe(11);
        expect(err.gasLimit).toBe(10);
      }
    }
  });

  it('marks meter as exhausted after exceeding budget', () => {
    const meter = createGasMeter(5);
    try {
      meter.consume(6);
    } catch {
      // expected
    }
    expect(meter.isExhausted).toBe(true);
  });

  it('throws on subsequent consume calls after exhaustion', () => {
    const meter = createGasMeter(5);
    try {
      meter.consume(6);
    } catch {
      // expected
    }

    expect(() => { meter.consume(1); }).toThrow(GasExhaustedSignal);
  });

  it('allows exact budget consumption without error', () => {
    const meter = createGasMeter(10);
    meter.consume(10);
    expect(meter.gasUsed).toBe(10);
    expect(meter.isExhausted).toBe(false);
  });

  it('throws when consuming 1 more than exact budget', () => {
    const meter = createGasMeter(10);
    meter.consume(10);
    expect(() => { meter.consume(1); }).toThrow(GasExhaustedSignal);
  });

  it('resets gasUsed and exhausted state', () => {
    const meter = createGasMeter(10);
    try {
      meter.consume(11);
    } catch {
      // expected
    }
    expect(meter.isExhausted).toBe(true);

    meter.reset();
    expect(meter.gasUsed).toBe(0);
    expect(meter.isExhausted).toBe(false);
  });

  it('works correctly after reset', () => {
    const meter = createGasMeter(10);
    meter.consume(8);
    meter.reset();
    meter.consume(8);
    expect(meter.gasUsed).toBe(8);
    expect(meter.isExhausted).toBe(false);
  });

  it('produces deterministic results for same inputs', () => {
    const meter1 = createGasMeter(100);
    const meter2 = createGasMeter(100);

    meter1.consume(30);
    meter1.consume(20);

    meter2.consume(30);
    meter2.consume(20);

    expect(meter1.gasUsed).toBe(meter2.gasUsed);
    expect(meter1.isExhausted).toBe(meter2.isExhausted);
  });
});
