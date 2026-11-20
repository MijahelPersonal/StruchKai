ALTER TABLE anime ALTER COLUMN year DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE manga ALTER COLUMN year DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE anime_episodes ALTER COLUMN number DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE manga_chapters ALTER COLUMN number DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE providers ADD COLUMN descriptor jsonb NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE providers ADD COLUMN checked_at timestamptz;
--> statement-breakpoint
ALTER TABLE providers ADD COLUMN last_error text;
--> statement-breakpoint
ALTER TABLE provider_mappings ADD COLUMN identity_key text;
--> statement-breakpoint
ALTER TABLE provider_mappings ADD COLUMN verified_by text NOT NULL DEFAULT 'provider_identifier';
--> statement-breakpoint
ALTER TABLE provider_mappings ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE provider_mappings ADD COLUMN fetched_at timestamptz;
--> statement-breakpoint
ALTER TABLE provider_mappings ADD COLUMN expires_at timestamptz;
--> statement-breakpoint
ALTER TABLE provider_mappings ADD COLUMN last_error text;
--> statement-breakpoint
CREATE INDEX provider_mappings_identity_idx ON provider_mappings(identity_key);
--> statement-breakpoint
ALTER TABLE provider_releases ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE provider_releases ADD COLUMN availability text NOT NULL DEFAULT 'unknown' CHECK(availability IN ('unknown','announced','published'));
--> statement-breakpoint
ALTER TABLE provider_releases ADD COLUMN fetched_at timestamptz;
--> statement-breakpoint
ALTER TABLE provider_releases ADD COLUMN expires_at timestamptz;
