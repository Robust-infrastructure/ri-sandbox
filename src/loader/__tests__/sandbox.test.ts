import { describe, it, expect, beforeEach } from 'vitest';
import { createWasmSandbox } from '../../sandbox.js';
import { resetInstanceCounter } from '../instance-factory.js';
import type { SandboxConfig, WasmSandbox, SandboxInstance } from '../../types.js';
import {
  DEFAULT_MAX_MEMORY_BYTES,
  DEFAULT_MAX_GAS,
  DEFAULT_MAX_EXECUTION_MS,
  DEFAULT_DETERMINISTIC_SEED,
} from '../../types.js';
import { memoryImportWasmModule } from './wasm-fixtures.js';

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

describe('sandbox create & load', () => {
  let sandbox: WasmSandbox;

  beforeEach(() => {
    resetInstanceCounter();
    sandbox = createWasmSandbox();
  });

  it('create returns an instance with status created', () => {
    const instance = sandbox.create(makeConfig());
    expect(instance.id).toBe('sandbox-0');
    expect(instance.status).toBe('created');
  });

  it('create produces unique IDs', () => {
    const a = sandbox.create(makeConfig());
    const b = sandbox.create(makeConfig());
    expect(a.id).not.toBe(b.id);
  });

  it('load succeeds with a valid WASM module', async () => {
    const instance = sandbox.create(makeConfig());
    await expect(sandbox.load(instance, memoryImportWasmModule())).resolves.toBeUndefined();
  });

  it('load throws for invalid WASM bytes', async () => {
    const instance = sandbox.create(makeConfig());
    const badBytes = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
    await expect(sandbox.load(instance, badBytes)).rejects.toThrow('Failed to load WASM module');
  });

  it('load throws for unknown instance', async () => {
    const fakeInstance: SandboxInstance = {
      id: 'nonexistent',
      config: makeConfig(),
      status: 'created',
      metrics: {
        memoryUsedBytes: 0,
        memoryLimitBytes: DEFAULT_MAX_MEMORY_BYTES,
        gasUsed: 0,
        gasLimit: DEFAULT_MAX_GAS,
        executionMs: 0,
        executionLimitMs: DEFAULT_MAX_EXECUTION_MS,
      },
    };
    await expect(sandbox.load(fakeInstance, memoryImportWasmModule())).rejects.toThrow(
      'Unknown sandbox instance',
    );
  });

  it('getMetrics returns current metrics', async () => {
    const instance = sandbox.create(makeConfig());
    await sandbox.load(instance, memoryImportWasmModule());
    const metrics = sandbox.getMetrics(instance);
    expect(metrics.gasUsed).toBe(0);
    expect(metrics.gasLimit).toBe(DEFAULT_MAX_GAS);
    expect(metrics.memoryLimitBytes).toBe(DEFAULT_MAX_MEMORY_BYTES);
    expect(metrics.memoryUsedBytes).toBeGreaterThan(0);
  });
});

describe('sandbox destroy', () => {
  let sandbox: WasmSandbox;
  let instance: SandboxInstance;

  beforeEach(async () => {
    resetInstanceCounter();
    sandbox = createWasmSandbox();
    instance = sandbox.create(makeConfig());
    await sandbox.load(instance, memoryImportWasmModule());
  });

  it('destroy sets status to destroyed (no throw)', () => {
    expect(() => { sandbox.destroy(instance); }).not.toThrow();
  });

  it('destroy is idempotent (calling twice does not throw)', () => {
    sandbox.destroy(instance);
    expect(() => { sandbox.destroy(instance); }).not.toThrow();
  });

  it('getMetrics throws after destroy', () => {
    sandbox.destroy(instance);
    expect(() => { sandbox.getMetrics(instance); }).toThrow('destroyed');
  });

  it('load throws after destroy', async () => {
    sandbox.destroy(instance);
    await expect(sandbox.load(instance, memoryImportWasmModule())).rejects.toThrow('destroyed');
  });

  it('execute throws after destroy (stub — will be real in M4)', () => {
    sandbox.destroy(instance);
    // execute currently throws "not yet implemented" regardless,
    // but once implemented, it should return INSTANCE_DESTROYED.
    expect(() => { sandbox.execute(instance, 'test', {}); }).toThrow();
  });

  it('snapshot throws after destroy (stub — will be real in M7)', () => {
    sandbox.destroy(instance);
    expect(() => { sandbox.snapshot(instance); }).toThrow();
  });
});
