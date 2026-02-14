/**
 * ri-sandbox — Host function bridge
 *
 * Wraps caller-provided host functions with error capture.
 * When a host function throws, the error is captured as a HOST_FUNCTION_ERROR
 * rather than crashing the WASM execution.
 */

import type { SandboxError } from '../errors.js';
import { hostFunctionError } from '../errors.js';
import type { HostFunction, HostFunctionMap } from '../types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A captured error from a host function invocation. */
export interface CapturedHostError {
  readonly error: SandboxError;
}

// ---------------------------------------------------------------------------
// Host Function Wrapping
// ---------------------------------------------------------------------------

/**
 * Wrap a single host function with error capture.
 *
 * If the handler throws, the error is pushed to `capturedErrors` and the
 * function returns 0 to WASM (a safe default for all WASM numeric types).
 */
export function wrapHostFunction(
  fn: HostFunction,
  capturedErrors: SandboxError[],
): (...args: number[]) => number | undefined {
  return (...args: number[]): number | undefined => {
    try {
      return fn.handler(...args);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      capturedErrors.push(hostFunctionError(fn.name, message));
      return 0;
    }
  };
}

/**
 * Build the `env` import object for WASM instantiation, with all host
 * functions wrapped for error capture.
 *
 * @param hostFunctions - The caller-provided host function map.
 * @param capturedErrors - Mutable array where host function errors are collected.
 * @returns Record of wrapped functions keyed by function name.
 */
export function buildHostImports(
  hostFunctions: HostFunctionMap,
  capturedErrors: SandboxError[],
): Record<string, (...args: number[]) => number | undefined> {
  const imports: Record<string, (...args: number[]) => number | undefined> = {};

  for (const [, fn] of Object.entries(hostFunctions)) {
    // noUncheckedIndexedAccess: fn may be undefined from Object.entries
    const hostFn: HostFunction | undefined = fn;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard
    if (hostFn !== undefined) {
      imports[hostFn.name] = wrapHostFunction(hostFn, capturedErrors);
    }
  }

  return imports;
}
