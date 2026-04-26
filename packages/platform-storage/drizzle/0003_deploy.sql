CREATE TYPE "public"."deployment_status" AS ENUM('queued', 'running', 'succeeded', 'succeeded_with_warnings', 'failed', 'failed_orphaned');
--> statement-breakpoint
CREATE TABLE "deploy_target" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"kind" text NOT NULL,
	"dokploy_url" text NOT NULL,
	"dokploy_project_id" text,
	"dokploy_project_name" text,
	"allow_create_project" boolean DEFAULT false NOT NULL,
	"api_token_ciphertext" bytea NOT NULL,
	"api_token_nonce" bytea NOT NULL,
	"api_token_key_version" smallint NOT NULL,
	"event_bus_config" jsonb NOT NULL,
	"policy_values" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deploy_target_org_slug_uq" UNIQUE("org_id","slug")
);
--> statement-breakpoint
CREATE TABLE "deployment" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"project_version_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"status" "deployment_status" DEFAULT 'queued' NOT NULL,
	"config_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rendered_plan_digest" text,
	"apply_result" jsonb,
	"verification_report" jsonb,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error_code" text,
	"error_message" text,
	"started_by_account_id" uuid NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"last_heartbeat_at" timestamp with time zone,
	CONSTRAINT "terminal_means_finished" CHECK (
		("status" IN ('queued', 'running') AND "finished_at" IS NULL)
		OR
		("status" NOT IN ('queued', 'running') AND "finished_at" IS NOT NULL)
	)
);
--> statement-breakpoint
CREATE TABLE "deployment_log_line" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"deployment_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"level" text NOT NULL,
	"step" text NOT NULL,
	"message" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "deploy_target" ADD CONSTRAINT "deploy_target_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_project_version_id_project_version_id_fk" FOREIGN KEY ("project_version_id") REFERENCES "public"."project_version"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_target_id_deploy_target_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."deploy_target"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "deployment" ADD CONSTRAINT "deployment_started_by_account_id_account_id_fk" FOREIGN KEY ("started_by_account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "deployment_log_line" ADD CONSTRAINT "deployment_log_line_deployment_id_deployment_id_fk" FOREIGN KEY ("deployment_id") REFERENCES "public"."deployment"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "deployment_log_line" ADD CONSTRAINT "deployment_log_line_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "one_default_per_org" ON "deploy_target" USING btree ("org_id") WHERE "is_default";
--> statement-breakpoint
CREATE INDEX "deployment_project_idx" ON "deployment" USING btree ("project_id","queued_at");
--> statement-breakpoint
CREATE INDEX "deployment_target_idx" ON "deployment" USING btree ("target_id");
--> statement-breakpoint
CREATE INDEX "deployment_live_idx" ON "deployment" USING btree ("status","last_heartbeat_at");
--> statement-breakpoint
CREATE INDEX "deployment_log_line_idx" ON "deployment_log_line" USING btree ("deployment_id","id");
--> statement-breakpoint
ALTER TABLE "deploy_target" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "deployment" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "deployment_log_line" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "deploy_target"
	USING (org_id = current_setting('app.org_id', true)::uuid)
	WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY tenant_insert ON "deploy_target"
	FOR INSERT
	WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "deployment"
	USING (org_id = current_setting('app.org_id', true)::uuid)
	WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY tenant_insert ON "deployment"
	FOR INSERT
	WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY tenant_isolation ON "deployment_log_line"
	USING (org_id = current_setting('app.org_id', true)::uuid)
	WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);
--> statement-breakpoint
CREATE POLICY tenant_insert ON "deployment_log_line"
	FOR INSERT
	WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);
