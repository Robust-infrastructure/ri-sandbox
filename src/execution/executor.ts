/**
 * ri-sandbox — Execution engine
 *
 * Executes WASM exported functions with payload serialization,
 * host function bridging, resource enforcement, and result extraction.
 */

import type { ExecutionResult } from '../types.js';
import { instanceDestroyed, wasmTrap, gasExhausted, timeout } from '../errors.js';
import type { InternalSandboxState } from '../internal-types.js';
import { GasExhaustedSignal } from '../resources/gas-meter.js';
import { TimeoutSignal } from '../resources/timeout.js';
import { createExecutionContext, buildResourceMetrics } from '../resources/resource-tracker.js';
import type { ResourceTrackerConfig } from '../resources/resource-tracker.js';
import type { TimerFn } from '../resources/timeout.js';
import { checkMemoryLimit, createMemoryExceededError } from '../resources/memory-limiter.js';

// ---------------------------------------------------------------------------
// Payload Helpers
// ---------------------------------------------------------------------------

/**
 * Determine if a payload should be passed as direct numeric arguments.
 * Direct mode: payload is a number, an array of numbers, or nullish (no args).
 */
function isDirectPayload(payload: unknown): payload is number | number[] | null | undefined {
  if (payload === null || payload === undefined) {
    return true;
  }
  if (typeof payload === 'number') {
    return true;
  }
  if (Array.isArray(payload) && payload.every((v): v is number => typeof v === 'number')) {
    return true;
  }
  return false;
}

/**
 * Convert a direct payload into an array of numeric arguments.
 */
