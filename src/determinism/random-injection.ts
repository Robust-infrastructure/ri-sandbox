/**
 * ri-sandbox — Deterministic PRNG
 *
 * Implements a seeded pseudorandom number generator using the Mulberry32 algorithm.
 * Seed from `config.deterministicSeed`. Same seed always produces the same sequence.
 *
 * PRNG state is serializable for snapshot/restore (M7).
 */

// ---------------------------------------------------------------------------
// PRNG State
// ---------------------------------------------------------------------------

/** Serializable PRNG state for snapshot/restore. */
export interface PrngState {
  /** Current internal state value (32-bit unsigned integer). */
  readonly current: number;
}

// ---------------------------------------------------------------------------
// PRNG Interface
// ---------------------------------------------------------------------------

/** A deterministic pseudorandom number generator. */
export interface Prng {
  /** Generate the next pseudorandom 32-bit unsigned integer. */
  next(): number;
  /** Get the current serializable state. */
  getState(): PrngState;
  /** Restore from a previously captured state. */
  setState(state: PrngState): void;
  /** Reset to a new seed value. */
  reset(seed: number): void;
}

// ---------------------------------------------------------------------------
// Mulberry32 Algorithm
// ---------------------------------------------------------------------------

/**
 * Advance the Mulberry32 state by one step and return a 32-bit unsigned integer.
 *
 * Mulberry32 is a simple, high-quality 32-bit PRNG with a single u32 state.
 * It passes BigCrush statistical tests and is fully deterministic.
 *
 * @param state - Current 32-bit state value.
 * @returns Tuple of [output, nextState].
 */
function mulberry32Step(state: number): readonly [number, number] {
  let t = (state + 0x6d2b79f5) | 0;
  const nextState = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
  const output = (t ^ (t >>> 14)) >>> 0;
  return [output, nextState] as const;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a deterministic PRNG seeded with the given value.
 *
 * Same seed always produces the same sequence of values.
 * State is serializable/restorable for snapshot/restore support.
 *
 * @param seed - Initial seed value (32-bit integer).
 * @returns A Prng instance.
 */
export function createPrng(seed: number): Prng {
  let current = seed | 0;

  return {
    next(): number {
      const [output, nextState] = mulberry32Step(current);
      current = nextState;
      return output;
    },

    getState(): PrngState {
      return { current };
    },

    setState(state: PrngState): void {
      current = state.current | 0;
    },

    reset(newSeed: number): void {
      current = newSeed | 0;
    },
  };
}
