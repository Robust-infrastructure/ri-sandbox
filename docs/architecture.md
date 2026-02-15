# Architecture

> ri-sandbox v1.0.0 — Phase 0 (Browser WebAssembly API)

## Module Dependency Graph

```
sandbox.ts (factory: createWasmSandbox)
├── loader/
│   ├── instance-factory.ts      Creates SandboxInstance + Memory + PRNG
│   ├── module-loader.ts         Validates WASM magic bytes + compiles
│   └── instantiator.ts          Wires host functions, memory, time, random
├── execution/
│   ├── executor.ts              Calls WASM exports + enforces resource limits
│   ├── host-bridge.ts           Error-capturing host function wrappers
│   └── memory-io.ts             Bounds-checked WASM memory read/write
├── resources/
│   ├── gas-meter.ts             Gas counting at host function boundaries
│   ├── timeout.ts               Wall-clock timeout with injectable timer
│   ├── memory-limiter.ts        Post-execution memory limit checking
│   └── resource-tracker.ts      Per-execution context: gas + timeout + memory
├── determinism/
│   ├── isolation.ts             Validates imports (rejects WASI, undeclared)
│   ├── time-injection.ts        __get_time() → config.eventTimestamp
│   ├── random-injection.ts      __get_random() → Mulberry32 PRNG
│   └── determinism-validator.ts Double-execution determinism check
└── snapshot/
    ├── serializer.ts            Binary snapshot creation (WSNP format)
    └── deserializer.ts          Binary snapshot restoration

Standalone (exported from index.ts, not used by sandbox.ts):
├── pressure/memory-pressure.ts  Memory pressure level computation
└── pressure/pressure-advisor.ts Actionable recommendations per level
```

Cross-module dependencies are **one-directional**. No module imports from a module that imports from it. The factory (`sandbox.ts`) imports loader, execution, determinism, and snapshot modules. The pressure modules are standalone — exported directly from `index.ts`.

## Load Pipeline

Loading a WASM module into a sandbox instance is a 4-step pipeline:

```
Uint8Array (WASM bytes)
     │
     ▼
┌──────────────┐
│ module-loader │  1. Validate magic bytes (\0asm)
│               │  2. WebAssembly.compile() → WebAssembly.Module
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  isolation    │  3. Inspect module imports
│               │  4. Reject WASI namespaces (wasi_snapshot_preview1, etc.)
│               │  5. Reject undeclared functions
│               │  6. Reject non-env namespaces
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ instantiator  │  7. Build import object:
│               │     - env.memory → WebAssembly.Memory
│               │     - env.__get_time → time injection
│               │     - env.__get_random → PRNG injection
│               │     - env.<name> → user host functions (wrapped)
│               │  8. WebAssembly.instantiate(module, imports)
└──────┬───────┘
       │
       ▼
   Instance ready (status: loaded)
```

## Execute Pipeline

Executing a WASM function with resource enforcement:

```
execute(instance, action, payload)
     │
     ▼
┌───────────────────┐
│  Status check      │  Reject if destroyed, not loaded
└──────┬────────────┘
       │
       ▼
┌───────────────────┐
│  Create execution  │  ExecutionContext with gas meter, timeout,
│  context           │  start timestamp
└──────┬────────────┘
       │
       ▼
┌───────────────────┐
│  Payload dispatch  │  Direct mode: number/array/null → WASM args
│                    │  Memory mode: JSON → write to WASM memory
└──────┬────────────┘
       │
       ▼
┌───────────────────┐
│  Call WASM export  │  instance.exports[action](...args)
│                    │  ┌───────────────────────────────────┐
│                    │  │ On each host function call:        │
│                    │  │   1. Gas increment (+1)            │
│                    │  │   2. Check gas limit               │
│                    │  │   3. Check timeout                 │
│                    │  │   4. Execute host function handler │
│                    │  └───────────────────────────────────┘
└──────┬────────────┘
       │
       ▼
┌───────────────────┐
│  Post-execution    │  Check memory limit (memory-limiter)
│  checks            │  Build ResourceMetrics snapshot
└──────┬────────────┘
       │
       ▼
  ExecutionResult (ok: true | ok: false)
```

### Resource Enforcement Points

