/**
 * ri-sandbox — Import isolation
 *
 * Validates that a WASM module only imports declared host functions,
 * the injected memory, and the determinism system functions (`__get_time`,
 * `__get_random`). Rejects modules that import WASI interfaces, undeclared
 * functions, or unexpected namespaces.
 */

import type { Result } from '../types.js';
import type { SandboxError } from '../errors.js';
import { invalidModule } from '../errors.js';
import type { SandboxConfig } from '../types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** WASI module namespaces that must be rejected. */
const BLOCKED_NAMESPACES: readonly string[] = [
  'wasi_snapshot_preview1',
  'wasi_unstable',
  'wasi',
];

/** System-provided host function names (always available under "env"). */
const SYSTEM_PROVIDED_IMPORTS: readonly string[] = [
  'memory',
  '__get_time',
  '__get_random',
];

// ---------------------------------------------------------------------------
// Import Report
// ---------------------------------------------------------------------------

/** A single validated import entry. */
export interface ImportEntry {
  /** The module namespace (e.g. "env"). */
  readonly module: string;
  /** The import name (e.g. "double", "memory"). */
  readonly name: string;
  /** The import kind (e.g. "function", "memory", "table", "global"). */
  readonly kind: string;
}

/** Report of all imports found during validation. */
export interface ImportReport {
  /** All imports declared by the WASM module. */
  readonly imports: readonly ImportEntry[];
  /** Count of total imports. */
  readonly totalImports: number;
  /** Count of host function imports (user-declared). */
  readonly hostFunctionImports: number;
  /** Count of system-provided imports (memory, __get_time, __get_random). */
  readonly systemImports: number;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate all imports declared by a WASM module.
 *
 * Rejects modules that:
 * - Import from WASI namespaces (`wasi_snapshot_preview1`, `wasi_unstable`, `wasi`)
 * - Import from non-"env" namespaces
 * - Import undeclared functions from the "env" namespace
 *
 * Allows:
 * - `env.memory` (system-provided)
 * - `env.__get_time` (determinism system)
 * - `env.__get_random` (determinism system)
 * - Any function declared in `config.hostFunctions`
 *
 * @param module - Compiled WASM module to validate.
 * @param config - Sandbox configuration with declared host functions.
 * @returns ImportReport on success, SandboxError on validation failure.
 */
export function validateModuleImports(
  module: WebAssembly.Module,
  config: Readonly<SandboxConfig>,
): Result<ImportReport, SandboxError> {
  const wasmImports = WebAssembly.Module.imports(module);
  const entries: ImportEntry[] = [];
  let hostFunctionImports = 0;
  let systemImports = 0;

  for (const imp of wasmImports) {
    const entry: ImportEntry = {
      module: imp.module,
      name: imp.name,
      kind: imp.kind,
    };
    entries.push(entry);

    // Check for blocked WASI namespaces
    if (BLOCKED_NAMESPACES.includes(imp.module)) {
      return {
        ok: false,
        error: invalidModule(
          `WASM module imports from blocked namespace '${imp.module}' ` +
            `(import: '${imp.name}'). WASI and system interfaces are not allowed ` +
            `in deterministic sandboxes.`,
        ),
      };
    }

    // Only "env" namespace is allowed
    if (imp.module !== 'env') {
      return {
        ok: false,
        error: invalidModule(
          `WASM module imports from undeclared namespace '${imp.module}' ` +
            `(import: '${imp.name}'). Only the 'env' namespace is supported.`,
        ),
      };
    }

    // Check if it's a system-provided import
    if (SYSTEM_PROVIDED_IMPORTS.includes(imp.name)) {
      systemImports += 1;
      continue;
    }

    // Check if it's a declared host function
    if (imp.name in config.hostFunctions) {
      hostFunctionImports += 1;
      continue;
    }

    // Undeclared import — reject
    return {
      ok: false,
      error: invalidModule(
        `WASM module imports undeclared function 'env.${imp.name}'. ` +
          `Only declared host functions and system imports ` +
          `(memory, __get_time, __get_random) are allowed.`,
      ),
    };
  }

  return {
    ok: true,
    value: {
      imports: entries,
      totalImports: entries.length,
      hostFunctionImports,
      systemImports,
    },
  };
}
