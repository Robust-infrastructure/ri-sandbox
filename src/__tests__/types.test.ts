import { describe, it, expect } from 'vitest';
import type {
  Result,
  WasmValueType,
  HostFunction,
  HostFunctionMap,
  SandboxConfig,
  ResourceMetrics,
  SandboxStatus,
  SandboxInstance,
  ExecutionSuccess,
  ExecutionFailure,
  ExecutionResult,
  MemoryPressureLevel,
  WasmSandbox,
  SandboxError,
  SandboxErrorCode,
} from '../types.js';
import {
  DEFAULT_MAX_MEMORY_BYTES,
  DEFAULT_MAX_GAS,
  DEFAULT_MAX_EXECUTION_MS,
  DEFAULT_DETERMINISTIC_SEED,
} from '../types.js';
import {
  gasExhausted,
  memoryExceeded,
  timeout,
  wasmTrap,
  invalidModule,
  hostFunctionError,
  instanceDestroyed,
  snapshotError,
} from '../errors.js';

// ---------------------------------------------------------------------------
// Helpers — compile-time type assertions
// ---------------------------------------------------------------------------

/**
 * Asserts that the value is assignable to T. Compilation fails if not.
 * The unused parameter suppresses lint warnings.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- intentional compile-time assertion
function assertType<T>(_value: T): void {
  // compile-time only
}

// ---------------------------------------------------------------------------
// Default Constants
// ---------------------------------------------------------------------------

describe('default constants', () => {
  it('has correct default values', () => {
    expect(DEFAULT_MAX_MEMORY_BYTES).toBe(16_777_216);
    expect(DEFAULT_MAX_GAS).toBe(1_000_000);
    expect(DEFAULT_MAX_EXECUTION_MS).toBe(50);
    expect(DEFAULT_DETERMINISTIC_SEED).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Result<T, E>
// ---------------------------------------------------------------------------

describe('Result type', () => {
  it('narrows on ok: true', () => {
    const result: Result<number, string> = { ok: true, value: 42 };
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- testing discriminated union narrowing
    if (result.ok) {
      expect(result.value).toBe(42);
      assertType<number>(result.value);
    }
  });

  it('narrows on ok: false', () => {
    const result: Result<number, string> = { ok: false, error: 'fail' };
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- testing discriminated union narrowing
    if (!result.ok) {
      expect(result.error).toBe('fail');
      assertType<string>(result.error);
    }
  });
});

// ---------------------------------------------------------------------------
// WasmValueType
// ---------------------------------------------------------------------------

describe('WasmValueType', () => {
  it('accepts all four WASM value types', () => {
    const types: WasmValueType[] = ['i32', 'i64', 'f32', 'f64'];
    expect(types).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// HostFunction & HostFunctionMap
// ---------------------------------------------------------------------------

describe('HostFunction', () => {
  it('accepts a valid host function definition', () => {
    const fn: HostFunction = {
      name: 'log',
      params: ['i32', 'i32'],
      results: [],
      handler: (_ptr: number, _len: number) => undefined,
    };
    expect(fn.name).toBe('log');
    expect(fn.params).toEqual(['i32', 'i32']);
    expect(fn.results).toEqual([]);
  });
});

describe('HostFunctionMap', () => {
  it('accepts a record of host functions', () => {
    const map: HostFunctionMap = {
      log: {
        name: 'log',
        params: ['i32'],
        results: [],
        handler: () => undefined,
      },
      getValue: {
        name: 'getValue',
        params: [],
        results: ['i32'],
        handler: () => 42,
      },
    };
    expect(Object.keys(map)).toEqual(['log', 'getValue']);
  });
});

// ---------------------------------------------------------------------------
// SandboxConfig
// ---------------------------------------------------------------------------

describe('SandboxConfig', () => {
  it('accepts a full configuration', () => {
    const config: SandboxConfig = {
      maxMemoryBytes: DEFAULT_MAX_MEMORY_BYTES,
      maxGas: DEFAULT_MAX_GAS,
      maxExecutionMs: DEFAULT_MAX_EXECUTION_MS,
      hostFunctions: {},
      deterministicSeed: DEFAULT_DETERMINISTIC_SEED,
      eventTimestamp: 1700000000000,
    };
    expect(config.maxMemoryBytes).toBe(16_777_216);
    expect(config.maxGas).toBe(1_000_000);
    expect(config.maxExecutionMs).toBe(50);
    expect(config.deterministicSeed).toBe(0);
    expect(config.eventTimestamp).toBe(1700000000000);
  });
});

// ---------------------------------------------------------------------------
// ResourceMetrics
// ---------------------------------------------------------------------------

describe('ResourceMetrics', () => {
  it('holds all metric fields', () => {
    const metrics: ResourceMetrics = {
      memoryUsedBytes: 1024,
      memoryLimitBytes: DEFAULT_MAX_MEMORY_BYTES,
      gasUsed: 500,
      gasLimit: DEFAULT_MAX_GAS,
      executionMs: 10,
      executionLimitMs: DEFAULT_MAX_EXECUTION_MS,
    };
    expect(metrics.memoryUsedBytes).toBe(1024);
    expect(metrics.gasLimit).toBe(1_000_000);
  });
});

// ---------------------------------------------------------------------------
// SandboxInstance
// ---------------------------------------------------------------------------

describe('SandboxInstance', () => {
  it('accepts all valid status values', () => {
    const statuses: SandboxStatus[] = ['created', 'loaded', 'running', 'suspended', 'destroyed'];
    expect(statuses).toHaveLength(5);
  });

  it('holds instance fields', () => {
    const instance: SandboxInstance = {
      id: 'test-1',
      config: {
        maxMemoryBytes: DEFAULT_MAX_MEMORY_BYTES,
        maxGas: DEFAULT_MAX_GAS,
        maxExecutionMs: DEFAULT_MAX_EXECUTION_MS,
        hostFunctions: {},
        deterministicSeed: DEFAULT_DETERMINISTIC_SEED,
        eventTimestamp: 1700000000000,
      },
      status: 'created',
      metrics: {
        memoryUsedBytes: 0,
        memoryLimitBytes: DEFAULT_MAX_MEMORY_BYTES,
        gasUsed: 0,
        gasLimit: DEFAULT_MAX_GAS,
        executionMs: 0,
        executionLimitMs: DEFAULT_MAX_EXECUTION_MS,
      },
    };
    expect(instance.id).toBe('test-1');
    expect(instance.status).toBe('created');
  });
});

// ---------------------------------------------------------------------------
// SandboxError — discriminated union narrowing
// ---------------------------------------------------------------------------

describe('SandboxError', () => {
  it('narrows GAS_EXHAUSTED', () => {
    const error: SandboxError = gasExhausted(1_000_000, 1_000_000);
    if (error.code === 'GAS_EXHAUSTED') {
      expect(error.gasUsed).toBe(1_000_000);
      expect(error.gasLimit).toBe(1_000_000);
      assertType<number>(error.gasUsed);
      assertType<number>(error.gasLimit);
    }
  });

  it('narrows MEMORY_EXCEEDED', () => {
    const error: SandboxError = memoryExceeded(20_000_000, 16_777_216);
    if (error.code === 'MEMORY_EXCEEDED') {
      expect(error.memoryUsed).toBe(20_000_000);
      expect(error.memoryLimit).toBe(16_777_216);
    }
  });

  it('narrows TIMEOUT', () => {
    const error: SandboxError = timeout(60, 50);
    if (error.code === 'TIMEOUT') {
      expect(error.elapsedMs).toBe(60);
      expect(error.limitMs).toBe(50);
    }
  });

  it('narrows WASM_TRAP', () => {
    const error: SandboxError = wasmTrap('unreachable', 'unreachable instruction executed');
    if (error.code === 'WASM_TRAP') {
      expect(error.trapKind).toBe('unreachable');
      expect(error.message).toBe('unreachable instruction executed');
    }
  });

  it('narrows INVALID_MODULE', () => {
    const error: SandboxError = invalidModule('bad magic bytes');
    if (error.code === 'INVALID_MODULE') {
      expect(error.reason).toBe('bad magic bytes');
    }
  });

  it('narrows HOST_FUNCTION_ERROR', () => {
    const error: SandboxError = hostFunctionError('log', 'buffer overflow');
    if (error.code === 'HOST_FUNCTION_ERROR') {
      expect(error.functionName).toBe('log');
      expect(error.message).toBe('buffer overflow');
    }
  });

  it('narrows INSTANCE_DESTROYED', () => {
    const error: SandboxError = instanceDestroyed('inst-42');
    if (error.code === 'INSTANCE_DESTROYED') {
      expect(error.instanceId).toBe('inst-42');
    }
  });

  it('narrows SNAPSHOT_ERROR', () => {
    const error: SandboxError = snapshotError('corrupt data');
    if (error.code === 'SNAPSHOT_ERROR') {
      expect(error.reason).toBe('corrupt data');
    }
  });

  it('covers all 8 error codes', () => {
    const codes: SandboxErrorCode[] = [
      'GAS_EXHAUSTED',
      'MEMORY_EXCEEDED',
      'TIMEOUT',
      'WASM_TRAP',
      'INVALID_MODULE',
      'HOST_FUNCTION_ERROR',
      'INSTANCE_DESTROYED',
      'SNAPSHOT_ERROR',
    ];
    expect(codes).toHaveLength(8);
  });
});

// ---------------------------------------------------------------------------
// ExecutionResult — discriminated union narrowing
// ---------------------------------------------------------------------------

describe('ExecutionResult', () => {
  it('narrows success result', () => {
    const result: ExecutionResult = {
      ok: true,
      value: { answer: 42 },
      metrics: {
        memoryUsedBytes: 2048,
        memoryLimitBytes: DEFAULT_MAX_MEMORY_BYTES,
        gasUsed: 500,
        gasLimit: DEFAULT_MAX_GAS,
        executionMs: 5,
        executionLimitMs: DEFAULT_MAX_EXECUTION_MS,
      },
      gasUsed: 500,
      durationMs: 5,
    };

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- testing discriminated union narrowing
    if (result.ok) {
      assertType<ExecutionSuccess>(result);
      expect(result.value).toEqual({ answer: 42 });
      expect(result.gasUsed).toBe(500);
      expect(result.durationMs).toBe(5);
      expect(result.metrics.memoryUsedBytes).toBe(2048);
    } else {
      expect.unreachable('Expected success result');
    }
  });

  it('narrows failure result', () => {
    const result: ExecutionResult = {
      ok: false,
      error: gasExhausted(1_000_001, 1_000_000),
    };

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- testing discriminated union narrowing
    if (!result.ok) {
      assertType<ExecutionFailure>(result);
      expect(result.error.code).toBe('GAS_EXHAUSTED');
    } else {
      expect.unreachable('Expected failure result');
    }
  });
});

// ---------------------------------------------------------------------------
// MemoryPressureLevel
// ---------------------------------------------------------------------------

describe('MemoryPressureLevel', () => {
  it('accepts all 5 pressure levels', () => {
    const levels: MemoryPressureLevel[] = ['NORMAL', 'WARNING', 'PRESSURE', 'CRITICAL', 'OOM'];
    expect(levels).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// WasmSandbox interface — structural compatibility
// ---------------------------------------------------------------------------

describe('WasmSandbox interface', () => {
  it('can be structurally implemented', () => {
    // Verify the interface shape compiles — a no-op implementation
    const _sandbox: WasmSandbox = {
      create: (_config: SandboxConfig): SandboxInstance => {
        throw new Error('not implemented');
      },
      load: async (_instance: SandboxInstance, _module: Uint8Array): Promise<void> => {
        // not implemented
      },
      execute: (_instance: SandboxInstance, _action: string, _payload: unknown): ExecutionResult => {
        throw new Error('not implemented');
      },
      destroy: (_instance: SandboxInstance): void => {
        // not implemented
      },
      snapshot: (_instance: SandboxInstance): Uint8Array => {
        throw new Error('not implemented');
      },
      restore: (_instance: SandboxInstance, _snapshot: Uint8Array): void => {
        // not implemented
      },
      getMetrics: (_instance: SandboxInstance): ResourceMetrics => {
        throw new Error('not implemented');
      },
    };

    expect(_sandbox).toBeDefined();
  });
});
