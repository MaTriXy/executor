import {
  createRunExecutor,
  type ToolRegistry,
} from "@executor-v2/engine";
import type { ExecuteRunInput, ExecuteRunResult } from "@executor-v2/sdk";
import * as Effect from "effect/Effect";

import { createExecuteRuntimeRunInConvex } from "./runtime_execution_port";

export type ExecuteRunImplOptions = {
  toolRegistry?: ToolRegistry;
};

export const executeRunImpl = (
  input: ExecuteRunInput,
  options: ExecuteRunImplOptions = {},
): Effect.Effect<ExecuteRunResult> => {
  const runExecutor = createRunExecutor(
    createExecuteRuntimeRunInConvex({
      toolRegistry: options.toolRegistry,
    }),
  );

  return runExecutor.executeRun(input);
};
