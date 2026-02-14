import { describe, it, expect } from 'vitest';
import { createSnapshot, HEADER_SIZE } from '../serializer.js';
import { restoreSnapshot } from '../deserializer.js';
import type { InternalSandboxState } from '../../internal-types.js';
import type { SandboxConfig, ResourceMetrics } from '../../types.js';
import {
  DEFAULT_MAX_MEMORY_BYTES,
  DEFAULT_MAX_GAS,
  DEFAULT_MAX_EXECUTION_MS,
  DEFAULT_DETERMINISTIC_SEED,
} from '../../types.js';
import { createPrng } from '../../determinism/random-injection.js';
import { bytesToPages } from '../../internal-types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides?: Partial<SandboxConfig>): SandboxConfig {
  return {
    maxMemoryBytes: DEFAULT_MAX_MEMORY_BYTES,
    maxGas: DEFAULT_MAX_GAS,
    maxExecutionMs: DEFAULT_MAX_EXECUTION_MS,
    hostFunctions: {},
    deterministicSeed: DEFAULT_DETERMINISTIC_SEED,
    eventTimestamp: 1700000000000,
    ...overrides,
  };
}

function makeMetrics(overrides?: Partial<ResourceMetrics>): ResourceMetrics {
  return {
    memoryUsedBytes: 65_536,
    memoryLimitBytes: DEFAULT_MAX_MEMORY_BYTES,
    gasUsed: 0,
    gasLimit: DEFAULT_MAX_GAS,
    executionMs: 0,
    executionLimitMs: DEFAULT_MAX_EXECUTION_MS,
    ...overrides,
  };
}

function makeLoadedState(overrides?: Partial<InternalSandboxState>): InternalSandboxState {
  const config = makeConfig();
  const maxPages = bytesToPages(config.maxMemoryBytes);
  return {
    id: 'snap-test-0',
    config,
    status: 'loaded',
    metrics: makeMetrics(),
    wasmMemory: new WebAssembly.Memory({ initial: 1, maximum: maxPages }),
    wasmModule: null,
    wasmInstance: null,
    executionContext: null,
    prng: createPrng(config.deterministicSeed),
    ...overrides,
  };
}

/** Create a valid snapshot from a state for use in restore tests. */
function captureSnapshot(state: InternalSandboxState): Uint8Array {
  const result = createSnapshot(state);
  if (!result.ok) throw new Error('Failed to create snapshot for test setup');
  return result.value;
}

