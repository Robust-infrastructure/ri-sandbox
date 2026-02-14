/**
 * ri-sandbox — Executor resource enforcement tests
 *
 * Tests that the executor correctly enforces gas, timeout, and memory limits
 * when calling WASM functions through host function bridges.
 */

import { describe, it, expect } from 'vitest';
import { execute } from '../../execution/executor.js';
import type { InternalSandboxState } from '../../internal-types.js';
import type { SandboxConfig, ResourceMetrics } from '../../types.js';
import { hostCallWasmModule, addWasmModule, timeImportWasmModule, randomImportWasmModule } from '../../loader/__tests__/wasm-fixtures.js';
import { instantiate } from '../../loader/instantiator.js';
import { createPrng } from '../../determinism/random-injection.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultConfig: SandboxConfig = {
  maxMemoryBytes: 65_536,
  maxGas: 1_000_000,
  maxExecutionMs: 5000,
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
  executionLimitMs: 5000,
};

/**
 * Create a loaded InternalSandboxState using the real instantiator.
 * This ensures host functions are wrapped with gas/timeout interception.
 */
async function createLoadedState(
  wasmBytes: Uint8Array,
  config?: Partial<SandboxConfig>,
): Promise<InternalSandboxState> {
  const fullConfig: SandboxConfig = { ...defaultConfig, ...config };
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 1 });
  const module = await WebAssembly.compile(new Uint8Array(wasmBytes).buffer);

  // Build the state with the instantiator to get proper host function wrapping
  const state: InternalSandboxState = {
    id: 'test-0',
    config: Object.freeze(fullConfig),
    status: 'created',
    metrics: { ...defaultMetrics },
    wasmMemory: memory,
    wasmModule: null,
    wasmInstance: null,
    executionContext: null,
    prng: createPrng(fullConfig.deterministicSeed),
  };

  const result = await instantiate(state, module);
  if (!result.ok) {
    throw new Error(`Failed to instantiate: ${result.error.code}`);
  }

  return state;
}

// ---------------------------------------------------------------------------
// Gas metering
// ---------------------------------------------------------------------------

