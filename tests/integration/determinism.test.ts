/**
 * ri-sandbox — Determinism integration tests.
 *
 * Verifies that identical inputs produce identical outputs across
 * multiple sandbox instances, seeds, and snapshot/restore cycles.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createWasmSandbox } from '../../src/sandbox.js';
import { resetInstanceCounter } from '../../src/loader/instance-factory.js';
import type { SandboxConfig } from '../../src/types.js';
import {
  DEFAULT_MAX_MEMORY_BYTES,
  DEFAULT_MAX_GAS,
  DEFAULT_MAX_EXECUTION_MS,
  DEFAULT_DETERMINISTIC_SEED,
} from '../../src/types.js';
import {
  addWasmModule,
  fibonacciWasmModule,
  randomImportWasmModule,
  timeImportWasmModule,
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

describe('determinism', () => {
  beforeEach(() => {
    resetInstanceCounter();
  });

  it('same module + same config + same action → identical result (100 repetitions)', async () => {
    const config = makeConfig({ deterministicSeed: 42 });
    const results: unknown[] = [];

    for (let i = 0; i < 100; i++) {
      resetInstanceCounter();
      const sandbox = createWasmSandbox();
      const instance = sandbox.create(config);
      await sandbox.load(instance, addWasmModule());

      const result = sandbox.execute(instance, 'add', [17, 25]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        results.push(result.value);
      }

      sandbox.destroy(instance);
    }

    // All 100 results must be identical
    const first = results[0];
    expect(first).toBe(42);
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBe(first);
    }
  });

  it('same fibonacci computation is deterministic across instances', async () => {
    const results: unknown[] = [];

    for (let i = 0; i < 10; i++) {
      resetInstanceCounter();
      const sandbox = createWasmSandbox();
      const instance = sandbox.create(
        makeConfig({ maxGas: 1_000_000, maxExecutionMs: 5_000 }),
      );
      await sandbox.load(instance, fibonacciWasmModule());

      const result = sandbox.execute(instance, 'fib', 20);
      expect(result.ok).toBe(true);
      if (result.ok) {
        results.push(result.value);
      }

      sandbox.destroy(instance);
    }

    // All results must equal fib(20) = 6765
    for (const r of results) {
      expect(r).toBe(6765);
    }
  });

  it('different deterministicSeed → different random outputs', async () => {
    const resultsBySeed = new Map<number, unknown>();

    for (const seed of [0, 1, 42, 12345, 999999]) {
      resetInstanceCounter();
      const sandbox = createWasmSandbox();
      const instance = sandbox.create(
        makeConfig({ deterministicSeed: seed }),
      );
      await sandbox.load(instance, randomImportWasmModule());

      const result = sandbox.execute(instance, 'getRandom', []);
      expect(result.ok).toBe(true);
      if (result.ok) {
        resultsBySeed.set(seed, result.value);
      }

      sandbox.destroy(instance);
    }

    // Different seeds should produce different random values
    const values = [...resultsBySeed.values()];
    const unique = new Set(values);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('same deterministicSeed → same random output', async () => {
    const results: unknown[] = [];

    for (let i = 0; i < 10; i++) {
      resetInstanceCounter();
      const sandbox = createWasmSandbox();
      const instance = sandbox.create(
        makeConfig({ deterministicSeed: 42 }),
      );
      await sandbox.load(instance, randomImportWasmModule());

      const result = sandbox.execute(instance, 'getRandom', []);
      expect(result.ok).toBe(true);
      if (result.ok) {
        results.push(result.value);
      }

      sandbox.destroy(instance);
    }

    // All 10 random results with the same seed must be identical
    const first = results[0];
    for (const r of results) {
      expect(r).toBe(first);
    }
  });

  it('different eventTimestamp → different time outputs', async () => {
    const resultsByTimestamp = new Map<number, unknown>();

    for (const ts of [1_000_000_000_000, 1_500_000_000_000, 1_700_000_000_000]) {
      resetInstanceCounter();
      const sandbox = createWasmSandbox();
      const instance = sandbox.create(
        makeConfig({ eventTimestamp: ts }),
      );
      await sandbox.load(instance, timeImportWasmModule());

      const result = sandbox.execute(instance, 'getTime', []);
      expect(result.ok).toBe(true);
      if (result.ok) {
        resultsByTimestamp.set(ts, result.value);
      }

      sandbox.destroy(instance);
    }

    // Different timestamps should produce different time values
    const values = [...resultsByTimestamp.values()];
    const unique = new Set(values);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('same eventTimestamp → same time output', async () => {
    const results: unknown[] = [];

    for (let i = 0; i < 10; i++) {
      resetInstanceCounter();
      const sandbox = createWasmSandbox();
      const instance = sandbox.create(
        makeConfig({ eventTimestamp: 1_700_000_000_000 }),
      );
      await sandbox.load(instance, timeImportWasmModule());

      const result = sandbox.execute(instance, 'getTime', []);
      expect(result.ok).toBe(true);
      if (result.ok) {
        results.push(result.value);
      }

      sandbox.destroy(instance);
    }

    const first = results[0];
    for (const r of results) {
      expect(r).toBe(first);
    }
  });

  it('snapshot → restore → execute → compare: identical', async () => {
    resetInstanceCounter();
    const sandbox = createWasmSandbox();
    const instance = sandbox.create(
      makeConfig({ deterministicSeed: 42 }),
    );
    await sandbox.load(instance, randomImportWasmModule());

    // Execute to get a random value and advance PRNG state
    const r1 = sandbox.execute(instance, 'getRandom', []);
    expect(r1.ok).toBe(true);

    // Snapshot after first execution
    const snap = sandbox.snapshot(instance);

    // Execute to get second random value
    const r2 = sandbox.execute(instance, 'getRandom', []);
    expect(r2.ok).toBe(true);

    // Execute more (advance PRNG further)
    sandbox.execute(instance, 'getRandom', []);
    sandbox.execute(instance, 'getRandom', []);

    // Restore to snapshot (after r1, before r2)
    sandbox.restore(instance, snap);

    // Execute again — should get same value as r2
    const r3 = sandbox.execute(instance, 'getRandom', []);
    expect(r3.ok).toBe(true);
    if (r2.ok && r3.ok) {
      expect(r3.value).toBe(r2.value);
    }

    sandbox.destroy(instance);
  });

  it('sequential random values with same seed are consistent', async () => {
    // Run the same sequence twice with the same seed
    const sequences: unknown[][] = [];

    for (let run = 0; run < 2; run++) {
      resetInstanceCounter();
      const sandbox = createWasmSandbox();
      const instance = sandbox.create(
        makeConfig({ deterministicSeed: 12345 }),
      );
      await sandbox.load(instance, randomImportWasmModule());

      const seq: unknown[] = [];
      for (let i = 0; i < 10; i++) {
        const result = sandbox.execute(instance, 'getRandom', []);
        expect(result.ok).toBe(true);
        if (result.ok) {
          seq.push(result.value);
        }
      }
      sequences.push(seq);
      sandbox.destroy(instance);
    }

    // Both sequences must be identical
    expect(sequences[0]).toEqual(sequences[1]);
  });
});
