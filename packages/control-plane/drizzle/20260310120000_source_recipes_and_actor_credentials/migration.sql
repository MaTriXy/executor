ALTER TABLE "sources" ADD COLUMN "recipe_id" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "recipe_revision_id" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "binding_config_json" text;--> statement-breakpoint

CREATE TABLE "source_recipes" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"importer_kind" text NOT NULL,
	"provider_key" text NOT NULL,
	"name" text NOT NULL,
	"summary" text,
	"visibility" text NOT NULL,
	"latest_revision_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "source_recipes_kind_check" CHECK ("kind" in ('http_recipe', 'graphql_recipe', 'mcp_recipe', 'internal_recipe')),
	CONSTRAINT "source_recipes_importer_kind_check" CHECK ("importer_kind" in (
		'openapi',
		'google_discovery',
		'postman_collection',
		'snippet_bundle',
		'graphql_introspection',
		'mcp_manifest',
		'internal_manifest'
	)),
	CONSTRAINT "source_recipes_visibility_check" CHECK ("visibility" in ('private', 'workspace', 'organization', 'public'))
);--> statement-breakpoint

CREATE TABLE "source_recipe_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"recipe_id" text NOT NULL,
	"revision_number" bigint NOT NULL,
	"source_config_json" text NOT NULL,
	"manifest_json" text,
	"manifest_hash" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);--> statement-breakpoint

CREATE TABLE "source_recipe_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"recipe_revision_id" text NOT NULL,
	"document_kind" text NOT NULL,
	"document_key" text NOT NULL,
	"content_text" text NOT NULL,
	"content_hash" text NOT NULL,
	"fetched_at" bigint,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "source_recipe_documents_kind_check" CHECK ("document_kind" in (
		'google_discovery',
		'openapi',
		'postman_collection',
		'postman_environment',
		'graphql_introspection',
		'mcp_manifest'
	))
);--> statement-breakpoint

CREATE TABLE "source_recipe_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"recipe_revision_id" text NOT NULL,
	"operation_key" text NOT NULL,
	"transport_kind" text NOT NULL,
	"tool_id" text NOT NULL,
	"title" text,
	"description" text,
	"operation_kind" text NOT NULL,
	"search_text" text NOT NULL,
	"input_schema_json" text,
	"output_schema_json" text,
	"provider_kind" text NOT NULL,
	"provider_data_json" text,
	"mcp_tool_name" text,
	"openapi_method" text,
	"openapi_path_template" text,
	"openapi_operation_hash" text,
	"openapi_raw_tool_id" text,
	"openapi_operation_id" text,
	"openapi_tags_json" text,
	"openapi_request_body_required" boolean,
	"graphql_operation_type" text,
	"graphql_operation_name" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "source_recipe_operations_transport_kind_check" CHECK ("transport_kind" in ('http', 'graphql', 'mcp', 'internal')),
	CONSTRAINT "source_recipe_operations_kind_check" CHECK ("operation_kind" in ('read', 'write', 'delete', 'unknown')),
	CONSTRAINT "source_recipe_operations_provider_kind_check" CHECK ("provider_kind" in ('mcp', 'openapi', 'graphql', 'internal'))
);--> statement-breakpoint

CREATE TABLE "workspace_source_oauth_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"source_id" text NOT NULL,
	"provider_key" text NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_provider_id" text,
	"client_secret_handle" text,
	"client_metadata_json" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL
);--> statement-breakpoint

UPDATE "sources"
SET
	"recipe_id" = 'src_recipe_' || md5("workspace_id" || ':' || "source_id"),
	"recipe_revision_id" = 'src_recipe_rev_' || md5("workspace_id" || ':' || "source_id"),
	"binding_config_json" = null;--> statement-breakpoint

