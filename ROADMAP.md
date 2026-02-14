# ri-sandbox — ROADMAP

Deterministic WASM execution with resource limits, isolation, and snapshot/restore.

**Scope**: Phase 0 — everything needed to ship a production-ready npm package.

**Technology**: TypeScript, Vitest, tsup, Browser WebAssembly API, WebAssembly.Memory.

---

## M1: Project Scaffolding (Status: NOT STARTED)

**Goal**: Working TypeScript project with build, test, lint, and CI infrastructure.

**Depends on**: None

### Tasks

- [ ] Initialize npm project (`npm init`) with `"type": "module"`
- [ ] Install dev dependencies: `typescript`, `vitest`, `tsup`, `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `prettier`
- [ ] Create `tsconfig.json` (strict mode, ES2022 target, ESNext modules, bundler resolution)
- [ ] Create `vitest.config.ts` with v8 coverage provider, 90% line / 85% branch / 90% function thresholds
- [ ] Create `tsup.config.ts` — ESM + CJS dual output, entry `src/index.ts`, dts generation
- [ ] Create `.eslintrc.cjs` or `eslint.config.js` with @typescript-eslint strict rules
- [ ] Create `.prettierrc` (singleQuote, trailingComma, printWidth 100)
- [ ] Create `src/index.ts` with placeholder export
- [ ] Create `src/types.ts` with all public type definitions (see M2)
- [ ] Create `src/errors.ts` with error type union
- [ ] Create GitHub Actions workflow `.github/workflows/ci.yml` — runs lint, type-check, test on push/PR
- [ ] Create `README.md` — project description, API overview, install instructions, usage example
- [ ] Create `LICENSE` (MIT)
- [ ] Verify: `npx tsc --noEmit` passes
- [ ] Verify: `npx vitest run` passes (placeholder test)
- [ ] Verify: `npx tsup` produces `dist/` with ESM + CJS + types
- [ ] Commit and tag `v0.1.0`

### Done When

- [ ] `npm run build` produces working ESM + CJS output with `.d.ts` files
- [ ] `npm run test` runs Vitest with zero failures
- [ ] `npm run lint` passes with zero warnings
- [ ] `npm run typecheck` passes with zero errors
- [ ] CI workflow runs successfully on push
- [ ] README documents the project purpose and planned API

---

## M2: Core Types & Configuration (Status: NOT STARTED)

**Goal**: All public types defined — the complete API contract before any implementation.

**Depends on**: M1

### Tasks

- [ ] Define `SandboxConfig` interface:
    - `maxMemoryBytes` (number) — hard memory limit for the WASM instance
    - `maxGas` (number) — computation budget per execution (instruction count)
    - `maxExecutionMs` (number) — wall-clock timeout
    - `hostFunctions` (HostFunctionMap) — injected bridge functions
    - `deterministicSeed` (number) — PRNG seed for deterministic random
    - `eventTimestamp` (number) — injected "current time" (milliseconds since epoch)
- [ ] Define `HostFunctionMap` type — `Record<string, HostFunction>`
- [ ] Define `HostFunction` interface:
    - `name` (string) — function name as seen from WASM
    - `params` (WasmValueType[]) — parameter types
    - `results` (WasmValueType[]) — return types
    - `handler` (...args: number[]) => number | void — the actual implementation
- [ ] Define `WasmValueType` union — `'i32' | 'i64' | 'f32' | 'f64'`
- [ ] Define `SandboxInstance` interface:
    - `id` (string) — unique instance identifier
    - `config` (Readonly<SandboxConfig>) — frozen configuration
    - `status` ('created' | 'loaded' | 'running' | 'suspended' | 'destroyed')
    - `metrics` (ResourceMetrics) — current resource usage
- [ ] Define `ExecutionResult` type:
    - `{ ok: true; value: unknown; metrics: ResourceMetrics; gasUsed: number; durationMs: number }`
    - `{ ok: false; error: SandboxError }`
- [ ] Define `ResourceMetrics` interface:
    - `memoryUsedBytes` (number) — current WASM linear memory usage
    - `memoryLimitBytes` (number) — configured limit
    - `gasUsed` (number) — instructions executed so far
    - `gasLimit` (number) — configured budget
    - `executionMs` (number) — wall-clock time elapsed
    - `executionLimitMs` (number) — configured timeout
- [ ] Define `SandboxError` discriminated union:
    - `GAS_EXHAUSTED` — `{ gasUsed: number; gasLimit: number }`
    - `MEMORY_EXCEEDED` — `{ memoryUsed: number; memoryLimit: number }`
    - `TIMEOUT` — `{ elapsedMs: number; limitMs: number }`
    - `WASM_TRAP` — `{ trapKind: string; message: string }`
    - `INVALID_MODULE` — `{ reason: string }`
    - `HOST_FUNCTION_ERROR` — `{ functionName: string; message: string }`
    - `INSTANCE_DESTROYED` — `{ instanceId: string }`
    - `SNAPSHOT_ERROR` — `{ reason: string }`
- [ ] Define `WasmSandbox` interface — all 7 methods:
    - `create(config: SandboxConfig): SandboxInstance`
    - `load(instance: SandboxInstance, module: Uint8Array): Promise<void>`
    - `execute(instance: SandboxInstance, action: string, payload: unknown): ExecutionResult`
    - `destroy(instance: SandboxInstance): void`
    - `snapshot(instance: SandboxInstance): Uint8Array`
    - `restore(instance: SandboxInstance, snapshot: Uint8Array): void`
    - `getMetrics(instance: SandboxInstance): ResourceMetrics`
- [ ] Define `Result<T, E>` type — `{ ok: true; value: T } | { ok: false; error: E }`
- [ ] Write type-level tests — verify types compile, discriminated unions narrow
- [ ] Export all types from `src/index.ts`
- [ ] Update `README.md` with full type documentation

### Done When

- [ ] All public types are defined and exported
- [ ] `npx tsc --noEmit` passes — types are valid TypeScript
- [ ] Type tests verify discriminated union narrowing
- [ ] `npx tsup` produces `.d.ts` files with all types
- [ ] README documents every public type

---

## M3: WASM Module Loading & Instantiation (Status: NOT STARTED)

**Goal**: Load, validate, and instantiate WASM modules with configured memory limits.

**Depends on**: M2

### Tasks

- [ ] Create `src/loader/module-loader.ts` — WASM module loading
    - `loadModule(bytes: Uint8Array): Promise<WebAssembly.Module>`
    - Validate WASM magic bytes (`\0asm`)
    - Compile using `WebAssembly.compile(bytes)` (browser API)
    - Reject modules that exceed configured memory limits (inspect memory imports)
    - Return typed errors for invalid modules
- [ ] Create `src/loader/instance-factory.ts` — instance creation
    - `createSandboxInstance(config: SandboxConfig): SandboxInstance`
    - Generate unique ID (UUID v4)
    - Create `WebAssembly.Memory` with `initial` and `maximum` pages derived from `maxMemoryBytes`
    - Calculate page count: `Math.ceil(maxMemoryBytes / 65536)` (WASM page = 64KB)
    - Set instance status to `created`
    - Initialize metrics to zero
- [ ] Create `src/loader/instantiator.ts` — WASM instantiation
    - `instantiate(instance: SandboxInstance, module: WebAssembly.Module): Promise<void>`
    - Build import object from `hostFunctions` + memory
    - Instantiate module: `WebAssembly.instantiate(module, imports)`
    - Set instance status to `loaded`
    - Detect and report missing imports (clear error with expected vs. provided)
- [ ] Create `src/loader/module-loader.test.ts` — unit tests:
    - Valid WASM module loads successfully
    - Invalid bytes (not WASM): returns `INVALID_MODULE` error
    - Empty bytes: returns `INVALID_MODULE` error
    - Module with excessive memory imports: rejected
- [ ] Create `src/loader/instance-factory.test.ts` — unit tests:
    - Creates instance with unique ID
    - Config is frozen (readonly)
    - Initial status is `created`
    - Memory pages calculated correctly from bytes
    - Boundary: 64KB → 1 page, 65KB → 2 pages, 1MB → 16 pages
- [ ] Create `src/loader/instantiator.test.ts` — unit tests:
    - Instantiation with valid module succeeds
    - Status changes to `loaded` after instantiation
    - Missing import: clear error listing expected imports
    - Host functions are callable from WASM
- [ ] Wire `create` and `load` into `WasmSandbox` factory function in `src/sandbox.ts`
- [ ] Export factory function `createWasmSandbox(): WasmSandbox` from `src/index.ts`

### Done When

- [ ] WASM modules load and validate correctly
- [ ] Memory limits are enforced via `WebAssembly.Memory` maximum
- [ ] Host functions are injected into the WASM import object
- [ ] Invalid modules produce clear, typed errors
- [ ] All unit tests pass
- [ ] Coverage ≥ 90% for loader modules

---

## M4: Execution Engine & Host Function Bridge (Status: NOT STARTED)

**Goal**: Execute WASM functions with host function bridging, JSON payload serialization, and result extraction.

**Depends on**: M3

### Tasks

- [ ] Create `src/execution/executor.ts` — `execute` implementation
    - `execute(instance, action, payload)`:
        1. Verify instance status is `loaded` or `running`
        2. Serialize `payload` to JSON string
        3. Write JSON bytes into WASM linear memory (allocate via exported `__alloc` or similar)
        4. Call the WASM exported function named `action` with pointer and length
        5. Read result from WASM linear memory (pointer + length returned by function)
        6. Deserialize result from JSON bytes
        7. Return `ExecutionResult` with value + metrics
    - Set instance status to `running` during execution, back to `loaded` after
- [ ] Create `src/execution/memory-io.ts` — memory read/write helpers
    - `writeToMemory(memory: WebAssembly.Memory, data: Uint8Array, offset: number): void`
    - `readFromMemory(memory: WebAssembly.Memory, offset: number, length: number): Uint8Array`
    - `encodePayload(payload: unknown): Uint8Array` — JSON stringify → UTF-8 encode
    - `decodeResult(bytes: Uint8Array): unknown` — UTF-8 decode → JSON parse
    - Bounds checking: reject reads/writes outside memory bounds
- [ ] Create `src/execution/host-bridge.ts` — host function wrapper
    - Wrap each caller-provided host function with:
        1. Argument type validation
        2. Error capture (catch exceptions, convert to `HOST_FUNCTION_ERROR`)
        3. Return value validation
    - Host functions receive raw WASM values (i32, f64, etc.)
    - Bridge handles any necessary marshaling
- [ ] Create `src/execution/executor.test.ts` — unit tests:
    - Execute simple function (add two numbers): correct result
    - Execute function with string payload: JSON round-trip correct
    - Execute function that calls host function: host function invoked
    - Execute on destroyed instance: returns `INSTANCE_DESTROYED` error
    - Execute with unknown action name: returns `WASM_TRAP` or specific error
    - Instance status transitions: created → loaded → running → loaded
- [ ] Create `src/execution/memory-io.test.ts` — unit tests:
    - Write and read round-trip: identical bytes
    - Bounds check: write past memory end → error
    - Empty payload: encodes correctly
    - Large payload (100KB): encodes and decodes correctly
    - Unicode payload: encoding is correct
- [ ] Create `src/execution/host-bridge.test.ts` — unit tests:
    - Host function called with correct arguments
    - Host function that throws: captured as `HOST_FUNCTION_ERROR`
    - Host function return value passed back to WASM
- [ ] Wire `execute` into `WasmSandbox` factory

### Done When

- [ ] WASM functions can be called with arbitrary JSON payloads
- [ ] Results are extracted and deserialized correctly
- [ ] Host functions are invoked from WASM and errors are captured
- [ ] Memory I/O handles bounds checking and encoding
- [ ] All unit tests pass
- [ ] Coverage ≥ 90% for execution modules

---

## M5: Gas Metering & Resource Limits (Status: NOT STARTED)

**Goal**: Enforce computation budgets (gas), memory limits, and wall-clock timeouts.

**Depends on**: M4

### Tasks

- [ ] Create `src/resources/gas-meter.ts` — gas (instruction) metering
    - Strategy: intercept execution at regular intervals to check gas budget
    - Option A: WASM module pre-instrumentation (inject counter increments into WASM bytecode using `wasm-metering` or custom transform)
    - Option B: Use execution polling — check elapsed instructions/time at host function call boundaries
    - Implement chosen strategy:
        - Track `gasUsed` counter incrementing during execution
        - When `gasUsed >= maxGas`: trap execution, return `GAS_EXHAUSTED` error
        - Gas is reset at the start of each `execute` call
- [ ] Create `src/resources/memory-limiter.ts` — memory enforcement
    - `WebAssembly.Memory` with `maximum` pages already enforces hard limit
    - Track current memory usage: `memory.buffer.byteLength`
    - Detect `memory.grow` attempts that would exceed limit (browser traps automatically but we report it)
    - Update `ResourceMetrics.memoryUsedBytes` after each execution
- [ ] Create `src/resources/timeout.ts` — wall-clock timeout
    - Start timer before execution
    - If execution exceeds `maxExecutionMs`: abort and return `TIMEOUT` error
    - Use `AbortController` or similar mechanism for clean cancellation
    - Timer resolution: ≤ 1ms
- [ ] Create `src/resources/resource-tracker.ts` — aggregate resource tracking
    - Combines gas meter, memory limiter, and timeout into unified `ResourceMetrics`
    - Updates metrics after every execution
    - Provides `getMetrics(instance)` for external monitoring
- [ ] Create `src/resources/gas-meter.test.ts` — unit tests:
    - Simple function: gas < limit → succeeds
    - Infinite loop (or very long computation): gas > limit → `GAS_EXHAUSTED`
    - Gas counter resets between executions
    - Gas usage reported in `ExecutionResult.gasUsed`
    - Zero gas limit: immediately exhausted
- [ ] Create `src/resources/memory-limiter.test.ts` — unit tests:
    - Module using less than max memory: succeeds
    - Module trying to grow past max: trapped
    - Memory metrics accurate after execution
    - Multiple executions: memory tracked cumulatively
- [ ] Create `src/resources/timeout.test.ts` — unit tests:
    - Fast execution (< timeout): succeeds
    - Slow execution (> timeout): returns `TIMEOUT` error
    - Timeout of 0: immediately times out
    - Large timeout (60s): doesn't affect fast execution
- [ ] Wire resource enforcement into `execute` flow
- [ ] Wire `getMetrics` into `WasmSandbox` factory

### Done When

- [ ] Gas budget enforced — execution stops when gas exhausted
- [ ] Memory limits enforced — growth past limit is trapped
- [ ] Wall-clock timeout works — long executions are aborted
- [ ] ResourceMetrics accurately reflect usage after every execution
- [ ] All unit tests pass
- [ ] Coverage ≥ 90% for resource modules

---

## M6: Determinism Enforcement (Status: NOT STARTED)

**Goal**: Guarantee that identical inputs always produce identical outputs — eliminate all sources of non-determinism.

**Depends on**: M4, M5

### Tasks

- [ ] Create `src/determinism/time-injection.ts` — deterministic time
    - Provide `eventTimestamp` from `SandboxConfig` to WASM via host function
    - Host function `__get_time()` returns `config.eventTimestamp` (always the same value per execution)
    - No access to `Date.now()`, `performance.now()`, or any real clock
- [ ] Create `src/determinism/random-injection.ts` — deterministic PRNG
    - Implement a seeded PRNG (e.g., xorshift128+ or PCG)
    - Seed from `config.deterministicSeed`
    - Host function `__get_random()` returns next PRNG value
    - Same seed → same sequence of random numbers (always)
    - PRNG state is part of the sandbox state (snapshot/restore includes it)
- [ ] Create `src/determinism/isolation.ts` — ambient state isolation
    - Verify: WASM module has no imports other than declared host functions
    - Reject modules that import `wasi_snapshot_preview1` or other system interfaces
    - Reject modules that import undeclared functions
    - Log all imports during loading for auditability
- [ ] Create `src/determinism/determinism-validator.ts` — optional double-execution check
    - `validateDeterminism(instance, action, payload)`:
        1. Execute once, capture result + metrics
        2. Restore to pre-execution state (snapshot)
        3. Execute again with identical inputs
        4. Compare results byte-for-byte
        5. Return match/mismatch report
    - This is expensive (2x execution) — intended for testing and auditing, not production
- [ ] Create `src/determinism/time-injection.test.ts` — unit tests:
    - `__get_time()` returns configured timestamp
    - Different timestamps produce different results in time-dependent code
    - Same timestamp always produces same result
- [ ] Create `src/determinism/random-injection.test.ts` — unit tests:
    - Same seed → same sequence (100 values)
    - Different seed → different sequence
    - PRNG distributes across range (basic statistical test)
    - Sequence is reproducible after snapshot/restore
- [ ] Create `src/determinism/isolation.test.ts` — unit tests:
    - Module with only declared imports: accepted
    - Module with undeclared import: rejected with clear error
    - Module with WASI imports: rejected
- [ ] Create `src/determinism/determinism-validator.test.ts` — unit tests:
    - Deterministic function: double-execution matches
    - Function using injected time: matches with same timestamp
    - Function using injected random: matches with same seed

### Done When

- [ ] Time is injected, never read from host clock
- [ ] Random numbers come from seeded PRNG, never from `crypto.getRandomValues`
- [ ] Undeclared imports are rejected during module loading
- [ ] Double-execution validator confirms determinism
- [ ] All 7 non-determinism sources from the spec are addressed
- [ ] All unit tests pass
- [ ] Coverage ≥ 90% for determinism modules

---

## M7: Snapshot & Restore (Status: NOT STARTED)

**Goal**: Serialize and deserialize sandbox execution state for suspend/resume and rollback.

**Depends on**: M4, M6

### Tasks

- [ ] Create `src/snapshot/serializer.ts` — snapshot creation
    - `snapshot(instance)`:
        1. Verify instance status is `loaded` (not `running`)
        2. Capture WASM linear memory: `new Uint8Array(memory.buffer).slice()`
        3. Capture PRNG state (current position in sequence)
        4. Capture injected timestamp
        5. Capture gas counter state
        6. Serialize all state into a binary format:
            - Header: magic bytes (`WSNP`), version (uint8)
            - Memory section: length (uint32) + raw bytes
            - State section: JSON-serialized { prngState, timestamp, gasUsed }
        7. Return `Uint8Array`
- [ ] Create `src/snapshot/deserializer.ts` — snapshot restore
    - `restore(instance, snapshot)`:
        1. Parse header, verify magic bytes and version
        2. Extract memory bytes
        3. Extract state JSON
        4. Copy memory bytes back into WASM linear memory
        5. Restore PRNG state
        6. Restore timestamp
        7. Restore gas counter
        8. Set instance status to `loaded`
    - Reject snapshots with version mismatch or corrupted headers
    - Reject snapshots whose memory size doesn't match instance memory
- [ ] Create `src/snapshot/serializer.test.ts` — unit tests:
    - Snapshot of fresh instance: produces valid format
    - Snapshot after execution: captures modified memory
    - Snapshot format: valid header, correct memory size
    - Snapshot of destroyed instance: returns error
    - Snapshot of running instance: returns error (must be suspended first)
- [ ] Create `src/snapshot/deserializer.test.ts` — unit tests:
    - Restore from valid snapshot: state matches
    - Restore then execute: produces same result as before snapshot
    - Restore corrupted snapshot: returns `SNAPSHOT_ERROR`
    - Restore snapshot with wrong memory size: returns error
    - Restore snapshot with unknown version: returns error
    - Multiple snapshot/restore cycles: state remains consistent
- [ ] Create `tests/snapshot-roundtrip.test.ts` — integration test:
    - Execute 10 actions → snapshot → execute 5 more → restore → execute 5 actions → compare results with snapshot-then-5 path → identical
    - Snapshot → modify → restore → verify original state
- [ ] Wire `snapshot` and `restore` into `WasmSandbox` factory

### Done When

- [ ] Snapshots capture complete execution state (memory + PRNG + metrics)
- [ ] Restore recreates identical execution environment
- [ ] Post-restore execution produces identical results to pre-snapshot execution
- [ ] Invalid snapshots are rejected with clear errors
- [ ] All unit tests pass
- [ ] Coverage ≥ 90% for snapshot modules

---

## M8: Memory Pressure System (Status: NOT STARTED)

**Goal**: System-wide memory pressure monitoring with tiered responses.

**Depends on**: M5

### Tasks

- [ ] Create `src/pressure/memory-pressure.ts` — pressure level computation
    - `getMemoryPressure(instances: SandboxInstance[], availableBytes: number): MemoryPressureLevel`
    - Sum memory usage across all active sandbox instances
    - Compute usage percentage: `totalUsed / availableBytes * 100`
    - Return level:
        - `NORMAL` (< 70%): no action needed
        - `WARNING` (70–85%): recommend compacting caches, logging
        - `PRESSURE` (85–95%): recommend suspending background instances
        - `CRITICAL` (> 95%): recommend emergency save, suspend all but foreground
        - `OOM`: should never happen — if it does, report it
    - Caller provides `availableBytes` — library doesn't access platform memory APIs
- [ ] Create `src/pressure/pressure-advisor.ts` — actionable recommendations
    - Given a pressure level + list of instances, return recommended actions:
        - `WARNING`: `{ action: 'log', message: string }`
        - `PRESSURE`: `{ action: 'suspend', instanceIds: string[] }` — recommend suspending instances by age (oldest first)
        - `CRITICAL`: `{ action: 'emergency_save', instanceIds: string[] }` — recommend saving all but foreground
    - Library returns recommendations — caller decides whether to act on them
- [ ] Define `MemoryPressureLevel` type — `'NORMAL' | 'WARNING' | 'PRESSURE' | 'CRITICAL' | 'OOM'`
- [ ] Define `PressureRecommendation` type with discriminated union per action
- [ ] Create `src/pressure/memory-pressure.test.ts` — unit tests:
    - 0% usage: NORMAL
    - 50% usage: NORMAL
    - 70% usage: WARNING (boundary)
    - 75% usage: WARNING
    - 85% usage: PRESSURE (boundary)
    - 90% usage: PRESSURE
    - 95% usage: CRITICAL (boundary)
    - 99% usage: CRITICAL
    - 100% usage: OOM
    - Multiple instances: totals summed correctly
    - Single instance using all memory: correct level
- [ ] Create `src/pressure/pressure-advisor.test.ts` — unit tests:
    - WARNING: returns log recommendation
    - PRESSURE: returns suspend recommendation with oldest instances
    - CRITICAL: returns emergency_save with all non-foreground instances
    - NORMAL: returns no recommendation
- [ ] Wire `getMemoryPressure` into the public API (optional utility export)

### Done When

- [ ] Pressure levels computed correctly for all thresholds
- [ ] Boundary values (exactly 70%, 85%, 95%) return correct levels
- [ ] Recommendations are actionable and specific
- [ ] Library doesn't access platform memory APIs — caller provides usage data
- [ ] All unit tests pass
- [ ] Coverage ≥ 90% for pressure modules

---

## M9: Integration Tests & Performance Validation (Status: NOT STARTED)

**Goal**: End-to-end tests covering the full API surface, performance benchmarks, and production readiness.

**Depends on**: M3, M4, M5, M6, M7, M8 (all previous milestones)

### Tasks

- [ ] Create test WASM modules (minimal .wasm files for testing):
    - `add.wasm` — exports `add(a: i32, b: i32): i32`
    - `counter.wasm` — exports `increment(): void`, `get(): i32` (stateful)
    - `fibonacci.wasm` — exports `fib(n: i32): i32` (computation-heavy for gas testing)
    - `memory-hog.wasm` — exports `allocate(bytes: i32): void` (memory testing)
    - `host-caller.wasm` — exports `call_host(): i32` (calls a host function)
    - `infinite-loop.wasm` — exports `loop(): void` (never returns — gas/timeout testing)
    - Generate these using wat2wasm or hand-crafted WASM bytes
- [ ] Create `tests/integration/full-lifecycle.test.ts`:
    - Create sandbox → load module → execute → read result → destroy
    - Create → load → execute 100 times → verify determinism → destroy
    - Create → load → execute → snapshot → execute → restore → execute → compare
    - Multiple concurrent instances: independent, isolated
    - Destroy instance → execute: returns `INSTANCE_DESTROYED` error
- [ ] Create `tests/integration/resource-limits.test.ts`:
    - Gas exhaustion: fibonacci with low gas limit → `GAS_EXHAUSTED`
    - Memory limit: memory-hog exceeding limit → trapped
    - Timeout: infinite-loop with 100ms timeout → `TIMEOUT`
    - All three limits simultaneously: first one hit wins
    - Very generous limits: execution succeeds normally
- [ ] Create `tests/integration/host-functions.test.ts`:
    - Host function called from WASM: correct arguments, correct return
    - Multiple host functions: all callable
    - Host function throws: `HOST_FUNCTION_ERROR` returned
    - Missing host function: `INVALID_MODULE` during load
- [ ] Create `tests/integration/determinism.test.ts`:
    - Same module + same config + same action + same payload → identical result (100 repetitions)
    - Different `deterministicSeed` → different random outputs
    - Different `eventTimestamp` → different time outputs
    - Snapshot → restore → execute → compare: identical
    - Cross-browser: same WASM → same result (verifiable by running tests)
- [ ] Create `tests/performance/benchmarks.test.ts`:
    - Create sandbox instance: < 5ms
    - Load WASM module (10KB): < 50ms
    - Execute simple function (add): < 1ms
    - Execute complex function (fibonacci 20): < 50ms
    - Snapshot: < 10ms
    - Restore: < 10ms
    - Create + load + execute end-to-end: < 100ms
    - 10 concurrent instances: all functional
- [ ] Final `README.md` update:
    - Complete API documentation with examples for every public method
    - Performance characteristics table
    - Architecture overview (WASM loading, execution, resource limits, determinism)
    - Getting started guide
    - Test WASM module creation guide
    - Contributing guide
- [ ] Run full test suite with coverage — verify ≥ 90% across all modules
- [ ] Run `npx tsc --noEmit` — zero errors
- [ ] Run `npx tsup` — clean build
- [ ] Run linter — zero warnings

### Done When

- [ ] All integration tests pass
- [ ] All performance benchmarks meet targets
- [ ] Determinism verified across 100 repetitions
- [ ] Test WASM modules cover all scenarios
- [ ] Coverage ≥ 90% lines, ≥ 85% branches, ≥ 90% functions (overall)
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] `npx tsup` produces clean ESM + CJS + types output
- [ ] README is complete and documents the full public API
- [ ] Zero `TODO`/`FIXME` comments in source code
- [ ] Ready for `npm publish` and consumption by external callers
- [ ] Tag `v1.0.0`
