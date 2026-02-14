/**
 * ri-sandbox — Memory limiter
 *
 * Tracks and reports WASM linear memory usage.
 * The hard memory limit is enforced by `WebAssembly.Memory({ maximum })`,
 * but this module provides reporting and detection utilities.
 */

import type { SandboxError } from '../errors.js';
import { memoryExceeded } from '../errors.js';

// ---------------------------------------------------------------------------
// Memory Usage
// ---------------------------------------------------------------------------

/**
 * Get the current memory usage in bytes from a WebAssembly.Memory instance.
 *
 * @returns Memory usage in bytes, or 0 if memory is null.
 */
export function getMemoryUsageBytes(memory: WebAssembly.Memory | null): number {
  if (memory === null) {
    return 0;
  }
  return memory.buffer.byteLength;
}

/**
 * Get the current memory usage in WASM pages (64 KB each).
 *
 * @returns Memory usage in pages, or 0 if memory is null.
 */
export function getMemoryUsagePages(memory: WebAssembly.Memory | null): number {
  if (memory === null) {
    return 0;
  }
  return memory.buffer.byteLength / 65_536;
}

// ---------------------------------------------------------------------------
// Memory Limit Checking
// ---------------------------------------------------------------------------

/** Result of a memory limit check. */
export interface MemoryCheckResult {
  /** Current memory usage in bytes. */
  readonly usedBytes: number;
  /** Configured limit in bytes. */
  readonly limitBytes: number;
  /** Whether usage exceeds the configured limit. */
  readonly exceeded: boolean;
}

/**
 * Check whether WASM memory usage exceeds the configured limit.
 *
 * Note: The hard limit is enforced by `WebAssembly.Memory({ maximum })`,
 * so this check is for reporting. The browser/runtime traps `memory.grow`
 * that would exceed `maximum`, returning -1.
 *
 * @param memory - The WebAssembly.Memory instance to check.
 * @param limitBytes - Configured memory limit in bytes.
 * @returns MemoryCheckResult with usage details.
 */
export function checkMemoryLimit(
  memory: WebAssembly.Memory | null,
  limitBytes: number,
): MemoryCheckResult {
  const usedBytes = getMemoryUsageBytes(memory);

  return {
    usedBytes,
    limitBytes,
    exceeded: usedBytes > limitBytes,
  };
}

/**
 * Create a MEMORY_EXCEEDED error from a memory check result.
 * Only call this when `result.exceeded` is true.
 */
export function createMemoryExceededError(result: MemoryCheckResult): SandboxError {
  return memoryExceeded(result.usedBytes, result.limitBytes);
}
