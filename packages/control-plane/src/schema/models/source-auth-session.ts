import { createSelectSchema } from "drizzle-orm/effect-schema";
import { Schema } from "effect";

import { sourceAuthSessionsTable } from "../../persistence/schema";
import { TimestampMsSchema } from "../common";
import {
  AccountIdSchema,
  ExecutionIdSchema,
  ExecutionInteractionIdSchema,
  SourceAuthSessionIdSchema,
  SourceIdSchema,
  WorkspaceIdSchema,
} from "../ids";

export const SourceAuthSessionProviderKindSchema = Schema.Literal(
  "mcp_oauth",
  "oauth2_pkce",
);

export const SourceAuthSessionStatusSchema = Schema.Literal(
  "pending",
  "completed",
  "failed",
  "cancelled",
);

const sourceAuthSessionSchemaOverrides = {
  id: SourceAuthSessionIdSchema,
  workspaceId: WorkspaceIdSchema,
  sourceId: SourceIdSchema,
  actorAccountId: Schema.NullOr(AccountIdSchema),
  executionId: Schema.NullOr(ExecutionIdSchema),
  interactionId: Schema.NullOr(ExecutionInteractionIdSchema),
  providerKind: SourceAuthSessionProviderKindSchema,
  status: SourceAuthSessionStatusSchema,
  completedAt: Schema.NullOr(TimestampMsSchema),
  createdAt: TimestampMsSchema,
  updatedAt: TimestampMsSchema,
} as const;

export const SourceAuthSessionSchema = createSelectSchema(
  sourceAuthSessionsTable,
  sourceAuthSessionSchemaOverrides,
);

export type SourceAuthSessionProviderKind = typeof SourceAuthSessionProviderKindSchema.Type;
export type SourceAuthSessionStatus = typeof SourceAuthSessionStatusSchema.Type;
export type SourceAuthSession = typeof SourceAuthSessionSchema.Type;
