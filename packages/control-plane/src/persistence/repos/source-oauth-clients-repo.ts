import {
  type WorkspaceSourceOauthClient,
  WorkspaceSourceOauthClientSchema,
} from "#schema";
import * as Option from "effect/Option";
import { Schema } from "effect";
import { and, eq } from "drizzle-orm";

import type { DrizzleClient } from "../client";
import type { DrizzleTables } from "../schema";
import { firstOption, withoutCreatedAt } from "./shared";

const decodeWorkspaceSourceOauthClient = Schema.decodeUnknownSync(
  WorkspaceSourceOauthClientSchema,
);

export const createSourceOauthClientsRepo = (
  client: DrizzleClient,
  tables: DrizzleTables,
) => ({
  getByWorkspaceSourceAndProvider: (input: {
    workspaceId: WorkspaceSourceOauthClient["workspaceId"];
    sourceId: WorkspaceSourceOauthClient["sourceId"];
    providerKey: string;
  }) =>
    client.use("rows.source_oauth_clients.get_by_workspace_source_provider", async (db) => {
      const rows = await db
        .select()
        .from(tables.workspaceSourceOauthClientsTable)
        .where(
          and(
            eq(tables.workspaceSourceOauthClientsTable.workspaceId, input.workspaceId),
            eq(tables.workspaceSourceOauthClientsTable.sourceId, input.sourceId),
            eq(tables.workspaceSourceOauthClientsTable.providerKey, input.providerKey),
          ),
        )
        .limit(1);

      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeWorkspaceSourceOauthClient(row.value))
        : Option.none<WorkspaceSourceOauthClient>();
    }),

  upsert: (oauthClient: WorkspaceSourceOauthClient) =>
    client.use("rows.source_oauth_clients.upsert", async (db) => {
      await db
        .insert(tables.workspaceSourceOauthClientsTable)
        .values(oauthClient)
        .onConflictDoUpdate({
          target: [
            tables.workspaceSourceOauthClientsTable.workspaceId,
            tables.workspaceSourceOauthClientsTable.sourceId,
            tables.workspaceSourceOauthClientsTable.providerKey,
          ],
          set: {
            ...withoutCreatedAt(oauthClient),
          },
        });
    }),

  removeByWorkspaceAndSourceId: (input: {
    workspaceId: WorkspaceSourceOauthClient["workspaceId"];
    sourceId: WorkspaceSourceOauthClient["sourceId"];
  }) =>
    client.use("rows.source_oauth_clients.remove_by_workspace_source", async (db) => {
      const deleted = await db
        .delete(tables.workspaceSourceOauthClientsTable)
        .where(
          and(
            eq(tables.workspaceSourceOauthClientsTable.workspaceId, input.workspaceId),
            eq(tables.workspaceSourceOauthClientsTable.sourceId, input.sourceId),
          ),
        )
        .returning();

      return deleted.length;
    }),
});
