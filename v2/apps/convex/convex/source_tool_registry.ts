import {
  createSourceToolRegistry,
  makeOpenApiToolProvider,
  makeToolProviderRegistry,
} from "@executor-v2/engine";
import {
  SourceStoreError,
  ToolArtifactStoreError,
  type SourceStore,
  type ToolArtifactStore,
} from "@executor-v2/persistence-ports";
import {
  SourceSchema,
  ToolArtifactSchema,
  type Source,
  type SourceId,
  type ToolArtifact,
  type WorkspaceId,
} from "@executor-v2/schema";
import { v } from "convex/values";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { api } from "./_generated/api";
import { query, type ActionCtx } from "./_generated/server";

const runtimeApi = api as any;

const decodeSource = Schema.decodeUnknownSync(SourceSchema);
const decodeToolArtifact = Schema.decodeUnknownSync(ToolArtifactSchema);

const stripConvexSystemFields = (
  value: Record<string, unknown>,
): Record<string, unknown> => {
  const { _id: _ignoredId, _creationTime: _ignoredCreationTime, ...rest } = value;
  return rest;
};

const unsupportedSourceStoreMutation = (
  operation: "upsert" | "removeById",
): SourceStoreError =>
  new SourceStoreError({
    operation,
    backend: "convex",
    location: "source-tool-registry",
    message: `SourceStore.${operation} is not supported in source tool registry runtime`,
    reason: "unsupported_operation",
    details: null,
  });

const unsupportedToolArtifactMutation = (): ToolArtifactStoreError =>
  new ToolArtifactStoreError({
    operation: "upsert",
    backend: "convex",
    location: "source-tool-registry",
    message: "ToolArtifactStore.upsert is not supported in source tool registry runtime",
    reason: "unsupported_operation",
    details: null,
  });

const sourceStoreQueryError = (
  operation: string,
  cause: unknown,
): SourceStoreError =>
  new SourceStoreError({
    operation,
    backend: "convex",
    location: "source-tool-registry",
    message: "SourceStore query failed",
    reason: "convex_query_error",
    details: String(cause),
  });

const toolArtifactStoreQueryError = (
  operation: string,
  cause: unknown,
): ToolArtifactStoreError =>
  new ToolArtifactStoreError({
    operation,
    backend: "convex",
    location: "source-tool-registry",
    message: "ToolArtifactStore query failed",
    reason: "convex_query_error",
    details: String(cause),
  });

export const listSourcesForWorkspace = query({
  args: {
    workspaceId: v.string(),
  },
  handler: async (ctx, args): Promise<Array<Source>> => {
    const rows = await ctx.db
      .query("sources")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();

    return rows.map((row) =>
      decodeSource(stripConvexSystemFields(row as unknown as Record<string, unknown>)),
    );
  },
});

export const getToolArtifactBySource = query({
  args: {
    workspaceId: v.string(),
    sourceId: v.string(),
  },
  handler: async (ctx, args): Promise<ToolArtifact | null> => {
    const rows = await ctx.db
      .query("toolArtifacts")
      .withIndex("by_sourceId", (q) => q.eq("sourceId", args.sourceId))
      .collect();

    const record = rows.find((row) => row.workspaceId === args.workspaceId) ?? null;
    if (!record) {
      return null;
    }

    return decodeToolArtifact(
      stripConvexSystemFields(record as unknown as Record<string, unknown>),
    );
  },
});

const createConvexSourceStore = (ctx: ActionCtx): SourceStore => ({
  getById: (workspaceId: WorkspaceId, sourceId: SourceId) =>
    Effect.tryPromise({
      try: () =>
        ctx
          .runQuery(runtimeApi.source_tool_registry.listSourcesForWorkspace, {
            workspaceId,
          })
          .then((sources: Array<Source>) =>
            Option.fromNullable(
              sources.find((source: Source) => source.id === sourceId) ?? null,
            ),
          ),
      catch: (cause) => sourceStoreQueryError("getById", cause),
    }),

  listByWorkspace: (workspaceId: WorkspaceId) =>
    Effect.tryPromise({
      try: () =>
        ctx.runQuery(runtimeApi.source_tool_registry.listSourcesForWorkspace, {
          workspaceId,
        }),
      catch: (cause) => sourceStoreQueryError("listByWorkspace", cause),
    }),

  upsert: () => Effect.fail(unsupportedSourceStoreMutation("upsert")),

  removeById: () => Effect.fail(unsupportedSourceStoreMutation("removeById")),
});

const createConvexToolArtifactStore = (ctx: ActionCtx): ToolArtifactStore => ({
  getBySource: (workspaceId: WorkspaceId, sourceId: SourceId) =>
    Effect.tryPromise({
      try: () =>
        ctx
          .runQuery(runtimeApi.source_tool_registry.getToolArtifactBySource, {
            workspaceId,
            sourceId,
          })
          .then((artifact) => Option.fromNullable(artifact)),
      catch: (cause) => toolArtifactStoreQueryError("getBySource", cause),
    }),

  upsert: () => Effect.fail(unsupportedToolArtifactMutation()),
});

export const createConvexSourceToolRegistry = (
  ctx: ActionCtx,
  workspaceId: string,
) => {
  const sourceStore = createConvexSourceStore(ctx);
  const toolArtifactStore = createConvexToolArtifactStore(ctx);
  const toolProviderRegistry = makeToolProviderRegistry([makeOpenApiToolProvider()]);

  return createSourceToolRegistry({
    workspaceId,
    sourceStore,
    toolArtifactStore,
    toolProviderRegistry,
  });
};