/** Extract a non-null value or fail the test. */
function requireNonNull<T>(value: T | null, label: string): T {
  expect(value, `${label} should not be null`).not.toBeNull();
  return value as T;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('restoreSnapshot', () => {
  it('restores memory from a valid snapshot', () => {
    const state = makeLoadedState();
    const wasmMem = requireNonNull(state.wasmMemory, 'wasmMemory');
    // Write pattern into memory
    const mem = new Uint8Array(wasmMem.buffer);
    mem[0] = 0xca;
    mem[1] = 0xfe;

    const snap = captureSnapshot(state);

    // Clear memory to simulate modification
    mem[0] = 0x00;
    mem[1] = 0x00;

    const result = restoreSnapshot(state, snap);
    expect(result.ok).toBe(true);

    // Verify memory was restored
    const restored = new Uint8Array(wasmMem.buffer);
    expect(restored[0]).toBe(0xca);
    expect(restored[1]).toBe(0xfe);
  });

  it('restores PRNG state from snapshot', () => {
    const state = makeLoadedState();
    const prng = requireNonNull(state.prng, 'prng');
    // Advance PRNG
    prng.next();
    prng.next();
    const prngStateBefore = prng.getState();
    const nextValueBefore = prng.next();

    // Snapshot captures prng state AFTER 2 advances (before the 3rd call above)
    // We need to re-advance to match
    prng.setState(prngStateBefore);
    const snap = captureSnapshot(state);

    // Advance PRNG further (to a different position)
    prng.next();
    prng.next();
    prng.next();

    // Restore
    const result = restoreSnapshot(state, snap);
    expect(result.ok).toBe(true);

    // Next value should match what we recorded
    expect(prng.next()).toBe(nextValueBefore);
  });

  it('restores gasUsed from snapshot', () => {
    const state = makeLoadedState({ metrics: makeMetrics({ gasUsed: 12_345 }) });
    const snap = captureSnapshot(state);

    // Change gas
    state.metrics = { ...state.metrics, gasUsed: 99_999 };

    const result = restoreSnapshot(state, snap);
    expect(result.ok).toBe(true);
    expect(state.metrics.gasUsed).toBe(12_345);
  });

  it('sets status to loaded after restore', () => {
    const snapState = makeLoadedState();
    const snap = captureSnapshot(snapState);

    // Create a suspended state sharing the same memory
    const state = makeLoadedState({ status: 'suspended' as const });
    const wasmMem = requireNonNull(snapState.wasmMemory, 'wasmMemory');
    (state as { wasmMemory: WebAssembly.Memory }).wasmMemory = wasmMem;

    const result = restoreSnapshot(state, snap);
    expect(result.ok).toBe(true);
    expect(state.status).toBe('loaded');
  });

  it('rejects snapshot with bad magic bytes', () => {
    const badSnap = new Uint8Array(20);
    badSnap[0] = 0x00;
    badSnap[1] = 0x00;
    badSnap[2] = 0x00;
    badSnap[3] = 0x00;

    const state = makeLoadedState();
    const result = restoreSnapshot(state, badSnap);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SNAPSHOT_ERROR');
    expect(result.error).toHaveProperty('reason', expect.stringContaining('magic'));
  });

  it('rejects snapshot with unknown version', () => {
    const state = makeLoadedState();
    const snap = captureSnapshot(state);

    // Corrupt version byte
    snap[4] = 99;

    const result = restoreSnapshot(state, snap);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SNAPSHOT_ERROR');
    expect(result.error).toHaveProperty('reason', expect.stringContaining('version'));
  });

  it('rejects snapshot that is too small for header', () => {
    const state = makeLoadedState();
    const tinySnap = new Uint8Array(3);
    const result = restoreSnapshot(state, tinySnap);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SNAPSHOT_ERROR');
    expect(result.error).toHaveProperty('reason', expect.stringContaining('header'));
  });

  it('rejects snapshot with wrong memory size', () => {
    // Create a snapshot with 2-page memory, try to restore into 1-page instance
    const config2Pages = makeConfig({ maxMemoryBytes: 131_072 });
    const twoPageState: InternalSandboxState = {
      id: 'two-page',
      config: config2Pages,
      status: 'loaded',
      metrics: makeMetrics({ memoryUsedBytes: 131_072 }),
      wasmMemory: new WebAssembly.Memory({ initial: 2, maximum: 2 }),
      wasmModule: null,
      wasmInstance: null,
      executionContext: null,
      prng: createPrng(config2Pages.deterministicSeed),
    };
    const snap = captureSnapshot(twoPageState);

    // Try to restore into a 1-page instance
    const onePageState = makeLoadedState();
    const result = restoreSnapshot(onePageState, snap);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SNAPSHOT_ERROR');
    expect(result.error).toHaveProperty('reason', expect.stringContaining('memory size'));
  });

  it('rejects snapshot truncated in memory section', () => {
    const state = makeLoadedState();
    const snap = captureSnapshot(state);

    // Truncate after memory length but before full memory
    const truncated = snap.subarray(0, HEADER_SIZE + 4 + 100);
    const result = restoreSnapshot(state, truncated);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SNAPSHOT_ERROR');
    expect(result.error).toHaveProperty('reason', expect.stringContaining('truncated'));
  });

  it('rejects snapshot truncated before state section', () => {
    const state = makeLoadedState();
    const snap = captureSnapshot(state);

    // Keep header + memory but cut off state section
    const memLength = 65_536;
    const cutPoint = HEADER_SIZE + 4 + memLength; // right before state length
    const truncated = snap.subarray(0, cutPoint);
    const result = restoreSnapshot(state, truncated);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SNAPSHOT_ERROR');
  });

  it('rejects restore into destroyed instance', () => {
    const state = makeLoadedState({ status: 'destroyed' });
    const snapState = makeLoadedState();
    const snap = captureSnapshot(snapState);

    const result = restoreSnapshot(state, snap);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SNAPSHOT_ERROR');
    expect(result.error).toHaveProperty('reason', expect.stringContaining('destroyed'));
  });

  it('rejects restore into created instance', () => {
    const state = makeLoadedState({ status: 'created' });
    const snapState = makeLoadedState();
    const snap = captureSnapshot(snapState);

    const result = restoreSnapshot(state, snap);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SNAPSHOT_ERROR');
  });

  it('multiple snapshot/restore cycles produce consistent state', () => {
    const state = makeLoadedState();
    const wasmMem = requireNonNull(state.wasmMemory, 'wasmMemory');
    const prng = requireNonNull(state.prng, 'prng');
    const mem = new Uint8Array(wasmMem.buffer);

    // Write pattern 1
    mem[0] = 0xaa;
    mem[100] = 0xbb;
    prng.next();
    const gasAfterStep1 = 1000;
    state.metrics = { ...state.metrics, gasUsed: gasAfterStep1 };
    const snap1 = captureSnapshot(state);

    // Modify state
    mem[0] = 0xff;
    mem[100] = 0xff;
    prng.next();
    prng.next();
    state.metrics = { ...state.metrics, gasUsed: 9999 };

    // Restore to snap1
    const r1 = restoreSnapshot(state, snap1);
    expect(r1.ok).toBe(true);
    expect(mem[0]).toBe(0xaa);
    expect(mem[100]).toBe(0xbb);
    expect(state.metrics.gasUsed).toBe(gasAfterStep1);

    // Snapshot again — should produce identical bytes
    const snap2 = captureSnapshot(state);

    // Modify again
    mem[0] = 0x11;
    state.metrics = { ...state.metrics, gasUsed: 5555 };

    // Restore from snap2
    const r2 = restoreSnapshot(state, snap2);
    expect(r2.ok).toBe(true);
    expect(mem[0]).toBe(0xaa);
    expect(state.metrics.gasUsed).toBe(gasAfterStep1);
  });

  it('rejects snapshot with corrupted state JSON', () => {
    const state = makeLoadedState();
    const snap = captureSnapshot(state);

    // Find and corrupt the state JSON section
    const view = new DataView(snap.buffer, snap.byteOffset, snap.byteLength);
    const memLength = view.getUint32(HEADER_SIZE, true);
    const stateOffset = HEADER_SIZE + 4 + memLength + 4;

    // Overwrite the first bytes of state JSON with garbage
    snap[stateOffset] = 0xff;
    snap[stateOffset + 1] = 0xff;
    snap[stateOffset + 2] = 0xff;

    const result = restoreSnapshot(state, snap);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SNAPSHOT_ERROR');
    expect(result.error).toHaveProperty('reason', expect.stringContaining('corrupted'));
  });

  it('handles restore with null prng gracefully', () => {
    const state = makeLoadedState({ prng: null });
    const snapState = makeLoadedState({ prng: null });
    const snap = captureSnapshot(snapState);

    const result = restoreSnapshot(state, snap);
    expect(result.ok).toBe(true);
  });
});
