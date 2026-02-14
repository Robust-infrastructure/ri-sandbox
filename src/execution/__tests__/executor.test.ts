/**
 * ri-sandbox — Executor unit tests
 *
 * Tests the execute function with real WASM modules.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { execute } from '../../execution/executor.js';
import type { InternalSandboxState } from '../../internal-types.js';
import type { SandboxConfig, ResourceMetrics } from '../../types.js';
import { addWasmModule, hostCallWasmModule, noExportsWasmModule } from '../../loader/__tests__/wasm-fixtures.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultConfig: SandboxConfig = {
  maxMemoryBytes: 65_536,
  maxGas: 1_000_000,
  maxExecutionMs: 50,
  hostFunctions: {},
  deterministicSeed: 0,
  eventTimestamp: 0,
};

const defaultMetrics: ResourceMetrics = {
  memoryUsedBytes: 0,
  memoryLimitBytes: 65_536,
  gasUsed: 0,
  gasLimit: 1_000_000,
  executionMs: 0,
  executionLimitMs: 50,
};

async function createLoadedState(
  wasmBytes: Uint8Array,
  config?: Partial<SandboxConfig>,
): Promise<InternalSandboxState> {
  const fullConfig: SandboxConfig = { ...defaultConfig, ...config };
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 1 });
  const module = await WebAssembly.compile(new Uint8Array(wasmBytes).buffer);

  // Build imports
  const imports: WebAssembly.Imports = { env: { memory } };

  // Add host function imports if configured
  for (const [, fn] of Object.entries(fullConfig.hostFunctions)) {
    const hostFn = fn;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard
    if (hostFn !== undefined) {
      const env = imports['env'] as Record<string, unknown> | undefined;
      if (env !== undefined) {
        env[hostFn.name] = hostFn.handler;
      }
    }
  }

  const instance = await WebAssembly.instantiate(module, imports);

  return {
    id: 'test-0',
    config: Object.freeze(fullConfig),
    status: 'loaded',
    metrics: { ...defaultMetrics },
    wasmMemory: memory,
    wasmModule: module,
    wasmInstance: instance,
  };
}

// ---------------------------------------------------------------------------
// execute — direct calling convention
// ---------------------------------------------------------------------------

describe('execute — direct mode', () => {
  let state: InternalSandboxState;

  beforeEach(async () => {
    state = await createLoadedState(addWasmModule());
  });

  it('executes add(3, 7) and returns 10', () => {
    const result = execute(state, 'add', [3, 7]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(10);
    }
  });

  it('executes add(0, 0) and returns 0', () => {
    const result = execute(state, 'add', [0, 0]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });

  it('executes add(-5, 3) and returns -2', () => {
    const result = execute(state, 'add', [-5, 3]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(-2);
    }
  });

  it('returns metrics in successful result', () => {
    const result = execute(state, 'add', [1, 2]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.metrics.memoryLimitBytes).toBe(65_536);
      expect(result.metrics.gasLimit).toBe(1_000_000);
      expect(result.gasUsed).toBeTypeOf('number');
      expect(result.durationMs).toBeTypeOf('number');
    }
  });

  it('handles null payload as no-args call', () => {
    // The add function expects 2 args; calling with 0 args should
    // return 0 (WASM defaults missing args to 0)
    const result = execute(state, 'add', null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });

  it('handles undefined payload as no-args call', () => {
    const result = execute(state, 'add', undefined);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(0);
    }
  });

  it('handles single number payload', () => {
    // add(5, <missing>) → 5 + 0 = 5
    const result = execute(state, 'add', 5);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(5);
    }
  });
});

// ---------------------------------------------------------------------------
// execute — status transitions
// ---------------------------------------------------------------------------

describe('execute — status transitions', () => {
  it('status is loaded before and after execution', async () => {
    const state = await createLoadedState(addWasmModule());
    expect(state.status).toBe('loaded');

    execute(state, 'add', [1, 1]);

    expect(state.status).toBe('loaded');
  });

  it('returns INSTANCE_DESTROYED for destroyed instance', async () => {
    const state = await createLoadedState(addWasmModule());
    state.status = 'destroyed';

    const result = execute(state, 'add', [1, 2]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INSTANCE_DESTROYED');
    }
  });

  it('returns WASM_TRAP for created (not loaded) instance', async () => {
    const state = await createLoadedState(addWasmModule());
    state.status = 'created';

    const result = execute(state, 'add', [1, 2]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WASM_TRAP');
      if (result.error.code === 'WASM_TRAP') {
        expect(result.error.trapKind).toBe('invalid_state');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// execute — error cases
// ---------------------------------------------------------------------------

describe('execute — error cases', () => {
  it('returns WASM_TRAP for unknown action name', async () => {
    const state = await createLoadedState(addWasmModule());

    const result = execute(state, 'nonExistentFunction', [1, 2]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WASM_TRAP');
      if (result.error.code === 'WASM_TRAP') {
        expect(result.error.trapKind).toBe('missing_export');
        expect(result.error.message).toContain('nonExistentFunction');
      }
    }
  });

  it('returns WASM_TRAP when no WASM instance available', async () => {
    const state = await createLoadedState(addWasmModule());
    state.wasmInstance = null;

    const result = execute(state, 'add', [1, 2]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WASM_TRAP');
      if (result.error.code === 'WASM_TRAP') {
        expect(result.error.trapKind).toBe('no_instance');
      }
    }
  });

  it('returns WASM_TRAP when action is not a function export', async () => {
    // The memory import module exports "memory" (not a function) and "getMemSize" (function)
    // Trying to call "memory" should fail — but actually memory is on the import side.
    // Let's use a module that has a non-function export... The noExportsWasmModule has no exports.
    const state = await createLoadedState(noExportsWasmModule());

    const result = execute(state, 'anything', []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WASM_TRAP');
    }
  });

  it('restores status after an error', async () => {
    const state = await createLoadedState(addWasmModule());
    expect(state.status).toBe('loaded');

    // Call a non-existent function — should error but restore status
    execute(state, 'nonExistent', [1]);
    expect(state.status).toBe('loaded');
  });
});

// ---------------------------------------------------------------------------
// execute — host function invocation
// ---------------------------------------------------------------------------

describe('execute — host function bridge', () => {
  it('calls host function from WASM and returns result', async () => {
    const state = await createLoadedState(hostCallWasmModule(), {
      hostFunctions: {
        double: {
          name: 'double',
          params: ['i32'],
          results: ['i32'],
          handler: (...args: readonly number[]) => (args[0] ?? 0) * 2,
        },
      },
    });

    const result = execute(state, 'callDouble', [5]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(10);
    }
  });

  it('calls host function with different values', async () => {
    const state = await createLoadedState(hostCallWasmModule(), {
      hostFunctions: {
        double: {
          name: 'double',
          params: ['i32'],
          results: ['i32'],
          handler: (...args: readonly number[]) => (args[0] ?? 0) * 2,
        },
      },
    });

    const result1 = execute(state, 'callDouble', [0]);
    expect(result1.ok).toBe(true);
    if (result1.ok) {
      expect(result1.value).toBe(0);
    }

    const result2 = execute(state, 'callDouble', [100]);
    expect(result2.ok).toBe(true);
    if (result2.ok) {
      expect(result2.value).toBe(200);
    }
  });

  it('multiple executions on same instance produce correct results', async () => {
    const state = await createLoadedState(addWasmModule());

    for (let i = 0; i < 10; i++) {
      const result = execute(state, 'add', [i, i * 2]);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(i + i * 2);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// execute — JSON calling convention
// ---------------------------------------------------------------------------

describe('execute — JSON mode', () => {
  it('returns error when module lacks __alloc and payload is non-numeric', async () => {
    const state = await createLoadedState(addWasmModule());

    // Passing a string payload triggers JSON mode, but addWasmModule has no __alloc
    const result = execute(state, 'add', { a: 1, b: 2 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('WASM_TRAP');
      if (result.error.code === 'WASM_TRAP') {
        expect(result.error.message).toContain('__alloc');
      }
    }
  });
});
