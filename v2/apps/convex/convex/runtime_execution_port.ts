import {
  RuntimeExecutionPortError,
  createRuntimeToolCallService,
  createStaticToolRegistry,
  type ExecuteRuntimeRun,
  type ExecuteRuntimeRunInput,
  type ToolRegistry,
  makeRuntimeAdapterRegistry,
  type RuntimeExecuteError,
} from "@executor-v2/engine";
import { makeLocalInProcessRuntimeAdapter } from "@executor-v2/runtime-local-inproc";
import * as Effect from "effect/Effect";

const convexRuntimeAdapter = makeLocalInProcessRuntimeAdapter();

const runtimeAdapters = makeRuntimeAdapterRegistry([convexRuntimeAdapter]);

export type ConvexRuntimeExecutionPortOptions = {
  toolRegistry?: ToolRegistry;
};

export const createExecuteRuntimeRunInConvex = (
  options: ConvexRuntimeExecutionPortOptions = {},
): ExecuteRuntimeRun => {
  const toolRegistry =
    options.toolRegistry ??
    createStaticToolRegistry({
      tools: {},
    });
  const toolCallService = createRuntimeToolCallService(toolRegistry);

  return (input: ExecuteRuntimeRunInput) =>
    Effect.gen(function* () {
      const runtimeAdapter = yield* runtimeAdapters.get(convexRuntimeAdapter.kind).pipe(
        Effect.mapError(
          (error) =>
            new RuntimeExecutionPortError({
              operation: "resolve_runtime_adapter",
              message: error.message,
              details: null,
            }),
        ),
      );

      const isAvailable = yield* runtimeAdapter.isAvailable();
      if (!isAvailable) {
        return yield* new RuntimeExecutionPortError({
          operation: "runtime_available",
          message: `Runtime '${convexRuntimeAdapter.kind}' is not available in this convex process.`,
          details: null,
        });
      }

      return yield* runtimeAdapter
        .execute({
          runId: input.runId,
          code: input.code,
          timeoutMs: input.timeoutMs,
          toolCallService,
        })
        .pipe(
          Effect.mapError(
            (error: RuntimeExecuteError) =>
              new RuntimeExecutionPortError({
                operation: "runtime_execute",
                message: error.message,
                details: error.details,
              }),
          ),
        );
    });
};

export const executeRuntimeRunInConvex = createExecuteRuntimeRunInConvex();
