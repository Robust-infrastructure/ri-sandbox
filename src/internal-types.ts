/**
 * ri-sandbox — Internal types
 *
 * Mutable internal state backing the public readonly SandboxInstance interface.
 * These types are NOT exported from the package.
 */

import type { SandboxConfig, SandboxStatus, ResourceMetrics } from './types.js';
import type { ExecutionContext } from './resources/resource-tracker.js';
import type { Prng } from './determinism/random-injection.js';

/** WASM page size in bytes (64 KB). */
export const WASM_PAGE_SIZE = 65_536;

/** Mutable internal state for a sandbox instance. */
export interface InternalSandboxState {
  readonly id: string;
  readonly config: Readonly<SandboxConfig>;
  status: SandboxStatus;
  metrics: ResourceMetrics;
  wasmMemory: WebAssembly.Memory | null;
  wasmModule: WebAssembly.Module | null;
  wasmInstance: WebAssembly.Instance | null;
  /** Set per-execution by the executor; host function wrappers read this. */
  executionContext: ExecutionContext | null;
  /** Deterministic PRNG — initialized from config.deterministicSeed. */
  prng: Prng | null;
}

/** Convert bytes to WASM page count (each page = 64 KB). */
export function bytesToPages(bytes: number): number {
  return Math.ceil(bytes / WASM_PAGE_SIZE);
}
