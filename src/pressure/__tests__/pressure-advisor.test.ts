import { describe, it, expect } from 'vitest';
import { advise } from '../pressure-advisor.js';
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

function makeInstance(id: string, status: 'loaded' | 'destroyed' = 'loaded'): SandboxInstance {
  const config: SandboxConfig = {
    maxMemoryBytes: DEFAULT_MAX_MEMORY_BYTES,
    maxGas: DEFAULT_MAX_GAS,
    maxExecutionMs: DEFAULT_MAX_EXECUTION_MS,
    hostFunctions: {},
    deterministicSeed: DEFAULT_DETERMINISTIC_SEED,
    eventTimestamp: 1700000000000,
  };
  const metrics: ResourceMetrics = {
    memoryUsedBytes: 65_536,
    memoryLimitBytes: DEFAULT_MAX_MEMORY_BYTES,
    gasUsed: 0,
    gasLimit: DEFAULT_MAX_GAS,
    executionMs: 0,
    executionLimitMs: DEFAULT_MAX_EXECUTION_MS,
  };
  return { id, config, status, metrics };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('advise', () => {
  const instances = [
    makeInstance('inst-0'),
    makeInstance('inst-1'),
    makeInstance('inst-2'),
  ];

  it('NORMAL → no action', () => {
    const rec = advise('NORMAL', instances);
    expect(rec.action).toBe('none');
  });

  it('WARNING → log recommendation with instance count', () => {
    const rec = advise('WARNING', instances);
    expect(rec.action).toBe('log');
    if (rec.action === 'log') {
      expect(rec.message).toContain('70%');
      expect(rec.message).toContain('3');
    }
  });

  it('PRESSURE → suspend non-foreground instances', () => {
    const rec = advise('PRESSURE', instances, 'inst-0');
    expect(rec.action).toBe('suspend');
    if (rec.action === 'suspend') {
      expect(rec.instanceIds).toEqual(['inst-1', 'inst-2']);
    }
  });

  it('PRESSURE without foreground → suspend all instances', () => {
    const rec = advise('PRESSURE', instances);
    expect(rec.action).toBe('suspend');
    if (rec.action === 'suspend') {
      expect(rec.instanceIds).toEqual(['inst-0', 'inst-1', 'inst-2']);
    }
  });

  it('CRITICAL → emergency_save non-foreground instances', () => {
    const rec = advise('CRITICAL', instances, 'inst-1');
    expect(rec.action).toBe('emergency_save');
    if (rec.action === 'emergency_save') {
      expect(rec.instanceIds).toEqual(['inst-0', 'inst-2']);
    }
  });

  it('OOM → emergency_save non-foreground instances', () => {
    const rec = advise('OOM', instances, 'inst-0');
    expect(rec.action).toBe('emergency_save');
    if (rec.action === 'emergency_save') {
      expect(rec.instanceIds).toEqual(['inst-1', 'inst-2']);
    }
  });

  it('excludes destroyed instances from recommendations', () => {
    const mixed = [
      makeInstance('alive-0'),
      makeInstance('dead-1', 'destroyed'),
      makeInstance('alive-2'),
    ];
    const rec = advise('PRESSURE', mixed, 'alive-0');
    expect(rec.action).toBe('suspend');
    if (rec.action === 'suspend') {
      expect(rec.instanceIds).toEqual(['alive-2']);
    }
  });

  it('returns empty instanceIds when only foreground is alive', () => {
    const single = [makeInstance('only-one')];
    const rec = advise('CRITICAL', single, 'only-one');
    expect(rec.action).toBe('emergency_save');
    if (rec.action === 'emergency_save') {
      expect(rec.instanceIds).toEqual([]);
    }
  });

  it('returns empty instanceIds with no instances', () => {
    const rec = advise('PRESSURE', []);
    expect(rec.action).toBe('suspend');
    if (rec.action === 'suspend') {
      expect(rec.instanceIds).toEqual([]);
    }
  });

  it('WARNING with single instance includes count in message', () => {
    const rec = advise('WARNING', [makeInstance('solo')]);
    expect(rec.action).toBe('log');
    if (rec.action === 'log') {
      expect(rec.message).toContain('1');
    }
  });
});
