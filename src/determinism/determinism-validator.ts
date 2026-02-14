/**
 * ri-sandbox — Determinism validator
 *
 * Optional double-execution check that verifies a WASM function produces
 * identical results when run twice with the same inputs. Captures and
 * restores memory + PRNG state between runs.
 *
 * This is expensive (2× execution) — intended for testing and auditing,
 * not production use.
 */

import type { ExecutionResult } from '../types.js';
import type { InternalSandboxState } from '../internal-types.js';
import { execute } from '../execution/executor.js';
import type { PrngState } from './random-injection.js';
import type { TimerFn } from '../resources/timeout.js';

// ---------------------------------------------------------------------------
// Report Types
// ---------------------------------------------------------------------------

/** Result of a determinism validation check. */
export interface DeterminismReport {
  /** Whether both executions produced identical results. */
  readonly deterministic: boolean;
  /** Result from the first execution. */
  readonly firstResult: ExecutionResult;
  /** Result from the second execution. */
  readonly secondResult: ExecutionResult;
  /** Details about any mismatch found. */
  readonly mismatch: DeterminismMismatch | null;
}

/** Details about a determinism mismatch. */
export interface DeterminismMismatch {
  /** Human-readable description of the mismatch. */
  readonly reason: string;
  /** First execution value (JSON-serialized for comparison). */
  readonly firstValue: string;
  /** Second execution value (JSON-serialized for comparison). */
  readonly secondValue: string;
}

// ---------------------------------------------------------------------------
// Internal State Capture
// ---------------------------------------------------------------------------

/** Captured sandbox state for restore between validation runs. */
interface CapturedState {
  readonly memorySnapshot: Uint8Array | null;
  readonly prngState: PrngState | null;
  readonly gasUsed: number;
  readonly executionMs: number;
}

/** Capture the current sandbox state for later restoration. */
function captureState(state: InternalSandboxState): CapturedState {
  let memorySnapshot: Uint8Array | null = null;
  if (state.wasmMemory !== null) {
    memorySnapshot = new Uint8Array(state.wasmMemory.buffer).slice();
  }

  let prngState: PrngState | null = null;
  if (state.prng !== null) {
    prngState = state.prng.getState();
  }

  return {
    memorySnapshot,
    prngState,
    gasUsed: state.metrics.gasUsed,
    executionMs: state.metrics.executionMs,
  };
}

/** Restore sandbox state from a previous capture. */
function restoreState(state: InternalSandboxState, captured: CapturedState): void {
  // Restore memory
  if (captured.memorySnapshot !== null && state.wasmMemory !== null) {
    const target = new Uint8Array(state.wasmMemory.buffer);
    target.set(captured.memorySnapshot);
  }

  // Restore PRNG state
  if (captured.prngState !== null && state.prng !== null) {
    state.prng.setState(captured.prngState);
  }

  // Restore metrics
  state.metrics = {
    ...state.metrics,
    gasUsed: captured.gasUsed,
    executionMs: captured.executionMs,
  };
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/** Serialize an ExecutionResult for comparison. */
function serializeResult(result: ExecutionResult): string {
  if (result.ok) {
    return JSON.stringify({ ok: true, value: result.value });
  }
  return JSON.stringify({ ok: false, error: result.error });
}

/** Compare two execution results for determinism. */
export function compareResults(
  first: ExecutionResult,
  second: ExecutionResult,
): DeterminismMismatch | null {
  const firstSerialized = serializeResult(first);
  const secondSerialized = serializeResult(second);

  if (firstSerialized !== secondSerialized) {
    return {
      reason: 'Execution results differ between first and second run',
      firstValue: firstSerialized,
      secondValue: secondSerialized,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

/**
 * Validate determinism by executing a WASM function twice with identical inputs.
 *
 * Steps:
 * 1. Capture current memory, PRNG state, and metrics
 * 2. Execute the action once
 * 3. Restore state to pre-execution snapshot
 * 4. Execute the action again with identical inputs
 * 5. Compare results
 *
 * @param state - Internal sandbox state (must be in 'loaded' status).
 * @param action - Name of the WASM function to execute.
 * @param payload - Arguments to pass to the function.
 * @param timer - Optional timer function for deterministic timeout tracking.
 * @returns A DeterminismReport with match/mismatch details.
 */
export function validateDeterminism(
  state: InternalSandboxState,
  action: string,
  payload: unknown,
  timer?: TimerFn,
): DeterminismReport {
  // Capture pre-execution state
  const captured = captureState(state);

  // First execution
  const firstResult = execute(state, action, payload, timer);

  // Restore to pre-execution state
  restoreState(state, captured);

  // Second execution with identical inputs
  const secondResult = execute(state, action, payload, timer);

  // Compare results
  const mismatch = compareResults(firstResult, secondResult);

  // Restore state one final time to leave sandbox in pre-validation state
  restoreState(state, captured);

  return {
    deterministic: mismatch === null,
    firstResult,
    secondResult,
    mismatch,
  };
}
