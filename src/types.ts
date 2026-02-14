/**
 * ri-sandbox — Core type definitions
 *
 * All public types for deterministic WASM execution with resource limits,
 * isolation, and snapshot/restore.
 */

// ---------------------------------------------------------------------------
// Result Type
// ---------------------------------------------------------------------------

/** Success branch of a Result. */
export interface ResultOk<T> {
  readonly ok: true;
  readonly value: T;
}

/** Failure branch of a Result. */
export interface ResultErr<E> {
  readonly ok: false;
  readonly error: E;
}

/** Discriminated union for fallible operations. */
export type Result<T, E> = ResultOk<T> | ResultErr<E>;

// ---------------------------------------------------------------------------
// WASM Value Types
// ---------------------------------------------------------------------------

/** WASM value types supported for host function parameters and returns. */
export type WasmValueType = 'i32' | 'i64' | 'f32' | 'f64';

// ---------------------------------------------------------------------------
// Host Functions
// ---------------------------------------------------------------------------

/** A function injected from the host into the WASM sandbox. */
export interface HostFunction {
  /** Function name as seen from WASM. */
  readonly name: string;
  /** Parameter types for the function. */
  readonly params: readonly WasmValueType[];
  /** Return types for the function. */
  readonly results: readonly WasmValueType[];
  /** The actual implementation called when WASM invokes this function. */
  readonly handler: (...args: readonly number[]) => number | undefined;
}

/** Map of module names to host functions available for WASM imports. */
export type HostFunctionMap = Readonly<Record<string, HostFunction>>;

// ---------------------------------------------------------------------------
// Sandbox Configuration
// ---------------------------------------------------------------------------

/** Default values for SandboxConfig. */
export const DEFAULT_MAX_MEMORY_BYTES = 16_777_216; // 16 MB
export const DEFAULT_MAX_GAS = 1_000_000;
export const DEFAULT_MAX_EXECUTION_MS = 50;
export const DEFAULT_DETERMINISTIC_SEED = 0;

/** Configuration for creating a sandbox instance. */
export interface SandboxConfig {
  /** Hard memory limit for the WASM instance in bytes. Default: 16,777,216 (16 MB). */
  readonly maxMemoryBytes: number;
  /** Computation budget per execution (instruction count). Default: 1,000,000. */
  readonly maxGas: number;
  /** Wall-clock timeout in milliseconds. Default: 50. */
  readonly maxExecutionMs: number;
  /** Injected bridge functions available to WASM. Default: {} (empty). */
  readonly hostFunctions: HostFunctionMap;
  /** PRNG seed for deterministic random number generation. Default: 0. */
  readonly deterministicSeed: number;
  /** Injected "current time" in milliseconds since epoch. Caller provides this. */
  readonly eventTimestamp: number;
}

// ---------------------------------------------------------------------------
// Resource Metrics
// ---------------------------------------------------------------------------

/** Current resource usage for a sandbox instance. */
export interface ResourceMetrics {
  /** Current WASM linear memory usage in bytes. */
  readonly memoryUsedBytes: number;
  /** Configured memory limit in bytes. */
  readonly memoryLimitBytes: number;
  /** Instructions executed so far. */
  readonly gasUsed: number;
  /** Configured computation budget. */
  readonly gasLimit: number;
  /** Wall-clock time elapsed in milliseconds. */
  readonly executionMs: number;
  /** Configured timeout in milliseconds. */
  readonly executionLimitMs: number;
}

// ---------------------------------------------------------------------------
// Sandbox Instance
// ---------------------------------------------------------------------------

/** Possible states of a sandbox instance. */
export type SandboxStatus = 'created' | 'loaded' | 'running' | 'suspended' | 'destroyed';

/** An isolated WASM execution environment. */
export interface SandboxInstance {
  /** Unique instance identifier. */
  readonly id: string;
  /** Frozen configuration for this instance. */
  readonly config: Readonly<SandboxConfig>;
  /** Current lifecycle state. */
  readonly status: SandboxStatus;
  /** Current resource usage. */
  readonly metrics: ResourceMetrics;
}

// ---------------------------------------------------------------------------
// Execution Result
// ---------------------------------------------------------------------------

/** Successful execution result with metrics. */
export interface ExecutionSuccess {
  readonly ok: true;
  /** The value returned by the WASM execution. */
  readonly value: unknown;
  /** Resource metrics snapshot after execution. */
  readonly metrics: ResourceMetrics;
  /** Gas consumed during this execution. */
  readonly gasUsed: number;
  /** Wall-clock duration of this execution in milliseconds. */
  readonly durationMs: number;
}

/** Failed execution result with a typed error. */
export interface ExecutionFailure {
  readonly ok: false;
  /** The typed error describing the failure. */
  readonly error: import('./errors.js').SandboxError;
}

/** Result of executing an action in the sandbox. */
export type ExecutionResult = ExecutionSuccess | ExecutionFailure;

// ---------------------------------------------------------------------------
// Memory Pressure
// ---------------------------------------------------------------------------

/** System-wide memory pressure level based on percentage of available memory. */
export type MemoryPressureLevel = 'NORMAL' | 'WARNING' | 'PRESSURE' | 'CRITICAL' | 'OOM';

// ---------------------------------------------------------------------------
// WasmSandbox Interface
// ---------------------------------------------------------------------------

/** The main sandbox interface — all 7 methods for WASM execution lifecycle. */
export interface WasmSandbox {
  /** Create a new sandbox instance with the given configuration. */
  create(config: SandboxConfig): SandboxInstance;

  /** Load a WASM module into an existing sandbox instance. */
  load(instance: SandboxInstance, module: Uint8Array): Promise<void>;

  /** Execute an action in the sandbox with the given payload. */
  execute(instance: SandboxInstance, action: string, payload: unknown): ExecutionResult;

  /** Destroy a sandbox instance, releasing all resources. */
  destroy(instance: SandboxInstance): void;

  /** Serialize the sandbox instance state to a snapshot. */
  snapshot(instance: SandboxInstance): Uint8Array;

  /** Restore a sandbox instance from a previously captured snapshot. */
  restore(instance: SandboxInstance, snapshot: Uint8Array): void;

  /** Get current resource metrics for a sandbox instance. */
  getMetrics(instance: SandboxInstance): ResourceMetrics;
}

// ---------------------------------------------------------------------------
// Re-export SandboxError from errors module (type-only)
// ---------------------------------------------------------------------------

export type { SandboxError, SandboxErrorCode } from './errors.js';
