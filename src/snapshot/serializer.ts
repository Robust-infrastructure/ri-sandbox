/**
 * ri-sandbox — Snapshot serializer
 *
 * Captures complete sandbox execution state (WASM linear memory, PRNG state,
 * gas counter, timestamp) into a compact binary format.
 *
 * Binary format:
 *   Offset  Size    Content
 *   0       4       Magic bytes: "WSNP" (0x57, 0x53, 0x4E, 0x50)
 *   4       1       Version: 1
 *   5       4       Memory length in bytes (uint32 LE)
 *   9       N       Raw WASM linear memory bytes
 *   9+N     4       State JSON length in bytes (uint32 LE)
 *   13+N    M       State JSON (UTF-8 encoded)
 */

import type { Result } from '../types.js';
import type { SandboxError } from '../errors.js';
import { snapshotError } from '../errors.js';
import type { InternalSandboxState } from '../internal-types.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Magic bytes identifying a snapshot: "WSNP". */
export const SNAPSHOT_MAGIC = new Uint8Array([0x57, 0x53, 0x4e, 0x50]);

/** Current snapshot format version. */
export const SNAPSHOT_VERSION = 1;

/** Header size: 4 (magic) + 1 (version) = 5 bytes. */
export const HEADER_SIZE = 5;

// ---------------------------------------------------------------------------
// State JSON Shape
// ---------------------------------------------------------------------------

/** JSON-serializable snapshot state (everything except raw memory). */
export interface SnapshotStateJson {
  readonly prngState: { readonly current: number };
  readonly timestamp: number;
  readonly gasUsed: number;
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

/**
 * Create a binary snapshot of a sandbox instance's execution state.
 *
 * The instance must be in `loaded` status — snapshots of `created`,
 * `running`, or `destroyed` instances are rejected.
 *
 * @param state - Internal sandbox state to snapshot.
 * @returns A Result containing the snapshot bytes or a SNAPSHOT_ERROR.
 */
export function createSnapshot(
  state: InternalSandboxState,
): Result<Uint8Array, SandboxError> {
  // --- Status validation ---------------------------------------------------
  if (state.status === 'destroyed') {
    return { ok: false, error: snapshotError('Cannot snapshot a destroyed instance') };
  }
  if (state.status === 'created') {
    return { ok: false, error: snapshotError('Cannot snapshot an instance that has not been loaded') };
  }
  if (state.status === 'running') {
    return { ok: false, error: snapshotError('Cannot snapshot a running instance — suspend first') };
  }

  // --- Capture memory ------------------------------------------------------
  if (state.wasmMemory === null) {
    return { ok: false, error: snapshotError('No WASM memory available for snapshot') };
  }
  const memoryBytes = new Uint8Array(state.wasmMemory.buffer).slice();

  // --- Capture state -------------------------------------------------------
  const prngState = state.prng !== null ? state.prng.getState() : { current: 0 };

  const stateJson: SnapshotStateJson = {
    prngState,
    timestamp: state.config.eventTimestamp,
    gasUsed: state.metrics.gasUsed,
  };

  const stateJsonString = JSON.stringify(stateJson);
  const encoder = new TextEncoder();
  const stateJsonBytes = encoder.encode(stateJsonString);

  // --- Encode binary -------------------------------------------------------
  const totalSize = HEADER_SIZE + 4 + memoryBytes.byteLength + 4 + stateJsonBytes.byteLength;
  const snapshot = new Uint8Array(totalSize);
  const view = new DataView(snapshot.buffer, snapshot.byteOffset, snapshot.byteLength);

  let offset = 0;

  // Magic bytes
  snapshot.set(SNAPSHOT_MAGIC, offset);
  offset += SNAPSHOT_MAGIC.byteLength;

  // Version
  snapshot[offset] = SNAPSHOT_VERSION;
  offset += 1;

  // Memory section: length + bytes
  view.setUint32(offset, memoryBytes.byteLength, true);
  offset += 4;
  snapshot.set(memoryBytes, offset);
  offset += memoryBytes.byteLength;

  // State section: length + JSON bytes
  view.setUint32(offset, stateJsonBytes.byteLength, true);
  offset += 4;
  snapshot.set(stateJsonBytes, offset);

  return { ok: true, value: snapshot };
}
