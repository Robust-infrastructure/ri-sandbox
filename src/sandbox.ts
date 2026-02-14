/**
 * ri-sandbox — Main sandbox factory.
 *
 * Creates a `WasmSandbox` instance that manages WASM execution lifecycle.
 * Internal state is tracked per-instance via an internal Map.
 */

import type {
  SandboxConfig,
  SandboxInstance,
  ResourceMetrics,
  WasmSandbox,
  ExecutionResult,
} from './types.js';
import type { InternalSandboxState } from './internal-types.js';
import { createSandboxInstance } from './loader/instance-factory.js';
import { loadModule } from './loader/module-loader.js';
import { instantiate } from './loader/instantiator.js';
import { execute as executeAction } from './execution/executor.js';

/**
 * Create a new `WasmSandbox` — the main entry point for the library.
 *
 * Each sandbox factory maintains its own registry of instances.
 * All methods look up internal state by instance ID.
 */
export function createWasmSandbox(): WasmSandbox {
  const instances = new Map<string, InternalSandboxState>();

  function getState(instance: SandboxInstance): InternalSandboxState | undefined {
    return instances.get(instance.id);
  }

  function requireState(instance: SandboxInstance): InternalSandboxState {
    const state = getState(instance);
    if (state === undefined) {
      throw new Error(`Unknown sandbox instance: ${instance.id}`);
    }
    return state;
  }

  const sandbox: WasmSandbox = {
    create(config: SandboxConfig): SandboxInstance {
      const { instance, state } = createSandboxInstance(config);
      instances.set(state.id, state);
      return instance;
    },

    async load(instance: SandboxInstance, module: Uint8Array): Promise<void> {
      const state = requireState(instance);

      if (state.status === 'destroyed') {
        throw new Error(
          `Cannot load module into destroyed instance: ${state.id}`,
        );
      }

      const loadResult = await loadModule(module);
      if (!loadResult.ok) {
        throw new Error(
          `Failed to load WASM module: ${loadResult.error.code === 'INVALID_MODULE' ? loadResult.error.reason : 'Unknown error'}`,
        );
      }

      const instantiateResult = await instantiate(state, loadResult.value);
      if (!instantiateResult.ok) {
        const err = instantiateResult.error;
        throw new Error(
          `Failed to instantiate WASM module: ${err.code === 'INVALID_MODULE' ? err.reason : err.code === 'HOST_FUNCTION_ERROR' ? err.message : err.code}`,
        );
      }
    },

    execute(instance: SandboxInstance, action: string, payload: unknown): ExecutionResult {
      const state = requireState(instance);
      return executeAction(state, action, payload);
    },

    destroy(instance: SandboxInstance): void {
      const state = requireState(instance);

      if (state.status === 'destroyed') {
        return;
      }

      // Release WASM resources
      state.wasmInstance = null;
      state.wasmModule = null;
      state.wasmMemory = null;
      state.status = 'destroyed';
    },

    snapshot(_instance: SandboxInstance): Uint8Array {
      // Stub — implemented in M7
      throw new Error('snapshot() not yet implemented — see M7');
    },

    restore(_instance: SandboxInstance, _snapshot: Uint8Array): void {
      // Stub — implemented in M7
      throw new Error('restore() not yet implemented — see M7');
    },

    getMetrics(instance: SandboxInstance): ResourceMetrics {
      const state = requireState(instance);

      if (state.status === 'destroyed') {
        throw new Error(
          `Cannot get metrics for destroyed instance: ${state.id}`,
        );
      }

      // Update memory metrics from live memory
      if (state.wasmMemory !== null) {
        state.metrics = {
          ...state.metrics,
          memoryUsedBytes: state.wasmMemory.buffer.byteLength,
        };
      }

      return { ...state.metrics };
    },
  };

  return sandbox;
}
