import { createSelectSchema } from "drizzle-orm/effect-schema";
import { Schema } from "effect";

import {
  sourceRecipeDocumentsTable,
  sourceRecipeOperationsTable,
  sourceRecipeRevisionsTable,
  sourceRecipesTable,
} from "../../persistence/schema";
import { TimestampMsSchema } from "../common";
import {
  SourceRecipeIdSchema,
  SourceRecipeRevisionIdSchema,
} from "../ids";

export const SourceRecipeKindSchema = Schema.Literal(
  "http_recipe",
  "graphql_recipe",
  "mcp_recipe",
  "internal_recipe",
);

export const SourceRecipeImporterKindSchema = Schema.Literal(
  "openapi",
  "google_discovery",
  "postman_collection",
  "snippet_bundle",
  "graphql_introspection",
  "mcp_manifest",
  "internal_manifest",
);

export const SourceRecipeVisibilitySchema = Schema.Literal(
  "private",
  "workspace",
  "organization",
  "public",
);

export const SourceRecipeDocumentKindSchema = Schema.Literal(
  "google_discovery",
  "openapi",
  "postman_collection",
  "postman_environment",
  "graphql_introspection",
  "mcp_manifest",
);

export const SourceRecipeTransportKindSchema = Schema.Literal(
  "http",
  "graphql",
  "mcp",
  "internal",
);

export const SourceRecipeOperationKindSchema = Schema.Literal(
  "read",
  "write",
  "delete",
  "unknown",
);

export const SourceRecipeOperationProviderKindSchema = Schema.Literal(
  "mcp",
  "openapi",
  "graphql",
  "internal",
);

const recipeRowSchemaOverrides = {
  id: SourceRecipeIdSchema,
  kind: SourceRecipeKindSchema,
  importerKind: SourceRecipeImporterKindSchema,
  visibility: SourceRecipeVisibilitySchema,
  latestRevisionId: SourceRecipeRevisionIdSchema,
  createdAt: TimestampMsSchema,
  updatedAt: TimestampMsSchema,
} as const;

const recipeRevisionRowSchemaOverrides = {
  id: SourceRecipeRevisionIdSchema,
  recipeId: SourceRecipeIdSchema,
  revisionNumber: Schema.Number,
  createdAt: TimestampMsSchema,
  updatedAt: TimestampMsSchema,
} as const;

const recipeDocumentRowSchemaOverrides = {
  recipeRevisionId: SourceRecipeRevisionIdSchema,
  documentKind: SourceRecipeDocumentKindSchema,
  fetchedAt: Schema.NullOr(TimestampMsSchema),
  createdAt: TimestampMsSchema,
  updatedAt: TimestampMsSchema,
} as const;

const recipeOperationRowSchemaOverrides = {
  recipeRevisionId: SourceRecipeRevisionIdSchema,
  transportKind: SourceRecipeTransportKindSchema,
  operationKind: SourceRecipeOperationKindSchema,
  providerKind: SourceRecipeOperationProviderKindSchema,
  openApiMethod: Schema.NullOr(
    Schema.Literal("get", "put", "post", "delete", "patch", "head", "options", "trace"),
  ),
  createdAt: TimestampMsSchema,
  updatedAt: TimestampMsSchema,
} as const;

export const StoredSourceRecipeRecordSchema = createSelectSchema(
  sourceRecipesTable,
  recipeRowSchemaOverrides,
);

export const StoredSourceRecipeRevisionRecordSchema = createSelectSchema(
  sourceRecipeRevisionsTable,
  recipeRevisionRowSchemaOverrides,
);

export const StoredSourceRecipeDocumentRecordSchema = createSelectSchema(
  sourceRecipeDocumentsTable,
  recipeDocumentRowSchemaOverrides,
);

export const StoredSourceRecipeOperationRecordSchema = createSelectSchema(
  sourceRecipeOperationsTable,
  recipeOperationRowSchemaOverrides,
);

export type SourceRecipeKind = typeof SourceRecipeKindSchema.Type;
export type SourceRecipeImporterKind = typeof SourceRecipeImporterKindSchema.Type;
export type SourceRecipeVisibility = typeof SourceRecipeVisibilitySchema.Type;
export type SourceRecipeDocumentKind = typeof SourceRecipeDocumentKindSchema.Type;
export type SourceRecipeTransportKind = typeof SourceRecipeTransportKindSchema.Type;
export type SourceRecipeOperationKind = typeof SourceRecipeOperationKindSchema.Type;
export type SourceRecipeOperationProviderKind =
  typeof SourceRecipeOperationProviderKindSchema.Type;
export type StoredSourceRecipeRecord = typeof StoredSourceRecipeRecordSchema.Type;
export type StoredSourceRecipeRevisionRecord = typeof StoredSourceRecipeRevisionRecordSchema.Type;
export type StoredSourceRecipeDocumentRecord = typeof StoredSourceRecipeDocumentRecordSchema.Type;
export type StoredSourceRecipeOperationRecord =
  typeof StoredSourceRecipeOperationRecordSchema.Type;
