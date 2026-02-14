/**
 * ri-sandbox — Host function bridge unit tests
 */

import { describe, it, expect } from 'vitest';
import { wrapHostFunction, buildHostImports } from '../../execution/host-bridge.js';
import type { HostFunction, HostFunctionMap } from '../../types.js';
import type { SandboxError } from '../../errors.js';

// ---------------------------------------------------------------------------
// wrapHostFunction
// ---------------------------------------------------------------------------

describe('wrapHostFunction', () => {
  it('calls the handler with correct arguments', () => {
    const calls: number[][] = [];
    const fn: HostFunction = {
      name: 'add',
      params: ['i32', 'i32'],
      results: ['i32'],
      handler: (...args: readonly number[]) => {
        calls.push([...args]);
        const a = args[0] ?? 0;
        const b = args[1] ?? 0;
        return a + b;
      },
    };
    const errors: SandboxError[] = [];
    const wrapped = wrapHostFunction(fn, errors);

    const result = wrapped(3, 7);

    expect(result).toBe(10);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([3, 7]);
    expect(errors).toHaveLength(0);
  });

  it('returns undefined when handler returns undefined', () => {
    const fn: HostFunction = {
      name: 'logValue',
      params: ['i32'],
      results: [],
      handler: () => undefined,
    };
    const errors: SandboxError[] = [];
    const wrapped = wrapHostFunction(fn, errors);

    const result = wrapped(42);

    expect(result).toBeUndefined();
    expect(errors).toHaveLength(0);
  });

  it('captures thrown Error as HOST_FUNCTION_ERROR', () => {
    const fn: HostFunction = {
      name: 'failingFn',
      params: [],
      results: ['i32'],
      handler: () => {
        throw new Error('Something went wrong');
      },
    };
    const errors: SandboxError[] = [];
    const wrapped = wrapHostFunction(fn, errors);

    const result = wrapped();

    expect(result).toBe(0);
    expect(errors).toHaveLength(1);
    const err = errors[0];
    expect(err).toBeDefined();
    if (err !== undefined) {
      expect(err.code).toBe('HOST_FUNCTION_ERROR');
      if (err.code === 'HOST_FUNCTION_ERROR') {
        expect(err.functionName).toBe('failingFn');
        expect(err.message).toBe('Something went wrong');
      }
    }
  });

  it('captures thrown string as HOST_FUNCTION_ERROR', () => {
    const fn: HostFunction = {
      name: 'throwStr',
      params: [],
      results: ['i32'],
      handler: () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'raw string error';
      },
    };
    const errors: SandboxError[] = [];
    const wrapped = wrapHostFunction(fn, errors);

    const result = wrapped();

    expect(result).toBe(0);
    expect(errors).toHaveLength(1);
    const err = errors[0];
    expect(err).toBeDefined();
    if (err !== undefined && err.code === 'HOST_FUNCTION_ERROR') {
      expect(err.message).toBe('raw string error');
    }
  });

  it('accumulates multiple errors', () => {
    const fn: HostFunction = {
      name: 'boom',
      params: [],
      results: ['i32'],
      handler: () => {
        throw new Error('fail');
      },
    };
    const errors: SandboxError[] = [];
    const wrapped = wrapHostFunction(fn, errors);

    wrapped();
    wrapped();
    wrapped();

    expect(errors).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// buildHostImports
// ---------------------------------------------------------------------------

describe('buildHostImports', () => {
  it('builds import record from host function map', () => {
    const hostFunctions: HostFunctionMap = {
      double: {
        name: 'double',
        params: ['i32'],
        results: ['i32'],
        handler: (...args: readonly number[]) => (args[0] ?? 0) * 2,
      },
      negate: {
        name: 'negate',
        params: ['i32'],
        results: ['i32'],
        handler: (...args: readonly number[]) => -(args[0] ?? 0),
      },
    };
    const errors: SandboxError[] = [];
    const imports = buildHostImports(hostFunctions, errors);

    expect(Object.keys(imports)).toHaveLength(2);
    expect(imports['double']).toBeDefined();
    expect(imports['negate']).toBeDefined();

    // Verify they work
    const doubleFn = imports['double'];
    expect(doubleFn?.(5)).toBe(10);

    const negateFn = imports['negate'];
    expect(negateFn?.(7)).toBe(-7);

    expect(errors).toHaveLength(0);
  });

  it('returns empty record for empty host function map', () => {
    const errors: SandboxError[] = [];
    const imports = buildHostImports({}, errors);
    expect(Object.keys(imports)).toHaveLength(0);
  });

  it('wraps all functions with error capture', () => {
    const hostFunctions: HostFunctionMap = {
      fail: {
        name: 'fail',
        params: [],
        results: ['i32'],
        handler: () => {
          throw new Error('boom');
        },
      },
    };
    const errors: SandboxError[] = [];
    const imports = buildHostImports(hostFunctions, errors);

    const failFn = imports['fail'];
    const result = failFn?.();
    expect(result).toBe(0);
    expect(errors).toHaveLength(1);
    const err = errors[0];
    expect(err).toBeDefined();
    if (err !== undefined) {
      expect(err.code).toBe('HOST_FUNCTION_ERROR');
    }
  });

  it('uses function name from HostFunction, not the map key', () => {
    const hostFunctions: HostFunctionMap = {
      myKey: {
        name: 'actual_name',
        params: ['i32'],
        results: ['i32'],
        handler: (...args: readonly number[]) => args[0] ?? 0,
      },
    };
    const errors: SandboxError[] = [];
    const imports = buildHostImports(hostFunctions, errors);

    // Keyed by fn.name, not by the map key
    expect(imports['actual_name']).toBeDefined();
    expect(imports['myKey']).toBeUndefined();
  });
});
