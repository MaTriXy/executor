import { createHash } from "node:crypto";

import type {
  CreateSourcePayload,
  UpdateSourcePayload,
} from "#api";
import type {
  AccountId,
  Credential,
  Source,
  SourceAuth,
  SourceRecipeId,
  SourceRecipeImporterKind,
  SourceRecipeKind,
  SourceRecipeRevisionId,
  StoredSourceRecord,
  StoredSourceRecipeRecord,
  StoredSourceRecipeRevisionRecord,
  StringMap,
  WorkspaceId,
} from "#schema";
import {
  CredentialIdSchema,
  SourceRecipeIdSchema,
  SourceRecipeRevisionIdSchema,
} from "#schema";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const decodeStringMap = Schema.decodeUnknown(
  Schema.NullOr(
    Schema.Record({
      key: Schema.String,
      value: Schema.String,
    }),
  ),
);

const trimOrNull = (value: string | null | undefined): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const serializeStringMap = (value: StringMap | null): string | null =>
  value === null ? null : JSON.stringify(value);

const parseStringMapJson = (
  fieldName: string,
  value: string | null,
): Effect.Effect<StringMap | null, Error, never> =>
  value === null
    ? Effect.succeed(null)
    : Effect.try({
        try: () => JSON.parse(value),
        catch: (cause) =>
          cause instanceof Error
            ? new Error(`Invalid ${fieldName}: ${cause.message}`)
            : new Error(`Invalid ${fieldName}: ${String(cause)}`),
      }).pipe(
        Effect.flatMap((parsed) => decodeStringMap(parsed)),
        Effect.mapError((cause) =>
          cause instanceof Error
            ? new Error(`Invalid ${fieldName}: ${cause.message}`)
            : new Error(`Invalid ${fieldName}: ${String(cause)}`),
        ),
      );

type SourceRecipeSourceConfig =
  | {
      kind: "mcp";
      endpoint: string;
      transport: Source["transport"];
      queryParams: Source["queryParams"];
      headers: Source["headers"];
    }
  | {
      kind: "openapi";
      endpoint: string;
      specUrl: string;
      defaultHeaders: Source["defaultHeaders"];
    }
  | {
      kind: "graphql";
      endpoint: string;
      defaultHeaders: Source["defaultHeaders"];
    }
  | {
      kind: "internal";
      endpoint: string;
    };

const sourceConfigFromSource = (source: Source): SourceRecipeSourceConfig => {
  if (source.kind === "mcp") {
    return {
      kind: "mcp",
      endpoint: source.endpoint,
      transport: source.transport,
      queryParams: source.queryParams,
      headers: source.headers,
    };
  }

  if (source.kind === "openapi") {
    return {
      kind: "openapi",
      endpoint: source.endpoint,
      specUrl: source.specUrl ?? source.endpoint,
      defaultHeaders: source.defaultHeaders,
    };
  }

  if (source.kind === "graphql") {
    return {
      kind: "graphql",
      endpoint: source.endpoint,
      defaultHeaders: source.defaultHeaders,
    };
  }

  return {
    kind: "internal",
    endpoint: source.endpoint,
  };
};

const sourceRecipeKindFromSource = (source: Source): SourceRecipeKind => {
  if (source.kind === "mcp") {
    return "mcp_recipe";
  }

  if (source.kind === "graphql") {
    return "graphql_recipe";
  }

  if (source.kind === "openapi") {
    return "http_recipe";
  }

  return "internal_recipe";
};

const sourceRecipeImporterKindFromSource = (source: Source): SourceRecipeImporterKind => {
  if (source.kind === "mcp") {
    return "mcp_manifest";
  }

  if (source.kind === "graphql") {
    return "graphql_introspection";
  }

  if (source.kind === "openapi") {
    return "openapi";
  }

  return "internal_manifest";
};

const sourceRecipeProviderKeyFromSource = (source: Source): string => {
  if (source.kind === "mcp") {
    return "generic_mcp";
  }

  if (source.kind === "graphql") {
    return "generic_graphql";
  }

  if (source.kind === "openapi") {
    return "generic_http";
  }

  return "generic_internal";
};

const stableHash = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, 24);

const sourceRecipeSignature = (source: Source): string =>
  JSON.stringify({
    recipeKind: sourceRecipeKindFromSource(source),
    importerKind: sourceRecipeImporterKindFromSource(source),
    providerKey: sourceRecipeProviderKeyFromSource(source),
    sourceConfig: sourceConfigFromSource(source),
  });

export const sourceConfigSignature = (source: Source): string =>
  JSON.stringify(sourceConfigFromSource(source));

export const stableSourceRecipeId = (source: Source): SourceRecipeId =>
  SourceRecipeIdSchema.make(`src_recipe_${stableHash(sourceRecipeSignature(source))}`);

