/**
 * ri-sandbox — Deterministic time injection
 *
 * Provides a deterministic `__get_time()` host function that always returns
 * the caller-provided `eventTimestamp`. No access to `Date.now()`,
 * `performance.now()`, or any real clock.
 */

// ---------------------------------------------------------------------------
// Time Provider
// ---------------------------------------------------------------------------

/** A deterministic time provider that always returns the configured timestamp. */
export interface TimeProvider {
  /** Returns the configured event timestamp (milliseconds since epoch). */
  getTime(): number;
  /** The configured timestamp value. */
  readonly eventTimestamp: number;
}

/**
 * Create a deterministic time provider.
 *
 * The returned `getTime()` always returns the same `eventTimestamp` value,
 * ensuring deterministic behavior across all executions with the same config.
 *
 * @param eventTimestamp - Milliseconds since epoch, injected by the caller.
 * @returns A TimeProvider that always returns eventTimestamp.
 */
export function createTimeProvider(eventTimestamp: number): TimeProvider {
  return {
    getTime(): number {
      return eventTimestamp;
    },
    get eventTimestamp(): number {
      return eventTimestamp;
    },
  };
}
