import { describe, it, expect, beforeEach } from 'vitest';
import { createSandboxInstance, resetInstanceCounter } from '../instance-factory.js';
import { bytesToPages, WASM_PAGE_SIZE } from '../../internal-types.js';
import type { SandboxConfig } from '../../types.js';
import {
  DEFAULT_MAX_MEMORY_BYTES,
  DEFAULT_MAX_GAS,
  DEFAULT_MAX_EXECUTION_MS,
  DEFAULT_DETERMINISTIC_SEED,
} from '../../types.js';

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

describe('createSandboxInstance', () => {
  beforeEach(() => {
    resetInstanceCounter();
  });

  it('creates an instance with a unique ID', () => {
    const { instance: a } = createSandboxInstance(makeConfig());
    const { instance: b } = createSandboxInstance(makeConfig());
    expect(a.id).toBe('sandbox-0');
    expect(b.id).toBe('sandbox-1');
    expect(a.id).not.toBe(b.id);
  });

  it('sets initial status to created', () => {
    const { instance, state } = createSandboxInstance(makeConfig());
    expect(instance.status).toBe('created');
    expect(state.status).toBe('created');
  });

  it('freezes the config', () => {
    const { instance } = createSandboxInstance(makeConfig());
    expect(Object.isFrozen(instance.config)).toBe(true);
  });

  it('initializes metrics to zero (except memory)', () => {
    const { instance } = createSandboxInstance(makeConfig());
    expect(instance.metrics.gasUsed).toBe(0);
    expect(instance.metrics.executionMs).toBe(0);
    expect(instance.metrics.gasLimit).toBe(DEFAULT_MAX_GAS);
    expect(instance.metrics.executionLimitMs).toBe(DEFAULT_MAX_EXECUTION_MS);
    expect(instance.metrics.memoryLimitBytes).toBe(DEFAULT_MAX_MEMORY_BYTES);
  });

  it('allocates initial WASM memory (1 page = 64 KB)', () => {
    const { state } = createSandboxInstance(makeConfig());
    expect(state.wasmMemory).not.toBeNull();
    expect(state.wasmMemory?.buffer.byteLength).toBe(WASM_PAGE_SIZE);
  });

  it('stores config on internal state', () => {
    const config = makeConfig({ maxGas: 500_000 });
    const { state } = createSandboxInstance(config);
    expect(state.config.maxGas).toBe(500_000);
  });

  it('starts with null WASM module and instance', () => {
    const { state } = createSandboxInstance(makeConfig());
    expect(state.wasmModule).toBeNull();
    expect(state.wasmInstance).toBeNull();
  });
});

describe('bytesToPages', () => {
  it('returns 1 page for 64 KB', () => {
    expect(bytesToPages(65_536)).toBe(1);
  });

  it('returns 2 pages for 65 KB (rounds up)', () => {
    expect(bytesToPages(65_537)).toBe(2);
  });

  it('returns 16 pages for 1 MB', () => {
    expect(bytesToPages(1_048_576)).toBe(16);
  });

  it('returns 256 pages for 16 MB (default)', () => {
    expect(bytesToPages(DEFAULT_MAX_MEMORY_BYTES)).toBe(256);
  });

  it('returns 1 page for 1 byte (minimum)', () => {
    expect(bytesToPages(1)).toBe(1);
  });
});
