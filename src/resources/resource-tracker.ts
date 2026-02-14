/**
 * ri-sandbox — Resource tracker
 *
 * Aggregates gas metering, timeout checking, and memory tracking
 * into a unified execution context. Created fresh for each `execute()` call
 * and stored on InternalSandboxState so host function wrappers can access it.
 */

import type { ResourceMetrics } from '../types.js';
import type { SandboxError } from '../errors.js';
import { createGasMeter, type GasMeter } from './gas-meter.js';
import { createTimeoutChecker, type TimeoutChecker, type TimerFn, defaultTimer } from './timeout.js';
import { getMemoryUsageBytes } from './memory-limiter.js';

// ---------------------------------------------------------------------------
// Execution Context
// ---------------------------------------------------------------------------

/**
 * Mutable execution context created per `execute()` call.
 * Stored on `InternalSandboxState.executionContext` so that host function
 * wrappers (bound at instantiation time) can access gas/timeout at call time.
 */
export interface ExecutionContext {
  readonly gasMeter: GasMeter;
  readonly timeoutChecker: TimeoutChecker;
  readonly hostErrors: SandboxError[];
}

// ---------------------------------------------------------------------------
// Resource Tracker
// ---------------------------------------------------------------------------

/** Configuration for creating a resource tracker. */
export interface ResourceTrackerConfig {
  readonly maxGas: number;
  readonly maxExecutionMs: number;
  readonly maxMemoryBytes: number;
  readonly timer?: TimerFn;
}

/**
 * Create a fresh execution context for a single `execute()` call.
 *
 * @param config - Resource limits configuration.
 * @returns ExecutionContext with gas meter, timeout checker, and host error capture.
 */
export function createExecutionContext(config: ResourceTrackerConfig): ExecutionContext {
  const timer = config.timer ?? defaultTimer;

  return {
    gasMeter: createGasMeter(config.maxGas),
    timeoutChecker: createTimeoutChecker(config.maxExecutionMs, timer),
    hostErrors: [],
  };
}

/**
 * Build a ResourceMetrics snapshot from the execution context and memory state.
 *
 * @param ctx - The execution context with gas and timeout data.
 * @param memory - WebAssembly.Memory for memory usage tracking.
 * @param config - Sandbox configuration for limit values.
 * @returns Frozen ResourceMetrics.
 */
export function buildResourceMetrics(
  ctx: ExecutionContext,
  memory: WebAssembly.Memory | null,
  config: ResourceTrackerConfig,
): ResourceMetrics {
  return {
    memoryUsedBytes: getMemoryUsageBytes(memory),
    memoryLimitBytes: config.maxMemoryBytes,
    gasUsed: ctx.gasMeter.gasUsed,
    gasLimit: config.maxGas,
    executionMs: ctx.timeoutChecker.elapsedMs,
    executionLimitMs: config.maxExecutionMs,
  };
}
