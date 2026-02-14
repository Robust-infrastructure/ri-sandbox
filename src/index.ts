/**
 * ri-sandbox — Deterministic WASM execution with resource limits, isolation, and snapshot/restore.
 *
 * @packageDocumentation
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type {
  Result,
  ResultOk,
  ResultErr,
  WasmValueType,
  HostFunction,
  HostFunctionMap,
  SandboxConfig,
  ResourceMetrics,
  SandboxStatus,
  SandboxInstance,
  ExecutionSuccess,
  ExecutionFailure,
  ExecutionResult,
  MemoryPressureLevel,
  WasmSandbox,
  SandboxError,
  SandboxErrorCode,
} from './types.js';

export {
  DEFAULT_MAX_MEMORY_BYTES,
  DEFAULT_MAX_GAS,
  DEFAULT_MAX_EXECUTION_MS,
  DEFAULT_DETERMINISTIC_SEED,
} from './types.js';

// ---------------------------------------------------------------------------
// Error Constructors
// ---------------------------------------------------------------------------

export {
  gasExhausted,
  memoryExceeded,
  timeout,
  wasmTrap,
  invalidModule,
  hostFunctionError,
  instanceDestroyed,
  snapshotError,
} from './errors.js';
