/**
 * ri-sandbox — Memory limiter unit tests
 *
 * Tests memory usage reporting and limit checking.
 */

import { describe, it, expect } from 'vitest';
import {
  getMemoryUsageBytes,
  getMemoryUsagePages,
  checkMemoryLimit,
  createMemoryExceededError,
} from '../memory-limiter.js';

// ---------------------------------------------------------------------------
// getMemoryUsageBytes
// ---------------------------------------------------------------------------

describe('getMemoryUsageBytes', () => {
  it('returns 0 for null memory', () => {
    expect(getMemoryUsageBytes(null)).toBe(0);
  });

  it('returns byte length for a 1-page memory', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    expect(getMemoryUsageBytes(memory)).toBe(65_536);
  });

  it('returns byte length for a 4-page memory', () => {
    const memory = new WebAssembly.Memory({ initial: 4 });
    expect(getMemoryUsageBytes(memory)).toBe(4 * 65_536);
  });
});

// ---------------------------------------------------------------------------
// getMemoryUsagePages
// ---------------------------------------------------------------------------

describe('getMemoryUsagePages', () => {
  it('returns 0 for null memory', () => {
    expect(getMemoryUsagePages(null)).toBe(0);
  });

  it('returns 1 for a 1-page memory', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    expect(getMemoryUsagePages(memory)).toBe(1);
  });

  it('returns 4 for a 4-page memory', () => {
    const memory = new WebAssembly.Memory({ initial: 4 });
    expect(getMemoryUsagePages(memory)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// checkMemoryLimit
// ---------------------------------------------------------------------------

describe('checkMemoryLimit', () => {
  it('returns not exceeded for null memory', () => {
    const result = checkMemoryLimit(null, 65_536);
    expect(result.exceeded).toBe(false);
    expect(result.usedBytes).toBe(0);
    expect(result.limitBytes).toBe(65_536);
  });

  it('returns not exceeded when usage equals limit', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const result = checkMemoryLimit(memory, 65_536);
    expect(result.exceeded).toBe(false);
    expect(result.usedBytes).toBe(65_536);
  });

  it('returns not exceeded when usage is below limit', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const result = checkMemoryLimit(memory, 2 * 65_536);
    expect(result.exceeded).toBe(false);
  });

  it('returns exceeded when usage is above limit', () => {
    const memory = new WebAssembly.Memory({ initial: 2 });
    const result = checkMemoryLimit(memory, 65_536);
    expect(result.exceeded).toBe(true);
    expect(result.usedBytes).toBe(2 * 65_536);
    expect(result.limitBytes).toBe(65_536);
  });
});

// ---------------------------------------------------------------------------
// createMemoryExceededError
// ---------------------------------------------------------------------------

describe('createMemoryExceededError', () => {
  it('creates MEMORY_EXCEEDED error from check result', () => {
    const result = checkMemoryLimit(
      new WebAssembly.Memory({ initial: 2 }),
      65_536,
    );
    const error = createMemoryExceededError(result);
    expect(error.code).toBe('MEMORY_EXCEEDED');
    if (error.code === 'MEMORY_EXCEEDED') {
      expect(error.memoryUsed).toBe(2 * 65_536);
      expect(error.memoryLimit).toBe(65_536);
    }
  });

  it('produces deterministic results for same inputs', () => {
    const mem1 = new WebAssembly.Memory({ initial: 3 });
    const mem2 = new WebAssembly.Memory({ initial: 3 });
    const r1 = checkMemoryLimit(mem1, 65_536);
    const r2 = checkMemoryLimit(mem2, 65_536);

    expect(r1.usedBytes).toBe(r2.usedBytes);
    expect(r1.limitBytes).toBe(r2.limitBytes);
    expect(r1.exceeded).toBe(r2.exceeded);
  });
});
