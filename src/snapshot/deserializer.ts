/**
 * ri-sandbox — Snapshot deserializer
 *
 * Restores a sandbox instance from a previously captured binary snapshot.
 * Validates header, magic bytes, version, and memory size before restoring.
 *
 * See serializer.ts for the binary format specification.
 */

import type { Result } from '../types.js';
import type { SandboxError } from '../errors.js';
import { snapshotError } from '../errors.js';
import type { InternalSandboxState } from '../internal-types.js';
import { SNAPSHOT_MAGIC, SNAPSHOT_VERSION, HEADER_SIZE } from './serializer.js';
import type { SnapshotStateJson } from './serializer.js';

// ---------------------------------------------------------------------------
// Deserializer
// ---------------------------------------------------------------------------

/**
 * Restore a sandbox instance from a binary snapshot.
 *
 * The instance must be in `loaded` status. The snapshot must have:
 * - Valid magic bytes ("WSNP")
 * - Compatible version
 * - Memory size matching the instance's current linear memory
 *
 * @param state - Internal sandbox state to restore into.
 * @param data  - Binary snapshot data produced by `createSnapshot`.
 * @returns A Result containing void on success or a SNAPSHOT_ERROR on failure.
 */
export function restoreSnapshot(
  state: InternalSandboxState,
  data: Uint8Array,
): Result<void, SandboxError> {
  // --- Status validation ---------------------------------------------------
  if (state.status === 'destroyed') {
    return { ok: false, error: snapshotError('Cannot restore into a destroyed instance') };
  }
  if (state.status === 'created') {
    return { ok: false, error: snapshotError('Cannot restore into an instance that has not been loaded') };
  }
  if (state.status === 'running') {
    return { ok: false, error: snapshotError('Cannot restore into a running instance — suspend first') };
  }

  // --- Header validation ---------------------------------------------------
  if (data.byteLength < HEADER_SIZE) {
    return { ok: false, error: snapshotError('Snapshot too small — missing header') };
  }

  // Check magic bytes
  for (let i = 0; i < SNAPSHOT_MAGIC.byteLength; i++) {
    if (data[i] !== SNAPSHOT_MAGIC[i]) {
      return { ok: false, error: snapshotError('Invalid snapshot — bad magic bytes') };
    }
  }

  // Check version
  const version = data[HEADER_SIZE - 1];
  if (version !== SNAPSHOT_VERSION) {
    return {
      ok: false,
      error: snapshotError(`Unsupported snapshot version: ${String(version)} (expected ${String(SNAPSHOT_VERSION)})`),
    };
  }

  // --- Parse memory section ------------------------------------------------
  if (data.byteLength < HEADER_SIZE + 4) {
    return { ok: false, error: snapshotError('Snapshot truncated — missing memory length') };
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = HEADER_SIZE;

  const memoryLength = view.getUint32(offset, true);
  offset += 4;

  if (data.byteLength < offset + memoryLength) {
    return { ok: false, error: snapshotError('Snapshot truncated — memory section incomplete') };
  }

  const memoryBytes = data.subarray(offset, offset + memoryLength);
  offset += memoryLength;

  // --- Parse state section -------------------------------------------------
  if (data.byteLength < offset + 4) {
    return { ok: false, error: snapshotError('Snapshot truncated — missing state length') };
  }

  const stateLength = view.getUint32(offset, true);
  offset += 4;

  if (data.byteLength < offset + stateLength) {
    return { ok: false, error: snapshotError('Snapshot truncated — state section incomplete') };
  }

  const stateJsonBytes = data.subarray(offset, offset + stateLength);
  const decoder = new TextDecoder();
  const stateJsonString = decoder.decode(stateJsonBytes);

  let stateJson: SnapshotStateJson;
  try {
    stateJson = JSON.parse(stateJsonString) as SnapshotStateJson;
  } catch {
    return { ok: false, error: snapshotError('Invalid snapshot — corrupted state JSON') };
  }

  // --- Validate memory size ------------------------------------------------
  if (state.wasmMemory === null) {
    return { ok: false, error: snapshotError('No WASM memory available for restore') };
  }

  const currentMemorySize = state.wasmMemory.buffer.byteLength;
  if (memoryLength !== currentMemorySize) {
    return {
      ok: false,
      error: snapshotError(
        `Snapshot memory size (${String(memoryLength)}) does not match instance memory (${String(currentMemorySize)})`,
      ),
    };
  }

  // --- Restore memory ------------------------------------------------------
  const target = new Uint8Array(state.wasmMemory.buffer);
  target.set(memoryBytes);

  // --- Restore PRNG state --------------------------------------------------
  if (state.prng !== null) {
    state.prng.setState(stateJson.prngState);
  }

  // --- Restore gas counter -------------------------------------------------
  state.metrics = {
    ...state.metrics,
    gasUsed: stateJson.gasUsed,
  };

  // --- Mark as loaded (ready for execution) --------------------------------
  state.status = 'loaded';

  return { ok: true, value: undefined };
}
