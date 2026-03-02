import { Schema } from "effect";

import { TimestampMsSchema } from "../common";
import {
  CredentialProviderSchema,
  CredentialScopeTypeSchema,
  CredentialSecretProviderSchema,
} from "../enums";
import {
  AccountIdSchema,
  AuthConnectionIdSchema,
  OrganizationIdSchema,
  SourceAuthBindingIdSchema,
  WorkspaceIdSchema,
} from "../ids";

export const SourceCredentialBindingSchema = Schema.Struct({
  id: SourceAuthBindingIdSchema,
  credentialId: AuthConnectionIdSchema,
  organizationId: OrganizationIdSchema,
  workspaceId: Schema.NullOr(WorkspaceIdSchema),
  accountId: Schema.NullOr(AccountIdSchema),
  scopeType: CredentialScopeTypeSchema,
  sourceKey: Schema.String,
  provider: CredentialProviderSchema,
  secretProvider: Schema.optional(CredentialSecretProviderSchema),
  secretRef: Schema.String,
  additionalHeadersJson: Schema.NullOr(Schema.String),
  boundAuthFingerprint: Schema.NullOr(Schema.String),
  createdAt: TimestampMsSchema,
  updatedAt: TimestampMsSchema,
});

export type SourceCredentialBinding = typeof SourceCredentialBindingSchema.Type;
