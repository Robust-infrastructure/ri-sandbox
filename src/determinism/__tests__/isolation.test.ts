/**
 * ri-sandbox — Import isolation unit tests
 */

import { describe, it, expect } from 'vitest';
import { validateModuleImports } from '../isolation.js';
import type { SandboxConfig } from '../../types.js';
import {
  DEFAULT_MAX_MEMORY_BYTES,
  DEFAULT_MAX_GAS,
  DEFAULT_MAX_EXECUTION_MS,
  DEFAULT_DETERMINISTIC_SEED,
} from '../../types.js';
import {
  addWasmModule,
  memoryImportWasmModule,
  hostCallWasmModule,
  wasiImportWasmModule,
  undeclaredImportWasmModule,
  timeImportWasmModule,
  randomImportWasmModule,
  customNamespaceWasmModule,
} from '../../loader/__tests__/wasm-fixtures.js';

/** Default config with no host functions. */
function defaultConfig(overrides: Partial<SandboxConfig> = {}): SandboxConfig {
  return {
    maxMemoryBytes: DEFAULT_MAX_MEMORY_BYTES,
    maxGas: DEFAULT_MAX_GAS,
    maxExecutionMs: DEFAULT_MAX_EXECUTION_MS,
    deterministicSeed: DEFAULT_DETERMINISTIC_SEED,
    eventTimestamp: 1700000000000,
    hostFunctions: {},
    ...overrides,
  };
}

async function compileModule(bytes: Uint8Array): Promise<WebAssembly.Module> {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return WebAssembly.compile(buffer);
}

describe('validateModuleImports', () => {
  describe('accepted modules', () => {
    it('accepts module with no imports', async () => {
      const module = await compileModule(addWasmModule());
      const result = validateModuleImports(module, defaultConfig());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.totalImports).toBe(0);
      }
    });

    it('accepts module with memory import', async () => {
      const module = await compileModule(memoryImportWasmModule());
      const result = validateModuleImports(module, defaultConfig());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.systemImports).toBe(1);
      }
    });

    it('accepts module with declared host function import', async () => {
      const config = defaultConfig({
        hostFunctions: {
          double: {
            name: 'double',
            params: ['i32'],
            results: ['i32'],
            handler: (x: number) => x * 2,
          },
        },
      });
      const module = await compileModule(hostCallWasmModule());
      const result = validateModuleImports(module, config);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.hostFunctionImports).toBe(1);
      }
    });

    it('accepts module importing __get_time', async () => {
      const module = await compileModule(timeImportWasmModule());
      const result = validateModuleImports(module, defaultConfig());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.systemImports).toBe(1);
      }
    });

    it('accepts module importing __get_random', async () => {
      const module = await compileModule(randomImportWasmModule());
      const result = validateModuleImports(module, defaultConfig());
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.systemImports).toBe(1);
      }
    });

    it('returns correct import report counts', async () => {
      const config = defaultConfig({
        hostFunctions: {
          double: {
            name: 'double',
            params: ['i32'],
            results: ['i32'],
            handler: (x: number) => x * 2,
          },
        },
      });
      const module = await compileModule(hostCallWasmModule());
      const result = validateModuleImports(module, config);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.totalImports).toBe(1);
        expect(result.value.hostFunctionImports).toBe(1);
        expect(result.value.systemImports).toBe(0);
        expect(result.value.imports).toHaveLength(1);
        expect(result.value.imports[0]).toEqual({
          module: 'env',
          name: 'double',
          kind: 'function',
        });
      }
    });
  });

  describe('rejected modules', () => {
    it('rejects module with WASI imports', async () => {
      const module = await compileModule(wasiImportWasmModule());
      const result = validateModuleImports(module, defaultConfig());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_MODULE');
        if (result.error.code === 'INVALID_MODULE') {
          expect(result.error.reason).toContain('wasi_snapshot_preview1');
          expect(result.error.reason).toContain('blocked namespace');
        }
      }
    });

    it('rejects module with undeclared import', async () => {
      const module = await compileModule(undeclaredImportWasmModule());
      const result = validateModuleImports(module, defaultConfig());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_MODULE');
        if (result.error.code === 'INVALID_MODULE') {
          expect(result.error.reason).toContain('undeclared_fn');
          expect(result.error.reason).toContain('undeclared function');
        }
      }
    });

    it('rejects module with undeclared host function (double without config)', async () => {
      // hostCallWasmModule imports env.double, but no host functions configured
      const module = await compileModule(hostCallWasmModule());
      const result = validateModuleImports(module, defaultConfig());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_MODULE');
        if (result.error.code === 'INVALID_MODULE') {
          expect(result.error.reason).toContain('double');
        }
      }
    });

    it('rejects module importing from custom namespace', async () => {
      const module = await compileModule(customNamespaceWasmModule());
      const result = validateModuleImports(module, defaultConfig());
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_MODULE');
        if (result.error.code === 'INVALID_MODULE') {
          expect(result.error.reason).toContain('custom_ns');
          expect(result.error.reason).toContain('undeclared namespace');
        }
      }
    });
  });
});
