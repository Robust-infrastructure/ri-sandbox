/**
 * ri-sandbox — Full lifecycle integration tests.
 *
 * Tests the complete sandbox lifecycle: create → load → execute → destroy,
 * including multi-instance isolation, snapshot/restore, and error paths.
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
  counterWasmModule,
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('full lifecycle', () => {
  let sandbox: WasmSandbox;

  beforeEach(() => {
    resetInstanceCounter();
    sandbox = createWasmSandbox();
  });

  it('create → load → execute → read result → destroy', async () => {
    const config = makeConfig();
    const instance = sandbox.create(config);
    expect(instance.id).toBe('sandbox-0');
    expect(instance.status).toBe('created');

    await sandbox.load(instance, addWasmModule());

    const result = sandbox.execute(instance, 'add', [3, 7]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(10);
      expect(result.gasUsed).toBeGreaterThanOrEqual(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.metrics.memoryUsedBytes).toBeGreaterThan(0);
    }

    sandbox.destroy(instance);

    // Executing after destroy returns INSTANCE_DESTROYED
    const afterDestroy = sandbox.execute(instance, 'add', [1, 2]);
    expect(afterDestroy.ok).toBe(false);
    if (!afterDestroy.ok) {
      expect(afterDestroy.error.code).toBe('INSTANCE_DESTROYED');
    }
  });

  it('create → load → execute 100 times → verify determinism → destroy', async () => {
    const config = makeConfig({ deterministicSeed: 42 });
    const instance = sandbox.create(config);
    await sandbox.load(instance, addWasmModule());

    const results: unknown[] = [];
    for (let i = 0; i < 100; i++) {
      const result = sandbox.execute(instance, 'add', [i, i + 1]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        results.push(result.value);
      }
    }

    // All results should be deterministic: i + (i + 1) = 2i + 1
    for (let i = 0; i < 100; i++) {
      expect(results[i]).toBe(2 * i + 1);
    }

    sandbox.destroy(instance);
  });

  it('create → load → execute → snapshot → execute → restore → execute → compare', async () => {
    const config = makeConfig();
    const instance = sandbox.create(config);
    await sandbox.load(instance, addWasmModule());

    // Execute baseline
    const r1 = sandbox.execute(instance, 'add', [10, 20]);
    expect(r1.ok).toBe(true);

    // Snapshot state
    const snap = sandbox.snapshot(instance);
    expect(snap.byteLength).toBeGreaterThan(0);

    // Execute more (mutates gas/metrics state)
    sandbox.execute(instance, 'add', [100, 200]);
    sandbox.execute(instance, 'add', [1000, 2000]);

    // Restore to snapshot
    sandbox.restore(instance, snap);

    // Execute same computation — should produce same result
    const r2 = sandbox.execute(instance, 'add', [10, 20]);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r2.value).toBe(r1.value);
    }

    sandbox.destroy(instance);
  });

  it('multiple concurrent instances are independent and isolated', async () => {
    const instanceA = sandbox.create(makeConfig({ deterministicSeed: 1 }));
    const instanceB = sandbox.create(makeConfig({ deterministicSeed: 2 }));

    await sandbox.load(instanceA, counterWasmModule());
    await sandbox.load(instanceB, addWasmModule());

    // Operate on instance A — counter
    sandbox.execute(instanceA, 'increment', []);
    sandbox.execute(instanceA, 'increment', []);
    sandbox.execute(instanceA, 'increment', []);
    const counterResult = sandbox.execute(instanceA, 'get', []);
    expect(counterResult.ok).toBe(true);
    if (counterResult.ok) {
      expect(counterResult.value).toBe(3);
    }

    // Operate on instance B — add
    const addResult = sandbox.execute(instanceB, 'add', [42, 58]);
    expect(addResult.ok).toBe(true);
    if (addResult.ok) {
      expect(addResult.value).toBe(100);
    }

    // Instances have independent IDs
    expect(instanceA.id).not.toBe(instanceB.id);

    // Destroying one doesn't affect the other
    sandbox.destroy(instanceA);
    const afterDestroy = sandbox.execute(instanceB, 'add', [1, 1]);
    expect(afterDestroy.ok).toBe(true);
    if (afterDestroy.ok) {
      expect(afterDestroy.value).toBe(2);
    }

    sandbox.destroy(instanceB);
  });

  it('destroy instance → execute returns INSTANCE_DESTROYED', async () => {
    const instance = sandbox.create(makeConfig());
    await sandbox.load(instance, addWasmModule());

    // Execute succeeds before destroy
    const before = sandbox.execute(instance, 'add', [1, 2]);
    expect(before.ok).toBe(true);

    sandbox.destroy(instance);

    // Execute fails after destroy
    const after = sandbox.execute(instance, 'add', [1, 2]);
    expect(after.ok).toBe(false);
    if (!after.ok) {
      expect(after.error.code).toBe('INSTANCE_DESTROYED');
    }
  });

  it('stateful module preserves state across calls', async () => {
    const instance = sandbox.create(makeConfig());
    await sandbox.load(instance, counterWasmModule());

    // Counter starts at 0
    const r0 = sandbox.execute(instance, 'get', []);
    expect(r0.ok).toBe(true);
    if (r0.ok) {
      expect(r0.value).toBe(0);
    }

    // Increment 5 times
    for (let i = 0; i < 5; i++) {
      sandbox.execute(instance, 'increment', []);
    }

    // Counter should be 5
    const r5 = sandbox.execute(instance, 'get', []);
    expect(r5.ok).toBe(true);
    if (r5.ok) {
      expect(r5.value).toBe(5);
    }

    sandbox.destroy(instance);
  });

  it('destroy is idempotent', async () => {
    const instance = sandbox.create(makeConfig());
    await sandbox.load(instance, addWasmModule());

    sandbox.destroy(instance);
    // Second destroy should not throw
    expect(() => {
      sandbox.destroy(instance);
    }).not.toThrow();
  });

  it('getMetrics returns valid metrics after execution', async () => {
    const gasLimit = 500_000;
    const instance = sandbox.create(makeConfig({ maxGas: gasLimit }));
    await sandbox.load(instance, memoryImportWasmModule());

    sandbox.execute(instance, 'getMemSize', []);

    const metrics = sandbox.getMetrics(instance);
    expect(metrics.memoryUsedBytes).toBeGreaterThan(0);
    expect(metrics.memoryLimitBytes).toBe(DEFAULT_MAX_MEMORY_BYTES);
    expect(metrics.gasUsed).toBeGreaterThanOrEqual(0);
    expect(metrics.gasLimit).toBe(gasLimit);
    expect(metrics.executionMs).toBeGreaterThanOrEqual(0);
    expect(metrics.executionLimitMs).toBe(DEFAULT_MAX_EXECUTION_MS);

    sandbox.destroy(instance);
  });
});
