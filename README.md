# ri-sandbox

Deterministic WASM execution with resource limits, isolation, and snapshot/restore.

## Status

**v0.7.0 — Snapshot & Restore**

| Milestone | Status |
|-----------|--------|
| M1: Project Scaffolding | Complete |
| M2: Core Types & Configuration | Complete |
| M3: WASM Module Loading & Instantiation | Complete |
| M4: Execution Engine & Host Function Bridge | Complete |
| M5: Gas Metering & Resource Limits | Complete |
| M6: Determinism Enforcement | Complete |
| M7: Snapshot & Restore | Complete |
| M7: Snapshot & Restore | Not Started |
| M8: Memory Pressure System | Not Started |
| M9: Integration Tests & Performance Validation | Not Started |

See [ROADMAP.md](ROADMAP.md) for the full development plan.

## Overview

`ri-sandbox` is a standalone TypeScript library that provides:

- **Deterministic execution** — identical inputs produce identical outputs, always
- **Resource limits** — memory caps, gas metering, wall-clock timeouts
- **Complete isolation** — no host memory access, no ambient authority
- **Snapshot/restore** — serialize and resume execution state
- **Host function injection** — controlled WASM-to-host bridge
- **Gas metering enforcement** — computation budget per execution
- **Determinism enforcement** — seeded PRNG, injected time, import isolation
- **Snapshot/restore** — serialize and resume execution state

## Install

```bash
npm install ri-sandbox
```

## Quick Start

```typescript
import { createWasmSandbox } from 'ri-sandbox';

// 1. Create a sandbox factory
const sandbox = createWasmSandbox();

// 2. Create an instance with resource limits
const instance = sandbox.create({
  maxMemoryBytes: 1_048_576,     // 1 MB
  maxGas: 500_000,
  maxExecutionMs: 30,
  hostFunctions: {},
  deterministicSeed: 42,
  eventTimestamp: 1700000000000,
});
// instance.id → "sandbox-0", instance.status → "created"

// 3. Load a WASM module
const wasmBytes = new Uint8Array(/* ... your .wasm file ... */);
await sandbox.load(instance, wasmBytes);
// instance status is now "loaded"

// 4. Execute a WASM function
const result = sandbox.execute(instance, 'add', [3, 7]);
if (result.ok) {
  console.log(result.value); // 10
  console.log(result.metrics);
  console.log(result.gasUsed); // gas consumed during execution
  console.log(result.durationMs); // wall-clock time in ms
}

// 5. Check resource metrics
const metrics = sandbox.getMetrics(instance);
// metrics.memoryUsedBytes, metrics.memoryLimitBytes, ...

// 5. Clean up
sandbox.destroy(instance);
// instance status is now "destroyed"
```

## API

### Resource Enforcement

The sandbox enforces three resource limits during execution:

| Resource | Config | Error Code | Enforcement |
|----------|--------|------------|-------------|
| Gas (computation) | `maxGas` | `GAS_EXHAUSTED` | Consumed at host function call boundaries |
| Memory | `maxMemoryBytes` | `MEMORY_EXCEEDED` | Checked after execution; `WebAssembly.Memory` maximum enforces hard limit |
| Timeout | `maxExecutionMs` | `TIMEOUT` | Checked at host function call boundaries via injectable timer |

```typescript
const result = sandbox.execute(instance, 'expensive', payload);
if (!result.ok) {
  switch (result.error.code) {
    case 'GAS_EXHAUSTED':
      console.log(`Gas: ${result.error.gasUsed}/${result.error.gasLimit}`);
      break;
    case 'TIMEOUT':
      console.log(`Timeout: ${result.error.elapsedMs}ms > ${result.error.limitMs}ms`);
      break;
    case 'MEMORY_EXCEEDED':
      console.log(`Memory: ${result.error.memoryUsed}/${result.error.memoryLimit} bytes`);
      break;
  }
}
```

### Determinism Enforcement

The sandbox eliminates all sources of non-determinism at load time and execution time:

| Mechanism | Module | Description |
|-----------|--------|-------------|
| Time injection | `time-injection.ts` | `__get_time()` host function returns `config.eventTimestamp` — never reads the system clock |
| Seeded PRNG | `random-injection.ts` | `__get_random()` host function returns values from a Mulberry32 PRNG seeded with `config.deterministicSeed` |
| Import isolation | `isolation.ts` | Rejects WASM modules that import WASI, undeclared functions, or non-`env` namespaces |
| Double-execution check | `determinism-validator.ts` | Runs a function twice with state capture/restore and compares results byte-for-byte |

The `__get_time` and `__get_random` host functions are automatically injected into every sandbox instance. WASM modules can import them from the `env` namespace:

```wat
(import "env" "__get_time" (func $get_time (result i32)))
(import "env" "__get_random" (func $get_random (result i32)))
```

Import validation runs during `sandbox.load()` — modules with disallowed imports are rejected before instantiation with an `INVALID_MODULE` error.

### Snapshot & Restore

Sandbox state (WASM linear memory, PRNG position, gas counter) can be serialized to a binary snapshot and restored later:

```typescript
// Capture state
const snap = sandbox.snapshot(instance);

// Execute more actions...
sandbox.execute(instance, 'processEvent', payload);

// Rollback to captured state
sandbox.restore(instance, snap);

// Execution after restore is identical to execution after snapshot
const result = sandbox.execute(instance, 'processEvent', payload);
```

