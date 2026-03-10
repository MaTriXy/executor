import { type Workspace, WorkspaceSchema } from "#schema";
import * as Option from "effect/Option";
import { Schema } from "effect";
import { and, asc, eq, inArray, or } from "drizzle-orm";

import type { DrizzleClient } from "../client";
import type { DrizzleTables } from "../schema";
import { firstOption, postgresSecretHandlesFromCredentials } from "./shared";

const decodeWorkspace = Schema.decodeUnknownSync(WorkspaceSchema);

export const createWorkspacesRepo = (
  client: DrizzleClient,
  tables: DrizzleTables,
) => ({
  listByOrganizationId: (organizationId: Workspace["organizationId"]) =>
    client.use("rows.workspaces.list_by_organization", async (db) => {
      const rows = await db
        .select()
        .from(tables.workspacesTable)
        .where(eq(tables.workspacesTable.organizationId, organizationId))
        .orderBy(
          asc(tables.workspacesTable.updatedAt),
          asc(tables.workspacesTable.id),
        );

      return rows.map((row) => decodeWorkspace(row));
    }),

  getById: (workspaceId: Workspace["id"]) =>
    client.use("rows.workspaces.get_by_id", async (db) => {
      const rows = await db
        .select()
        .from(tables.workspacesTable)
        .where(eq(tables.workspacesTable.id, workspaceId))
        .limit(1);

      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeWorkspace(row.value))
        : Option.none<Workspace>();
    }),

  insert: (workspace: Workspace) =>
    client.use("rows.workspaces.insert", async (db) => {
      await db.insert(tables.workspacesTable).values(workspace);
    }),

  update: (
    workspaceId: Workspace["id"],
    patch: Partial<Omit<Workspace, "id" | "createdAt">>,
  ) =>
    client.use("rows.workspaces.update", async (db) => {
      const rows = await db
        .update(tables.workspacesTable)
        .set(patch)
        .where(eq(tables.workspacesTable.id, workspaceId))
        .returning();

      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeWorkspace(row.value))
        : Option.none<Workspace>();
    }),

  removeById: (workspaceId: Workspace["id"]) =>
    client.useTx("rows.workspaces.remove", async (tx) => {
      const executionRows = await tx
        .select({ id: tables.executionsTable.id })
        .from(tables.executionsTable)
        .where(eq(tables.executionsTable.workspaceId, workspaceId));
      const sourceRows = await tx
        .select({
          sourceId: tables.sourcesTable.sourceId,
          recipeId: tables.sourcesTable.recipeId,
        })
        .from(tables.sourcesTable)
        .where(eq(tables.sourcesTable.workspaceId, workspaceId));
      const executionIds = executionRows.map((execution) => execution.id);
      const sourceIds = sourceRows.map((source) => source.sourceId);
      const recipeIds = sourceRows.map((source) => source.recipeId);
      const credentials = await tx
        .select({
          tokenProviderId: tables.credentialsTable.tokenProviderId,
          tokenHandle: tables.credentialsTable.tokenHandle,
          refreshTokenProviderId: tables.credentialsTable.refreshTokenProviderId,
          refreshTokenHandle: tables.credentialsTable.refreshTokenHandle,
        })
        .from(tables.credentialsTable)
        .where(eq(tables.credentialsTable.workspaceId, workspaceId));
      const recipeRevisionRows = recipeIds.length > 0
        ? await tx
          .select({ id: tables.sourceRecipeRevisionsTable.id })
          .from(tables.sourceRecipeRevisionsTable)
          .where(inArray(tables.sourceRecipeRevisionsTable.recipeId, recipeIds))
        : [];
      const recipeRevisionIds = recipeRevisionRows.map((revision) => revision.id);
      const toolArtifactPaths = sourceIds.length > 0
        ? (
          await tx
            .select({ path: tables.toolArtifactsTable.path })
            .from(tables.toolArtifactsTable)
            .where(
              and(
                eq(tables.toolArtifactsTable.workspaceId, workspaceId),
                inArray(tables.toolArtifactsTable.sourceId, sourceIds),
              ),
            )
        ).map((row) => row.path)
        : [];
      const postgresSecretHandles = postgresSecretHandlesFromCredentials(credentials);

      if (executionIds.length > 0) {
        await tx
          .delete(tables.executionInteractionsTable)
          .where(inArray(tables.executionInteractionsTable.executionId, executionIds));
      }

      if (toolArtifactPaths.length > 0) {
        await tx
          .delete(tables.toolArtifactParametersTable)
          .where(
            and(
              eq(tables.toolArtifactParametersTable.workspaceId, workspaceId),
              or(...toolArtifactPaths.map((path) => eq(tables.toolArtifactParametersTable.path, path))),
            ),
          );

        await tx
          .delete(tables.toolArtifactRequestBodyContentTypesTable)
          .where(
            and(
              eq(tables.toolArtifactRequestBodyContentTypesTable.workspaceId, workspaceId),
              or(
                ...toolArtifactPaths.map((path) =>
                  eq(tables.toolArtifactRequestBodyContentTypesTable.path, path)
                ),
              ),
            ),
          );

        await tx
          .delete(tables.toolArtifactRefHintKeysTable)
          .where(
            and(
              eq(tables.toolArtifactRefHintKeysTable.workspaceId, workspaceId),
              or(...toolArtifactPaths.map((path) => eq(tables.toolArtifactRefHintKeysTable.path, path))),
            ),
          );
      }

      await tx
        .delete(tables.executionsTable)
        .where(eq(tables.executionsTable.workspaceId, workspaceId));

      await tx
        .delete(tables.sourceAuthSessionsTable)
        .where(eq(tables.sourceAuthSessionsTable.workspaceId, workspaceId));

      await tx
        .delete(tables.workspaceSourceOauthClientsTable)
        .where(eq(tables.workspaceSourceOauthClientsTable.workspaceId, workspaceId));

      await tx
        .delete(tables.credentialsTable)
        .where(eq(tables.credentialsTable.workspaceId, workspaceId));

      await tx
        .delete(tables.toolArtifactsTable)
        .where(eq(tables.toolArtifactsTable.workspaceId, workspaceId));

      await tx
        .delete(tables.sourcesTable)
        .where(eq(tables.sourcesTable.workspaceId, workspaceId));

      if (recipeRevisionIds.length > 0) {
        await tx
          .delete(tables.sourceRecipeDocumentsTable)
          .where(inArray(tables.sourceRecipeDocumentsTable.recipeRevisionId, recipeRevisionIds));

        await tx
          .delete(tables.sourceRecipeOperationsTable)
          .where(inArray(tables.sourceRecipeOperationsTable.recipeRevisionId, recipeRevisionIds));
      }

      if (recipeIds.length > 0) {
        await tx
          .delete(tables.sourceRecipeRevisionsTable)
          .where(inArray(tables.sourceRecipeRevisionsTable.recipeId, recipeIds));

        await tx
          .delete(tables.sourceRecipesTable)
          .where(inArray(tables.sourceRecipesTable.id, recipeIds));
      }

      await tx
        .delete(tables.policiesTable)
        .where(
          and(
            eq(tables.policiesTable.scopeType, "workspace"),
            eq(tables.policiesTable.workspaceId, workspaceId),
          ),
        );

      await tx
        .delete(tables.localInstallationsTable)
        .where(eq(tables.localInstallationsTable.workspaceId, workspaceId));

      if (postgresSecretHandles.length > 0) {
        await tx
          .delete(tables.secretMaterialsTable)
          .where(inArray(tables.secretMaterialsTable.id, postgresSecretHandles));
      }

      const deleted = await tx
        .delete(tables.workspacesTable)
        .where(eq(tables.workspacesTable.id, workspaceId))
        .returning();

      return deleted.length > 0;
    }),
});
