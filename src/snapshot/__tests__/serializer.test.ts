import { describe, it, expect } from 'vitest';
import {
  createSnapshot,
  SNAPSHOT_MAGIC,
  SNAPSHOT_VERSION,
  HEADER_SIZE,
} from '../serializer.js';
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

/** Extract a non-null value or fail the test. */
function requireNonNull<T>(value: T | null, label: string): T {
  expect(value, `${label} should not be null`).not.toBeNull();
  return value as T;
}

/** Parse the state JSON section from a snapshot binary. */
function parseStateJson(snap: Uint8Array): Record<string, unknown> {
  const view = new DataView(snap.buffer, snap.byteOffset, snap.byteLength);
  const memLength = view.getUint32(HEADER_SIZE, true);
  const stateOffset = HEADER_SIZE + 4 + memLength;
  const stateLength = view.getUint32(stateOffset, true);
  const stateJsonBytes = snap.subarray(stateOffset + 4, stateOffset + 4 + stateLength);
  return JSON.parse(new TextDecoder().decode(stateJsonBytes)) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createSnapshot', () => {
  it('produces a valid binary snapshot from a loaded instance', () => {
    const state = makeLoadedState();
    const result = createSnapshot(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const snap = result.value;
    // At minimum: header (5) + memory length (4) + 64KB memory + state length (4) + state JSON
    expect(snap.byteLength).toBeGreaterThan(HEADER_SIZE + 4 + 65_536);
  });

  it('snapshot header contains magic bytes "WSNP"', () => {
    const state = makeLoadedState();
    const result = createSnapshot(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const snap = result.value;
    expect(snap[0]).toBe(SNAPSHOT_MAGIC[0]); // W
    expect(snap[1]).toBe(SNAPSHOT_MAGIC[1]); // S
    expect(snap[2]).toBe(SNAPSHOT_MAGIC[2]); // N
    expect(snap[3]).toBe(SNAPSHOT_MAGIC[3]); // P
  });

  it('snapshot header contains correct version', () => {
    const state = makeLoadedState();
    const result = createSnapshot(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value[4]).toBe(SNAPSHOT_VERSION);
  });

  it('snapshot contains correct memory size in header', () => {
    const state = makeLoadedState();
    const result = createSnapshot(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const view = new DataView(
      result.value.buffer,
      result.value.byteOffset,
      result.value.byteLength,
    );
    const memLength = view.getUint32(HEADER_SIZE, true);
    expect(memLength).toBe(65_536); // 1 WASM page
  });

  it('captures modified memory contents', () => {
    const state = makeLoadedState();
    // Write a known pattern into memory
    const wasmMem = requireNonNull(state.wasmMemory, 'wasmMemory');
    const mem = new Uint8Array(wasmMem.buffer);
    mem[0] = 0xde;
    mem[1] = 0xad;
    mem[2] = 0xbe;
    mem[3] = 0xef;

    const result = createSnapshot(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Memory starts at offset HEADER_SIZE + 4
    const memOffset = HEADER_SIZE + 4;
    expect(result.value[memOffset]).toBe(0xde);
    expect(result.value[memOffset + 1]).toBe(0xad);
    expect(result.value[memOffset + 2]).toBe(0xbe);
    expect(result.value[memOffset + 3]).toBe(0xef);
  });

  it('captures PRNG state correctly', () => {
    const state = makeLoadedState();
    // Advance PRNG a few steps
    const prng = requireNonNull(state.prng, 'prng');
    prng.next();
    prng.next();
    const prngState = prng.getState();

    const result = createSnapshot(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stateJson = parseStateJson(result.value) as { prngState: { current: number } };
    expect(stateJson.prngState.current).toBe(prngState.current);
  });

  it('captures gasUsed from metrics', () => {
    const state = makeLoadedState({ metrics: makeMetrics({ gasUsed: 42_000 }) });
    const result = createSnapshot(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const stateJson = parseStateJson(result.value) as { gasUsed: number };
    expect(stateJson.gasUsed).toBe(42_000);
  });

  it('returns SNAPSHOT_ERROR for destroyed instance', () => {
    const state = makeLoadedState({ status: 'destroyed' });
    const result = createSnapshot(state);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SNAPSHOT_ERROR');
    expect(result.error).toHaveProperty('reason');
  });

  it('returns SNAPSHOT_ERROR for created (not loaded) instance', () => {
    const state = makeLoadedState({ status: 'created' });
    const result = createSnapshot(state);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SNAPSHOT_ERROR');
  });

  it('returns SNAPSHOT_ERROR for running instance', () => {
    const state = makeLoadedState({ status: 'running' });
    const result = createSnapshot(state);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SNAPSHOT_ERROR');
  });

  it('returns SNAPSHOT_ERROR when wasmMemory is null', () => {
    const state = makeLoadedState({ wasmMemory: null });
    const result = createSnapshot(state);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('SNAPSHOT_ERROR');
  });

  it('handles instance with null prng gracefully', () => {
    const state = makeLoadedState({ prng: null });
    const result = createSnapshot(state);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Parse state JSON — prngState.current should default to 0
    const stateJson = parseStateJson(result.value) as { prngState: { current: number } };
    expect(stateJson.prngState.current).toBe(0);
  });
});