INSERT INTO "source_recipes" (
	"id",
	"kind",
	"importer_kind",
	"provider_key",
	"name",
	"summary",
	"visibility",
	"latest_revision_id",
	"created_at",
	"updated_at"
)
SELECT
	"s"."recipe_id",
	CASE
		WHEN "s"."kind" = 'openapi' THEN 'http_recipe'
		WHEN "s"."kind" = 'graphql' THEN 'graphql_recipe'
		WHEN "s"."kind" = 'mcp' THEN 'mcp_recipe'
		ELSE 'internal_recipe'
	END,
	CASE
		WHEN "s"."kind" = 'openapi' THEN 'openapi'
		WHEN "s"."kind" = 'graphql' THEN 'graphql_introspection'
		WHEN "s"."kind" = 'mcp' THEN 'mcp_manifest'
		ELSE 'internal_manifest'
	END,
	CASE
		WHEN "s"."kind" = 'openapi' THEN 'generic_http'
		WHEN "s"."kind" = 'graphql' THEN 'generic_graphql'
		WHEN "s"."kind" = 'mcp' THEN 'generic_mcp'
		ELSE 'generic_internal'
	END,
	"s"."name",
	null,
	'workspace',
	"s"."recipe_revision_id",
	"s"."created_at",
	"s"."updated_at"
FROM "sources" AS "s";--> statement-breakpoint

INSERT INTO "source_recipe_revisions" (
	"id",
	"recipe_id",
	"revision_number",
	"source_config_json",
	"manifest_json",
	"manifest_hash",
	"created_at",
	"updated_at"
)
SELECT
	"s"."recipe_revision_id",
	"s"."recipe_id",
	1,
	CASE
		WHEN "s"."kind" = 'mcp' THEN jsonb_build_object(
			'kind', 'mcp',
			'endpoint', "s"."endpoint",
			'transport', "s"."transport",
			'queryParams', COALESCE("s"."query_params_json"::jsonb, 'null'::jsonb),
			'headers', COALESCE("s"."headers_json"::jsonb, 'null'::jsonb)
		)::text
		WHEN "s"."kind" = 'openapi' THEN jsonb_build_object(
			'kind', 'openapi',
			'endpoint', "s"."endpoint",
			'specUrl', COALESCE("s"."spec_url", "s"."endpoint"),
			'defaultHeaders', COALESCE("s"."default_headers_json"::jsonb, 'null'::jsonb)
		)::text
		WHEN "s"."kind" = 'graphql' THEN jsonb_build_object(
			'kind', 'graphql',
			'endpoint', "s"."endpoint",
			'defaultHeaders', COALESCE("s"."default_headers_json"::jsonb, 'null'::jsonb)
		)::text
		ELSE jsonb_build_object(
			'kind', 'internal',
			'endpoint', "s"."endpoint"
		)::text
	END,
	null,
	"s"."source_hash",
	"s"."created_at",
	"s"."updated_at"
FROM "sources" AS "s";--> statement-breakpoint

INSERT INTO "source_recipe_documents" (
	"id",
	"recipe_revision_id",
	"document_kind",
	"document_key",
	"content_text",
	"content_hash",
	"fetched_at",
	"created_at",
	"updated_at"
)
SELECT
	'src_recipe_doc_' || md5("s"."workspace_id" || ':' || "s"."source_id" || ':primary'),
	"s"."recipe_revision_id",
	CASE
		WHEN "s"."kind" = 'openapi' THEN 'openapi'
		WHEN "s"."kind" = 'graphql' THEN 'graphql_introspection'
		ELSE 'mcp_manifest'
	END,
	CASE
		WHEN "s"."kind" = 'openapi' THEN COALESCE("s"."spec_url", "s"."endpoint")
		ELSE "s"."endpoint"
	END,
	"s"."source_document_text",
	md5("s"."source_document_text"),
	"s"."updated_at",
	"s"."created_at",
	"s"."updated_at"
FROM "sources" AS "s"
WHERE "s"."source_document_text" IS NOT NULL;--> statement-breakpoint

