ALTER TABLE "policies" ADD COLUMN "scope_type" text;--> statement-breakpoint
ALTER TABLE "policies" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "policies" AS "pol"
SET
  "scope_type" = 'workspace',
  "organization_id" = "ws"."organization_id"
FROM "workspaces" AS "ws"
WHERE "pol"."workspace_id" = "ws"."id";--> statement-breakpoint
ALTER TABLE "policies" ALTER COLUMN "scope_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "policies" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "policies" ALTER COLUMN "workspace_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_scope_type_check" CHECK ("scope_type" in ('organization', 'workspace'));--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_scope_consistency_check" CHECK (("scope_type" = 'organization' and "workspace_id" is null) or ("scope_type" = 'workspace' and "workspace_id" is not null));--> statement-breakpoint
DROP INDEX IF EXISTS "policies_workspace_priority_idx";--> statement-breakpoint
CREATE INDEX "policies_organization_priority_idx" ON "policies" ("organization_id","priority" DESC,"updated_at","id");--> statement-breakpoint
CREATE INDEX "policies_workspace_priority_idx" ON "policies" ("workspace_id","priority" DESC,"updated_at","id");--> statement-breakpoint
ALTER TABLE "execution_interactions" ADD COLUMN "purpose" text NOT NULL DEFAULT 'elicitation';