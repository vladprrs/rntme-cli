ALTER TABLE "deploy_target" ADD COLUMN "public_base_url" text;
--> statement-breakpoint
UPDATE "deploy_target" SET "public_base_url" = "dokploy_url" WHERE "public_base_url" IS NULL;
--> statement-breakpoint
ALTER TABLE "deploy_target" ALTER COLUMN "public_base_url" SET NOT NULL;
