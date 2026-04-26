DROP TABLE IF EXISTS "artifact_tag";
--> statement-breakpoint
DROP TABLE IF EXISTS "artifact_version";
--> statement-breakpoint
DROP TABLE IF EXISTS "service";
--> statement-breakpoint
CREATE TABLE "project_version" (
	"id" uuid PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"seq" bigint NOT NULL,
	"bundle_digest" text NOT NULL,
	"bundle_blob_key" text NOT NULL,
	"bundle_size_bytes" bigint NOT NULL,
	"summary" jsonb NOT NULL,
	"uploaded_by_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_version_project_seq_uq" UNIQUE("project_id","seq"),
	CONSTRAINT "project_version_project_digest_uq" UNIQUE("project_id","bundle_digest")
);
--> statement-breakpoint
ALTER TABLE "project_version" ADD CONSTRAINT "project_version_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_version" ADD CONSTRAINT "project_version_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_version" ADD CONSTRAINT "project_version_uploaded_by_account_id_account_id_fk" FOREIGN KEY ("uploaded_by_account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "project_version_latest_idx" ON "project_version" USING btree ("project_id","seq");
--> statement-breakpoint
ALTER TABLE project_version ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE project_version FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_project_version ON project_version;
--> statement-breakpoint
CREATE POLICY tenant_isolation_project_version ON project_version USING (org_id = current_setting('app.org_id', true)::uuid) WITH CHECK (org_id = current_setting('app.org_id', true)::uuid);
