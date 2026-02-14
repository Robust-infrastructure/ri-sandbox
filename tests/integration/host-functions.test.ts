/**
 * ri-sandbox — Host function integration tests.
 *
 * Tests host function injection, multi-function binding,
 * error propagation, and missing-function rejection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createWasmSandbox } from '../../src/sandbox.js';
import { resetInstanceCounter } from '../../src/loader/instance-factory.js';
import type { SandboxConfig, WasmSandbox, HostFunction } from '../../src/types.js';
import {
  DEFAULT_MAX_MEMORY_BYTES,
  DEFAULT_MAX_GAS,
  DEFAULT_MAX_EXECUTION_MS,
  DEFAULT_DETERMINISTIC_SEED,
} from '../../src/types.js';
import {
  hostCallWasmModule,
  multiHostCallWasmModule,
  undeclaredImportWasmModule,
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

function makeHostFn(
  name: string,
  handler: (...args: readonly number[]) => number | undefined,
): HostFunction {
  return {
    name,
    params: ['i32'],
    results: ['i32'],
    handler,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('host functions', () => {
  let sandbox: WasmSandbox;

  beforeEach(() => {
    resetInstanceCounter();
    sandbox = createWasmSandbox();
  });

  it('host function called from WASM: correct arguments and return', async () => {
    const config = makeConfig({
      hostFunctions: {
        double: makeHostFn('double', (n) => n * 2),
      },
    });
    const instance = sandbox.create(config);
    await sandbox.load(instance, hostCallWasmModule());

    // callDouble(7) should return double(7) = 14
    const result = sandbox.execute(instance, 'callDouble', 7);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(14);
    }

    sandbox.destroy(instance);
  });

  it('host function receives correct argument values', async () => {
    const receivedArgs: number[] = [];
    const config = makeConfig({
      hostFunctions: {
        double: makeHostFn('double', (n) => {
          receivedArgs.push(n);
          return n * 2;
        }),
      },
    });
    const instance = sandbox.create(config);
    await sandbox.load(instance, hostCallWasmModule());

    sandbox.execute(instance, 'callDouble', 42);
    expect(receivedArgs).toEqual([42]);

    sandbox.execute(instance, 'callDouble', 0);
    expect(receivedArgs).toEqual([42, 0]);

    sandbox.destroy(instance);
  });

  it('multiple host functions: all callable', async () => {
    const config = makeConfig({
      hostFunctions: {
        double: makeHostFn('double', (n) => n * 2),
        triple: makeHostFn('triple', (n) => n * 3),
      },
    });
    const instance = sandbox.create(config);
    await sandbox.load(instance, multiHostCallWasmModule());

    // callBoth(5) = double(5) + triple(5) = 10 + 15 = 25
    const result = sandbox.execute(instance, 'callBoth', 5);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(25);
    }

    sandbox.destroy(instance);
  });

  it('multiple host function calls with different inputs', async () => {
    const config = makeConfig({
      hostFunctions: {
        double: makeHostFn('double', (n) => n * 2),
        triple: makeHostFn('triple', (n) => n * 3),
      },
    });
    const instance = sandbox.create(config);
    await sandbox.load(instance, multiHostCallWasmModule());

    // callBoth(10) = 20 + 30 = 50
    const r1 = sandbox.execute(instance, 'callBoth', 10);
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      expect(r1.value).toBe(50);
    }

    // callBoth(0) = 0 + 0 = 0
    const r2 = sandbox.execute(instance, 'callBoth', 0);
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.value).toBe(0);
    }

    sandbox.destroy(instance);
  });

  it('host function throws: error propagated through WASM execution', async () => {
    const config = makeConfig({
      hostFunctions: {
        double: makeHostFn('double', () => {
          throw new Error('intentional host error');
        }),
      },
    });
    const instance = sandbox.create(config);
    await sandbox.load(instance, hostCallWasmModule());

    const result = sandbox.execute(instance, 'callDouble', 5);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Host function errors surface as WASM_TRAP (caught by executor)
      expect(result.error.code).toBe('WASM_TRAP');
      if (result.error.code === 'WASM_TRAP') {
        expect(result.error.message).toContain('double');
        expect(result.error.message).toContain('intentional host error');
      }
    }

    sandbox.destroy(instance);
  });

  it('missing host function: load rejects with import validation error', async () => {
    // undeclaredImportWasmModule imports env.undeclared_fn, which is not
    // in hostFunctions — should fail during load.
    const config = makeConfig({ hostFunctions: {} });
    const instance = sandbox.create(config);

    await expect(
      sandbox.load(instance, undeclaredImportWasmModule()),
    ).rejects.toThrow(/[Ii]mport|undeclared/);

    sandbox.destroy(instance);
  });

  it('host function consumes gas on each call', async () => {
    const config = makeConfig({
      maxGas: 1_000_000,
      hostFunctions: {
        double: makeHostFn('double', (n) => n * 2),
      },
    });
    const instance = sandbox.create(config);
    await sandbox.load(instance, hostCallWasmModule());

    const result = sandbox.execute(instance, 'callDouble', 5);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Each host function call consumes 1 gas
      expect(result.gasUsed).toBeGreaterThanOrEqual(1);
    }

    sandbox.destroy(instance);
  });
});