export const stableSourceRecipeRevisionId = (
  source: Source,
): SourceRecipeRevisionId =>
  SourceRecipeRevisionIdSchema.make(`src_recipe_rev_${stableHash(sourceConfigSignature(source))}`);

const normalizeAuth = (
  auth: SourceAuth | undefined,
): Effect.Effect<SourceAuth, Error, never> =>
  Effect.gen(function* () {
    if (auth === undefined || auth.kind === "none") {
      return { kind: "none" } satisfies SourceAuth;
    }

    const headerName = trimOrNull(auth.headerName) ?? "Authorization";
    const prefix = auth.prefix ?? "Bearer ";

    if (auth.kind === "bearer") {
      const providerId = trimOrNull(auth.token.providerId);
      const handle = trimOrNull(auth.token.handle);
      if (providerId === null || handle === null) {
        return yield* Effect.fail(new Error("Bearer auth requires a token secret ref"));
      }

      return {
        kind: "bearer",
        headerName,
        prefix,
        token: {
          providerId,
          handle,
        },
      } satisfies SourceAuth;
    }

    const accessProviderId = trimOrNull(auth.accessToken.providerId);
    const accessHandle = trimOrNull(auth.accessToken.handle);
    if (accessProviderId === null || accessHandle === null) {
      return yield* Effect.fail(new Error("OAuth2 auth requires an access token secret ref"));
    }

    let refreshToken: { providerId: string; handle: string } | null = null;
    if (auth.refreshToken !== null) {
      const refreshProviderId = trimOrNull(auth.refreshToken.providerId);
      const refreshHandle = trimOrNull(auth.refreshToken.handle);
      if (refreshProviderId === null || refreshHandle === null) {
        return yield* Effect.fail(
          new Error("OAuth2 refresh token ref must include providerId and handle"),
        );
      }

      refreshToken = {
        providerId: refreshProviderId,
        handle: refreshHandle,
      };
    }

    return {
      kind: "oauth2",
      headerName,
      prefix,
      accessToken: {
        providerId: accessProviderId,
        handle: accessHandle,
      },
      refreshToken,
    } satisfies SourceAuth;
  });

const validateSourceByKind = (source: Source): Effect.Effect<Source, Error, never> =>
  Effect.gen(function* () {
    if (source.kind === "mcp") {
      if (source.specUrl !== null) {
        return yield* Effect.fail(new Error("MCP sources cannot define specUrl"));
      }
      return source;
    }

    if (source.kind === "openapi") {
      if (trimOrNull(source.specUrl) === null) {
        return yield* Effect.fail(new Error("OpenAPI sources require specUrl"));
      }

      if (source.transport !== null || source.queryParams !== null || source.headers !== null) {
        return yield* Effect.fail(
          new Error("OpenAPI sources cannot define MCP transport settings"),
        );
      }

      return source;
    }

    if (source.kind === "graphql") {
      if (source.transport !== null || source.queryParams !== null || source.headers !== null) {
        return yield* Effect.fail(
          new Error("GraphQL sources cannot define MCP transport settings"),
        );
      }

      if (source.specUrl !== null) {
        return yield* Effect.fail(new Error("GraphQL sources cannot define specUrl"));
      }

      return source;
    }

    if (source.transport !== null || source.queryParams !== null || source.headers !== null) {
      return yield* Effect.fail(
        new Error(`${source.kind} sources cannot define MCP transport settings`),
      );
    }

    if (source.specUrl !== null || source.defaultHeaders !== null) {
      return yield* Effect.fail(
        new Error(`${source.kind} sources cannot define OpenAPI settings`),
      );
    }

    return source;
  });

export const createSourceFromPayload = (input: {
  workspaceId: WorkspaceId;
  sourceId: Source["id"];
  payload: CreateSourcePayload;
  now: number;
}): Effect.Effect<Source, Error, never> =>
  Effect.gen(function* () {
    const auth = yield* normalizeAuth(input.payload.auth);

    return yield* validateSourceByKind({
      id: input.sourceId,
      workspaceId: input.workspaceId,
      name: input.payload.name.trim(),
      kind: input.payload.kind,
      endpoint: input.payload.endpoint.trim(),
      status: input.payload.status ?? "draft",
      enabled: input.payload.enabled ?? true,
      namespace: trimOrNull(input.payload.namespace),
      transport: input.payload.transport ?? null,
      queryParams: input.payload.queryParams ?? null,
      headers: input.payload.headers ?? null,
      specUrl: trimOrNull(input.payload.specUrl),
      defaultHeaders: input.payload.defaultHeaders ?? null,
      auth,
      sourceHash: trimOrNull(input.payload.sourceHash),
      lastError: trimOrNull(input.payload.lastError),
      createdAt: input.now,
      updatedAt: input.now,
    });
  });

