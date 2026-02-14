# Integration Guide

> ri-sandbox v1.0.0 — How to integrate the WASM sandbox into your application

## Installation

```bash
npm install ri-sandbox
```

## Quick Start

```typescript
import { createWasmSandbox } from 'ri-sandbox';

// 1. Create the sandbox factory
const sandbox = createWasmSandbox();

// 2. Create an instance with configuration
const instance = sandbox.create({
  maxMemoryBytes: 16_777_216,     // 16 MB
  maxGas: 1_000_000,             // 1M gas budget
  maxExecutionMs: 50,            // 50ms timeout
  hostFunctions: {},             // No host functions
  deterministicSeed: 42,         // PRNG seed
  eventTimestamp: 1700000000000, // Injected "now"
});

// 3. Load a WASM module
const wasmBytes = new Uint8Array(/* ... your WASM binary ... */);
await sandbox.load(instance, wasmBytes);

// 4. Execute a function
const result = sandbox.execute(instance, 'add', [2, 3]);
if (result.ok) {
  console.log(result.value);     // 5
  console.log(result.gasUsed);   // 0 (pure compute, no host calls)
  console.log(result.durationMs);
}

// 5. Check resource usage
const metrics = sandbox.getMetrics(instance);
console.log(metrics.memoryUsedBytes);

// 6. Clean up
sandbox.destroy(instance);
```

## Configuration

All 6 fields of `SandboxConfig` must be provided:

| Field | Type | Recommended Default | Description |
|-------|------|---------------------|-------------|
| `maxMemoryBytes` | `number` | `16_777_216` | Hard memory limit. Set based on available system memory. |
| `maxGas` | `number` | `1_000_000` | Gas budget per execution. Higher = more host function calls allowed. |
| `maxExecutionMs` | `number` | `50` | Wall-clock timeout. Catches runaway loops even without host calls. |
| `hostFunctions` | `HostFunctionMap` | `{}` | Bridge functions callable from WASM. |
| `deterministicSeed` | `number` | `0` | PRNG seed. Same seed = same random sequence. |
| `eventTimestamp` | `number` | — | Injected time. **Must be provided by the caller.** |

> **Important**: `eventTimestamp` has no default. The library never calls `Date.now()` — the caller is responsible for providing the timestamp. This ensures deterministic execution.

Use the exported default constants for convenience:

```typescript
import {
  DEFAULT_MAX_MEMORY_BYTES,    // 16_777_216
  DEFAULT_MAX_GAS,             // 1_000_000
  DEFAULT_MAX_EXECUTION_MS,    // 50
  DEFAULT_DETERMINISTIC_SEED,  // 0
} from 'ri-sandbox';
```

## Host Function Injection

Host functions bridge WASM to the host environment. Define them in the config:

```typescript
import type { HostFunction } from 'ri-sandbox';

const logValue: HostFunction = {
  name: 'log_value',
  params: ['i32'],        // Takes one i32 parameter
  results: [],            // Returns nothing
  handler: (value) => {
    console.log('WASM logged:', value);
    return undefined;
  },
};

const double: HostFunction = {
  name: 'double',
  params: ['i32'],
  results: ['i32'],       // Returns one i32
  handler: (n) => n * 2,
};

const instance = sandbox.create({
  // ...other config...
  hostFunctions: {
    log_value: logValue,
    double: double,
  },
});
```

### Rules

- All host functions are injected into the `env` namespace
- Each host function call consumes 1 gas unit
- Each host function call triggers a timeout check
- If a host function throws, execution traps with `HOST_FUNCTION_ERROR`
- WASM modules that import undeclared functions are rejected at load time

### Auto-Injected Functions

Two functions are always available in `env`, even if not declared in `hostFunctions`:

| Function | Signature | Returns |
|----------|-----------|---------|
| `__get_time` | `() → i32` | `config.eventTimestamp` (always the same value) |
| `__get_random` | `() → i32` | Next deterministic random number from seeded PRNG |

## Error Handling

`execute()` returns an `ExecutionResult` — a discriminated union that never throws:

```typescript
const result = sandbox.execute(instance, 'compute', [42]);

if (result.ok) {
  // Success
  console.log(result.value);
  console.log(result.metrics);
  console.log(result.gasUsed);
  console.log(result.durationMs);
} else {
  // Failure — match on error code
  switch (result.error.code) {
    case 'GAS_EXHAUSTED':
      console.log(`Gas: ${result.error.gasUsed}/${result.error.gasLimit}`);
      break;
    case 'MEMORY_EXCEEDED':
      console.log(`Memory: ${result.error.memoryUsed}/${result.error.memoryLimit}`);
      break;
    case 'TIMEOUT':
      console.log(`Time: ${result.error.elapsedMs}ms/${result.error.limitMs}ms`);
      break;
    case 'WASM_TRAP':
      console.log(`Trap: ${result.error.trapKind} — ${result.error.message}`);
      break;
    case 'HOST_FUNCTION_ERROR':
      console.log(`Host fn "${result.error.functionName}": ${result.error.message}`);
      break;
    case 'INSTANCE_DESTROYED':
      console.log(`Instance ${result.error.instanceId} is destroyed`);
      break;
  }
}
```

