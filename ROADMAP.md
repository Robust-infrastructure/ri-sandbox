# ri-sandbox — ROADMAP

Deterministic WASM execution with resource limits, isolation, and snapshot/restore.

**Scope**: Phase 0 — everything needed to ship a production-ready npm package.

**Technology**: TypeScript, Vitest, tsup, Browser WebAssembly API, WebAssembly.Memory.

---

## M1: Project Scaffolding (Status: COMPLETE)

**Goal**: Working TypeScript project with build, test, lint, and CI infrastructure.

**Depends on**: None

### Tasks

- [x] Initialize npm project (`npm init`) with `"type": "module"`
- [x] Install dev dependencies: `typescript`, `vitest`, `tsup`, `eslint`, `@typescript-eslint/parser`, `@typescript-eslint/eslint-plugin`, `prettier`
- [x] Create `tsconfig.json` (strict mode, ES2022 target, ESNext modules, bundler resolution)
- [x] Create `vitest.config.ts` with v8 coverage provider, 90% line / 85% branch / 90% function thresholds
- [x] Create `tsup.config.ts` — ESM + CJS dual output, entry `src/index.ts`, dts generation
- [x] Create `.eslintrc.cjs` or `eslint.config.js` with @typescript-eslint strict rules
- [x] Create `.prettierrc` (singleQuote, trailingComma, printWidth 100)
- [x] Create `src/index.ts` with placeholder export
- [ ] Create `src/types.ts` with all public type definitions (see M2)
- [ ] Create `src/errors.ts` with error type union
- [x] Create GitHub Actions workflow `.github/workflows/ci.yml` — runs lint, type-check, test on push/PR
- [x] Create `README.md` — project description, API overview, install instructions, usage example
- [x] Create `LICENSE` (MIT)
- [x] Verify: `npx tsc --noEmit` passes
- [x] Verify: `npx vitest run` passes (placeholder test)
- [x] Verify: `npx tsup` produces `dist/` with ESM + CJS + types
- [x] Commit and tag `v0.1.0`

### Done When

- [x] `npm run build` produces working ESM + CJS output with `.d.ts` files
- [x] `npm run test` runs Vitest with zero failures
- [x] `npm run lint` passes with zero warnings
- [x] `npm run typecheck` passes with zero errors
- [x] CI workflow runs successfully on push
- [x] README documents the project purpose and planned API

---

## M2: Core Types & Configuration (Status: COMPLETE)

**Goal**: All public types defined — the complete API contract before any implementation.

**Depends on**: M1

### Tasks

- [x] Define `SandboxConfig` interface:
    - `maxMemoryBytes` (number, default 16_777_216 — 16 MB) — hard memory limit for the WASM instance
    - `maxGas` (number, default 1_000_000) — computation budget per execution (instruction count)
    - `maxExecutionMs` (number, default 50) — wall-clock timeout
    - `hostFunctions` (HostFunctionMap, default {}) — injected bridge functions
    - `deterministicSeed` (number, default 0) — PRNG seed for deterministic random
    - `eventTimestamp` (number, default Date.now() at creation) — injected "current time" (milliseconds since epoch)
- [x] Define `HostFunctionMap` type — `Record<string, HostFunction>`
- [x] Define `HostFunction` interface:
    - `name` (string) — function name as seen from WASM
    - `params` (WasmValueType[]) — parameter types
    - `results` (WasmValueType[]) — return types
    - `handler` (...args: number[]) => number | undefined — the actual implementation
- [x] Define `WasmValueType` union — `'i32' | 'i64' | 'f32' | 'f64'`
- [x] Define `SandboxInstance` interface:
    - `id` (string) — unique instance identifier
    - `config` (Readonly<SandboxConfig>) — frozen configuration
    - `status` ('created' | 'loaded' | 'running' | 'suspended' | 'destroyed')
    - `metrics` (ResourceMetrics) — current resource usage
- [x] Define `ExecutionResult` type:
    - `{ ok: true; value: unknown; metrics: ResourceMetrics; gasUsed: number; durationMs: number }`
    - `{ ok: false; error: SandboxError }`
- [x] Define `ResourceMetrics` interface:
    - `memoryUsedBytes` (number) — current WASM linear memory usage
    - `memoryLimitBytes` (number) — configured limit
    - `gasUsed` (number) — instructions executed so far
    - `gasLimit` (number) — configured budget
    - `executionMs` (number) — wall-clock time elapsed
    - `executionLimitMs` (number) — configured timeout
