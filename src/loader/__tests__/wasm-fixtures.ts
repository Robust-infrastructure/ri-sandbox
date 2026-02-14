/**
 * ri-sandbox — WASM test fixture helpers.
 *
 * Minimal hand-crafted WASM binaries for testing the loader and sandbox.
 */

/**
 * Minimal valid WASM module (8 bytes): magic + version.
 * Contains no sections — a valid but empty module.
 */
export function minimalWasmModule(): Uint8Array {
  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, // \0asm magic
    0x01, 0x00, 0x00, 0x00, // version 1
  ]);
}

/**
 * WASM module that exports a function `add(i32, i32) -> i32`.
 *
 * Hand-crafted binary layout:
 *   - Type section:  1 type  (i32, i32) -> i32
 *   - Function section: 1 function referencing type 0
 *   - Export section: export "add" as function 0
 *   - Code section: function body: local.get 0, local.get 1, i32.add, end
 */
export function addWasmModule(): Uint8Array {
  return new Uint8Array([
    // Header
    0x00, 0x61, 0x73, 0x6d, // magic
    0x01, 0x00, 0x00, 0x00, // version

    // Type section (id=1)
    0x01,       // section id
    0x07,       // section size (7 bytes)
    0x01,       // 1 type
    0x60,       // func type
    0x02,       // 2 params
    0x7f, 0x7f, // i32, i32
    0x01,       // 1 result
    0x7f,       // i32

    // Function section (id=3)
    0x03,       // section id
    0x02,       // section size (2 bytes)
    0x01,       // 1 function
    0x00,       // type index 0

    // Export section (id=7)
    0x07,       // section id
    0x07,       // section size (7 bytes)
    0x01,       // 1 export
    0x03,       // name length: 3
    0x61, 0x64, 0x64, // "add"
    0x00,       // export kind: function
    0x00,       // function index 0

    // Code section (id=10)
    0x0a,       // section id
    0x09,       // section size (9 bytes)
    0x01,       // 1 function body
    0x07,       // body size (7 bytes)
    0x00,       // 0 local declarations
    0x20, 0x00, // local.get 0
    0x20, 0x01, // local.get 1
    0x6a,       // i32.add
    0x0b,       // end
  ]);
}

/**
 * WASM module that imports memory from env.memory and exports a function.
 *
 * Exports `getMemSize() -> i32` which returns memory.size (in pages).
 */
export function memoryImportWasmModule(): Uint8Array {
  return new Uint8Array([
    // Header
    0x00, 0x61, 0x73, 0x6d,
    0x01, 0x00, 0x00, 0x00,

    // Type section (id=1): () -> i32
    0x01,
    0x05,       // size
    0x01,       // 1 type
    0x60,       // func
    0x00,       // 0 params
    0x01, 0x7f, // 1 result: i32

    // Import section (id=2): import env.memory as memory (min 1 page)
    0x02,
    0x0f,       // size (15 bytes)
    0x01,       // 1 import
    0x03,       // module name length: 3
    0x65, 0x6e, 0x76, // "env"
    0x06,       // field name length: 6
    0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79, // "memory"
    0x02,       // import kind: memory
    0x00,       // limits: flags (no maximum)
    0x01,       // initial: 1 page

    // Function section (id=3)
    0x03,
    0x02,       // size
    0x01,       // 1 function
    0x00,       // type index 0

    // Export section (id=7): export "getMemSize"
    0x07,
    0x0e,       // size (14 bytes)
    0x01,       // 1 export
    0x0a,       // name length: 10
    0x67, 0x65, 0x74, 0x4d, 0x65, 0x6d, 0x53, 0x69, 0x7a, 0x65, // "getMemSize"
    0x00,       // export kind: function
    0x00,       // function index 0

    // Code section (id=10): memory.size
    0x0a,
    0x06,       // size (6 bytes)
    0x01,       // 1 function body
    0x04,       // body size (4 bytes)
    0x00,       // 0 local declarations
    0x3f, 0x00, // memory.size (memory index 0)
    0x0b,       // end
  ]);
}

/** Invalid bytes — not a WASM module. */
export function invalidWasmBytes(): Uint8Array {
  return new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
}

/** Empty byte array. */
export function emptyBytes(): Uint8Array {
  return new Uint8Array(0);
}