### Error Factory Functions

For testing or creating errors programmatically:

```typescript
import { gasExhausted, timeout, wasmTrap } from 'ri-sandbox';

const err = gasExhausted(500_000, 1_000_000);
// { code: 'GAS_EXHAUSTED', gasUsed: 500000, gasLimit: 1000000 }
```

## Resource Limits

Three resources are enforced independently:

### Gas

Gas measures computation volume by counting host function calls. Each call to `__get_time`, `__get_random`, or any user-defined host function increments the gas counter by 1.

- **Pure WASM loops** (no host calls) consume zero gas
- The **timeout** serves as the backstop for tight loops without host calls
- When gas is exhausted, the execution returns `GAS_EXHAUSTED` — never partial results

### Memory

`WebAssembly.Memory` is created with `maximum` pages set from `maxMemoryBytes`. The WASM engine prevents `memory.grow` beyond this limit. Post-execution, the library checks actual buffer size and returns `MEMORY_EXCEEDED` if it exceeds the limit.

### Timeout

Wall-clock timeout is checked at each host function call. An injectable `TimerFn` (defaulting to `performance.now`) measures elapsed time. When the timeout is exceeded, execution returns `TIMEOUT`.

### Interaction Between Limits

```
Gas check  ─── at each host function call ─── TIMEOUT check
                     │
                     ▼ (if both gas and timeout fire, gas fires first)
                 
Memory check ─── post-execution ─── can trigger even if gas/timeout pass
```

## Snapshot & Restore

Snapshots serialize complete execution state for later restoration.

### Suspend and Resume

```typescript
// Suspend: save state and free resources
const snapshotData = sandbox.snapshot(instance);
sandbox.destroy(instance);

// Resume: create new instance, load module, restore state
const newInstance = sandbox.create(originalConfig);
await sandbox.load(newInstance, wasmBytes);
sandbox.restore(newInstance, snapshotData);

// Continue execution — state is identical to where it was suspended
const result = sandbox.execute(newInstance, 'next_step', null);
```

### Fork / Clone

```typescript
// Take a snapshot of the original
const snapshotData = sandbox.snapshot(instanceA);

// Create a second instance and restore into it
const instanceB = sandbox.create(config);
await sandbox.load(instanceB, wasmBytes);
sandbox.restore(instanceB, snapshotData);

// Both instances now have identical state but are fully independent
```

### Snapshot Format

Binary WSNP format — see [snapshot-format.md](snapshot-format.md) for the full specification.

## Memory Pressure Monitoring

Two standalone functions for monitoring system-wide memory usage:

```typescript
import { getMemoryPressure, advise } from 'ri-sandbox';

// Compute pressure level (pure function — caller provides available memory)
const level = getMemoryPressure(allInstances, navigator.deviceMemory * 1e9);
// Returns: 'NORMAL' | 'WARNING' | 'PRESSURE' | 'CRITICAL' | 'OOM'

// Get actionable recommendation
const recommendation = advise(level, allInstances, foregroundInstanceId);

switch (recommendation.action) {
  case 'none':
    break;
  case 'log':
    console.warn(recommendation.message);
    break;
  case 'suspend':
    // recommendation.instanceIds — instances to suspend
    for (const id of recommendation.instanceIds) {
      // Snapshot and destroy these instances
    }
    break;
  case 'emergency_save':
    // recommendation.instanceIds — instances to emergency-save
    for (const id of recommendation.instanceIds) {
      // Snapshot to persistent storage immediately
    }
    break;
}
```

### Pressure Thresholds

| Level | Usage | Recommendation |
|-------|-------|----------------|
| `NORMAL` | < 70% | No action |
| `WARNING` | 70–85% | Log a warning |
| `PRESSURE` | 85–95% | Suspend non-foreground instances |
| `CRITICAL` | ≥ 95% | Emergency save all non-foreground |
| `OOM` | ≥ 100% | Emergency save all non-foreground |

## Deterministic Execution

The sandbox guarantees determinism through three mechanisms:

1. **Time injection**: `__get_time()` always returns `config.eventTimestamp`
2. **PRNG injection**: `__get_random()` returns Mulberry32 output from `config.deterministicSeed`
3. **Import isolation**: WASI and undeclared imports are rejected

To reproduce an execution exactly:

```typescript
// Execution 1
const result1 = sandbox.execute(instance1, 'compute', [42]);

// Execution 2 — same config, same module, same inputs → identical result
const result2 = sandbox.execute(instance2, 'compute', [42]);

// result1.value === result2.value (guaranteed)
```

For detailed information on determinism mechanisms, see [determinism.md](determinism.md).

## Browser Compatibility

Requires:

- `WebAssembly` API — all modern browsers (Chrome 57+, Firefox 52+, Safari 11+, Edge 16+)
- `WebAssembly.Memory` with `maximum` parameter
- `TextEncoder` / `TextDecoder` for snapshot state serialization

Node.js is fully supported via native `WebAssembly` support (Node 8+).

---

*Last verified: 14 February 2026 against source code.*
