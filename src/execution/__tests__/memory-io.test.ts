/**
 * ri-sandbox — Memory I/O unit tests
 */

import { describe, it, expect } from 'vitest';
import {
  encodePayload,
  decodeResult,
  writeToMemory,
  readFromMemory,
} from '../../execution/memory-io.js';

// ---------------------------------------------------------------------------
// encodePayload
// ---------------------------------------------------------------------------

describe('encodePayload', () => {
  it('encodes a simple object to UTF-8 JSON bytes', () => {
    const result = encodePayload({ key: 'value' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const decoder = new TextDecoder();
      expect(decoder.decode(result.value)).toBe('{"key":"value"}');
    }
  });

  it('encodes a number to JSON bytes', () => {
    const result = encodePayload(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const decoder = new TextDecoder();
      expect(decoder.decode(result.value)).toBe('42');
    }
  });

  it('encodes a string to JSON bytes', () => {
    const result = encodePayload('hello');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const decoder = new TextDecoder();
      expect(decoder.decode(result.value)).toBe('"hello"');
    }
  });

  it('encodes null to JSON bytes', () => {
    const result = encodePayload(null);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const decoder = new TextDecoder();
      expect(decoder.decode(result.value)).toBe('null');
    }
  });

  it('encodes an empty object to JSON bytes', () => {
    const result = encodePayload({});
    expect(result.ok).toBe(true);
    if (result.ok) {
      const decoder = new TextDecoder();
      expect(decoder.decode(result.value)).toBe('{}');
    }
  });

  it('encodes unicode payload correctly', () => {
    const result = encodePayload({ emoji: '🚀', text: 'héllo wörld' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const decoder = new TextDecoder();
      const decoded = JSON.parse(decoder.decode(result.value)) as Record<string, string>;
      expect(decoded['emoji']).toBe('🚀');
      expect(decoded['text']).toBe('héllo wörld');
    }
  });

  it('returns error for circular reference', () => {
    const circular: Record<string, unknown> = {};
    circular['self'] = circular;
    const result = encodePayload(circular);
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// decodeResult
// ---------------------------------------------------------------------------

describe('decodeResult', () => {
  it('decodes UTF-8 JSON bytes to a value', () => {
    const encoder = new TextEncoder();
    const bytes = encoder.encode('{"answer":42}');
    const result = decodeResult(bytes);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ answer: 42 });
    }
  });

  it('decodes a number from JSON bytes', () => {
    const encoder = new TextEncoder();
    const result = decodeResult(encoder.encode('123'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(123);
    }
  });

  it('decodes a string from JSON bytes', () => {
    const encoder = new TextEncoder();
    const result = decodeResult(encoder.encode('"hello"'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe('hello');
    }
  });

  it('returns error for invalid JSON', () => {
    const encoder = new TextEncoder();
    const result = decodeResult(encoder.encode('not valid json'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_MODULE');
    }
  });

  it('returns error for empty bytes', () => {
    const result = decodeResult(new Uint8Array(0));
    expect(result.ok).toBe(false);
  });

  it('round-trips encode/decode for complex object', () => {
    const original = {
      name: 'test',
      values: [1, 2, 3],
      nested: { a: true, b: null },
    };
    const encResult = encodePayload(original);
    expect(encResult.ok).toBe(true);
    if (encResult.ok) {
      const decResult = decodeResult(encResult.value);
      expect(decResult.ok).toBe(true);
      if (decResult.ok) {
        expect(decResult.value).toEqual(original);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// writeToMemory / readFromMemory
// ---------------------------------------------------------------------------

describe('writeToMemory', () => {
  it('writes data at offset 0', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const data = new Uint8Array([10, 20, 30]);
    const result = writeToMemory(memory, data, 0);
    expect(result.ok).toBe(true);

    const view = new Uint8Array(memory.buffer);
    expect(view[0]).toBe(10);
    expect(view[1]).toBe(20);
    expect(view[2]).toBe(30);
  });

  it('writes data at a non-zero offset', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const data = new Uint8Array([0xaa, 0xbb]);
    const result = writeToMemory(memory, data, 100);
    expect(result.ok).toBe(true);

    const view = new Uint8Array(memory.buffer);
    expect(view[100]).toBe(0xaa);
    expect(view[101]).toBe(0xbb);
  });

  it('returns error for out-of-bounds write', () => {
    const memory = new WebAssembly.Memory({ initial: 1 }); // 64 KB
    const data = new Uint8Array(100);
    // Offset puts it past the end
    const result = writeToMemory(memory, data, 65500);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_MODULE');
    }
  });

  it('returns error for negative offset', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const data = new Uint8Array([1]);
    const result = writeToMemory(memory, data, -1);
    expect(result.ok).toBe(false);
  });

  it('handles empty data write', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const data = new Uint8Array(0);
    const result = writeToMemory(memory, data, 0);
    expect(result.ok).toBe(true);
  });
});

describe('readFromMemory', () => {
  it('reads data written at offset 0', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const view = new Uint8Array(memory.buffer);
    view[0] = 42;
    view[1] = 43;
    view[2] = 44;

    const result = readFromMemory(memory, 0, 3);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(new Uint8Array([42, 43, 44]));
    }
  });

  it('returns a copy (not a view)', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const view = new Uint8Array(memory.buffer);
    view[0] = 1;

    const result = readFromMemory(memory, 0, 1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Modify original memory
      view[0] = 99;
      // Copy should be unaffected
      expect(result.value[0]).toBe(1);
    }
  });

  it('returns error for out-of-bounds read', () => {
    const memory = new WebAssembly.Memory({ initial: 1 }); // 64 KB
    const result = readFromMemory(memory, 65000, 1000);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_MODULE');
    }
  });

  it('returns error for negative offset', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const result = readFromMemory(memory, -1, 10);
    expect(result.ok).toBe(false);
  });

  it('returns error for negative length', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const result = readFromMemory(memory, 0, -5);
    expect(result.ok).toBe(false);
  });

  it('reads zero bytes successfully', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const result = readFromMemory(memory, 0, 0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.length).toBe(0);
    }
  });

  it('write then read round-trip is identical', () => {
    const memory = new WebAssembly.Memory({ initial: 1 });
    const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    writeToMemory(memory, original, 50);
    const result = readFromMemory(memory, 50, 8);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(original);
    }
  });

  it('handles large payload (100KB boundary)', () => {
    // 2 pages = 128 KB
    const memory = new WebAssembly.Memory({ initial: 2 });
    const largeData = new Uint8Array(102_400); // 100 KB
    for (let i = 0; i < largeData.length; i++) {
      largeData[i] = i % 256;
    }

    const writeResult = writeToMemory(memory, largeData, 0);
    expect(writeResult.ok).toBe(true);

    const readResult = readFromMemory(memory, 0, 102_400);
    expect(readResult.ok).toBe(true);
    if (readResult.ok) {
      expect(readResult.value).toEqual(largeData);
    }
  });
});
