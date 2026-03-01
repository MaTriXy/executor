import {
  type SourceStore,
  type SourceStoreError,
  type ToolArtifactStore,
  type ToolArtifactStoreError,
} from "@executor-v2/persistence-ports";
import type { Source, WorkspaceId } from "@executor-v2/schema";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { openApiToolDescriptorsFromManifest } from "./openapi-provider";
import {
  RuntimeAdapterError,
  type RuntimeAdapterKind,
} from "./runtime-adapters";
import type {
  CanonicalToolDescriptor,
  ToolProviderError,
  ToolProviderRegistry,
  ToolProviderRegistryError,
} from "./tool-providers";
import type {
  ToolRegistry,
  ToolRegistryCatalogNamespacesInput,
  ToolRegistryCatalogNamespacesOutput,
  ToolRegistryCatalogToolsInput,
  ToolRegistryCatalogToolsOutput,
  ToolRegistryCallInput,
  ToolRegistryDiscoverInput,
  ToolRegistryDiscoverOutput,
  ToolRegistryToolSummary,
} from "./tool-registry";

const sourceToolRegistryRuntimeKind: RuntimeAdapterKind = "source-tool-registry";

type SourceToolRegistryOptions = {
  workspaceId: string;
  sourceStore: SourceStore;
  toolArtifactStore: ToolArtifactStore;
  toolProviderRegistry: ToolProviderRegistry;
};

type SourceToolEntry = {
  path: string;
  namespace: string;
  source: Source;
  descriptor: CanonicalToolDescriptor;
};

const toRuntimeAdapterError = (
  operation: string,
  message: string,
  details: string | null,
): RuntimeAdapterError =>
  new RuntimeAdapterError({
    operation,
    runtimeKind: sourceToolRegistryRuntimeKind,
    message,
    details,
  });

const sourceStoreErrorToRuntimeAdapterError = (
  operation: string,
  cause: SourceStoreError,
): RuntimeAdapterError =>
  toRuntimeAdapterError(
    operation,
    cause.message,
    cause.details ?? cause.reason ?? cause.location,
  );

const toolArtifactStoreErrorToRuntimeAdapterError = (
  operation: string,
  cause: ToolArtifactStoreError,
): RuntimeAdapterError =>
  toRuntimeAdapterError(
    operation,
    cause.message,
    cause.details ?? cause.reason ?? cause.location,
  );

const toolProviderErrorToRuntimeAdapterError = (
  operation: string,
  cause: ToolProviderError,
): RuntimeAdapterError =>
  toRuntimeAdapterError(operation, cause.message, cause.details ?? null);

const toolProviderRegistryErrorToRuntimeAdapterError = (
  operation: string,
  cause: ToolProviderRegistryError,
): RuntimeAdapterError =>
  toRuntimeAdapterError(operation, cause.message, null);

const normalizeNamespacePart = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized.length > 0 ? normalized : "source";
};

const sourceNamespace = (source: Source): string => {
  const sourceIdSuffix = source.id.slice(-6).toLowerCase();
  return `${normalizeNamespacePart(source.name)}_${sourceIdSuffix}`;
};

const sourceToolPath = (
  source: Source,
  descriptor: CanonicalToolDescriptor,
): string => `${sourceNamespace(source)}.${descriptor.toolId}`;

const scoreSummary = (summary: ToolRegistryToolSummary, query: string): number => {
  if (query.length === 0) {
    return 1;
  }

  const lowerQuery = query.toLowerCase();
  const lowerPath = summary.path.toLowerCase();
  const lowerSource = (summary.source ?? "").toLowerCase();
  const lowerDescription = (summary.description ?? "").toLowerCase();

  if (lowerPath === lowerQuery) {
    return 100;
  }

  if (lowerPath.startsWith(lowerQuery)) {
    return 80;
  }

  if (lowerPath.includes(lowerQuery)) {
    return 60;
  }

  if (lowerSource.includes(lowerQuery)) {
    return 40;
  }

  if (lowerDescription.includes(lowerQuery)) {
    return 30;
  }

  return 0;
};

const summaryFromEntry = (entry: SourceToolEntry): ToolRegistryToolSummary => ({
  path: entry.path,
  source: entry.source.name,
  approval: "auto",
  description: entry.descriptor.description ?? undefined,
});

const normalizeToolCallInput = (
  input: unknown,
): Record<string, unknown> => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return input as Record<string, unknown>;
};

