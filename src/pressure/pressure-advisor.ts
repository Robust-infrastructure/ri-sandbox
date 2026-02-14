/**
 * ri-sandbox — Pressure advisor
 *
 * Given a memory pressure level and a list of sandbox instances, returns
 * actionable recommendations. The library returns recommendations — the
 * caller decides whether to act on them.
 */

import type { SandboxInstance, MemoryPressureLevel } from '../types.js';

// ---------------------------------------------------------------------------
// Recommendation types (discriminated union)
// ---------------------------------------------------------------------------

/** No action needed. */
export interface NoActionRecommendation {
  readonly action: 'none';
}

/** Log a warning message. */
export interface LogRecommendation {
  readonly action: 'log';
  readonly message: string;
}

/** Suspend specific instances (oldest first). */
export interface SuspendRecommendation {
  readonly action: 'suspend';
  readonly instanceIds: readonly string[];
}

/** Emergency save — snapshot all instances except the foreground one. */
export interface EmergencySaveRecommendation {
  readonly action: 'emergency_save';
  readonly instanceIds: readonly string[];
}

/** Discriminated union of all recommendation types. */
export type PressureRecommendation =
  | NoActionRecommendation
  | LogRecommendation
  | SuspendRecommendation
  | EmergencySaveRecommendation;

// ---------------------------------------------------------------------------
// Advisor
// ---------------------------------------------------------------------------

/**
 * Produce an actionable recommendation based on the current pressure level.
 *
 * @param level             - Current memory pressure level.
 * @param instances         - Active sandbox instances (used to pick candidates).
 * @param foregroundId      - ID of the foreground instance (protected from suspension).
 * @returns A `PressureRecommendation` the caller can act on.
 */
export function advise(
  level: MemoryPressureLevel,
  instances: readonly SandboxInstance[],
  foregroundId?: string,
): PressureRecommendation {
  switch (level) {
    case 'NORMAL':
      return { action: 'none' };

    case 'WARNING':
      return {
        action: 'log',
        message: `Memory usage is above 70%. ${String(instances.length)} active instance(s).`,
      };

    case 'PRESSURE': {
      // Recommend suspending non-foreground instances, oldest first.
      // "Oldest" = earliest in the array (caller orders by creation time).
      const candidates = instances
        .filter((inst) => inst.id !== foregroundId && inst.status !== 'destroyed')
        .map((inst) => inst.id);
      return { action: 'suspend', instanceIds: candidates };
    }

    case 'CRITICAL': {
      // Emergency save all non-foreground instances.
      const candidates = instances
        .filter((inst) => inst.id !== foregroundId && inst.status !== 'destroyed')
        .map((inst) => inst.id);
      return { action: 'emergency_save', instanceIds: candidates };
    }

    case 'OOM':
      // Same as CRITICAL — caller should handle OOM distinctly if needed.
      return {
        action: 'emergency_save',
        instanceIds: instances
          .filter((inst) => inst.id !== foregroundId && inst.status !== 'destroyed')
          .map((inst) => inst.id),
      };
  }
}
