/**
 * ri-sandbox — Resource limits integration tests.
 *
 * Tests gas exhaustion, memory limits, timeout, and combined limit behaviour.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createWasmSandbox } from '../../src/sandbox.js';
import { resetInstanceCounter } from '../../src/loader/instance-factory.js';
import type { SandboxConfig, WasmSandbox } from '../../src/types.js';
import {
  DEFAULT_MAX_MEMORY_BYTES,
  DEFAULT_MAX_GAS,
  DEFAULT_MAX_EXECUTION_MS,
  DEFAULT_DETERMINISTIC_SEED,
} from '../../src/types.js';
import {
  addWasmModule,
  fibonacciWasmModule,
  memoryHogWasmModule,
  infiniteLoopWasmModule,
} from '../../src/loader/__tests__/wasm-fixtures.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<SandboxConfig>): SandboxConfig {
  return {
    maxMemoryBytes: DEFAULT_MAX_MEMORY_BYTES,
    maxGas: DEFAULT_MAX_GAS,
    maxExecutionMs: DEFAULT_MAX_EXECUTION_MS,
    hostFunctions: {},
    deterministicSeed: DEFAULT_DETERMINISTIC_SEED,
    eventTimestamp: 1_700_000_000_000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resource limits', () => {
  let sandbox: WasmSandbox;

  beforeEach(() => {
    resetInstanceCounter();
    sandbox = createWasmSandbox();
  });

  it('gas exhaustion: fibonacci with low gas limit → GAS_EXHAUSTED', async () => {
    // fib(100) consumes 101 gas ticks. With maxGas=50, it exhausts gas.
    const instance = sandbox.create(
      makeConfig({ maxGas: 50, maxExecutionMs: 5_000 }),
    );
    await sandbox.load(instance, fibonacciWasmModule());

    const result = sandbox.execute(instance, 'fib', 100);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('GAS_EXHAUSTED');
      if (result.error.code === 'GAS_EXHAUSTED') {
        expect(result.error.gasUsed).toBeGreaterThanOrEqual(50);
        expect(result.error.gasLimit).toBe(50);
      }
    }

    sandbox.destroy(instance);
  });

  it('memory limit: memory-hog exceeding limit → MEMORY_EXCEEDED', async () => {
    // maxMemoryBytes=100_000 → maximum 2 pages. Growing from 1→2 pages
    // gives 131072 bytes > 100000 → MEMORY_EXCEEDED.
    const instance = sandbox.create(
      makeConfig({ maxMemoryBytes: 100_000 }),
    );
    await sandbox.load(instance, memoryHogWasmModule());

    const result = sandbox.execute(instance, 'allocate', 1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MEMORY_EXCEEDED');
      if (result.error.code === 'MEMORY_EXCEEDED') {
        expect(result.error.memoryUsed).toBeGreaterThan(100_000);
        expect(result.error.memoryLimit).toBe(100_000);
      }
    }

    sandbox.destroy(instance);
  });

  it('timeout: infinite loop with short timeout → TIMEOUT', async () => {
    // Very high gas (1B) so gas doesn't exhaust before timeout.
    // The infinite loop calls __get_time each iteration, which checks timeout.
    const instance = sandbox.create(
      makeConfig({ maxGas: 1_000_000_000, maxExecutionMs: 100 }),
    );
    await sandbox.load(instance, infiniteLoopWasmModule());

    const result = sandbox.execute(instance, 'loop', []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TIMEOUT');
      if (result.error.code === 'TIMEOUT') {
        expect(result.error.elapsedMs).toBeGreaterThanOrEqual(0);
        expect(result.error.limitMs).toBe(100);
      }
    }

    sandbox.destroy(instance);
  });

  it('gas limit hit first when both gas and timeout are limited', async () => {
    // Very low gas (10) and generous timeout (5000ms).
    // Gas exhausts long before timeout.
    const instance = sandbox.create(
      makeConfig({ maxGas: 10, maxExecutionMs: 5_000 }),
    );
    await sandbox.load(instance, infiniteLoopWasmModule());

    const result = sandbox.execute(instance, 'loop', []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('GAS_EXHAUSTED');
    }

    sandbox.destroy(instance);
  });

  it('generous limits: execution succeeds normally', async () => {
    // High gas, generous timeout, plenty of memory.
    const instance = sandbox.create(
      makeConfig({
        maxGas: 1_000_000,
        maxExecutionMs: 5_000,
        maxMemoryBytes: DEFAULT_MAX_MEMORY_BYTES,
      }),
    );
    await sandbox.load(instance, fibonacciWasmModule());

    // fib(20) = 6765, consumes 21 gas
    const result = sandbox.execute(instance, 'fib', 20);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(6765);
      expect(result.gasUsed).toBe(21);
    }

    sandbox.destroy(instance);
  });

  it('fib(10) = 55 with sufficient gas', async () => {
    const instance = sandbox.create(
      makeConfig({ maxGas: 1_000_000, maxExecutionMs: 5_000 }),
    );
    await sandbox.load(instance, fibonacciWasmModule());

    const result = sandbox.execute(instance, 'fib', 10);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(55);
    }

    sandbox.destroy(instance);
  });

  it('memory growth within limit succeeds', async () => {
    // 3 pages = 196608 bytes. Growing from 1→2 pages stays within limit.
    const instance = sandbox.create(
      makeConfig({ maxMemoryBytes: 196_608 }),
    );
    await sandbox.load(instance, memoryHogWasmModule());

    const result = sandbox.execute(instance, 'allocate', 1);
    expect(result.ok).toBe(true);

    // Verify memory grew
    const sizeResult = sandbox.execute(instance, 'getMemSize', []);
    expect(sizeResult.ok).toBe(true);
    if (sizeResult.ok) {
      expect(sizeResult.value).toBe(2); // 2 pages
    }

    sandbox.destroy(instance);
  });

  it('add function consumes no gas (no host function calls)', async () => {
    const instance = sandbox.create(
      makeConfig({ maxGas: 1_000_000 }),
    );
    await sandbox.load(instance, addWasmModule());

    const result = sandbox.execute(instance, 'add', [3, 7]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(10);
      // add doesn't call host functions, so gasUsed should be 0
      expect(result.gasUsed).toBe(0);
    }

    sandbox.destroy(instance);
  });
});