- [x] Define `SandboxError` discriminated union:
    - `GAS_EXHAUSTED` — `{ gasUsed: number; gasLimit: number }`
    - `MEMORY_EXCEEDED` — `{ memoryUsed: number; memoryLimit: number }`
    - `TIMEOUT` — `{ elapsedMs: number; limitMs: number }`
    - `WASM_TRAP` — `{ trapKind: string; message: string }`
    - `INVALID_MODULE` — `{ reason: string }`
    - `HOST_FUNCTION_ERROR` — `{ functionName: string; message: string }`
    - `INSTANCE_DESTROYED` — `{ instanceId: string }`
    - `SNAPSHOT_ERROR` — `{ reason: string }`
- [x] Define `WasmSandbox` interface — all 7 methods:
    - `create(config: SandboxConfig): SandboxInstance`
    - `load(instance: SandboxInstance, module: Uint8Array): Promise<void>`
    - `execute(instance: SandboxInstance, action: string, payload: unknown): ExecutionResult`
    - `destroy(instance: SandboxInstance): void`
    - `snapshot(instance: SandboxInstance): Uint8Array`
    - `restore(instance: SandboxInstance, snapshot: Uint8Array): void`
    - `getMetrics(instance: SandboxInstance): ResourceMetrics`
- [x] Define `Result<T, E>` type — `{ ok: true; value: T } | { ok: false; error: E }`
- [x] Write type-level tests — verify types compile, discriminated unions narrow
- [x] Export all types from `src/index.ts`
- [x] Update `README.md` with full type documentation

### Done When

- [x] All public types are defined and exported
- [x] `npx tsc --noEmit` passes — types are valid TypeScript
- [x] Type tests verify discriminated union narrowing
- [x] `npx tsup` produces `.d.ts` files with all types
- [x] README documents every public type

---

## M3: WASM Module Loading & Instantiation (Status: COMPLETE)

**Goal**: Load, validate, and instantiate WASM modules with configured memory limits.

**Depends on**: M2

### Tasks

- [x] Create `src/loader/module-loader.ts` — WASM module loading
    - `loadModule(bytes: Uint8Array): Promise<WebAssembly.Module>`
    - Validate WASM magic bytes (`\0asm`)
    - Compile using `WebAssembly.compile(bytes)` (browser API)
    - Reject modules that exceed configured memory limits (inspect memory imports)
    - Return typed errors for invalid modules
- [x] Create `src/loader/instance-factory.ts` — instance creation
    - `createSandboxInstance(config: SandboxConfig): SandboxInstance`
    - Generate unique ID (counter-based deterministic IDs: `sandbox-0`, `sandbox-1`, ...)
    - Create `WebAssembly.Memory` with `initial` and `maximum` pages derived from `maxMemoryBytes`
    - Calculate page count: `Math.ceil(maxMemoryBytes / 65536)` (WASM page = 64KB)
    - Set instance status to `created`
    - Initialize metrics to zero
- [x] Create `src/loader/instantiator.ts` — WASM instantiation
    - `instantiate(state: InternalSandboxState, module: WebAssembly.Module): Promise<void>`
    - Build import object from `hostFunctions` + memory
    - Instantiate module: `WebAssembly.instantiate(module, imports)`
    - Set instance status to `loaded`
    - Detect and report missing imports (clear error with expected vs. provided)
- [x] Create `src/loader/__tests__/module-loader.test.ts` — unit tests:
    - Valid WASM module loads successfully
    - Invalid bytes (not WASM): returns `INVALID_MODULE` error
    - Empty bytes: returns `INVALID_MODULE` error
    - Corrupted body: returns `INVALID_MODULE` error
- [x] Create `src/loader/__tests__/instance-factory.test.ts` — unit tests:
    - Creates instance with unique ID
    - Config is frozen (readonly)
    - Initial status is `created`
    - Memory pages calculated correctly from bytes
    - Boundary: 64KB → 1 page, 65KB → 2 pages, 1MB → 16 pages
- [x] Create `src/loader/__tests__/instantiator.test.ts` — unit tests:
    - Instantiation with valid module succeeds
    - Status changes to `loaded` after instantiation
    - Missing import: clear error listing expected imports
    - Host functions are callable from WASM
    - Destroyed instance returns error
- [x] Wire `create` and `load` into `WasmSandbox` factory function in `src/sandbox.ts`
- [x] Implement `destroy(instance)` in `src/sandbox.ts`:
    - Verify instance status is not already `destroyed`
    - Release WASM memory (set memory buffer reference to null)
    - Clear all host function references
    - Set instance status to `destroyed`
    - Idempotent destroy (no-op if already destroyed)
- [x] Create `src/loader/__tests__/sandbox.test.ts` — unit tests:
    - Create instance with valid config
    - Load module into instance
    - Destroy loaded instance: status becomes `destroyed`
    - Idempotent destroy (second destroy is no-op)
    - Post-destroy: load, execute, getMetrics throw errors
    - getMetrics returns live memory usage
