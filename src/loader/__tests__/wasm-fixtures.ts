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

/**
 * WASM module that imports `env.double(i32) -> i32` and exports `callDouble(i32) -> i32`.
 *
 * The exported `callDouble` function calls the imported `double` host function
 * with its argument and returns the result.
 *
 * Binary layout:
 *   - Type section:  1 type  (i32) -> i32
 *   - Import section: import env.double as func type 0
 *   - Function section: 1 function (callDouble) referencing type 0
 *   - Export section: export "callDouble" as function 1
 *   - Code section: function body: local.get 0, call 0, end
 */
export function hostCallWasmModule(): Uint8Array {
  return new Uint8Array([
    // Header
    0x00, 0x61, 0x73, 0x6d, // magic
    0x01, 0x00, 0x00, 0x00, // version

    // Type section (id=1): (i32) -> i32
    0x01,       // section id
    0x06,       // section size (6 bytes)
    0x01,       // 1 type
    0x60,       // func type
    0x01,       // 1 param
    0x7f,       // i32
    0x01,       // 1 result
    0x7f,       // i32

    // Import section (id=2): env.double
    0x02,       // section id
    0x0e,       // section size (14 bytes)
    0x01,       // 1 import
    0x03,       // module name length: 3
    0x65, 0x6e, 0x76, // "env"
    0x06,       // field name length: 6
    0x64, 0x6f, 0x75, 0x62, 0x6c, 0x65, // "double"
    0x00,       // import kind: function
    0x00,       // type index 0

    // Function section (id=3): 1 function, type 0
    0x03,       // section id
    0x02,       // section size (2 bytes)
    0x01,       // 1 function
    0x00,       // type index 0

    // Export section (id=7): "callDouble" -> func 1
    0x07,       // section id
    0x0e,       // section size (14 bytes)
    0x01,       // 1 export
    0x0a,       // name length: 10
    // "callDouble"
    0x63, 0x61, 0x6c, 0x6c, 0x44, 0x6f, 0x75, 0x62, 0x6c, 0x65,
    0x00,       // export kind: function
    0x01,       // function index 1 (func 0 is the imported `double`)

    // Code section (id=10): callDouble body
    0x0a,       // section id
    0x08,       // section size (8 bytes)
    0x01,       // 1 function body
    0x06,       // body size (6 bytes)
    0x00,       // 0 local declarations
    0x20, 0x00, // local.get 0
    0x10, 0x00, // call 0 (the imported `double` function)
    0x0b,       // end
  ]);
}

/**
 * WASM module with no exported functions.
 * Has a type section and function section but exports nothing.
 */
export function noExportsWasmModule(): Uint8Array {
  return new Uint8Array([
    // Header
    0x00, 0x61, 0x73, 0x6d, // magic
    0x01, 0x00, 0x00, 0x00, // version

    // Type section (id=1): () -> ()
    0x01,       // section id
    0x04,       // section size
    0x01,       // 1 type
    0x60,       // func type
    0x00,       // 0 params
    0x00,       // 0 results

    // Function section (id=3)
    0x03,       // section id
    0x02,       // section size
    0x01,       // 1 function
    0x00,       // type index 0

    // Code section (id=10): empty function body
    0x0a,       // section id
    0x05,       // section size (5 bytes)
    0x01,       // 1 function body
    0x03,       // body size (3 bytes)
    0x00,       // 0 local declarations
    0x01,       // nop
    0x0b,       // end
  ]);
}

/**
 * WASM module that imports from `wasi_snapshot_preview1` namespace.
 * Used to test isolation — should be rejected by import validation.
 *
 * Imports `wasi_snapshot_preview1.fd_write(i32, i32, i32, i32) -> i32`.
 */
