/**
 * ri-sandbox — Resource tracker unit tests
 *
 * Tests ExecutionContext creation and ResourceMetrics building.
 */

import { describe, it, expect } from 'vitest';
import { createExecutionContext, buildResourceMetrics } from '../resource-tracker.js';

// ---------------------------------------------------------------------------
// createExecutionContext
// ---------------------------------------------------------------------------

describe('createExecutionContext', () => {
  it('creates context with gas meter at configured limit', () => {
    const ctx = createExecutionContext({
      maxGas: 500,
      maxExecutionMs: 100,
      maxMemoryBytes: 65_536,
    });

    expect(ctx.gasMeter.gasLimit).toBe(500);
    expect(ctx.gasMeter.gasUsed).toBe(0);
    expect(ctx.gasMeter.isExhausted).toBe(false);
  });

  it('creates context with timeout checker at configured limit', () => {
    const ctx = createExecutionContext({
      maxGas: 500,
      maxExecutionMs: 200,
      maxMemoryBytes: 65_536,
    });

    expect(ctx.timeoutChecker.limitMs).toBe(200);
    expect(ctx.timeoutChecker.elapsedMs).toBe(0);
    expect(ctx.timeoutChecker.isTimedOut).toBe(false);
  });

  it('creates context with empty host errors', () => {
    const ctx = createExecutionContext({
      maxGas: 500,
      maxExecutionMs: 100,
      maxMemoryBytes: 65_536,
    });

    expect(ctx.hostErrors).toEqual([]);
  });

  it('uses injectable timer function', () => {
    let now = 0;
    const timer = (): number => now;

    const ctx = createExecutionContext({
      maxGas: 500,
      maxExecutionMs: 100,
      maxMemoryBytes: 65_536,
      timer,
    });

    ctx.timeoutChecker.start();
    now = 42;
    expect(ctx.timeoutChecker.elapsedMs).toBe(42);
  });

  it('gas meter and timeout checker are independent', () => {
    const ctx = createExecutionContext({
      maxGas: 10,
      maxExecutionMs: 100,
      maxMemoryBytes: 65_536,
    });

    // Exhaust gas
    try {
      ctx.gasMeter.consume(11);
    } catch {
      // expected
    }

    // Timeout checker should still be fine
    expect(ctx.timeoutChecker.isTimedOut).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildResourceMetrics
// ---------------------------------------------------------------------------

describe('buildResourceMetrics', () => {
  it('builds metrics from context and memory', () => {
    let now = 0;
    const timer = (): number => now;

    const ctx = createExecutionContext({
      maxGas: 1000,
      maxExecutionMs: 50,
      maxMemoryBytes: 65_536,
      timer,
    });

    ctx.timeoutChecker.start();
    ctx.gasMeter.consume(42);
    now = 10;

    const memory = new WebAssembly.Memory({ initial: 1 });
    const metrics = buildResourceMetrics(ctx, memory, {
      maxGas: 1000,
      maxExecutionMs: 50,
      maxMemoryBytes: 65_536,
    });

    expect(metrics.gasUsed).toBe(42);
    expect(metrics.gasLimit).toBe(1000);
    expect(metrics.executionMs).toBe(10);
    expect(metrics.executionLimitMs).toBe(50);
    expect(metrics.memoryUsedBytes).toBe(65_536);
    expect(metrics.memoryLimitBytes).toBe(65_536);
  });

  it('builds metrics with null memory', () => {
    const ctx = createExecutionContext({
      maxGas: 100,
      maxExecutionMs: 50,
      maxMemoryBytes: 65_536,
    });

    const metrics = buildResourceMetrics(ctx, null, {
      maxGas: 100,
      maxExecutionMs: 50,
      maxMemoryBytes: 65_536,
    });

    expect(metrics.memoryUsedBytes).toBe(0);
    expect(metrics.memoryLimitBytes).toBe(65_536);
  });

  it('reflects gas consumed during execution', () => {
    const ctx = createExecutionContext({
      maxGas: 100,
      maxExecutionMs: 50,
      maxMemoryBytes: 65_536,
    });

    ctx.gasMeter.consume(10);
    ctx.gasMeter.consume(20);
    ctx.gasMeter.consume(30);

    const metrics = buildResourceMetrics(ctx, null, {
      maxGas: 100,
      maxExecutionMs: 50,
      maxMemoryBytes: 65_536,
    });

    expect(metrics.gasUsed).toBe(60);
  });

  it('produces deterministic results for same inputs', () => {
    let now1 = 0;
    let now2 = 0;
    const timer1 = (): number => now1;
    const timer2 = (): number => now2;

    const config = {
      maxGas: 100,
      maxExecutionMs: 50,
      maxMemoryBytes: 65_536,
    };

    const ctx1 = createExecutionContext({ ...config, timer: timer1 });
    const ctx2 = createExecutionContext({ ...config, timer: timer2 });

    ctx1.timeoutChecker.start();
    ctx2.timeoutChecker.start();

    ctx1.gasMeter.consume(25);
    ctx2.gasMeter.consume(25);

    now1 = 15;
    now2 = 15;

    const mem1 = new WebAssembly.Memory({ initial: 1 });
    const mem2 = new WebAssembly.Memory({ initial: 1 });

    const m1 = buildResourceMetrics(ctx1, mem1, config);
    const m2 = buildResourceMetrics(ctx2, mem2, config);

    expect(m1.gasUsed).toBe(m2.gasUsed);
    expect(m1.executionMs).toBe(m2.executionMs);
    expect(m1.memoryUsedBytes).toBe(m2.memoryUsedBytes);
  });
});
