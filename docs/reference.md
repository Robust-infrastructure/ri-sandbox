# ri-sandbox — API Reference

**Version**: 1.0.0  
**Phase**: 0 (Browser WebAssembly API)  
**Tests**: 338 passed across 28 files  
**Coverage**: 95.6% lines · 86.72% branches · 100% functions

---

## §1 Identity

Deterministic WASM execution with resource limits, isolation, and snapshot/restore.

| Field | Value |
|-------|-------|
| Package | `ri-sandbox` |
| Language | TypeScript (strict mode) |
| Runtime | Browser (WebAssembly API) / Node.js (native WASM support) |
| Build | ESM + CJS dual output via tsup |
| WASM Runtime | Browser `WebAssembly` API (native) |
| Gas Metering | Host function call boundary interception |
| PRNG | Mulberry32 (seeded, deterministic) |

### Source Structure

```
src/
├── index.ts                     Public exports
├── types.ts                     All public type definitions
├── errors.ts                    Discriminated union error types + factory functions
├── sandbox.ts                   Factory: createWasmSandbox()
├── internal-types.ts            Mutable internal state (not exported)
├── loader/
│   ├── module-loader.ts         WASM magic byte validation + compilation
│   ├── instantiator.ts          WebAssembly.Instance creation + import wiring
│   └── instance-factory.ts      SandboxInstance + Memory + PRNG creation
├── execution/
│   ├── executor.ts              Execute WASM functions + resource enforcement
│   ├── host-bridge.ts           Error-capturing host function wrappers
│   └── memory-io.ts             Bounds-checked WASM memory read/write
├── resources/
│   ├── gas-meter.ts             Gas counting at host function boundaries
│   ├── timeout.ts               Wall-clock timeout with injectable timer
│   ├── memory-limiter.ts        Post-execution memory limit checking
│   └── resource-tracker.ts      Aggregate gas + timeout + memory per execution
├── determinism/
│   ├── time-injection.ts        __get_time() → config.eventTimestamp
│   ├── random-injection.ts      __get_random() → Mulberry32 PRNG
│   ├── isolation.ts             Import validation (reject WASI, undeclared)
│   └── determinism-validator.ts Double-execution determinism check
├── snapshot/
│   ├── serializer.ts            Binary snapshot creation (WSNP format)
│   └── deserializer.ts          Binary snapshot restoration
└── pressure/
    ├── memory-pressure.ts       Tiered memory pressure computation
    └── pressure-advisor.ts      Actionable pressure recommendations
```

### Stats

| Metric | Value |
|--------|-------|
| Public types | 22 |
| WasmSandbox methods | 7 |
| Error codes | 8 |
| Error factory functions | 8 |
| Exported constants | 4 |
| Standalone functions | 2 (`getMemoryPressure`, `advise`) |
| Internal modules | 18 |

---

## §2 WasmSandbox Interface

> Source: [src/types.ts](../src/types.ts), [src/sandbox.ts](../src/sandbox.ts)

The primary API surface. Created via `createWasmSandbox()`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `create` | `(config: SandboxConfig) → SandboxInstance` | Create a new isolated WASM execution environment |
| `load` | `(instance: SandboxInstance, module: Uint8Array) → Promise<void>` | Load, validate, and instantiate a WASM module |
| `execute` | `(instance: SandboxInstance, action: string, payload: unknown) → ExecutionResult` | Execute a WASM exported function with resource enforcement |
| `destroy` | `(instance: SandboxInstance) → void` | Release all resources (idempotent) |
| `snapshot` | `(instance: SandboxInstance) → Uint8Array` | Serialize execution state to binary WSNP format |
| `restore` | `(instance: SandboxInstance, snapshot: Uint8Array) → void` | Restore execution state from a binary snapshot |
| `getMetrics` | `(instance: SandboxInstance) → ResourceMetrics` | Get current resource usage for the instance |

### Method Detail

#### `create(config)`