INSERT INTO "source_recipe_operations" (
	"id",
	"recipe_revision_id",
	"operation_key",
	"transport_kind",
	"tool_id",
	"title",
	"description",
	"operation_kind",
	"search_text",
	"input_schema_json",
	"output_schema_json",
	"provider_kind",
	"provider_data_json",
	"mcp_tool_name",
	"openapi_method",
	"openapi_path_template",
	"openapi_operation_hash",
	"openapi_raw_tool_id",
	"openapi_operation_id",
	"openapi_tags_json",
	"openapi_request_body_required",
	"graphql_operation_type",
	"graphql_operation_name",
	"created_at",
	"updated_at"
)
SELECT
	'src_recipe_op_' || md5("ta"."workspace_id" || ':' || "ta"."source_id" || ':' || "ta"."path"),
	"s"."recipe_revision_id",
	"ta"."tool_id",
	CASE
		WHEN "ta"."provider_kind" = 'openapi' THEN 'http'
		ELSE 'mcp'
	END,
	"ta"."tool_id",
	"ta"."title",
	"ta"."description",
	CASE
		WHEN "ta"."provider_kind" = 'openapi' AND upper(COALESCE("ta"."openapi_method", '')) IN ('GET', 'HEAD') THEN 'read'
		WHEN "ta"."provider_kind" = 'openapi' AND upper(COALESCE("ta"."openapi_method", '')) = 'DELETE' THEN 'delete'
		WHEN "ta"."provider_kind" = 'openapi' THEN 'write'
		ELSE 'unknown'
	END,
	"ta"."search_text",
	"ta"."input_schema_json",
	"ta"."output_schema_json",
	"ta"."provider_kind",
	CASE
		WHEN "ta"."provider_kind" = 'mcp' THEN jsonb_build_object(
			'kind', 'mcp',
			'toolId', "ta"."tool_id",
			'toolName', COALESCE("ta"."mcp_tool_name", "ta"."title", "ta"."path"),
			'description', "ta"."description"
		)::text
		ELSE jsonb_build_object(
			'kind', 'openapi',
			'toolId', "ta"."tool_id",
			'rawToolId', "ta"."openapi_raw_tool_id",
			'operationId', "ta"."openapi_operation_id",
			'tags', COALESCE("ta"."openapi_tags_json"::jsonb, '[]'::jsonb),
			'method', "ta"."openapi_method",
			'path', "ta"."openapi_path_template",
			'operationHash', "ta"."openapi_operation_hash"
		)::text
	END,
	"ta"."mcp_tool_name",
	"ta"."openapi_method",
	"ta"."openapi_path_template",
	"ta"."openapi_operation_hash",
	"ta"."openapi_raw_tool_id",
	"ta"."openapi_operation_id",
	"ta"."openapi_tags_json",
	"ta"."openapi_request_body_required",
	null,
	null,
	"ta"."created_at",
	"ta"."updated_at"
FROM "tool_artifacts" AS "ta"
JOIN "sources" AS "s"
	ON "s"."workspace_id" = "ta"."workspace_id"
	AND "s"."source_id" = "ta"."source_id";--> statement-breakpoint

WITH "mcp_manifests" AS (
	SELECT
		"s"."workspace_id",
		"s"."source_id",
		"s"."recipe_revision_id",
		jsonb_build_object(
			'version', 1,
			'tools', COALESCE(
				jsonb_agg(
					jsonb_build_object(
						'toolId', "ta"."tool_id",
						'toolName', COALESCE("ta"."mcp_tool_name", "ta"."title", "ta"."path"),
						'description', "ta"."description",
						'inputSchemaJson', "ta"."input_schema_json",
						'outputSchemaJson', "ta"."output_schema_json"
					)
					ORDER BY "ta"."path"
				) FILTER (WHERE "ta"."provider_kind" = 'mcp'),
				'[]'::jsonb
			)
		)::text AS "manifest_json"
	FROM "sources" AS "s"
	LEFT JOIN "tool_artifacts" AS "ta"
		ON "ta"."workspace_id" = "s"."workspace_id"
		AND "ta"."source_id" = "s"."source_id"
	WHERE "s"."kind" = 'mcp'
	GROUP BY "s"."workspace_id", "s"."source_id", "s"."recipe_revision_id"
)
UPDATE "source_recipe_revisions" AS "rev"
SET
	"manifest_json" = "mcp"."manifest_json",
	"manifest_hash" = md5("mcp"."manifest_json")
FROM "mcp_manifests" AS "mcp"
WHERE "rev"."id" = "mcp"."recipe_revision_id";--> statement-breakpoint

