CREATE TABLE "platform_rate_limit" (
	"bucket_key_hash" bytea NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "platform_rate_limit_pk" PRIMARY KEY("bucket_key_hash","window_start"),
	CONSTRAINT "platform_rate_limit_count_positive" CHECK ("count" > 0)
);
--> statement-breakpoint
CREATE INDEX "platform_rate_limit_expires_at_idx" ON "platform_rate_limit" USING btree ("expires_at");
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'platform_app') THEN
		GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "platform_rate_limit" TO platform_app;
	END IF;
END $$;
