/**
 * ri-sandbox — Determinism validator unit tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { validateDeterminism, compareResults } from '../determinism-validator.js';
import type { InternalSandboxState } from '../../internal-types.js';
import type { SandboxConfig } from '../../types.js';
import type { ExecutionResult } from '../../types.js';
import {
  DEFAULT_MAX_MEMORY_BYTES,
  DEFAULT_MAX_GAS,
  DEFAULT_MAX_EXECUTION_MS,
  DEFAULT_DETERMINISTIC_SEED,
} from '../../types.js';
import { addWasmModule, timeImportWasmModule, randomImportWasmModule } from '../../loader/__tests__/wasm-fixtures.js';
import { loadModule } from '../../loader/module-loader.js';
import { instantiate } from '../../loader/instantiator.js';
import { createSandboxInstance, resetInstanceCounter } from '../../loader/instance-factory.js';

function defaultConfig(overrides: Partial<SandboxConfig> = {}): SandboxConfig {
  return {
    maxMemoryBytes: DEFAULT_MAX_MEMORY_BYTES,
    maxGas: DEFAULT_MAX_GAS,
    maxExecutionMs: DEFAULT_MAX_EXECUTION_MS,
    deterministicSeed: DEFAULT_DETERMINISTIC_SEED,
    eventTimestamp: 1700000000000,
    hostFunctions: {},
    ...overrides,
  };
}

async function createLoadedState(
  wasmBytes: Uint8Array,
  configOverrides: Partial<SandboxConfig> = {},
): Promise<InternalSandboxState> {
  const config = defaultConfig(configOverrides);
  const { state } = createSandboxInstance(config);
  const loadResult = await loadModule(wasmBytes);
  if (!loadResult.ok) {
    throw new Error('Failed to load module');
  }
  const instResult = await instantiate(state, loadResult.value);
  if (!instResult.ok) {
    throw new Error('Failed to instantiate module');
  }
  return state;
}

describe('validateDeterminism', () => {
  beforeEach(() => {
    resetInstanceCounter();
  });

  it('reports deterministic for a pure function', async () => {
    const state = await createLoadedState(addWasmModule());
    const timer = (): number => 0;
    const report = validateDeterminism(state, 'add', [3, 4], timer);

    expect(report.deterministic).toBe(true);
    expect(report.mismatch).toBeNull();
    expect(report.firstResult.ok).toBe(true);
    expect(report.secondResult.ok).toBe(true);
    if (report.firstResult.ok && report.secondResult.ok) {
      expect(report.firstResult.value).toBe(7);
      expect(report.secondResult.value).toBe(7);
    }
  });

  it('reports deterministic for time-dependent function with same timestamp', async () => {
    const state = await createLoadedState(timeImportWasmModule(), {
      eventTimestamp: 42,
    });
    const timer = (): number => 0;
    const report = validateDeterminism(state, 'getTime', null, timer);

    expect(report.deterministic).toBe(true);
    if (report.firstResult.ok && report.secondResult.ok) {
      expect(report.firstResult.value).toBe(42);
      expect(report.secondResult.value).toBe(42);
    }
  });

  it('reports deterministic for random-dependent function with same seed', async () => {
    const state = await createLoadedState(randomImportWasmModule(), {
      deterministicSeed: 12345,
    });
    const timer = (): number => 0;
    const report = validateDeterminism(state, 'getRandom', null, timer);

    expect(report.deterministic).toBe(true);
    if (report.firstResult.ok && report.secondResult.ok) {
      // Both runs should produce the same random value
      expect(report.firstResult.value).toBe(report.secondResult.value);
    }
  });

  it('restores state to pre-validation after successful validation', async () => {
    const state = await createLoadedState(addWasmModule());
    const metricsBefore = { ...state.metrics };
    const timer = (): number => 0;
    validateDeterminism(state, 'add', [1, 2], timer);

    // State should be restored
    expect(state.status).toBe('loaded');
    expect(state.metrics.gasUsed).toBe(metricsBefore.gasUsed);
  });

  it('reports results for missing function (both fail identically)', async () => {
    const state = await createLoadedState(addWasmModule());
    const timer = (): number => 0;
    const report = validateDeterminism(state, 'nonexistent', null, timer);

    // Both executions fail the same way → still deterministic
    expect(report.deterministic).toBe(true);
    expect(report.firstResult.ok).toBe(false);
    expect(report.secondResult.ok).toBe(false);
  });
});

describe('compareResults', () => {
  it('returns null when results match', () => {
    const r1: ExecutionResult = {
      ok: true,
      value: 42,
      metrics: {
        memoryUsedBytes: 0,
        memoryLimitBytes: 0,
        gasUsed: 0,
        gasLimit: 0,
        executionMs: 0,
        executionLimitMs: 0,
      },
      gasUsed: 0,
      durationMs: 0,
    };
    const r2: ExecutionResult = { ...r1 };
    expect(compareResults(r1, r2)).toBeNull();
  });

  it('returns mismatch when values differ', () => {
    const r1: ExecutionResult = {
      ok: true,
      value: 42,
      metrics: {
        memoryUsedBytes: 0,
        memoryLimitBytes: 0,
        gasUsed: 0,
        gasLimit: 0,
        executionMs: 0,
        executionLimitMs: 0,
      },
      gasUsed: 0,
      durationMs: 0,
    };
    const r2: ExecutionResult = {
      ok: true,
      value: 99,
      metrics: {
        memoryUsedBytes: 0,
        memoryLimitBytes: 0,
        gasUsed: 0,
        gasLimit: 0,
        executionMs: 0,
        executionLimitMs: 0,
      },
      gasUsed: 0,
      durationMs: 0,
    };
    const mismatch = compareResults(r1, r2);
    expect(mismatch).not.toBeNull();
    expect(mismatch?.reason).toContain('differ');
    expect(mismatch?.firstValue).toContain('42');
    expect(mismatch?.secondValue).toContain('99');
  });

  it('returns mismatch when one succeeds and one fails', () => {
    const r1: ExecutionResult = {
      ok: true,
      value: 42,
      metrics: {
        memoryUsedBytes: 0,
        memoryLimitBytes: 0,
        gasUsed: 0,
        gasLimit: 0,
        executionMs: 0,
        executionLimitMs: 0,
      },
      gasUsed: 0,
      durationMs: 0,
    };
    const r2: ExecutionResult = {
      ok: false,
      error: { code: 'WASM_TRAP', trapKind: 'test', message: 'test error' },
    };
    const mismatch = compareResults(r1, r2);
    expect(mismatch).not.toBeNull();
  });
});