export function wasiImportWasmModule(): Uint8Array {
  return new Uint8Array([
    // Header
    0x00, 0x61, 0x73, 0x6d,
    0x01, 0x00, 0x00, 0x00,

    // Type section (id=1): (i32, i32, i32, i32) -> i32
    0x01,
    0x09,       // size (9 bytes)
    0x01,       // 1 type
    0x60,       // func type
    0x04,       // 4 params
    0x7f, 0x7f, 0x7f, 0x7f, // i32 × 4
    0x01,       // 1 result
    0x7f,       // i32

    // Import section (id=2): wasi_snapshot_preview1.fd_write
    0x02,
    0x23,       // size (35 bytes)
    0x01,       // 1 import
    0x16,       // module name length: 22
    // "wasi_snapshot_preview1"
    0x77, 0x61, 0x73, 0x69, 0x5f, 0x73, 0x6e, 0x61, 0x70, 0x73,
    0x68, 0x6f, 0x74, 0x5f, 0x70, 0x72, 0x65, 0x76, 0x69, 0x65,
    0x77, 0x31,
    0x08,       // field name length: 8
    // "fd_write"
    0x66, 0x64, 0x5f, 0x77, 0x72, 0x69, 0x74, 0x65,
    0x00,       // import kind: function
    0x00,       // type index 0
  ]);
}

/**
 * WASM module that imports an undeclared function `env.undeclared_fn`.
 * Used to test isolation — should be rejected when `undeclared_fn`
 * is not in the configured host functions.
 *
 * Imports `env.undeclared_fn() -> i32`.
 * Exports `callUndeclared() -> i32`.
 */
export function undeclaredImportWasmModule(): Uint8Array {
  return new Uint8Array([
    // Header
    0x00, 0x61, 0x73, 0x6d,
    0x01, 0x00, 0x00, 0x00,

    // Type section (id=1): () -> i32
    0x01,
    0x05,       // size
    0x01,       // 1 type
    0x60,       // func type
    0x00,       // 0 params
    0x01, 0x7f, // 1 result: i32

    // Import section (id=2): env.undeclared_fn
    0x02,
    0x15,       // size (21 bytes)
    0x01,       // 1 import
    0x03,       // module name length: 3
    0x65, 0x6e, 0x76, // "env"
    0x0d,       // field name length: 13
    // "undeclared_fn"
    0x75, 0x6e, 0x64, 0x65, 0x63, 0x6c, 0x61, 0x72, 0x65, 0x64,
    0x5f, 0x66, 0x6e,
    0x00,       // import kind: function
    0x00,       // type index 0

    // Function section (id=3)
    0x03,
    0x02,       // size
    0x01,       // 1 function
    0x00,       // type index 0

    // Export section (id=7): "callUndeclared" -> func 1
    0x07,
    0x12,       // size (18 bytes)
    0x01,       // 1 export
    0x0e,       // name length: 14
    // "callUndeclared"
    0x63, 0x61, 0x6c, 0x6c, 0x55, 0x6e, 0x64, 0x65, 0x63, 0x6c,
    0x61, 0x72, 0x65, 0x64,
    0x00,       // export kind: function
    0x01,       // function index 1

    // Code section (id=10): callUndeclared body
    0x0a,
    0x06,       // size (6 bytes)
    0x01,       // 1 function body
    0x04,       // body size (4 bytes)
    0x00,       // 0 local declarations
    0x10, 0x00, // call 0 (the imported undeclared_fn)
    0x0b,       // end
  ]);
}

/**
 * WASM module that imports `env.__get_time() -> i32` and exports
 * `getTime() -> i32` which calls the imported time function.
 */