INSERT INTO "source_recipe_documents" (
	"id",
	"recipe_revision_id",
	"document_kind",
	"document_key",
	"content_text",
	"content_hash",
	"fetched_at",
	"created_at",
	"updated_at"
)
SELECT
	'src_recipe_doc_' || md5("s"."workspace_id" || ':' || "s"."source_id" || ':mcp_manifest'),
	"s"."recipe_revision_id",
	'mcp_manifest',
	"s"."endpoint",
	"rev"."manifest_json",
	md5("rev"."manifest_json"),
	"s"."updated_at",
	"s"."created_at",
	"s"."updated_at"
FROM "sources" AS "s"
JOIN "source_recipe_revisions" AS "rev"
	ON "rev"."id" = "s"."recipe_revision_id"
WHERE "s"."kind" = 'mcp'
	AND "rev"."manifest_json" IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM "source_recipe_documents" AS "doc"
		WHERE "doc"."recipe_revision_id" = "s"."recipe_revision_id"
			AND "doc"."document_kind" = 'mcp_manifest'
			AND "doc"."document_key" = "s"."endpoint"
	);--> statement-breakpoint

ALTER TABLE "sources" ALTER COLUMN "recipe_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ALTER COLUMN "recipe_revision_id" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "sources_workspace_recipe_idx" ON "sources" ("workspace_id","recipe_id","updated_at","source_id");--> statement-breakpoint

CREATE TABLE "workspace_source_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"source_id" text NOT NULL,
	"actor_account_id" text,
	"auth_kind" text NOT NULL,
	"auth_header_name" text NOT NULL,
	"auth_prefix" text NOT NULL,
	"token_provider_id" text NOT NULL,
	"token_handle" text NOT NULL,
	"refresh_token_provider_id" text,
	"refresh_token_handle" text,
	"created_at" bigint NOT NULL,
	"updated_at" bigint NOT NULL,
	CONSTRAINT "credentials_auth_kind_check" CHECK ("auth_kind" in ('bearer', 'oauth2'))
);--> statement-breakpoint

INSERT INTO "workspace_source_credentials" (
	"id",
	"workspace_id",
	"source_id",
	"actor_account_id",
	"auth_kind",
	"auth_header_name",
	"auth_prefix",
	"token_provider_id",
	"token_handle",
	"refresh_token_provider_id",
	"refresh_token_handle",
	"created_at",
	"updated_at"
)
SELECT
	CASE
		WHEN count(*) OVER (PARTITION BY "c"."id") = 1 THEN "c"."id"
		ELSE "c"."id" || ':' || "scb"."source_id"
	END,
	"c"."workspace_id",
	"scb"."source_id",
	null,
	"c"."auth_kind",
	"c"."auth_header_name",
	"c"."auth_prefix",
	"c"."token_provider_id",
	"c"."token_handle",
	"c"."refresh_token_provider_id",
	"c"."refresh_token_handle",
	"c"."created_at",
	"c"."updated_at"
FROM "credentials" AS "c"
JOIN "source_credential_bindings" AS "scb"
	ON "scb"."workspace_id" = "c"."workspace_id"
	AND "scb"."credential_id" = "c"."id";--> statement-breakpoint

