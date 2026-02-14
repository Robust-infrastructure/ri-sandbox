/**
 * ri-sandbox — Memory pressure computation
 *
 * Computes system-wide memory pressure level from sandbox instance usage.
 * The caller provides `availableBytes` — this library never accesses
 * platform memory APIs directly.
 */

import type { SandboxInstance, MemoryPressureLevel } from '../types.js';

// ---------------------------------------------------------------------------
// Thresholds (percentages)
// ---------------------------------------------------------------------------

/** Usage percentage at or above which pressure is WARNING. */
const WARNING_THRESHOLD = 70;

/** Usage percentage at or above which pressure is PRESSURE. */
const PRESSURE_THRESHOLD = 85;

/** Usage percentage at or above which pressure is CRITICAL. */
const CRITICAL_THRESHOLD = 95;

/** Usage percentage at or above which pressure is OOM. */
const OOM_THRESHOLD = 100;

// ---------------------------------------------------------------------------
// Pressure computation
// ---------------------------------------------------------------------------

/**
 * Compute the memory pressure level across all sandbox instances.
 *
 * @param instances      - Active sandbox instances to sum memory from.
 * @param availableBytes - Total memory budget (caller-provided).
 * @returns The current `MemoryPressureLevel`.
 */
export function getMemoryPressure(
  instances: readonly SandboxInstance[],
  availableBytes: number,
): MemoryPressureLevel {
  if (availableBytes <= 0) {
    return 'OOM';
  }

  const totalUsed = instances.reduce(
    (sum, inst) => sum + inst.metrics.memoryUsedBytes,
    0,
  );

  const usagePercent = (totalUsed / availableBytes) * 100;

  if (usagePercent >= OOM_THRESHOLD) return 'OOM';
  if (usagePercent >= CRITICAL_THRESHOLD) return 'CRITICAL';
  if (usagePercent >= PRESSURE_THRESHOLD) return 'PRESSURE';
  if (usagePercent >= WARNING_THRESHOLD) return 'WARNING';
  return 'NORMAL';
}
