/**
 * ri-sandbox — Gas metering
 *
 * Tracks computation budget (gas) during WASM execution.
 * Gas is consumed at host function call boundaries.
 * When gasUsed exceeds gasLimit, a GasExhaustedSignal is thrown
 * which the executor catches and converts to a GAS_EXHAUSTED error.
 */

// ---------------------------------------------------------------------------
// Signal
// ---------------------------------------------------------------------------

/**
 * Internal signal thrown when gas is exhausted.
 * Not exported from the package — caught by the executor.
 */
export class GasExhaustedSignal extends Error {
  readonly gasUsed: number;
  readonly gasLimit: number;

  constructor(gasUsed: number, gasLimit: number) {
    super(`Gas exhausted: used ${String(gasUsed)} of ${String(gasLimit)}`);
    this.name = 'GasExhaustedSignal';
    this.gasUsed = gasUsed;
    this.gasLimit = gasLimit;
  }
}

// ---------------------------------------------------------------------------
// Gas Meter
// ---------------------------------------------------------------------------

/** Gas metering interface. */
export interface GasMeter {
  /** Current gas consumed. */
  readonly gasUsed: number;
  /** Configured gas budget. */
  readonly gasLimit: number;
  /** Whether gas has been exhausted. */
  readonly isExhausted: boolean;
  /**
   * Consume gas. Throws GasExhaustedSignal if budget exceeded.
   * @param amount - Gas units to consume (default: 1).
   */
  consume(amount?: number): void;
  /** Reset gasUsed to 0 for a new execution. */
  reset(): void;
}

/**
 * Create a gas meter with the given budget.
 *
 * @param gasLimit - Maximum gas allowed per execution.
 * @returns A mutable GasMeter.
 */
export function createGasMeter(gasLimit: number): GasMeter {
  let gasUsed = 0;
  let exhausted = false;

  return {
    get gasUsed(): number {
      return gasUsed;
    },

    get gasLimit(): number {
      return gasLimit;
    },

    get isExhausted(): boolean {
      return exhausted;
    },

    consume(amount = 1): void {
      if (exhausted) {
        throw new GasExhaustedSignal(gasUsed, gasLimit);
      }

      if (gasUsed + amount > gasLimit) {
        exhausted = true;
        gasUsed += amount;
        throw new GasExhaustedSignal(gasUsed, gasLimit);
      }

      gasUsed += amount;
    },

    reset(): void {
      gasUsed = 0;
      exhausted = false;
    },
  };
}
