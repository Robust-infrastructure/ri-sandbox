# Determinism

> ri-sandbox v1.0.0 — How deterministic execution works and why it matters

## Purpose

Deterministic execution guarantees that identical inputs always produce identical outputs. This is fundamental to:

- **Reproducibility**: Re-running a computation with the same inputs produces the same result, always
- **Snapshot fidelity**: `snapshot()` → `restore()` → re-execute yields the same state
- **Testing guarantees**: Assertions against execution results are stable across runs, machines, and browsers
- **Auditability**: Executions are verifiable — replay with the same inputs and compare

The sandbox prevents all 7 known sources of non-determinism in WASM execution.

## 7 Non-Determinism Sources

| # | Source | Prevention | Implementation |
|---|--------|------------|----------------|
| 1 | System clock | Injected timestamp | [time-injection.ts](../src/determinism/time-injection.ts) |
| 2 | Random numbers | Seeded PRNG | [random-injection.ts](../src/determinism/random-injection.ts) |
| 3 | Memory layout | WASM linear memory | Native — deterministic by spec |
| 4 | Floating point | IEEE 754 compliance | Native — WASM spec guarantee |
| 5 | Thread scheduling | Single-threaded | Design — no `SharedArrayBuffer` |
| 6 | Garbage collection | Manual memory | Native — WASM has no GC |
| 7 | Browser differences | WASM spec conformance | Native — all engines produce identical results |

Sources 3–7 are guaranteed by the WASM specification. Sources 1–2 require active prevention via injection.

## Time Injection

> Source: [src/determinism/time-injection.ts](../src/determinism/time-injection.ts)

Every WASM instance receives an auto-injected `__get_time` function in the `env` namespace:

```typescript
// Injected at instantiation — always returns the same value
env.__get_time = () => config.eventTimestamp;
```

### Behavior

- Returns `config.eventTimestamp` on every call — never the real system clock
- Return type: `i32` (32-bit integer, milliseconds since epoch)
- Same value regardless of when during execution it is called
- No `Date.now()`, `performance.now()`, or any real-time source inside the library

### Why the Caller Provides Time

The library's core rule prohibits `Date.now()` or any non-deterministic input inside library code. The caller provides `eventTimestamp` in `SandboxConfig`. This ensures:

- Two executions with the same `eventTimestamp` see the same "current time"
- The caller controls what "now" means (could be a historical replay timestamp)
- Test determinism — no flaky tests due to timing

## Random Injection

> Source: [src/determinism/random-injection.ts](../src/determinism/random-injection.ts)

Every WASM instance receives an auto-injected `__get_random` function in the `env` namespace:

```typescript
// Injected at instantiation — seeded PRNG
env.__get_random = () => prng.next();
```

### Mulberry32 Algorithm

The PRNG uses **Mulberry32**, a simple 32-bit PRNG that:

- Passes BigCrush statistical tests
- Has a single `uint32` state
- Produces deterministic output for any given seed
- Is serializable (for snapshot/restore)

```
Step 1: t = (state + 0x6D2B79F5) | 0
Step 2: nextState = t
Step 3: t = imul(t ^ (t >>> 15), t | 1)
Step 4: t = (t + imul(t ^ (t >>> 7), t | 61)) ^ t
Step 5: output = (t ^ (t >>> 14)) >>> 0
```

### PRNG State

```typescript
interface PrngState {
  readonly current: number;  // 32-bit unsigned integer
}

interface Prng {
  next(): number;             // Generate next random uint32
  getState(): PrngState;      // Serialize for snapshot
  setState(state: PrngState): void;  // Restore from snapshot
  reset(seed: number): void;  // Reset to a new seed
}
```

### Determinism Properties

- Same seed → same sequence, always
- Different seeds → different sequences
- State is captured in snapshots and restored on `restore()`
- Each instance has its own independent PRNG — no shared state

## Import Isolation

> Source: [src/determinism/isolation.ts](../src/determinism/isolation.ts)

The import validator inspects every import declared by a WASM module before instantiation. It rejects modules that attempt to access non-deterministic host APIs.

### Rejection Rules

| Import Pattern | Rejection Reason |
|----------------|------------------|
| `wasi_snapshot_preview1.*` | WASI provides filesystem, clock, random — all non-deterministic |
| `wasi_unstable.*` | Legacy WASI namespace |
| `wasi.*` | General WASI namespace |
| `<namespace>.*` where namespace ≠ `env` | Only the `env` namespace is supported |
| `env.<name>` where name is not declared | Function not in `hostFunctions` and not `__get_time`, `__get_random`, or `memory` |

### Allowed Imports

A WASM module may only import from the `env` namespace, and only:

- `memory` — the shared `WebAssembly.Memory` instance
- `__get_time` — the deterministic time injection
- `__get_random` — the deterministic PRNG
- Any function declared in `config.hostFunctions`

Everything else is rejected with `INVALID_MODULE` error before instantiation.

## Determinism Validation

> Source: [src/determinism/determinism-validator.ts](../src/determinism/determinism-validator.ts)

The library includes an internal double-execution validator (used in testing and auditing):

```
Execute(action, payload) → result₁ + snapshot₁
    ↓
Restore(snapshot₁)
    ↓
Execute(action, payload) → result₂ + snapshot₂
    ↓
Compare: result₁ === result₂ AND snapshot₁ === snapshot₂
```

This validates that:

1. The same execution produces the same return value
2. The same execution produces the same post-execution memory state
3. Snapshot/restore does not corrupt state

### Limitations

This validator is a testing/auditing tool, not a runtime guarantee. It runs each execution twice, so it doubles the cost. Production code relies on the determinism guarantees (time injection, PRNG, import isolation) being correct — the validator confirms those guarantees hold.

## Verification in Tests

The integration test suite validates determinism with multiple strategies:

| Test | Strategy | Count |
|------|----------|-------|
| 100-repetition identical results | Same inputs → same `ExecutionResult` 100 times | 100 |
| Cross-instance determinism | Two separate instances, same config → same results | 2 |
| Different seeds → different random | Same execution with seed=1 vs seed=2 → different `__get_random` | 2 |
| Same seed → same random | Same execution with same seed → identical random sequences | 2 |
| Different timestamps → different time | Same execution with time=1000 vs time=2000 → different `__get_time` | 2 |
| Same timestamp → same time | Same execution with same timestamp → identical time | 2 |
| Snapshot → restore → compare | Snapshot, restore, re-execute → identical to original | 1 |
| Sequential random consistency | 10 calls to `__get_random` → same 10 values on replay | 10 |

All tests pass deterministically — no flaky behavior, no timing dependencies.

---

*Last verified: 14 February 2026 against source code.*
