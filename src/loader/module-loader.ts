/**
 * ri-sandbox — WASM module loading and validation.
 *
 * Validates WASM magic bytes and compiles the module.
 */

import type { Result } from '../types.js';
import type { SandboxError } from '../errors.js';
import { invalidModule } from '../errors.js';

/** WASM magic bytes: `\0asm` */
const WASM_MAGIC = new Uint8Array([0x00, 0x61, 0x73, 0x6d]);

/** Minimum valid WASM module size (magic + version = 8 bytes). */
const MIN_WASM_SIZE = 8;

/** Validate that the bytes start with the WASM magic number. */
function hasValidMagic(bytes: Uint8Array): boolean {
  if (bytes.length < WASM_MAGIC.length) {
    return false;
  }
  for (let i = 0; i < WASM_MAGIC.length; i++) {
    if (bytes[i] !== WASM_MAGIC[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Load and compile a WASM module from raw bytes.
 *
 * Validates the WASM magic bytes before compilation.
 * Returns a typed error for invalid modules.
 */
export async function loadModule(
  bytes: Uint8Array,
): Promise<Result<WebAssembly.Module, SandboxError>> {
  if (bytes.length === 0) {
    return { ok: false, error: invalidModule('Empty WASM bytes — module must not be empty') };
  }

  if (bytes.length < MIN_WASM_SIZE) {
    return {
      ok: false,
      error: invalidModule(
        `WASM module too small: ${String(bytes.length)} bytes (minimum ${String(MIN_WASM_SIZE)})`,
      ),
    };
  }

  if (!hasValidMagic(bytes)) {
    return {
      ok: false,
      error: invalidModule('Invalid WASM magic bytes — expected \\0asm header'),
    };
  }

  try {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const module = await WebAssembly.compile(buffer);
    return { ok: true, value: module };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown compilation error';
    return { ok: false, error: invalidModule(`WASM compilation failed: ${message}`) };
  }
}