export const updateSourceFromPayload = (input: {
  source: Source;
  payload: UpdateSourcePayload;
  now: number;
}): Effect.Effect<Source, Error, never> =>
  Effect.gen(function* () {
    const nextAuth = input.payload.auth === undefined
      ? input.source.auth
      : yield* normalizeAuth(input.payload.auth);

    return yield* validateSourceByKind({
      ...input.source,
      name: input.payload.name !== undefined ? input.payload.name.trim() : input.source.name,
      kind: input.payload.kind ?? input.source.kind,
      endpoint:
        input.payload.endpoint !== undefined
          ? input.payload.endpoint.trim()
          : input.source.endpoint,
      status: input.payload.status ?? input.source.status,
      enabled: input.payload.enabled ?? input.source.enabled,
      namespace: input.payload.namespace !== undefined
        ? trimOrNull(input.payload.namespace)
        : input.source.namespace,
      transport: input.payload.transport !== undefined
        ? input.payload.transport
        : input.source.transport,
      queryParams: input.payload.queryParams !== undefined
        ? input.payload.queryParams
        : input.source.queryParams,
      headers: input.payload.headers !== undefined
        ? input.payload.headers
        : input.source.headers,
      specUrl: input.payload.specUrl !== undefined
        ? trimOrNull(input.payload.specUrl)
        : input.source.specUrl,
      defaultHeaders: input.payload.defaultHeaders !== undefined
        ? input.payload.defaultHeaders
        : input.source.defaultHeaders,
      auth: nextAuth,
      sourceHash: input.payload.sourceHash !== undefined
        ? trimOrNull(input.payload.sourceHash)
        : input.source.sourceHash,
      lastError: input.payload.lastError !== undefined
        ? trimOrNull(input.payload.lastError)
        : input.source.lastError,
      updatedAt: input.now,
    });
  });

export const createSourceRecipeRecord = (input: {
  source: Source;
  recipeId?: SourceRecipeId | null;
  latestRevisionId: SourceRecipeRevisionId;
}): StoredSourceRecipeRecord => ({
  id: input.recipeId ?? stableSourceRecipeId(input.source),
  kind: sourceRecipeKindFromSource(input.source),
  importerKind: sourceRecipeImporterKindFromSource(input.source),
  providerKey: sourceRecipeProviderKeyFromSource(input.source),
  name: input.source.name,
  summary: null,
  visibility: "workspace",
  latestRevisionId: input.latestRevisionId,
  createdAt: input.source.createdAt,
  updatedAt: input.source.updatedAt,
});

export const createSourceRecipeRevisionRecord = (input: {
  source: Source;
  recipeId: SourceRecipeId;
  recipeRevisionId?: SourceRecipeRevisionId | null;
  revisionNumber: number;
  manifestJson?: string | null;
  manifestHash?: string | null;
}): StoredSourceRecipeRevisionRecord => ({
  id:
    input.recipeRevisionId
    ?? stableSourceRecipeRevisionId(input.source),
  recipeId: input.recipeId,
  revisionNumber: input.revisionNumber,
  sourceConfigJson: sourceConfigSignature(input.source),
  manifestJson: input.manifestJson ?? null,
  manifestHash: input.manifestHash ?? null,
  createdAt: input.source.createdAt,
  updatedAt: input.source.updatedAt,
});

