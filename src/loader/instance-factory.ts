/**
 * ri-sandbox — Sandbox instance creation.
 *
 * Creates a new sandbox instance with configured memory and initial metrics.
 */

import type { SandboxConfig, SandboxInstance } from '../types.js';
import type { InternalSandboxState } from '../internal-types.js';
import { bytesToPages } from '../internal-types.js';
import { createPrng } from '../determinism/random-injection.js';

/** Counter for deterministic ID generation. */
let instanceCounter = 0;

/** Reset the instance counter (for testing only). */
export function resetInstanceCounter(): void {
  instanceCounter = 0;
}

/**
 * Create a new sandbox instance with the given configuration.
 *
 * Allocates `WebAssembly.Memory` with pages derived from `maxMemoryBytes`.
 * Returns both the public `SandboxInstance` and the internal mutable state.
 */
export function createSandboxInstance(config: SandboxConfig): {
  readonly instance: SandboxInstance;
  readonly state: InternalSandboxState;
} {
  const id = `sandbox-${String(instanceCounter)}`;
  instanceCounter += 1;

  const maxPages = bytesToPages(config.maxMemoryBytes);
  const wasmMemory = new WebAssembly.Memory({ initial: 1, maximum: maxPages });

  const state: InternalSandboxState = {
    id,
    config,
    status: 'created',
    metrics: {
      memoryUsedBytes: wasmMemory.buffer.byteLength,
      memoryLimitBytes: config.maxMemoryBytes,
      gasUsed: 0,
      gasLimit: config.maxGas,
      executionMs: 0,
      executionLimitMs: config.maxExecutionMs,
    },
    wasmMemory,
    wasmModule: null,
    wasmInstance: null,
    executionContext: null,
    prng: createPrng(config.deterministicSeed),
  };

  const instance: SandboxInstance = {
    id: state.id,
    config: Object.freeze({ ...config }),
    status: state.status,
    metrics: { ...state.metrics },
  };

  return { instance, state };
}