export function timeImportWasmModule(): Uint8Array {
  return new Uint8Array([
    // Header
    0x00, 0x61, 0x73, 0x6d,
    0x01, 0x00, 0x00, 0x00,

    // Type section (id=1): () -> i32
    0x01,
    0x05,       // size
    0x01,       // 1 type
    0x60,       // func type
    0x00,       // 0 params
    0x01, 0x7f, // 1 result: i32

    // Import section (id=2): env.__get_time
    0x02,
    0x12,       // size (18 bytes)
    0x01,       // 1 import
    0x03,       // module name length: 3
    0x65, 0x6e, 0x76, // "env"
    0x0a,       // field name length: 10
    // "__get_time"
    0x5f, 0x5f, 0x67, 0x65, 0x74, 0x5f, 0x74, 0x69, 0x6d, 0x65,
    0x00,       // import kind: function
    0x00,       // type index 0

    // Function section (id=3)
    0x03,
    0x02,       // size
    0x01,       // 1 function
    0x00,       // type index 0

    // Export section (id=7): "getTime" -> func 1
    0x07,
    0x0b,       // size (11 bytes)
    0x01,       // 1 export
    0x07,       // name length: 7
    // "getTime"
    0x67, 0x65, 0x74, 0x54, 0x69, 0x6d, 0x65,
    0x00,       // export kind: function
    0x01,       // function index 1

    // Code section (id=10): getTime body
    0x0a,
    0x06,       // size (6 bytes)
    0x01,       // 1 function body
    0x04,       // body size (4 bytes)
    0x00,       // 0 local declarations
    0x10, 0x00, // call 0 (the imported __get_time)
    0x0b,       // end
  ]);
}

/**
 * WASM module that imports `env.__get_random() -> i32` and exports
 * `getRandom() -> i32` which calls the imported random function.
 */
export function randomImportWasmModule(): Uint8Array {
  return new Uint8Array([
    // Header
    0x00, 0x61, 0x73, 0x6d,
    0x01, 0x00, 0x00, 0x00,

    // Type section (id=1): () -> i32
    0x01,
    0x05,       // size
    0x01,       // 1 type
    0x60,       // func type
    0x00,       // 0 params
    0x01, 0x7f, // 1 result: i32

    // Import section (id=2): env.__get_random
    0x02,
    0x14,       // size (20 bytes)
    0x01,       // 1 import
    0x03,       // module name length: 3
    0x65, 0x6e, 0x76, // "env"
    0x0c,       // field name length: 12
    // "__get_random"
    0x5f, 0x5f, 0x67, 0x65, 0x74, 0x5f, 0x72, 0x61, 0x6e, 0x64,
    0x6f, 0x6d,
    0x00,       // import kind: function
    0x00,       // type index 0

    // Function section (id=3)
    0x03,
    0x02,       // size
    0x01,       // 1 function
    0x00,       // type index 0

    // Export section (id=7): "getRandom" -> func 1
    0x07,
    0x0d,       // size (13 bytes)
    0x01,       // 1 export
    0x09,       // name length: 9
    // "getRandom"
    0x67, 0x65, 0x74, 0x52, 0x61, 0x6e, 0x64, 0x6f, 0x6d,
    0x00,       // export kind: function
    0x01,       // function index 1

    // Code section (id=10): getRandom body
    0x0a,
    0x06,       // size (6 bytes)
    0x01,       // 1 function body
    0x04,       // body size (4 bytes)
    0x00,       // 0 local declarations
    0x10, 0x00, // call 0 (the imported __get_random)
    0x0b,       // end
  ]);
}

/**
 * WASM module that imports from a custom namespace `custom_ns.func`.
 * Used to test that non-"env" namespaces are rejected.
 */
export function customNamespaceWasmModule(): Uint8Array {
  return new Uint8Array([
    // Header
    0x00, 0x61, 0x73, 0x6d,
    0x01, 0x00, 0x00, 0x00,

    // Type section (id=1): () -> i32
    0x01,
    0x05,       // size
    0x01,       // 1 type
    0x60,       // func type
    0x00,       // 0 params
    0x01, 0x7f, // 1 result: i32

    // Import section (id=2): custom_ns.func
    0x02,
    0x12,       // size (18 bytes)
    0x01,       // 1 import
    0x09,       // module name length: 9
    // "custom_ns"
    0x63, 0x75, 0x73, 0x74, 0x6f, 0x6d, 0x5f, 0x6e, 0x73,
    0x04,       // field name length: 4
    // "func"
    0x66, 0x75, 0x6e, 0x63,
    0x00,       // import kind: function
    0x00,       // type index 0
  ]);
}