Creates a new sandbox instance with a unique ID, `WebAssembly.Memory` sized to `maxMemoryBytes`, and a Mulberry32 PRNG seeded from `deterministicSeed`. Instance starts in `created` status.

- Returns a frozen `SandboxInstance` handle
- The factory tracks internal mutable state per instance ID
- Multiple instances are fully isolated — no shared state

#### `load(instance, module)`

Validates and instantiates a WASM module into the sandbox:

1. Validates WASM magic bytes (`\0asm`)
2. Compiles via `WebAssembly.compile()`
3. Validates imports — rejects WASI namespaces, undeclared functions, non-`env` namespaces
4. Instantiates with injected imports: `__get_time`, `__get_random`, `memory`, user host functions
5. Transitions status from `created` → `loaded`

Throws on failure (invalid module, import validation failure, instantiation failure).

#### `execute(instance, action, payload)`

Executes the WASM exported function named `action` with `payload` as arguments.

Supports two calling conventions:

- **Direct**: When `payload` is `number | number[] | null | undefined`, passed directly as WASM function arguments
- **Memory**: When `payload` is an object/string, JSON-serialized into WASM linear memory

Resource enforcement per execution:

- Gas: counted at each host function call; triggers `GAS_EXHAUSTED` when `maxGas` exceeded
- Timeout: checked at each host function call; triggers `TIMEOUT` when `maxExecutionMs` exceeded
- Memory: checked post-execution; triggers `MEMORY_EXCEEDED` if memory grew beyond `maxMemoryBytes`

Returns `ExecutionResult` (discriminated union — never throws).

#### `destroy(instance)`

Releases WASM instance, module, and memory references. Transitions status to `destroyed`. Idempotent — calling on an already-destroyed instance is a no-op.

#### `snapshot(instance)`

Captures WASM linear memory, PRNG state, gas counter, and timestamp into a binary WSNP format. Instance must be in `loaded` or `suspended` status — snapshots of `created`, `running`, or `destroyed` instances are rejected.

#### `restore(instance, snapshot)`

Restores WASM linear memory, PRNG state, and gas counter from a binary snapshot. Instance must be in `loaded` or `suspended` status. Memory sizes must match.

#### `getMetrics(instance)`

Returns a snapshot of current resource usage. Updates `memoryUsedBytes` from live `WebAssembly.Memory` buffer size before returning.

---

## §3 Configuration

> Source: [src/types.ts](../src/types.ts)

### SandboxConfig

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxMemoryBytes` | `number` | `16_777_216` (16 MB) | Hard memory limit for the WASM instance |
| `maxGas` | `number` | `1_000_000` | Computation budget per execution (host function calls) |
| `maxExecutionMs` | `number` | `50` | Wall-clock timeout in milliseconds |
| `hostFunctions` | `HostFunctionMap` | `{}` | Injected bridge functions available to WASM |
| `deterministicSeed` | `number` | `0` | PRNG seed for deterministic random number generation |
| `eventTimestamp` | `number` | — | Injected "current time" in ms since epoch. No default — caller must provide. |

All fields are `readonly`. The caller provides the full config — fields have sensible defaults except `eventTimestamp`, which the caller must always supply (to ensure determinism — no `Date.now()` inside the library).

### Default Constants

```typescript
const DEFAULT_MAX_MEMORY_BYTES = 16_777_216;  // 16 MB
const DEFAULT_MAX_GAS          = 1_000_000;
const DEFAULT_MAX_EXECUTION_MS = 50;
const DEFAULT_DETERMINISTIC_SEED = 0;
```

---

## §4 Instance & Status

> Source: [src/types.ts](../src/types.ts), [src/internal-types.ts](../src/internal-types.ts)

### SandboxInstance

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique instance identifier (counter-based: `sandbox-0`, `sandbox-1`, …) |
| `config` | `Readonly<SandboxConfig>` | Frozen configuration for this instance |
| `status` | `SandboxStatus` | Current lifecycle state |
| `metrics` | `ResourceMetrics` | Current resource usage |

### SandboxStatus

Five possible states forming a lifecycle:

| Status | Entered By | Allowed Transitions |
|--------|------------|---------------------|
| `created` | `create()` | → `loaded` (via `load()`) |
| `loaded` | `load()`, `restore()` | → `running` (via `execute()`), → `destroyed` (via `destroy()`) |
| `running` | `execute()` (start) | → `loaded` (execution complete) |
| `suspended` | Caller-managed | → `loaded` (via `restore()`), → `destroyed` (via `destroy()`) |
| `destroyed` | `destroy()` | Terminal — no further transitions |

### State Machine

```
   create()       load()        execute()
  ──────────► created ──────► loaded ──────► running
                 │               ▲               │
                 │               │  (complete)   │
                 │               └───────────────┘
                 │               │
                 │        destroy()  ◄── suspended
                 │               │
          destroy()              ▼
                 └──────►  destroyed