function toDirectArgs(payload: unknown): number[] {
  if (payload === null || payload === undefined) {
    return [];
  }
  if (typeof payload === 'number') {
    return [payload];
  }
  if (Array.isArray(payload)) {
    return payload as number[];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

/**
 * Execute a WASM exported function on a sandbox instance.
 *
 * Supports two calling conventions:
 * - **Direct**: When payload is `number | number[] | null | undefined`,
 *   arguments are passed directly to the WASM function.
 * - **JSON**: When payload is any other serializable value, the payload is
 *   JSON-encoded, written to memory via an exported `__alloc` function,
 *   and the action is called with `(pointer, length)`.
 *
 * Enforces gas, timeout, and memory limits via the execution context.
 *
 * @param state - Internal mutable state for the sandbox instance.
 * @param action - Name of the exported WASM function to call.
 * @param payload - Arguments to pass to the function.
 * @param timer - Optional timer function for timeout (injectable for testing).
 * @returns An ExecutionResult (ok with value + metrics, or error).
 */
export function execute(
  state: InternalSandboxState,
  action: string,
  payload: unknown,
  timer?: TimerFn,
): ExecutionResult {
  // Guard: destroyed instances
  if (state.status === 'destroyed') {
    return { ok: false, error: instanceDestroyed(state.id) };
  }

  // Guard: must be loaded (or running for re-entrant calls)
  if (state.status !== 'loaded' && state.status !== 'running') {
    return {
      ok: false,
      error: wasmTrap('invalid_state', `Cannot execute: instance status is '${state.status}'`),
    };
  }

  // Guard: need a live WASM instance
  if (state.wasmInstance === null) {
    return {
      ok: false,
      error: wasmTrap('no_instance', 'No WASM instance available — load a module first'),
    };
  }

  // Look up the exported function
  const exports = state.wasmInstance.exports;
  const exportedFn = exports[action];

  if (typeof exportedFn !== 'function') {
    return {
      ok: false,
      error: wasmTrap(
        'missing_export',
        `WASM module does not export a function named '${action}'`,
      ),
    };
  }

  // Create execution context with resource limits
  const trackerConfig: ResourceTrackerConfig = {
    maxGas: state.config.maxGas,
    maxExecutionMs: state.config.maxExecutionMs,
    maxMemoryBytes: state.config.maxMemoryBytes,
    ...(timer !== undefined ? { timer } : {}),
  };
  const ctx = createExecutionContext(trackerConfig);

  // Set on state so host function wrappers can access it
  state.executionContext = ctx;
  ctx.timeoutChecker.start();

  // Set status to running
  const previousStatus = state.status;
  state.status = 'running';

  try {
    let result: unknown;

    if (isDirectPayload(payload)) {
      // Direct calling convention: pass numeric args
      const args = toDirectArgs(payload);
      result = (exportedFn as (...args: number[]) => unknown)(...args);
    } else {
      // JSON calling convention: needs __alloc export
      result = executeJsonPayload(state, exportedFn, action, payload);
    }

    // Check memory after execution
    const memCheck = checkMemoryLimit(state.wasmMemory, state.config.maxMemoryBytes);
    if (memCheck.exceeded) {
      state.status = previousStatus;
      state.executionContext = null;
      return { ok: false, error: createMemoryExceededError(memCheck) };
    }

    // Build metrics from execution context
    const updatedMetrics = buildResourceMetrics(ctx, state.wasmMemory, {
      maxGas: state.config.maxGas,
      maxExecutionMs: state.config.maxExecutionMs,
      maxMemoryBytes: state.config.maxMemoryBytes,
    });
    state.metrics = updatedMetrics;

    // Restore status
    state.status = previousStatus;
    state.executionContext = null;

    return {
      ok: true,
      value: result,
      metrics: updatedMetrics,
      gasUsed: updatedMetrics.gasUsed,
      durationMs: updatedMetrics.executionMs,
    };
  } catch (err: unknown) {
    // Build metrics even on error (captures gasUsed, elapsedMs at failure point)
    const errorMetrics = buildResourceMetrics(ctx, state.wasmMemory, {
      maxGas: state.config.maxGas,
      maxExecutionMs: state.config.maxExecutionMs,
      maxMemoryBytes: state.config.maxMemoryBytes,
    });
    state.metrics = errorMetrics;

    // Restore status even on error
    state.status = previousStatus;
    state.executionContext = null;

    // Catch gas exhaustion
    if (err instanceof GasExhaustedSignal) {
      return {
        ok: false,
        error: gasExhausted(err.gasUsed, err.gasLimit),
      };
    }

    // Catch timeout
    if (err instanceof TimeoutSignal) {
      return {
        ok: false,
        error: timeout(err.elapsedMs, err.limitMs),
      };
    }

    // WASM traps surface as errors
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: wasmTrap('runtime_error', message),
    };
  }
}

// ---------------------------------------------------------------------------
// JSON Payload Execution
// ---------------------------------------------------------------------------

/**
 * Execute using JSON calling convention.
 * The WASM module must export `__alloc(size: i32): i32` for memory allocation.
 */
function executeJsonPayload(
  state: InternalSandboxState,
  exportedFn: WebAssembly.ExportValue,
  action: string,
  payload: unknown,
): unknown {
  if (state.wasmInstance === null || state.wasmMemory === null) {
    throw new Error('No WASM instance or memory available');
  }

  const alloc = state.wasmInstance.exports['__alloc'];
  if (typeof alloc !== 'function') {
    throw new Error(
      `JSON payload requires WASM module to export '__alloc', ` +
        `but '${action}' was called with a non-numeric payload`,
    );
  }

  // Encode payload to JSON bytes
  const encoder = new TextEncoder();
  const jsonBytes = encoder.encode(JSON.stringify(payload));

  // Allocate memory in WASM
  const ptr = (alloc as (size: number) => number)(jsonBytes.length);

  // Write JSON bytes to WASM memory
  const memoryView = new Uint8Array(state.wasmMemory.buffer);
  memoryView.set(jsonBytes, ptr);

  // Call the action with (pointer, length)
  const resultPacked = (exportedFn as (ptr: number, len: number) => number)(
    ptr,
    jsonBytes.length,
  );

  // Unpack result: upper 16 bits = length, lower 16 bits = pointer
  // This is a simplified convention; real-world modules would use a more robust ABI
  const resultPtr = resultPacked & 0xffff;
  const resultLen = (resultPacked >>> 16) & 0xffff;

  if (resultLen === 0) {
    return undefined;
  }

  // Re-create view after potential memory growth
  const resultView = new Uint8Array(state.wasmMemory.buffer);
  const resultBytes = resultView.slice(resultPtr, resultPtr + resultLen);

  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(resultBytes)) as unknown;
}

// ---------------------------------------------------------------------------
// Metrics