const describeOutput = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const loadSourceEntries = (
  options: SourceToolRegistryOptions,
): Effect.Effect<ReadonlyArray<SourceToolEntry>, RuntimeAdapterError> =>
  Effect.gen(function* () {
    const workspaceSources = yield* options.sourceStore
      .listByWorkspace(options.workspaceId as WorkspaceId)
      .pipe(
        Effect.mapError((cause) =>
          sourceStoreErrorToRuntimeAdapterError("list_sources", cause),
        ),
      );

    const enabledSources = workspaceSources.filter((source) => source.enabled);

    const bySource = yield* Effect.forEach(enabledSources, (source) =>
      Effect.gen(function* () {
        if (source.kind !== "openapi") {
          return [] as Array<SourceToolEntry>;
        }

        const artifactOption = yield* options.toolArtifactStore
          .getBySource(source.workspaceId, source.id)
          .pipe(
            Effect.mapError((cause) =>
              toolArtifactStoreErrorToRuntimeAdapterError("get_source_artifact", cause),
            ),
          );

        if (Option.isNone(artifactOption)) {
          return [] as Array<SourceToolEntry>;
        }

        const artifact = artifactOption.value;
        const descriptors = yield* openApiToolDescriptorsFromManifest(
          source,
          artifact.manifestJson,
        ).pipe(
          Effect.mapError((cause) =>
            toolProviderErrorToRuntimeAdapterError(
              "decode_source_manifest",
              cause,
            ),
          ),
        );

        const namespace = sourceNamespace(source);

        return descriptors.map((descriptor) => ({
          path: sourceToolPath(source, descriptor),
          namespace,
          source,
          descriptor,
        }));
      }),
    );

    return bySource.flat();
  });

const discoverTools = (
  entries: ReadonlyArray<SourceToolEntry>,
  input: ToolRegistryDiscoverInput,
): ToolRegistryDiscoverOutput => {
  const limit = Math.max(1, Math.min(50, input.limit ?? 8));
  const query = (input.query ?? "").trim().toLowerCase();

  const ranked = entries
    .map((entry) => ({
      summary: summaryFromEntry(entry),
      score: scoreSummary(summaryFromEntry(entry), query),
    }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => item.summary);

  return {
    bestPath: ranked[0]?.path ?? null,
    results: ranked,
    total: ranked.length,
  };
};

const catalogNamespaces = (
  entries: ReadonlyArray<SourceToolEntry>,
  input: ToolRegistryCatalogNamespacesInput,
): ToolRegistryCatalogNamespacesOutput => {
  const limit = Math.max(1, Math.min(200, input.limit ?? 50));
  const grouped = new Map<string, Array<string>>();

  for (const entry of entries) {
    const paths = grouped.get(entry.namespace) ?? [];
    paths.push(entry.path);
    grouped.set(entry.namespace, paths);
  }

  const namespaces = [...grouped.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([namespace, paths]) => ({
      namespace,
      toolCount: paths.length,
      samplePaths: [...paths]
        .sort((left, right) => left.localeCompare(right))
        .slice(0, 3),
    }));

  return {
    namespaces: namespaces.slice(0, limit),
    total: namespaces.length,
  };
};

const catalogTools = (
  entries: ReadonlyArray<SourceToolEntry>,
  input: ToolRegistryCatalogToolsInput,
): ToolRegistryCatalogToolsOutput => {
  const limit = Math.max(1, Math.min(200, input.limit ?? 50));
  const query = (input.query ?? "").trim().toLowerCase();
  const namespace = (input.namespace ?? "").trim().toLowerCase();

  const filtered = entries
    .filter((entry) =>
      namespace.length === 0 ? true : entry.namespace.toLowerCase() === namespace,
    )
    .map(summaryFromEntry)
    .filter((summary) => scoreSummary(summary, query) > 0)
    .slice(0, limit);

  return {
    results: filtered,
    total: filtered.length,
  };
};

export const createSourceToolRegistry = (
  options: SourceToolRegistryOptions,
): ToolRegistry => ({
  callTool: (input: ToolRegistryCallInput) =>
    Effect.gen(function* () {
      const entries = yield* loadSourceEntries(options);
      const entry = entries.find((candidate) => candidate.path === input.toolPath);

      if (!entry) {
        return yield* toRuntimeAdapterError(
          "call_tool",
          `Unknown tool path: ${input.toolPath}`,
          "Use tools.discover({ query }) or tools.catalog.tools({ namespace }) to find available tool paths.",
        );
      }

      const invocation = yield* options.toolProviderRegistry
        .invoke({
          source: entry.source,
          tool: entry.descriptor,
          args: normalizeToolCallInput(input.input),
        })
        .pipe(
          Effect.mapError((cause) =>
            cause._tag === "ToolProviderError"
              ? toolProviderErrorToRuntimeAdapterError("invoke_tool", cause)
              : toolProviderRegistryErrorToRuntimeAdapterError("invoke_tool", cause),
          ),
        );

      if (invocation.isError) {
        return yield* toRuntimeAdapterError(
          "call_tool",
          `Tool call returned provider error: ${input.toolPath}`,
          describeOutput(invocation.output),
        );
      }

      return invocation.output;
    }),

  discover: (input: ToolRegistryDiscoverInput) =>
    loadSourceEntries(options).pipe(
      Effect.map((entries) => discoverTools(entries, input)),
    ),

  catalogNamespaces: (input: ToolRegistryCatalogNamespacesInput) =>
    loadSourceEntries(options).pipe(
      Effect.map((entries) => catalogNamespaces(entries, input)),
    ),

  catalogTools: (input: ToolRegistryCatalogToolsInput) =>
    loadSourceEntries(options).pipe(
      Effect.map((entries) => catalogTools(entries, input)),
    ),
});
