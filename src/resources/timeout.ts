/**
 * ri-sandbox — Wall-clock timeout
 *
 * Checks elapsed time at host function call boundaries.
 * When elapsed time exceeds the configured limit, a TimeoutSignal is thrown
 * which the executor catches and converts to a TIMEOUT error.
 *
 * The timer function is injectable for determinism in tests.
 * Defaults to `performance.now()` for operational use.
 */

// ---------------------------------------------------------------------------
// Signal
// ---------------------------------------------------------------------------

/**
 * Internal signal thrown when execution times out.
 * Not exported from the package — caught by the executor.
 */
export class TimeoutSignal extends Error {
  readonly elapsedMs: number;
  readonly limitMs: number;

  constructor(elapsedMs: number, limitMs: number) {
    super(`Timeout: elapsed ${String(elapsedMs)}ms exceeds limit ${String(limitMs)}ms`);
    this.name = 'TimeoutSignal';
    this.elapsedMs = elapsedMs;
    this.limitMs = limitMs;
  }
}

// ---------------------------------------------------------------------------
// Timer Function
// ---------------------------------------------------------------------------

/** A function that returns the current time in milliseconds. */
export type TimerFn = () => number;

/**
 * Default timer using `performance.now()`.
 * Falls back to `Date.now()` if `performance` is not available.
 */
export const defaultTimer: TimerFn = (): number => {
  if (typeof performance !== 'undefined') {
    return performance.now();
  }
  return Date.now();
};

// ---------------------------------------------------------------------------
// Timeout Checker
// ---------------------------------------------------------------------------

/** Timeout checking interface. */
export interface TimeoutChecker {
  /** Elapsed time since start in milliseconds. */
  readonly elapsedMs: number;
  /** Configured timeout limit in milliseconds. */
  readonly limitMs: number;
  /** Whether the timeout has been exceeded. */
  readonly isTimedOut: boolean;
  /** Mark the start of execution. */
  start(): void;
  /** Check if timeout exceeded. Throws TimeoutSignal if so. */
  check(): void;
}

/**
 * Create a timeout checker with the given limit and timer function.
 *
 * @param limitMs - Maximum wall-clock time allowed in milliseconds.
 * @param timer - Injectable timer function (defaults to performance.now).
 * @returns A mutable TimeoutChecker.
 */
export function createTimeoutChecker(limitMs: number, timer: TimerFn = defaultTimer): TimeoutChecker {
  let startTime = 0;
  let timedOut = false;
  let started = false;

  return {
    get elapsedMs(): number {
      if (!started) {
        return 0;
      }
      return timer() - startTime;
    },

    get limitMs(): number {
      return limitMs;
    },

    get isTimedOut(): boolean {
      return timedOut;
    },

    start(): void {
      startTime = timer();
      timedOut = false;
      started = true;
    },

    check(): void {
      if (timedOut) {
        throw new TimeoutSignal(timer() - startTime, limitMs);
      }

      const elapsed = timer() - startTime;
      if (elapsed > limitMs) {
        timedOut = true;
        throw new TimeoutSignal(elapsed, limitMs);
      }
    },
  };
}