```

`destroy()` transitions any non-destroyed status (`created`, `loaded`, `running`, `suspended`) to `destroyed`. Idempotent on already-destroyed instances.

---

## §5 Execution Results

> Source: [src/types.ts](../src/types.ts)

### ExecutionResult

Discriminated union on `ok`:

```typescript
type ExecutionResult = ExecutionSuccess | ExecutionFailure;
```

### ExecutionSuccess

| Field | Type | Description |
|-------|------|-------------|
| `ok` | `true` | Discriminator |
| `value` | `unknown` | The value returned by the WASM function |
| `metrics` | `ResourceMetrics` | Resource metrics snapshot after execution |
| `gasUsed` | `number` | Gas consumed during this execution |
| `durationMs` | `number` | Wall-clock duration in milliseconds |

### ExecutionFailure

| Field | Type | Description |
|-------|------|-------------|
| `ok` | `false` | Discriminator |
| `error` | `SandboxError` | Typed error describing the failure |

### ResourceMetrics

| Field | Type | Description |
|-------|------|-------------|
| `memoryUsedBytes` | `number` | Current WASM linear memory usage in bytes |
| `memoryLimitBytes` | `number` | Configured memory limit in bytes |
| `gasUsed` | `number` | Total gas consumed so far |
| `gasLimit` | `number` | Configured computation budget |
| `executionMs` | `number` | Wall-clock time elapsed in milliseconds |
| `executionLimitMs` | `number` | Configured timeout in milliseconds |

All fields are `readonly`.

---

## §6 Host Functions

> Source: [src/types.ts](../src/types.ts), [src/execution/host-bridge.ts](../src/execution/host-bridge.ts)

### HostFunction

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | Function name as seen from WASM |
| `params` | `readonly WasmValueType[]` | Parameter types |
| `results` | `readonly WasmValueType[]` | Return types |
| `handler` | `(...args: readonly number[]) => number \| undefined` | Implementation called when WASM invokes this function |

### HostFunctionMap

```typescript
type HostFunctionMap = Readonly<Record<string, HostFunction>>;
```

Keys are the function names. All host functions are injected into the `env` namespace.

### WasmValueType

```typescript
type WasmValueType = 'i32' | 'i64' | 'f32' | 'f64';
```

### Auto-Injected Functions

Two functions are automatically injected into every instance's `env` namespace:

| Function | Signature | Behavior |
|----------|-----------|----------|
| `__get_time` | `() → i32` | Returns `config.eventTimestamp` (same value every call) |
| `__get_random` | `() → i32` | Returns next Mulberry32 PRNG output from `config.deterministicSeed` |

These consume 1 gas unit each per call.

### Error Propagation

If a host function `handler` throws, the error is re-thrown by the instantiator wrapper and caught by the executor. It surfaces as a `WASM_TRAP` with `trapKind: 'runtime_error'` in the `ExecutionResult`. The WASM execution is trapped — no partial results.

### Gas & Timeout Interception

Every host function call (user-defined + auto-injected) triggers:

1. Gas increment (+1)
2. Gas limit check → `GasExhaustedSignal` if over budget
3. Timeout check → `TimeoutSignal` if elapsed time exceeds `maxExecutionMs`

Pure WASM computation (no host calls) does not consume gas. The timeout serves as the backstop for tight loops without host calls.

---

## §7 Snapshot Format

> Source: [src/snapshot/serializer.ts](../src/snapshot/serializer.ts), [src/snapshot/deserializer.ts](../src/snapshot/deserializer.ts)

### WSNP Binary Layout

```
Offset    Size    Content
──────    ─────   ────────────────────────────────
0         4       Magic bytes: 0x57 0x53 0x4E 0x50 ("WSNP")
4         1       Version: 0x01
5         4       Memory length in bytes (uint32, little-endian)
9         N       Raw WASM linear memory bytes
9+N       4       State JSON length in bytes (uint32, little-endian)
13+N      M       State JSON (UTF-8 encoded)
```

### State JSON Shape

```typescript
interface SnapshotStateJson {
  readonly prngState: { readonly current: number };
  readonly timestamp: number;
  readonly gasUsed: number;
}
```

### Validation Rules

On restore, the following checks are applied in order:

1. Minimum size check (≥ 5 bytes for header)
2. Magic bytes match `WSNP`
3. Version is `0x01`
4. Memory section is not truncated
5. State section is not truncated
6. State JSON parses successfully
7. Memory size matches instance's current `WebAssembly.Memory` buffer size

### Round-Trip Guarantee

`snapshot()` → `restore()` → re-execute produces identical results to the original execution path. Verified by integration tests.

---

## §8 Memory Pressure

> Source: [src/pressure/memory-pressure.ts](../src/pressure/memory-pressure.ts), [src/pressure/pressure-advisor.ts](../src/pressure/pressure-advisor.ts)

### `getMemoryPressure(instances, availableBytes)`

```typescript
function getMemoryPressure(
  instances: readonly SandboxInstance[],
  availableBytes: number,
): MemoryPressureLevel;
```

A pure function. Sums `memoryUsedBytes` across all instances, computes usage as a percentage of `availableBytes`, and returns the pressure level. The caller provides `availableBytes` — the library never accesses platform memory APIs.

### MemoryPressureLevel

| Level | Threshold | Meaning |
|-------|-----------|---------|
| `NORMAL` | < 70% | No action needed |
| `WARNING` | 70–85% | Usage is elevated |
| `PRESSURE` | 85–95% | Approaching limits |
| `CRITICAL` | ≥ 95% | Near-capacity |
| `OOM` | ≥ 100% | Over budget |

### `advise(level, instances, foregroundId?)`

```typescript
function advise(
  level: MemoryPressureLevel,
  instances: readonly SandboxInstance[],
  foregroundId?: string,
): PressureRecommendation;
```

Returns an actionable recommendation based on the current pressure level. The foreground instance (if provided) is protected from suspension.

### PressureRecommendation

Discriminated union on `action`:

| Variant | `action` | Fields | When |
|---------|----------|--------|------|
| `NoActionRecommendation` | `'none'` | — | `NORMAL` |
| `LogRecommendation` | `'log'` | `message: string` | `WARNING` |
| `SuspendRecommendation` | `'suspend'` | `instanceIds: readonly string[]` | `PRESSURE` |
| `EmergencySaveRecommendation` | `'emergency_save'` | `instanceIds: readonly string[]` | `CRITICAL`, `OOM` |

The library returns recommendations — the caller decides whether to act on them.

---

## §9 Error Types

> Source: [src/errors.ts](../src/errors.ts)

All errors use a discriminated union on the `code` field.

### SandboxErrorCode (8 variants)

| Code | Fields | Meaning |
|------|--------|---------|
| `GAS_EXHAUSTED` | `gasUsed`, `gasLimit` | Computation budget exceeded |
| `MEMORY_EXCEEDED` | `memoryUsed`, `memoryLimit` | WASM memory grew beyond limit |
| `TIMEOUT` | `elapsedMs`, `limitMs` | Wall-clock timeout exceeded |
| `WASM_TRAP` | `trapKind`, `message` | WASM runtime fault (divide by zero, unreachable, etc.) |
| `INVALID_MODULE` | `reason` | WASM module failed validation or compilation |
| `HOST_FUNCTION_ERROR` | `functionName`, `message` | Host function threw an error |
| `INSTANCE_DESTROYED` | `instanceId` | Operation attempted on a destroyed instance |
| `SNAPSHOT_ERROR` | `reason` | Snapshot creation or restoration failed |

### Error Factory Functions

```typescript
gasExhausted(gasUsed: number, gasLimit: number): SandboxError
memoryExceeded(memoryUsed: number, memoryLimit: number): SandboxError
timeout(elapsedMs: number, limitMs: number): SandboxError
wasmTrap(trapKind: string, message: string): SandboxError
invalidModule(reason: string): SandboxError
hostFunctionError(functionName: string, message: string): SandboxError
instanceDestroyed(instanceId: string): SandboxError
snapshotError(reason: string): SandboxError
```

All factory functions return frozen `SandboxError` objects with `as const` narrowing.

---

## §10 Result Type

> Source: [src/types.ts](../src/types.ts)

### Result\<T, E\>

```typescript
type Result<T, E> = ResultOk<T> | ResultErr<E>;
```

### ResultOk\<T\>

| Field | Type | Description |
|-------|------|-------------|
| `ok` | `true` | Discriminator |
| `value` | `T` | The success value |

### ResultErr\<E\>

| Field | Type | Description |
|-------|------|-------------|
| `ok` | `false` | Discriminator |
| `error` | `E` | The error value |

Used internally by the loader, serializer, deserializer, and determinism validator. The public `execute()` method returns `ExecutionResult` (which follows the same pattern but with richer success fields).

---

## §11 Guarantees

### Determinism Guarantees

| Non-Determinism Source | Prevention |
|------------------------|------------|
| System clock | `__get_time()` returns `config.eventTimestamp` — never the real clock |
| Random numbers | `__get_random()` returns Mulberry32 output from `config.deterministicSeed` |
| Memory layout | WASM linear memory is deterministic by spec |
| Floating point | WASM IEEE 754 compliance — bit-exact across platforms |
| Thread scheduling | Single-threaded — no shared-memory concurrency |
| Garbage collection | WASM uses manual memory — no GC |
| Browser differences | WASM spec guarantees identical behavior across engines |

### Invariants

- Identical inputs (WASM binary + action + payload + config) produce identical outputs
- All WASM execution is single-threaded — no shared-memory concurrency
- No ambient authority — all host access via declared `hostFunctions` only
- Resource limits (memory, gas, time) are enforced — violations return typed errors
- Gas exhaustion returns `GAS_EXHAUSTED`, not partial results

### Performance Targets

| Operation | Target | Measured |
|-----------|--------|----------|
| `create()` | < 5ms | < 1ms |
| `load()` | < 50ms | < 5ms |
| `execute()` (simple) | < 50ms | < 0.1ms |
| `execute()` (fibonacci 20) | < 50ms | < 5ms |
| `snapshot()` | < 10ms | < 1ms |
| `restore()` | < 10ms | < 1ms |
| End-to-end (create + load + execute) | < 100ms | < 10ms |

---

## §12 Deferred to Future

| Item | Phase | Notes |
|------|-------|-------|
| Instruction-level gas metering | 1+ | via wasm-metering library; current Phase 0 uses host-call-boundary metering with timeout backstop |
| wasmtime / wasmer backend | 1+ | Native WASM runtime for desktop/server; same `WasmSandbox` interface |
| Embedded WASM runtime | 2+ | For constrained hardware (mobile, glasses, gadgets) |
| OS-level sandboxing | OS | seccomp, namespaces, cgroups for Linux distro phase |
| Rust port | 3+ | When hardware constraints require native performance |

---

*Last verified: 14 February 2026 against source code.*
