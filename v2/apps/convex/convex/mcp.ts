import { handleMcpHttpRequest } from "@executor-v2/mcp-gateway";
import { createExecutorRunClient } from "@executor-v2/sdk";
import * as Effect from "effect/Effect";

import { httpAction } from "./_generated/server";
import { executeRunImpl } from "./executor";
import { createConvexSourceToolRegistry } from "./source_tool_registry";

const readConfiguredWorkspaceId = (value: string | undefined): string => {
  const normalized = value?.trim();
  return normalized && normalized.length > 0 ? normalized : "ws_local";
};

const workspaceId = readConfiguredWorkspaceId(process.env.CONVEX_WORKSPACE_ID);

export const mcpHandler = httpAction(async (ctx, request) => {
  const toolRegistry = createConvexSourceToolRegistry(ctx, workspaceId);

  const runClient = createExecutorRunClient((input) =>
    Effect.runPromise(
      executeRunImpl(input, {
        toolRegistry,
      }),
    ),
  );

  return handleMcpHttpRequest(request, {
    serverName: "executor-v2-convex",
    serverVersion: "0.0.0",
    runClient,
  });
});