Snapshot binary format: 5-byte header (`WSNP` magic + version), memory section (uint32 length + raw bytes), state section (uint32 length + JSON). Invalid or corrupted snapshots are rejected with `SNAPSHOT_ERROR`.

### `createWasmSandbox(): WasmSandbox`

Factory function — creates a new `WasmSandbox` with its own instance registry.

```typescript
import { createWasmSandbox } from 'ri-sandbox';

const sandbox = createWasmSandbox();
```

### `WasmSandbox`

The main sandbox interface — all 7 methods for WASM execution lifecycle.

```typescript
interface WasmSandbox {
  create(config: SandboxConfig): SandboxInstance;
  load(instance: SandboxInstance, module: Uint8Array): Promise<void>;
  execute(instance: SandboxInstance, action: string, payload: unknown): ExecutionResult;
  destroy(instance: SandboxInstance): void;
  snapshot(instance: SandboxInstance): Uint8Array;
  restore(instance: SandboxInstance, snapshot: Uint8Array): void;
  getMetrics(instance: SandboxInstance): ResourceMetrics;
}
```

### `SandboxConfig`

Configuration for creating a sandbox instance.

```typescript
interface SandboxConfig {
  readonly maxMemoryBytes: number;          // Hard memory limit (default: 16,777,216 — 16 MB)
  readonly maxGas: number;                  // Computation budget per execution (default: 1,000,000)
  readonly maxExecutionMs: number;          // Wall-clock timeout (default: 50ms)
  readonly hostFunctions: HostFunctionMap;  // Injected bridge functions (default: {})
  readonly deterministicSeed: number;       // PRNG seed (default: 0)
  readonly eventTimestamp: number;          // Injected "current time" (ms since epoch)
}
```

Default constants:

| Constant | Value |
|----------|-------|
| `DEFAULT_MAX_MEMORY_BYTES` | 16,777,216 (16 MB) |
| `DEFAULT_MAX_GAS` | 1,000,000 |
| `DEFAULT_MAX_EXECUTION_MS` | 50 |
| `DEFAULT_DETERMINISTIC_SEED` | 0 |

### `SandboxInstance`

An isolated WASM execution environment.

```typescript
interface SandboxInstance {
  readonly id: string;
  readonly config: Readonly<SandboxConfig>;
  readonly status: SandboxStatus;
  readonly metrics: ResourceMetrics;
}

type SandboxStatus = 'created' | 'loaded' | 'running' | 'suspended' | 'destroyed';
```

### `ExecutionResult`

Discriminated union returned by `execute()`.

```typescript
// Success
{ ok: true; value: unknown; metrics: ResourceMetrics; gasUsed: number; durationMs: number }

// Failure
{ ok: false; error: SandboxError }
```

### `ResourceMetrics`

Current resource usage for a sandbox instance.

```typescript
interface ResourceMetrics {
  readonly memoryUsedBytes: number;
  readonly memoryLimitBytes: number;
  readonly gasUsed: number;
  readonly gasLimit: number;
  readonly executionMs: number;
  readonly executionLimitMs: number;
}
```

### `HostFunction` & `HostFunctionMap`

Host functions injected from the caller into WASM.

```typescript
interface HostFunction {
  readonly name: string;
  readonly params: readonly WasmValueType[];
  readonly results: readonly WasmValueType[];
  readonly handler: (...args: readonly number[]) => number | undefined;
}

type HostFunctionMap = Readonly<Record<string, HostFunction>>;
type WasmValueType = 'i32' | 'i64' | 'f32' | 'f64';
```

### `SandboxError`

Discriminated union with 8 error codes:

| Code | Fields |
|------|--------|
| `GAS_EXHAUSTED` | `gasUsed`, `gasLimit` |
| `MEMORY_EXCEEDED` | `memoryUsed`, `memoryLimit` |
| `TIMEOUT` | `elapsedMs`, `limitMs` |
| `WASM_TRAP` | `trapKind`, `message` |
| `INVALID_MODULE` | `reason` |
| `HOST_FUNCTION_ERROR` | `functionName`, `message` |
| `INSTANCE_DESTROYED` | `instanceId` |
| `SNAPSHOT_ERROR` | `reason` |

Error factory functions: `gasExhausted()`, `memoryExceeded()`, `timeout()`, `wasmTrap()`, `invalidModule()`, `hostFunctionError()`, `instanceDestroyed()`, `snapshotError()`.

### `MemoryPressureLevel`

System-wide memory pressure level (percentage of available memory).

```typescript
type MemoryPressureLevel = 'NORMAL' | 'WARNING' | 'PRESSURE' | 'CRITICAL' | 'OOM';
```

| Level | Threshold |
|-------|-----------|
| NORMAL | < 70% |
| WARNING | 70–85% |
| PRESSURE | 85–95% |
| CRITICAL | > 95% |
| OOM | Should never happen |

### `Result<T, E>`

Generic discriminated union for fallible operations.

```typescript
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

## Development

```bash
npm install          # Install dependencies
npm run typecheck    # Type check
npm run test         # Run tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage
npm run lint         # Lint
npm run format       # Format
npm run build        # Build
```

## Determinism Guarantees

| Non-Determinism Source | Prevention |
|------------------------|------------|
| System clock | Injected `eventTimestamp` |
| Random numbers | Deterministic PRNG with injected seed |
| Memory layout | WASM linear memory is deterministic |
| Floating point | WASM IEEE 754 compliance |
| Thread scheduling | Single-threaded (no concurrency) |
| GC | WASM has manual memory (no GC) |
| Browser differences | WASM spec guarantees identical behavior |

## License

MIT