export const splitSourceForStorage = (input: {
  source: Source;
  recipeId: SourceRecipeId;
  recipeRevisionId: SourceRecipeRevisionId;
  actorAccountId?: AccountId | null;
  existingCredentialId?: Credential["id"] | null;
}): {
  sourceRecord: StoredSourceRecord;
  credential: Credential | null;
} => {
  const sourceRecord: StoredSourceRecord = {
    id: input.source.id,
    workspaceId: input.source.workspaceId,
    recipeId: input.recipeId,
    recipeRevisionId: input.recipeRevisionId,
    name: input.source.name,
    kind: input.source.kind,
    endpoint: input.source.endpoint,
    status: input.source.status,
    enabled: input.source.enabled,
    namespace: input.source.namespace,
    bindingConfigJson: null,
    transport: input.source.transport,
    queryParamsJson: serializeStringMap(input.source.queryParams),
    headersJson: serializeStringMap(input.source.headers),
    specUrl: input.source.specUrl,
    defaultHeadersJson: serializeStringMap(input.source.defaultHeaders),
    sourceHash: input.source.sourceHash,
    sourceDocumentText: null,
    lastError: input.source.lastError,
    createdAt: input.source.createdAt,
    updatedAt: input.source.updatedAt,
  };

  if (input.source.auth.kind === "none") {
    return {
      sourceRecord,
      credential: null,
    };
  }

  const credentialId = input.existingCredentialId
    ?? CredentialIdSchema.make(`cred_${crypto.randomUUID()}`);

  const credential: Credential = {
    id: credentialId,
    workspaceId: input.source.workspaceId,
    sourceId: input.source.id,
    actorAccountId: input.actorAccountId ?? null,
    authKind: input.source.auth.kind,
    authHeaderName: input.source.auth.headerName,
    authPrefix: input.source.auth.prefix,
    tokenProviderId:
      input.source.auth.kind === "bearer"
        ? input.source.auth.token.providerId
        : input.source.auth.accessToken.providerId,
    tokenHandle:
      input.source.auth.kind === "bearer"
        ? input.source.auth.token.handle
        : input.source.auth.accessToken.handle,
    refreshTokenProviderId:
      input.source.auth.kind === "oauth2" && input.source.auth.refreshToken !== null
        ? input.source.auth.refreshToken.providerId
        : null,
    refreshTokenHandle:
      input.source.auth.kind === "oauth2" && input.source.auth.refreshToken !== null
        ? input.source.auth.refreshToken.handle
        : null,
    createdAt: input.source.createdAt,
    updatedAt: input.source.updatedAt,
  };

  return {
    sourceRecord,
    credential,
  };
};

export const projectSourceFromStorage = (input: {
  sourceRecord: StoredSourceRecord;
  credential: Credential | null;
}): Effect.Effect<Source, Error, never> =>
  Effect.gen(function* () {
    const queryParams = yield* parseStringMapJson(
      `queryParamsJson for ${input.sourceRecord.id}`,
      input.sourceRecord.queryParamsJson,
    );
    const headers = yield* parseStringMapJson(
      `headersJson for ${input.sourceRecord.id}`,
      input.sourceRecord.headersJson,
    );
    const defaultHeaders = yield* parseStringMapJson(
      `defaultHeadersJson for ${input.sourceRecord.id}`,
      input.sourceRecord.defaultHeadersJson,
    );

    let auth: SourceAuth = { kind: "none" };
    if (input.credential !== null) {
      if (input.credential.authKind === "bearer") {
        auth = {
          kind: "bearer",
          headerName: input.credential.authHeaderName,
          prefix: input.credential.authPrefix,
          token: {
            providerId: input.credential.tokenProviderId,
            handle: input.credential.tokenHandle,
          },
        };
      } else {
        auth = {
          kind: "oauth2",
          headerName: input.credential.authHeaderName,
          prefix: input.credential.authPrefix,
          accessToken: {
            providerId: input.credential.tokenProviderId,
            handle: input.credential.tokenHandle,
          },
          refreshToken:
            input.credential.refreshTokenProviderId !== null
            && input.credential.refreshTokenHandle !== null
              ? {
                  providerId: input.credential.refreshTokenProviderId,
                  handle: input.credential.refreshTokenHandle,
                }
              : null,
        };
      }
    }

    return {
      id: input.sourceRecord.id,
      workspaceId: input.sourceRecord.workspaceId,
      name: input.sourceRecord.name,
      kind: input.sourceRecord.kind,
      endpoint: input.sourceRecord.endpoint,
      status: input.sourceRecord.status,
      enabled: input.sourceRecord.enabled,
      namespace: input.sourceRecord.namespace,
      transport: input.sourceRecord.transport,
      queryParams,
      headers,
      specUrl: input.sourceRecord.specUrl,
      defaultHeaders,
      auth,
      sourceHash: input.sourceRecord.sourceHash,
      lastError: input.sourceRecord.lastError,
      createdAt: input.sourceRecord.createdAt,
      updatedAt: input.sourceRecord.updatedAt,
    } satisfies Source;
  }).pipe(
    Effect.mapError((cause) =>
      cause instanceof Error ? cause : new Error(String(cause)),
    ),
  );

export const projectSourcesFromStorage = (input: {
  sourceRecords: ReadonlyArray<StoredSourceRecord>;
  credentials: ReadonlyArray<Credential>;
}): Effect.Effect<ReadonlyArray<Source>, Error, never> => {
  const credentialsBySourceId = new Map<string, Credential>();

  for (const credential of input.credentials) {
    const existing = credentialsBySourceId.get(credential.sourceId);
    if (!existing || (existing.actorAccountId === null && credential.actorAccountId !== null)) {
      credentialsBySourceId.set(credential.sourceId, credential);
    }
  }

  return Effect.forEach(input.sourceRecords, (sourceRecord) =>
    projectSourceFromStorage({
      sourceRecord,
      credential: credentialsBySourceId.get(sourceRecord.id) ?? null,
    }));
};
