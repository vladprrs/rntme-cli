ALTER TABLE "deploy_target" ADD COLUMN "module_config" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "deploy_target" ADD COLUMN "auth_config" jsonb DEFAULT '{}'::jsonb NOT NULL;