describe('execute — gas metering', () => {
  it('returns GAS_EXHAUSTED when host function call exceeds gas budget', async () => {
    // hostCallWasmModule calls env.double once, consuming 1 gas
    const state = await createLoadedState(hostCallWasmModule(), {
      maxGas: 0, // Impossible budget — any host call exhausts it
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
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('GAS_EXHAUSTED');
    }
  });

  it('reports gasUsed and gasLimit in GAS_EXHAUSTED error', async () => {
    const state = await createLoadedState(hostCallWasmModule(), {
      maxGas: 0,
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
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === 'GAS_EXHAUSTED') {
      expect(result.error.gasUsed).toBeGreaterThan(0);
      expect(result.error.gasLimit).toBe(0);
    }
  });

  it('restores status after gas exhaustion', async () => {
    const state = await createLoadedState(hostCallWasmModule(), {
      maxGas: 0,
      hostFunctions: {
        double: {
          name: 'double',
          params: ['i32'],
          results: ['i32'],
          handler: (...args: readonly number[]) => (args[0] ?? 0) * 2,
        },
      },
    });

    execute(state, 'callDouble', [5]);
    expect(state.status).toBe('loaded');
    expect(state.executionContext).toBeNull();
  });

  it('succeeds when within gas budget', async () => {
    const state = await createLoadedState(hostCallWasmModule(), {
      maxGas: 10,
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
  });

  it('tracks gasUsed in metrics on success', async () => {
    const state = await createLoadedState(hostCallWasmModule(), {
      maxGas: 100,
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
      expect(result.gasUsed).toBe(1); // 1 host call = 1 gas
    }
  });
});

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

describe('execute — timeout', () => {
  it('returns TIMEOUT when execution exceeds time limit', async () => {
    // Timer returns 0 on start(), then returns past-limit on subsequent calls (check())
    let callCount = 0;
    const timer = (): number => {
      callCount++;
      if (callCount <= 1) {
        return 0; // start() call
      }
      return 20; // check() call — past limit
    };

    const state = await createLoadedState(hostCallWasmModule(), {
      maxExecutionMs: 10,
      hostFunctions: {
        double: {
          name: 'double',
          params: ['i32'],
          results: ['i32'],
          handler: (...args: readonly number[]) => (args[0] ?? 0) * 2,
        },
      },
    });

    const result = execute(state, 'callDouble', [5], timer);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('TIMEOUT');
    }
  });

  it('restores status after timeout', async () => {
    let callCount = 0;
    const timer = (): number => {
      callCount++;
      if (callCount <= 1) {
        return 0;
      }
      return 20;
    };

    const state = await createLoadedState(hostCallWasmModule(), {
      maxExecutionMs: 10,
      hostFunctions: {
        double: {
          name: 'double',
          params: ['i32'],
          results: ['i32'],
          handler: (...args: readonly number[]) => (args[0] ?? 0) * 2,
        },
      },
    });

    execute(state, 'callDouble', [5], timer);
    expect(state.status).toBe('loaded');
    expect(state.executionContext).toBeNull();
  });

  it('succeeds when within time limit', async () => {
    let now = 0;
    const timer = (): number => now;

    const state = await createLoadedState(hostCallWasmModule(), {
      maxExecutionMs: 100,
      hostFunctions: {
        double: {
          name: 'double',
          params: ['i32'],
          results: ['i32'],
          handler: (...args: readonly number[]) => {
            now = 5;
            return (args[0] ?? 0) * 2;
          },
        },
      },
    });

    const result = execute(state, 'callDouble', [5], timer);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Memory limits
// ---------------------------------------------------------------------------

describe('execute — memory limits', () => {
  it('returns MEMORY_EXCEEDED when memory usage exceeds limit', async () => {
    // Create with 1 page (65536 bytes) but set limit to less than that
    const state = await createLoadedState(addWasmModule(), {
      maxMemoryBytes: 100, // Less than 1 page
    });

    const result = execute(state, 'add', [1, 2]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MEMORY_EXCEEDED');
    }
  });

  it('restores status after memory exceeded', async () => {
    const state = await createLoadedState(addWasmModule(), {
      maxMemoryBytes: 100,
    });

    execute(state, 'add', [1, 2]);
    expect(state.status).toBe('loaded');
    expect(state.executionContext).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Execution context lifecycle
// ---------------------------------------------------------------------------

describe('execute — execution context lifecycle', () => {
  it('clears executionContext after successful execution', async () => {
    const state = await createLoadedState(addWasmModule());
    expect(state.executionContext).toBeNull();

    execute(state, 'add', [1, 2]);
    expect(state.executionContext).toBeNull();
  });

  it('clears executionContext after error', async () => {
    const state = await createLoadedState(addWasmModule());
    state.status = 'destroyed';

    execute(state, 'add', [1, 2]);
    expect(state.executionContext).toBeNull();
  });

  it('updates metrics with gas and timing data on success', async () => {
    let now = 0;
    const timer = (): number => now;

    const state = await createLoadedState(hostCallWasmModule(), {
      maxGas: 100,
      maxExecutionMs: 100,
      hostFunctions: {
        double: {
          name: 'double',
          params: ['i32'],
          results: ['i32'],
          handler: (...args: readonly number[]) => {
            now = 5;
            return (args[0] ?? 0) * 2;
          },
        },
      },
    });

    const result = execute(state, 'callDouble', [5], timer);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.metrics.gasUsed).toBe(1);
      expect(result.metrics.gasLimit).toBe(100);
      expect(result.metrics.executionMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('updates state.metrics even on gas exhaustion', async () => {
    const state = await createLoadedState(hostCallWasmModule(), {
      maxGas: 0,
      hostFunctions: {
        double: {
          name: 'double',
          params: ['i32'],
          results: ['i32'],
          handler: (...args: readonly number[]) => (args[0] ?? 0) * 2,
        },
      },
    });

    execute(state, 'callDouble', [5]);
    // Metrics should be updated even on error
    expect(state.metrics.gasLimit).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Deterministic host functions (__get_time, __get_random)
// ---------------------------------------------------------------------------

describe('deterministic host functions', () => {
  it('__get_time returns the configured eventTimestamp', async () => {
    const state = await createLoadedState(timeImportWasmModule(), {
      eventTimestamp: 42,
    });
    const result = execute(state, 'getTime', null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it('__get_time returns same value on repeated calls', async () => {
    const state = await createLoadedState(timeImportWasmModule(), {
      eventTimestamp: 1700000000000,
    });
    const r1 = execute(state, 'getTime', null);
    const r2 = execute(state, 'getTime', null);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.value).toBe(r2.value);
    }
  });

  it('__get_random returns deterministic value from seeded PRNG', async () => {
    const state = await createLoadedState(randomImportWasmModule(), {
      deterministicSeed: 12345,
    });
    const result = execute(state, 'getRandom', null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.value).toBe('number');
    }
  });

  it('__get_random returns same value with same seed on separate instances', async () => {
    const state1 = await createLoadedState(randomImportWasmModule(), {
      deterministicSeed: 42,
    });
    const state2 = await createLoadedState(randomImportWasmModule(), {
      deterministicSeed: 42,
    });
    const r1 = execute(state1, 'getRandom', null);
    const r2 = execute(state2, 'getRandom', null);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.value).toBe(r2.value);
    }
  });

  it('__get_random returns different values with different seeds', async () => {
    const state1 = await createLoadedState(randomImportWasmModule(), {
      deterministicSeed: 1,
    });
    const state2 = await createLoadedState(randomImportWasmModule(), {
      deterministicSeed: 2,
    });
    const r1 = execute(state1, 'getRandom', null);
    const r2 = execute(state2, 'getRandom', null);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.value).not.toBe(r2.value);
    }
  });

  it('__get_time consumes gas', async () => {
    const state = await createLoadedState(timeImportWasmModule(), {
      eventTimestamp: 42,
      maxGas: 100,
    });
    const result = execute(state, 'getTime', null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Calling __get_time consumes 1 gas
      expect(result.gasUsed).toBe(1);
    }
  });

  it('__get_random consumes gas', async () => {
    const state = await createLoadedState(randomImportWasmModule(), {
      deterministicSeed: 42,
      maxGas: 100,
    });
    const result = execute(state, 'getRandom', null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Calling __get_random consumes 1 gas
      expect(result.gasUsed).toBe(1);
    }
  });
});
