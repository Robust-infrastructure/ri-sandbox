# Snapshot Format

> ri-sandbox v1.0.0 — Binary specification for execution state snapshots

## Overview

The WSNP format is a compact binary representation of a sandbox instance's complete execution state. It captures everything needed to restore the instance to an identical point: WASM linear memory, PRNG state, gas counter, and timestamp.

Use cases:

- **Suspend/resume**: Serialize a running instance, free resources, restore later
- **Undo/rollback**: Capture state before an action, restore if the user rejects the result
- **Fork**: Snapshot one instance, restore into another for parallel execution paths
- **Testing**: Compare snapshot bytes to verify determinism

## Byte Layout

```
Offset    Size    Encoding        Content
──────    ─────   ──────────      ────────────────────────────────
0         4       ASCII           Magic bytes: "WSNP" (0x57 0x53 0x4E 0x50)
4         1       uint8           Format version: 0x01
5         4       uint32 LE       Memory section length (N bytes)
9         N       raw bytes       WASM linear memory content
9+N       4       uint32 LE       State section length (M bytes)
13+N      M       UTF-8 JSON      State JSON
```

Total size: `13 + N + M` bytes, where N is the WASM memory size and M is the state JSON size.

## Header (5 bytes)

| Offset | Size | Value | Purpose |
|--------|------|-------|---------|
| 0 | 4 | `0x57 0x53 0x4E 0x50` | Magic bytes — identifies the format as WSNP |
| 4 | 1 | `0x01` | Format version — allows future format evolution |

The magic bytes spell "WSNP" in ASCII (WASM SNaPshot).

## Memory Section

| Offset | Size | Encoding | Content |
|--------|------|----------|---------|
| 5 | 4 | uint32 LE | Length of memory data in bytes |
| 9 | N | raw | Complete WASM linear memory buffer |

The memory section captures the entire `WebAssembly.Memory.buffer` as a byte-exact copy. The length field determines where the memory section ends and the state section begins.

Typical sizes:

- Minimum: 65,536 bytes (1 WASM page)
- Default config: up to 16,777,216 bytes (16 MB, 256 pages)

## State Section

| Offset | Size | Encoding | Content |
|--------|------|----------|---------|
| 9+N | 4 | uint32 LE | Length of state JSON in bytes |
| 13+N | M | UTF-8 | JSON-encoded execution state |

### State JSON Schema

```json
{
  "prngState": {
    "current": 1234567890
  },
  "timestamp": 1700000000000,
  "gasUsed": 42
}
```

| Field | Type | Description |
|-------|------|-------------|
| `prngState.current` | `number` | Mulberry32 internal state (32-bit unsigned integer) |
| `timestamp` | `number` | The `eventTimestamp` from config (ms since epoch) |
| `gasUsed` | `number` | Gas consumed up to the snapshot point |

The state JSON is compact — typically 60–100 bytes.

## Validation Rules

On `restore()`, the deserializer performs these checks in order:

| # | Check | Error on Failure |
|---|-------|------------------|
| 1 | `data.byteLength >= 5` | "Snapshot too small — missing header" |
| 2 | Bytes 0–3 match `WSNP` magic | "Invalid snapshot — bad magic bytes" |
| 3 | Byte 4 equals `0x01` | "Unsupported snapshot version: N" |
| 4 | Memory length + data available | "Snapshot truncated — memory section incomplete" |
| 5 | State length + data available | "Snapshot truncated — state section incomplete" |
| 6 | `JSON.parse(stateJson)` succeeds | "Invalid snapshot — corrupted state JSON" |
| 7 | Memory size matches instance | "Snapshot memory size (X) does not match instance memory (Y)" |

All validation errors return `SNAPSHOT_ERROR` with a descriptive `reason` string.

## Status Requirements

### For `snapshot()`

| Status | Allowed | Reason |
|--------|---------|--------|
| `created` | No | No WASM module loaded — nothing to snapshot |
| `loaded` | Yes | Stable state — ready for capture |
| `running` | No | Execution in progress — state is in flux |
| `suspended` | Yes | Stable state — ready for capture |
| `destroyed` | No | Resources released — nothing to capture |

### For `restore()`

| Status | Allowed | Reason |
|--------|---------|--------|
| `created` | No | No WASM module loaded — nowhere to restore into |
| `loaded` | Yes | Has memory to overwrite |
| `running` | No | Execution in progress — unsafe to overwrite |
| `suspended` | Yes | Has memory to overwrite |
| `destroyed` | No | Resources released — nowhere to restore into |

## Round-Trip Guarantee

The snapshot format supports exact round-trips:

```
snapshot(instance) → bytes₁
restore(instance, bytes₁)
execute(instance, action, payload) → result₂
snapshot(instance) → bytes₃

// Original execution:
execute(instance_original, action, payload) → result₁
snapshot(instance_original) → bytes₂

// Guarantee: result₁ === result₂ AND bytes₂ === bytes₃
```

This is verified by integration tests with snapshot-roundtrip validation.

## Version History

| Version | Status | Changes |
|---------|--------|---------|
| `0x01` | Current | Initial format — memory + PRNG state + timestamp + gas |

Future versions may add:

- Global variable state capture
- Table state capture
- Multiple memory support
- Compression for large memory snapshots

The version byte ensures forward compatibility — old snapshots can be detected and rejected with a clear error message.

---

*Last verified: 14 February 2026 against source code.*
