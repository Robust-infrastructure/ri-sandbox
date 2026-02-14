/**
 * ri-sandbox — Error types
 *
 * Discriminated union of all error types the sandbox can produce,
 * plus factory functions for constructing each variant.
 */

// ---------------------------------------------------------------------------
// Error Codes
// ---------------------------------------------------------------------------

/** All possible error codes produced by the sandbox. */
export type SandboxErrorCode =
  | 'GAS_EXHAUSTED'
  | 'MEMORY_EXCEEDED'
  | 'TIMEOUT'
  | 'WASM_TRAP'
  | 'INVALID_MODULE'
  | 'HOST_FUNCTION_ERROR'
  | 'INSTANCE_DESTROYED'
  | 'SNAPSHOT_ERROR';

// ---------------------------------------------------------------------------
// Error Union
// ---------------------------------------------------------------------------

/** Discriminated union of all sandbox errors. */
export type SandboxError =
  | {
      readonly code: 'GAS_EXHAUSTED';
      readonly gasUsed: number;
      readonly gasLimit: number;
    }
  | {
      readonly code: 'MEMORY_EXCEEDED';
      readonly memoryUsed: number;
      readonly memoryLimit: number;
    }
  | {
      readonly code: 'TIMEOUT';
      readonly elapsedMs: number;
      readonly limitMs: number;
    }
  | {
      readonly code: 'WASM_TRAP';
      readonly trapKind: string;
      readonly message: string;
    }
  | {
      readonly code: 'INVALID_MODULE';
      readonly reason: string;
    }
  | {
      readonly code: 'HOST_FUNCTION_ERROR';
      readonly functionName: string;
      readonly message: string;
    }
  | {
      readonly code: 'INSTANCE_DESTROYED';
      readonly instanceId: string;
    }
  | {
      readonly code: 'SNAPSHOT_ERROR';
      readonly reason: string;
    };

// ---------------------------------------------------------------------------
// Error Constructors
// ---------------------------------------------------------------------------

/** Create a GAS_EXHAUSTED error. */
export function gasExhausted(gasUsed: number, gasLimit: number): SandboxError {
  return { code: 'GAS_EXHAUSTED', gasUsed, gasLimit } as const;
}

/** Create a MEMORY_EXCEEDED error. */
export function memoryExceeded(memoryUsed: number, memoryLimit: number): SandboxError {
  return { code: 'MEMORY_EXCEEDED', memoryUsed, memoryLimit } as const;
}

/** Create a TIMEOUT error. */
export function timeout(elapsedMs: number, limitMs: number): SandboxError {
  return { code: 'TIMEOUT', elapsedMs, limitMs } as const;
}

/** Create a WASM_TRAP error. */
export function wasmTrap(trapKind: string, message: string): SandboxError {
  return { code: 'WASM_TRAP', trapKind, message } as const;
}

/** Create an INVALID_MODULE error. */
export function invalidModule(reason: string): SandboxError {
  return { code: 'INVALID_MODULE', reason } as const;
}

/** Create a HOST_FUNCTION_ERROR error. */
export function hostFunctionError(functionName: string, message: string): SandboxError {
  return { code: 'HOST_FUNCTION_ERROR', functionName, message } as const;
}

/** Create an INSTANCE_DESTROYED error. */
export function instanceDestroyed(instanceId: string): SandboxError {
  return { code: 'INSTANCE_DESTROYED', instanceId } as const;
}

/** Create a SNAPSHOT_ERROR error. */
export function snapshotError(reason: string): SandboxError {
  return { code: 'SNAPSHOT_ERROR', reason } as const;
}
