/**
 * ri-sandbox — WASM module instantiation.
 *
 * Instantiates a compiled WASM module into a sandbox instance,
 * wiring up host functions and memory.
 */

import type { Result, ResultErr } from '../types.js';
import type { SandboxError } from '../errors.js';
import { invalidModule, hostFunctionError } from '../errors.js';
import type { InternalSandboxState } from '../internal-types.js';
import { createTimeProvider } from '../determinism/time-injection.js';

/**
 * Build the WebAssembly import object from the sandbox state.
 *
 * Host functions are placed under the `"env"` namespace.
 * Memory is also injected under `"env"`.
 */
function buildImportObject(
  state: InternalSandboxState,
): Record<string, Record<string, WebAssembly.ImportValue>> {
  const envImports: Record<string, WebAssembly.ImportValue> = {};

  // Inject memory
  if (state.wasmMemory !== null) {
    envImports['memory'] = state.wasmMemory;
  }

  // Inject deterministic __get_time host function
  const timeProvider = createTimeProvider(state.config.eventTimestamp);
  envImports['__get_time'] = (): number => {
    const ctx = state.executionContext;
    if (ctx !== null) {
      ctx.gasMeter.consume(1);
      ctx.timeoutChecker.check();
    }
    return timeProvider.getTime();
  };

  // Inject deterministic __get_random host function
  envImports['__get_random'] = (): number => {
    const ctx = state.executionContext;
    if (ctx !== null) {
      ctx.gasMeter.consume(1);
      ctx.timeoutChecker.check();
    }
    return state.prng !== null ? state.prng.next() : 0;
  };

  // Inject host functions with gas/timeout interception
  for (const [key, hostFn] of Object.entries(state.config.hostFunctions)) {
    const fn = hostFn;
    envImports[key] = (...args: number[]): number | undefined => {
      // Check gas and timeout before calling host function
      const ctx = state.executionContext;
      if (ctx !== null) {
        ctx.gasMeter.consume(1);
        ctx.timeoutChecker.check();
      }

      try {
        return fn.handler(...args);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown host function error';
        throw new Error(`Host function '${fn.name}' failed: ${message}`);
      }
    };
  }

  return { env: envImports };
}

/**
 * Instantiate a compiled WASM module into a sandbox instance.
 *
 * Builds the import object from host functions and memory,
 * then instantiates the module. Updates internal state on success.
 */
export async function instantiate(
  state: InternalSandboxState,
  module: WebAssembly.Module,
): Promise<Result<void, SandboxError>> {
  if (state.status === 'destroyed') {
    return {
      ok: false,
      error: { code: 'INSTANCE_DESTROYED', instanceId: state.id },
    };
  }

  const imports = buildImportObject(state);

  try {
    const wasmInstance = await WebAssembly.instantiate(module, imports);
    state.wasmModule = module;
    state.wasmInstance = wasmInstance;
    state.status = 'loaded';

    // Update memory metrics after instantiation
    if (state.wasmMemory !== null) {
      state.metrics = {
        ...state.metrics,
        memoryUsedBytes: state.wasmMemory.buffer.byteLength,
      };
    }

    return { ok: true, value: undefined };
  } catch (err: unknown) {
    return classifyInstantiationError(err);
  }
}

/**
 * Classify an instantiation error into the appropriate SandboxError.
 *
 * Examines the error message to determine:
 * - Missing/incompatible imports → INVALID_MODULE
 * - Host function failures → HOST_FUNCTION_ERROR
 * - Other errors → generic INVALID_MODULE
 */
export function classifyInstantiationError(err: unknown): ResultErr<SandboxError> {
  const message = err instanceof Error ? err.message : 'Unknown instantiation error';

  // Detect missing imports
  if (message.includes('import')) {
    return {
      ok: false,
      error: invalidModule(`WASM instantiation failed — missing or incompatible imports: ${message}`),
    };
  }

  // Detect host function errors
  if (message.includes('Host function')) {
    const fnMatch = /Host function '([^']+)'/.exec(message);
    const fnName = fnMatch?.[1] ?? 'unknown';
    return {
      ok: false,
      error: hostFunctionError(fnName, message),
    };
  }

  return {
    ok: false,
    error: invalidModule(`WASM instantiation failed: ${message}`),
  };}