| Resource | Check Point | Signal | Error Code |
|----------|------------|--------|------------|
| Gas | Each host function call | `GasExhaustedSignal` (thrown internally) | `GAS_EXHAUSTED` |
| Timeout | Each host function call | `TimeoutSignal` (thrown internally) | `TIMEOUT` |
| Memory | Post-execution | Direct check on `Memory.buffer.byteLength` | `MEMORY_EXCEEDED` |

The executor catches `GasExhaustedSignal` and `TimeoutSignal` (special internal error classes) and converts them to typed `ExecutionFailure` results. These signals never escape the library boundary.

## Import Wiring

Every WASM instance receives an `env` namespace with these imports:

| Import | Source | Gas Cost |
|--------|--------|----------|
| `memory` | `WebAssembly.Memory` from instance factory | — |
| `__get_time` | Time injection (`config.eventTimestamp`) | 1 per call |
| `__get_random` | Mulberry32 PRNG (`config.deterministicSeed`) | 1 per call |
| User host functions | `config.hostFunctions` (wrapped in instantiator) | 1 per call |

The import validator (`isolation.ts`) rejects any WASM module that imports from:

- `wasi_snapshot_preview1`
- `wasi_unstable`
- `wasi`
- Any namespace other than `env`
- Any `env` function not declared in `hostFunctions` and not one of the auto-injected names

## Concurrency Model

- **Single-threaded**: All WASM execution within `execute()` is synchronous
- **No shared memory**: Each instance has its own `WebAssembly.Memory`
- **No concurrent access**: The executor sets status to `running` during execution and returns it to `loaded` on completion
- **Multiple instances**: Fully independent — no shared state between instances

## Error Strategy

Two layers of error handling:

1. **Internal signals**: `GasExhaustedSignal` and `TimeoutSignal` are thrown inside WASM execution (via host function wrappers) and caught by the executor. These are internal control flow — they never reach the caller.

2. **Public results**: All public `execute()` results are `ExecutionResult` — a discriminated union. Success returns the value; failure returns a typed `SandboxError` with specific error code and diagnostic fields.

Methods other than `execute()` throw on failure (e.g., `load()` throws on invalid modules, `snapshot()` throws on invalid state). This matches the lifecycle assumption that load/destroy/snapshot/restore are setup operations where exceptions are appropriate.

## Determinism Design

| Concern | Approach | Module |
|---------|----------|--------|
| System clock | `__get_time()` returns `config.eventTimestamp` | `time-injection.ts` |
| Random numbers | Mulberry32 PRNG seeded from `config.deterministicSeed` | `random-injection.ts` |
| Ambient access | Import validator rejects WASI + undeclared imports | `isolation.ts` |
| Validation | Double-execution comparison (testing/auditing) | `determinism-validator.ts` |
| Memory layout | WASM linear memory is deterministic by spec | (native) |
| Floating point | WASM IEEE 754 compliance | (native) |
| Concurrency | Single-threaded, no shared memory | (design) |

## Snapshot Architecture

Binary WSNP format captures complete execution state in two sections:

```
┌─────────────────────────┐
│ Header (5 bytes)         │  Magic: "WSNP" + Version: 1
├─────────────────────────┤
│ Memory Section           │  uint32 LE length + raw bytes
│ (WASM linear memory)     │
├─────────────────────────┤
│ State Section            │  uint32 LE length + JSON
│ (PRNG state, timestamp,  │
│  gas counter)             │
└─────────────────────────┘
```

The serializer captures a byte-exact copy of `WebAssembly.Memory`. The deserializer validates format, parses sections, and restores memory + PRNG state in-place.

---

## Gas Metering Strategy

The v1.0.0 implementation uses **host-call-boundary metering** rather than wasm-metering instruction rewriting:

- Each host function call (`__get_time`, `__get_random`, user-defined) consumes 1 gas unit
- Pure WASM loops without host calls consume zero gas
- The wall-clock timeout (`maxExecutionMs`) serves as the backstop for runaway loops

This is a deliberate tradeoff: simpler implementation with correct enforcement via timeout, deferring instruction-level granularity to Phase 1+ when wasm-metering or native runtime metering becomes available.

---

*Last verified: 14 February 2026 against source code.*