- [x] Export factory function `createWasmSandbox(): WasmSandbox` from `src/index.ts`

### Done When

- [x] WASM modules load and validate correctly
- [x] Memory limits are enforced via `WebAssembly.Memory` maximum
- [x] Host functions are injected into the WASM import object
- [x] Invalid modules produce clear, typed errors
- [x] All unit tests pass (59 tests across 6 files)
- [x] Coverage ≥ 90% for loader modules

---

## M4: Execution Engine & Host Function Bridge (Status: COMPLETE)

**Goal**: Execute WASM functions with host function bridging, JSON payload serialization, and result extraction.

**Depends on**: M3

### Tasks

- [x] Create `src/execution/executor.ts` — `execute` implementation
    - `execute(state, action, payload)`:
        1. Verify instance status is `loaded` or `running`
        2. Direct mode: pass numeric args directly to WASM function
        3. JSON mode: serialize payload, allocate via `__alloc`, write to memory, call with (ptr, len)
        4. Read result from WASM function return value or memory
        5. Return `ExecutionResult` with value + metrics
    - Set instance status to `running` during execution, back to `loaded` after
    - Guard against destroyed/created instances with typed errors
- [x] Create `src/execution/memory-io.ts` — memory read/write helpers
    - `writeToMemory(memory, data, offset): Result` — bounds-checked write
    - `readFromMemory(memory, offset, length): Result` — bounds-checked read (returns copy)
    - `encodePayload(payload): Result` — JSON stringify → UTF-8 encode
    - `decodeResult(bytes): Result` — UTF-8 decode → JSON parse
    - All functions return `Result<T, SandboxError>` for safe error handling
- [x] Create `src/execution/host-bridge.ts` — host function wrapper
    - `wrapHostFunction(fn, capturedErrors)` — wraps handler with try/catch
    - `buildHostImports(hostFunctions, capturedErrors)` — builds env import record
    - Error capture: exceptions convert to `HOST_FUNCTION_ERROR`, returns 0 to WASM
    - Host functions receive raw WASM values (i32, f64, etc.)
- [x] Create `src/execution/__tests__/executor.test.ts` — 18 unit tests:
    - Execute add(3, 7) → 10 (direct mode)
    - Null/undefined payload → no-args call
    - Single number payload, negative numbers
    - Destroyed instance → INSTANCE_DESTROYED
    - Created (not loaded) instance → WASM_TRAP
    - Unknown action name → WASM_TRAP (missing_export)
    - No WASM instance → WASM_TRAP (no_instance)
    - Host function invocation from WASM → correct result
    - Multiple executions → consistent results
    - JSON mode without __alloc → WASM_TRAP error
    - Status restored after errors
- [x] Create `src/execution/__tests__/memory-io.test.ts` — 26 unit tests:
    - Write and read round-trip: identical bytes
    - Bounds check: write/read past memory end → error
    - Negative offset/length → error
    - Empty data/payload → succeeds
    - Large payload (100KB) → round-trips correctly
    - Unicode payload: encoding is correct
    - Circular reference: returns error
    - JSON encode/decode round-trip for complex objects
- [x] Create `src/execution/__tests__/host-bridge.test.ts` — 9 unit tests:
    - Host function called with correct arguments
    - Host function returning undefined
    - Thrown Error → captured as HOST_FUNCTION_ERROR
    - Thrown string → captured as HOST_FUNCTION_ERROR
    - Multiple errors accumulated
    - buildHostImports creates correct import record
    - Empty host function map → empty record
    - Error capture wired through buildHostImports
    - Uses fn.name (not map key) for import names
- [x] Wire `execute` into `WasmSandbox` factory
- [x] Add `hostCallWasmModule` and `noExportsWasmModule` WASM test fixtures

### Done When

- [x] WASM functions can be called with numeric and JSON payloads
- [x] Results are extracted correctly from WASM return values
- [x] Host functions are invoked from WASM and errors are captured
- [x] Memory I/O handles bounds checking and encoding
- [x] All unit tests pass (112 tests across 9 files)
- [x] Coverage ≥ 90% for execution modules

---

## M5: Gas Metering & Resource Limits (Status: COMPLETE)

**Goal**: Enforce computation budgets (gas), memory limits, and wall-clock timeouts.

**Depends on**: M4

### Tasks

- [x] Create `src/resources/gas-meter.ts` — gas (instruction) metering
    - Strategy: intercept execution at host function call boundaries (Option B)
    - `GasExhaustedSignal` extends `Error` — thrown when gas budget exceeded
    - `GasMeter` interface: `gasUsed`, `gasLimit`, `isExhausted`, `consume(amount?)`, `reset()`
    - `createGasMeter(gasLimit)` factory — returns mutable meter
    - When `gasUsed + amount > gasLimit`: throws `GasExhaustedSignal`
    - Gas is consumed (1 unit) at each host function call boundary
    - Executor catches `GasExhaustedSignal` and returns `GAS_EXHAUSTED` error
