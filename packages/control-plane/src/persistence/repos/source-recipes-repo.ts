import {
  type StoredSourceRecipeRecord,
  StoredSourceRecipeRecordSchema,
} from "#schema";
import * as Option from "effect/Option";
import { Schema } from "effect";
import { asc, eq } from "drizzle-orm";

import type { DrizzleClient } from "../client";
import type { DrizzleTables } from "../schema";
import { firstOption, withoutCreatedAt } from "./shared";

const decodeStoredSourceRecipeRecord = Schema.decodeUnknownSync(
  StoredSourceRecipeRecordSchema,
);

export const createSourceRecipesRepo = (
  client: DrizzleClient,
  tables: DrizzleTables,
) => ({
  listByUpdatedAt: () =>
    client.use("rows.source_recipes.list", async (db) => {
      const rows = await db
        .select()
        .from(tables.sourceRecipesTable)
        .orderBy(asc(tables.sourceRecipesTable.updatedAt), asc(tables.sourceRecipesTable.id));

      return rows.map((row) => decodeStoredSourceRecipeRecord(row));
    }),

  getById: (id: StoredSourceRecipeRecord["id"]) =>
    client.use("rows.source_recipes.get_by_id", async (db) => {
      const rows = await db
        .select()
        .from(tables.sourceRecipesTable)
        .where(eq(tables.sourceRecipesTable.id, id))
        .limit(1);

      const row = firstOption(rows);
      return Option.isSome(row)
        ? Option.some(decodeStoredSourceRecipeRecord(row.value))
        : Option.none<StoredSourceRecipeRecord>();
    }),

  upsert: (recipe: StoredSourceRecipeRecord) =>
    client.use("rows.source_recipes.upsert", async (db) => {
      await db
        .insert(tables.sourceRecipesTable)
        .values(recipe)
        .onConflictDoUpdate({
          target: [tables.sourceRecipesTable.id],
          set: {
            ...withoutCreatedAt(recipe),
          },
        });
    }),

  removeById: (id: StoredSourceRecipeRecord["id"]) =>
    client.use("rows.source_recipes.remove", async (db) => {
      const deleted = await db
        .delete(tables.sourceRecipesTable)
        .where(eq(tables.sourceRecipesTable.id, id))
        .returning();

      return deleted.length > 0;
    }),
});