DROP TABLE "credentials";--> statement-breakpoint
DROP TABLE "source_credential_bindings";--> statement-breakpoint
CREATE INDEX "credentials_workspace_idx" ON "workspace_source_credentials" ("workspace_id","updated_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "credentials_workspace_source_actor_idx" ON "workspace_source_credentials" ("workspace_id","source_id","actor_account_id");--> statement-breakpoint
CREATE INDEX "credentials_workspace_source_idx" ON "workspace_source_credentials" ("workspace_id","source_id","updated_at","id");--> statement-breakpoint

ALTER TABLE "source_auth_sessions" ADD COLUMN "actor_account_id" text;--> statement-breakpoint
ALTER TABLE "source_auth_sessions" ADD COLUMN "provider_kind" text;--> statement-breakpoint
ALTER TABLE "source_auth_sessions" ADD COLUMN "session_data_json" text;--> statement-breakpoint

UPDATE "source_auth_sessions"
SET
	"provider_kind" = 'mcp_oauth',
	"session_data_json" = jsonb_build_object(
		'kind', 'mcp_oauth',
		'endpoint', "endpoint",
		'redirectUri', "redirect_uri",
		'scope', "scope",
		'resourceMetadataUrl', "resource_metadata_url",
		'authorizationServerUrl', "authorization_server_url",
		'resourceMetadataJson', "resource_metadata_json",
		'authorizationServerMetadataJson', "authorization_server_metadata_json",
		'clientInformationJson', "client_information_json",
		'codeVerifier', "code_verifier",
		'authorizationUrl', "authorization_url"
	)::text;--> statement-breakpoint

ALTER TABLE "source_auth_sessions" ALTER COLUMN "provider_kind" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "source_auth_sessions" ALTER COLUMN "session_data_json" SET NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "source_auth_sessions_pending_idx";--> statement-breakpoint
ALTER TABLE "source_auth_sessions" DROP CONSTRAINT "source_auth_sessions_strategy_check";--> statement-breakpoint
ALTER TABLE "source_auth_sessions" DROP COLUMN "strategy";--> statement-breakpoint
ALTER TABLE "source_auth_sessions" DROP COLUMN "endpoint";--> statement-breakpoint
ALTER TABLE "source_auth_sessions" DROP COLUMN "redirect_uri";--> statement-breakpoint
ALTER TABLE "source_auth_sessions" DROP COLUMN "scope";--> statement-breakpoint
ALTER TABLE "source_auth_sessions" DROP COLUMN "resource_metadata_url";--> statement-breakpoint
ALTER TABLE "source_auth_sessions" DROP COLUMN "authorization_server_url";--> statement-breakpoint
ALTER TABLE "source_auth_sessions" DROP COLUMN "resource_metadata_json";--> statement-breakpoint
ALTER TABLE "source_auth_sessions" DROP COLUMN "authorization_server_metadata_json";--> statement-breakpoint
ALTER TABLE "source_auth_sessions" DROP COLUMN "client_information_json";--> statement-breakpoint
ALTER TABLE "source_auth_sessions" DROP COLUMN "code_verifier";--> statement-breakpoint
ALTER TABLE "source_auth_sessions" DROP COLUMN "authorization_url";--> statement-breakpoint
ALTER TABLE "source_auth_sessions" ADD CONSTRAINT "source_auth_sessions_provider_kind_check" CHECK ("provider_kind" in ('mcp_oauth', 'oauth2_pkce'));--> statement-breakpoint
CREATE INDEX "source_auth_sessions_pending_idx" ON "source_auth_sessions" ("workspace_id","source_id","actor_account_id","status","updated_at","id");--> statement-breakpoint

CREATE INDEX "source_recipes_provider_updated_idx" ON "source_recipes" ("provider_key","updated_at","id");--> statement-breakpoint
CREATE INDEX "source_recipes_visibility_updated_idx" ON "source_recipes" ("visibility","updated_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_recipe_revisions_recipe_revision_idx" ON "source_recipe_revisions" ("recipe_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "source_recipe_revisions_recipe_manifest_idx" ON "source_recipe_revisions" ("recipe_id","manifest_hash");--> statement-breakpoint
CREATE INDEX "source_recipe_revisions_recipe_created_idx" ON "source_recipe_revisions" ("recipe_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_recipe_documents_revision_kind_key_idx" ON "source_recipe_documents" ("recipe_revision_id","document_kind","document_key");--> statement-breakpoint
CREATE INDEX "source_recipe_documents_revision_created_idx" ON "source_recipe_documents" ("recipe_revision_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_recipe_operations_revision_operation_key_idx" ON "source_recipe_operations" ("recipe_revision_id","operation_key");--> statement-breakpoint
CREATE INDEX "source_recipe_operations_revision_tool_idx" ON "source_recipe_operations" ("recipe_revision_id","tool_id","updated_at","id");--> statement-breakpoint
CREATE INDEX "source_recipe_operations_search_text_idx" ON "source_recipe_operations" USING gin (to_tsvector('simple', "search_text"));--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_source_oauth_clients_workspace_source_provider_idx" ON "workspace_source_oauth_clients" ("workspace_id","source_id","provider_key");--> statement-breakpoint
CREATE INDEX "workspace_source_oauth_clients_workspace_idx" ON "workspace_source_oauth_clients" ("workspace_id","updated_at","source_id");
