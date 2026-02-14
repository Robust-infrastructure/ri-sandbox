/**
 * ri-sandbox — Memory I/O helpers
 *
 * Read/write data to WASM linear memory with bounds checking,
 * plus JSON encoding/decoding for payload serialization.
 */

import type { SandboxError } from '../errors.js';
import { invalidModule } from '../errors.js';
import type { Result } from '../types.js';

// ---------------------------------------------------------------------------
// JSON Encoding / Decoding
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Encode a payload as UTF-8 JSON bytes.
 *
 * @returns Ok with Uint8Array of UTF-8 encoded JSON, or Err on serialization failure.
 */
export function encodePayload(payload: unknown): Result<Uint8Array, SandboxError> {
  try {
    const json = JSON.stringify(payload);
    return { ok: true, value: encoder.encode(json) };
  } catch {
    return {
      ok: false,
      error: invalidModule('Failed to serialize payload to JSON'),
    };
  }
}

/**
 * Decode UTF-8 JSON bytes back to a value.
 *
 * @returns Ok with parsed value, or Err on deserialization failure.
 */
export function decodeResult(bytes: Uint8Array): Result<unknown, SandboxError> {
  try {
    const json = decoder.decode(bytes);
    return { ok: true, value: JSON.parse(json) as unknown };
  } catch {
    return {
      ok: false,
      error: invalidModule('Failed to deserialize result from JSON'),
    };
  }
}

// ---------------------------------------------------------------------------
// Memory Read / Write
// ---------------------------------------------------------------------------

/**
 * Write data into WASM linear memory at the given byte offset.
 *
 * @returns Ok(undefined) on success, Err on out-of-bounds write.
 */
export function writeToMemory(
  memory: WebAssembly.Memory,
  data: Uint8Array,
  offset: number,
): Result<undefined, SandboxError> {
  const memoryBytes = new Uint8Array(memory.buffer);

  if (offset < 0 || offset + data.length > memoryBytes.length) {
    return {
      ok: false,
      error: invalidModule(
        `Memory write out of bounds: offset=${String(offset)}, length=${String(data.length)}, memorySize=${String(memoryBytes.length)}`,
      ),
    };
  }

  memoryBytes.set(data, offset);
  return { ok: true, value: undefined };
}

/**
 * Read data from WASM linear memory at the given byte offset.
 *
 * @returns Ok with a copy of the bytes, or Err on out-of-bounds read.
 */
export function readFromMemory(
  memory: WebAssembly.Memory,
  offset: number,
  length: number,
): Result<Uint8Array, SandboxError> {
  const memoryBytes = new Uint8Array(memory.buffer);

  if (offset < 0 || length < 0 || offset + length > memoryBytes.length) {
    return {
      ok: false,
      error: invalidModule(
        `Memory read out of bounds: offset=${String(offset)}, length=${String(length)}, memorySize=${String(memoryBytes.length)}`,
      ),
    };
  }

  // Return a copy to avoid aliasing issues with memory.buffer detachment
  const slice = memoryBytes.slice(offset, offset + length);
  return { ok: true, value: slice };
}
