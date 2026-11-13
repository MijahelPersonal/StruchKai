ALTER TABLE user_profiles ADD COLUMN avatar_url text;
--> statement-breakpoint
INSERT INTO roles(code) VALUES ('user'),('admin') ON CONFLICT(code) DO NOTHING;
