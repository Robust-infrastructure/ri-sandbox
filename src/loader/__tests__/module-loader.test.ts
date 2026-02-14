import { describe, it, expect } from 'vitest';
import { loadModule } from '../module-loader.js';
import {
  minimalWasmModule,
  addWasmModule,
  invalidWasmBytes,
  emptyBytes,
} from './wasm-fixtures.js';

describe('loadModule', () => {
  it('loads a minimal valid WASM module', async () => {
    const result = await loadModule(minimalWasmModule());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeInstanceOf(WebAssembly.Module);
    }
  });

  it('loads a WASM module with an exported function', async () => {
    const result = await loadModule(addWasmModule());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeInstanceOf(WebAssembly.Module);
    }
  });

  it('returns INVALID_MODULE for empty bytes', async () => {
    const result = await loadModule(emptyBytes());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_MODULE');
      if (result.error.code === 'INVALID_MODULE') {
        expect(result.error.reason).toContain('empty');
      }
    }
  });

  it('returns INVALID_MODULE for bytes smaller than minimum size', async () => {
    const result = await loadModule(new Uint8Array([0x00, 0x61, 0x73]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_MODULE');
      if (result.error.code === 'INVALID_MODULE') {
        expect(result.error.reason).toContain('too small');
      }
    }
  });

  it('returns INVALID_MODULE for invalid magic bytes', async () => {
    const result = await loadModule(invalidWasmBytes());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_MODULE');
      if (result.error.code === 'INVALID_MODULE') {
        expect(result.error.reason).toContain('magic');
      }
    }
  });

  it('returns INVALID_MODULE for corrupted WASM (valid magic, bad body)', async () => {
    // Valid magic + version but garbage after
    const bytes = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, // magic
      0x01, 0x00, 0x00, 0x00, // version
      0xff, 0xff, 0xff, 0xff, // garbage section
    ]);
    const result = await loadModule(bytes);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_MODULE');
      if (result.error.code === 'INVALID_MODULE') {
        expect(result.error.reason).toContain('compilation failed');
      }
    }
  });
});
