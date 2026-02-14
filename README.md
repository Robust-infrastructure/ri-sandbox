# ri-sandbox

Deterministic WASM execution with resource limits, isolation, and snapshot/restore.

## Status

**v0.1.0 — Project Scaffolding**

| Milestone | Status |
|-----------|--------|
| M1: Project Scaffolding | Complete |
| M2: Core Types & Configuration | Not Started |
| M3: WASM Module Loading & Instantiation | Not Started |
| M4: Execution Engine & Host Function Bridge | Not Started |
| M5: Gas Metering & Resource Limits | Not Started |
| M6: Determinism Enforcement | Not Started |
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

## Planned API

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

interface SandboxConfig {
  maxMemoryBytes: number;          // Hard memory limit (default: 16 MB)
  maxGas: number;                  // Computation budget per execution (default: 1,000,000)
  maxExecutionMs: number;          // Wall-clock timeout (default: 50ms)
  hostFunctions: HostFunctionMap;  // Injected bridge functions
  deterministicSeed: number;       // PRNG seed for deterministic random
  eventTimestamp: number;          // Injected "current time"
}
```

## Install

```bash
npm install ri-sandbox
```

## Development

```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Run tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint

# Format
npm run format

# Build
npm run build
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
