import { describe, it, expect } from 'vitest';
import { getMemoryPressure } from '../memory-pressure.js';
import type { SandboxInstance, SandboxConfig, ResourceMetrics } from '../../types.js';
import {
  DEFAULT_MAX_MEMORY_BYTES,
  DEFAULT_MAX_GAS,
  DEFAULT_MAX_EXECUTION_MS,
  DEFAULT_DETERMINISTIC_SEED,
} from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInstance(memoryUsedBytes: number, id = 'test-0'): SandboxInstance {
  const config: SandboxConfig = {
    maxMemoryBytes: DEFAULT_MAX_MEMORY_BYTES,
    maxGas: DEFAULT_MAX_GAS,
    maxExecutionMs: DEFAULT_MAX_EXECUTION_MS,
    hostFunctions: {},
    deterministicSeed: DEFAULT_DETERMINISTIC_SEED,
    eventTimestamp: 1700000000000,
  };
  const metrics: ResourceMetrics = {
    memoryUsedBytes,
    memoryLimitBytes: DEFAULT_MAX_MEMORY_BYTES,
    gasUsed: 0,
    gasLimit: DEFAULT_MAX_GAS,
    executionMs: 0,
    executionLimitMs: DEFAULT_MAX_EXECUTION_MS,
  };
  return { id, config, status: 'loaded', metrics };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('getMemoryPressure', () => {
  const availableBytes = 1_000_000;

  it('returns NORMAL for 0% usage', () => {
    expect(getMemoryPressure([], availableBytes)).toBe('NORMAL');
  });

  it('returns NORMAL for 50% usage', () => {
    const instances = [makeInstance(500_000)];
    expect(getMemoryPressure(instances, availableBytes)).toBe('NORMAL');
  });

  it('returns NORMAL for 69% usage', () => {
    const instances = [makeInstance(690_000)];
    expect(getMemoryPressure(instances, availableBytes)).toBe('NORMAL');
  });

  it('returns WARNING at exactly 70% usage (boundary)', () => {
    const instances = [makeInstance(700_000)];
    expect(getMemoryPressure(instances, availableBytes)).toBe('WARNING');
  });

  it('returns WARNING for 75% usage', () => {
    const instances = [makeInstance(750_000)];
    expect(getMemoryPressure(instances, availableBytes)).toBe('WARNING');
  });

  it('returns WARNING for 84% usage', () => {
    const instances = [makeInstance(840_000)];
    expect(getMemoryPressure(instances, availableBytes)).toBe('WARNING');
  });

  it('returns PRESSURE at exactly 85% usage (boundary)', () => {
    const instances = [makeInstance(850_000)];
    expect(getMemoryPressure(instances, availableBytes)).toBe('PRESSURE');
  });

  it('returns PRESSURE for 90% usage', () => {
    const instances = [makeInstance(900_000)];
    expect(getMemoryPressure(instances, availableBytes)).toBe('PRESSURE');
  });

  it('returns CRITICAL at exactly 95% usage (boundary)', () => {
    const instances = [makeInstance(950_000)];
    expect(getMemoryPressure(instances, availableBytes)).toBe('CRITICAL');
  });

  it('returns CRITICAL for 99% usage', () => {
    const instances = [makeInstance(990_000)];
    expect(getMemoryPressure(instances, availableBytes)).toBe('CRITICAL');
  });

  it('returns OOM at exactly 100% usage', () => {
    const instances = [makeInstance(1_000_000)];
    expect(getMemoryPressure(instances, availableBytes)).toBe('OOM');
  });

  it('returns OOM for > 100% usage', () => {
    const instances = [makeInstance(1_200_000)];
    expect(getMemoryPressure(instances, availableBytes)).toBe('OOM');
  });

  it('sums memory across multiple instances', () => {
    const instances = [
      makeInstance(300_000, 'a'),
      makeInstance(400_000, 'b'),
    ];
    // 700_000 / 1_000_000 = 70% → WARNING
    expect(getMemoryPressure(instances, availableBytes)).toBe('WARNING');
  });

  it('sums memory across many instances correctly', () => {
    const instances = [
      makeInstance(200_000, 'a'),
      makeInstance(200_000, 'b'),
      makeInstance(200_000, 'c'),
      makeInstance(300_000, 'd'),
    ];
    // 900_000 / 1_000_000 = 90% → PRESSURE
    expect(getMemoryPressure(instances, availableBytes)).toBe('PRESSURE');
  });

  it('single instance using all memory returns OOM', () => {
    const instances = [makeInstance(1_000_000)];
    expect(getMemoryPressure(instances, availableBytes)).toBe('OOM');
  });

  it('returns OOM when availableBytes is 0', () => {
    expect(getMemoryPressure([], 0)).toBe('OOM');
  });

  it('returns OOM when availableBytes is negative', () => {
    expect(getMemoryPressure([], -1)).toBe('OOM');
  });
});