- [x] Create `src/resources/memory-limiter.ts` — memory enforcement
    - `WebAssembly.Memory` with `maximum` pages already enforces hard limit
    - `getMemoryUsageBytes(memory)` — returns current memory usage
    - `getMemoryUsagePages(memory)` — returns current page count
    - `checkMemoryLimit(memory, limitBytes)` — returns `MemoryCheckResult`
    - `createMemoryExceededError(result)` — converts check result to `SandboxError`
    - Memory checked after each execution in the executor
- [x] Create `src/resources/timeout.ts` — wall-clock timeout
    - `TimeoutSignal` extends `Error` — thrown when timeout exceeded
    - `TimerFn` type — injectable timer function for determinism in tests
    - `defaultTimer` — uses `performance.now()` (falls back to `Date.now()`)
    - `TimeoutChecker` interface: `elapsedMs`, `limitMs`, `isTimedOut`, `start()`, `check()`
    - `createTimeoutChecker(limitMs, timer?)` factory — returns mutable checker
    - Timeout is checked at each host function call boundary
    - Executor catches `TimeoutSignal` and returns `TIMEOUT` error
- [x] Create `src/resources/resource-tracker.ts` — aggregate resource tracking
    - `ExecutionContext` interface: `gasMeter`, `timeoutChecker`, `hostErrors`
    - `createExecutionContext(config)` — creates fresh context per `execute()` call
    - `buildResourceMetrics(ctx, memory, config)` — builds `ResourceMetrics` from context
    - Context stored on `InternalSandboxState.executionContext` during execution
    - Host function wrappers in `instantiator.ts` access context at call time via closure
- [x] Create `src/resources/__tests__/gas-meter.test.ts` — 18 unit tests:
    - GasExhaustedSignal: extends Error, stores gasUsed/gasLimit, descriptive message
    - createGasMeter: starts at zero, reports limit, consumes with default/custom amount
    - Accumulates gas, throws when exceeded, records exceeding amount
    - Subsequent calls after exhaustion throw, exact budget succeeds
    - Reset clears gasUsed and exhausted, works after reset, deterministic
- [x] Create `src/resources/__tests__/memory-limiter.test.ts` — 12 unit tests:
    - getMemoryUsageBytes: null → 0, 1-page, 4-page
    - getMemoryUsagePages: null → 0, 1-page, 4-page
    - checkMemoryLimit: null memory, equal, below, above limit
    - createMemoryExceededError: correct error code and fields, deterministic
- [x] Create `src/resources/__tests__/timeout.test.ts` — 15 unit tests:
    - TimeoutSignal: extends Error, stores elapsedMs/limitMs, descriptive message
    - createTimeoutChecker: zero elapsed before start, reports limit
    - Tracks elapsed time, check passes under limit, throws when exceeded
    - Contains correct values, marks timed out, throws on subsequent calls
    - Allows at exactly limit, deterministic, resets on re-start
- [x] Create `src/resources/__tests__/resource-tracker.test.ts` — 9 unit tests:
    - createExecutionContext: gas meter at limit, timeout checker at limit, empty errors
    - Injectable timer, gas and timeout independent
    - buildResourceMetrics: from context + memory, null memory, reflects gas, deterministic
- [x] Wire resource enforcement into `execute` flow:
    - `executor.ts` creates `ExecutionContext` per call
    - Sets on `state.executionContext` for host wrapper access
    - Starts timeout checker, catches `GasExhaustedSignal` and `TimeoutSignal`
    - Checks memory limit after execution
    - Builds metrics from context, clears context in all paths
- [x] Create `src/execution/__tests__/executor-resources.test.ts` — 14 integration tests:
    - Gas: exhaustion triggers GAS_EXHAUSTED, correct error fields, status restored, succeeds within budget, gasUsed tracked
    - Timeout: timeout triggers TIMEOUT, status restored, succeeds within limit
    - Memory: exceeded triggers MEMORY_EXCEEDED, status restored
    - Lifecycle: context cleared after success/error, metrics updated
- [x] Wire `getMetrics` into `WasmSandbox` factory
- [x] Extract `classifyInstantiationError` for testable error classification

### Done When

- [x] Gas budget enforced — execution stops when gas exhausted
- [x] Memory limits enforced — growth past limit is trapped
- [x] Wall-clock timeout works — long executions are aborted
- [x] ResourceMetrics accurately reflect usage after every execution
- [x] All unit tests pass (190 tests across 15 files)
- [x] Coverage ≥ 90% lines, ≥ 85% branches for all modules

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
