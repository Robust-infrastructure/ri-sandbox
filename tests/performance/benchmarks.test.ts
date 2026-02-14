/**
 * ri-sandbox — Performance benchmarks.
 *
 * Validates that critical operations complete within acceptable time bounds.
 * Uses relaxed thresholds to avoid flakiness while ensuring no regressions.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createWasmSandbox } from '../../src/sandbox.js';
import { resetInstanceCounter } from '../../src/loader/instance-factory.js';
import type { SandboxConfig, WasmSandbox, SandboxInstance } from '../../src/types.js';
import {
  DEFAULT_MAX_MEMORY_BYTES,
  DEFAULT_MAX_GAS,
  DEFAULT_MAX_EXECUTION_MS,
  DEFAULT_DETERMINISTIC_SEED,
} from '../../src/types.js';
import {
  addWasmModule,
  fibonacciWasmModule,
  memoryImportWasmModule,
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

function measureMs(fn: () => void): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}

async function measureMsAsync(fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('performance benchmarks', () => {
  let sandbox: WasmSandbox;

  beforeEach(() => {
    resetInstanceCounter();
    sandbox = createWasmSandbox();
  });

  it('create sandbox instance: < 5ms', () => {
    const elapsed = measureMs(() => {
      sandbox.create(makeConfig());
    });
    expect(elapsed).toBeLessThan(5);
  });

  it('load WASM module: < 50ms', async () => {
    const instance = sandbox.create(makeConfig());
    const elapsed = await measureMsAsync(async () => {
      await sandbox.load(instance, addWasmModule());
    });
    expect(elapsed).toBeLessThan(50);
    sandbox.destroy(instance);
  });

  it('execute simple function (add): < 1ms', async () => {
    const instance = sandbox.create(makeConfig());
    await sandbox.load(instance, addWasmModule());

    // Warm up
    sandbox.execute(instance, 'add', [1, 1]);

    const elapsed = measureMs(() => {
      sandbox.execute(instance, 'add', [3, 7]);
    });
    expect(elapsed).toBeLessThan(1);

    sandbox.destroy(instance);
  });

  it('execute complex function (fibonacci 20): < 50ms', async () => {
    const instance = sandbox.create(
      makeConfig({ maxGas: 1_000_000, maxExecutionMs: 5_000 }),
    );
    await sandbox.load(instance, fibonacciWasmModule());

    const elapsed = measureMs(() => {
      const result = sandbox.execute(instance, 'fib', 20);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(6765);
      }
    });
    expect(elapsed).toBeLessThan(50);

    sandbox.destroy(instance);
  });

  it('snapshot: < 10ms', async () => {
    const instance = sandbox.create(makeConfig());
    await sandbox.load(instance, memoryImportWasmModule());
    sandbox.execute(instance, 'getMemSize', []);

    const elapsed = measureMs(() => {
      sandbox.snapshot(instance);
    });
    expect(elapsed).toBeLessThan(10);

    sandbox.destroy(instance);
  });

  it('restore: < 10ms', async () => {
    const instance = sandbox.create(makeConfig());
    await sandbox.load(instance, memoryImportWasmModule());
    sandbox.execute(instance, 'getMemSize', []);
    const snap = sandbox.snapshot(instance);

    const elapsed = measureMs(() => {
      sandbox.restore(instance, snap);
    });
    expect(elapsed).toBeLessThan(10);

    sandbox.destroy(instance);
  });

  it('create + load + execute end-to-end: < 100ms', async () => {
    const elapsed = await measureMsAsync(async () => {
      const instance = sandbox.create(makeConfig());
      await sandbox.load(instance, addWasmModule());
      const result = sandbox.execute(instance, 'add', [1, 2]);
      expect(result.ok).toBe(true);
      sandbox.destroy(instance);
    });
    expect(elapsed).toBeLessThan(100);
  });

  it('10 concurrent instances: all functional', async () => {
    const instances: SandboxInstance[] = [];

    // Create and load 10 instances
    for (let i = 0; i < 10; i++) {
      const instance = sandbox.create(
        makeConfig({ deterministicSeed: i }),
      );
      await sandbox.load(instance, addWasmModule());
      instances.push(instance);
    }

    // Execute on all 10
    for (let i = 0; i < instances.length; i++) {
      const instance = instances[i];
      if (instance === undefined) continue;
      const result = sandbox.execute(instance, 'add', [i, i * 10]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(i + i * 10);
      }
    }

    // Cleanup
    for (const instance of instances) {
      sandbox.destroy(instance);
    }
  });
});
