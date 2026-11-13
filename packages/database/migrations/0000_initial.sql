CREATE TABLE users (
  id uuid primary key default gen_random_uuid(),
  issuer text not null,
  subject text not null,
  email text,
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  unique(issuer,subject)
);
--> statement-breakpoint
CREATE TABLE user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  slug text not null unique check (length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name text not null,
  preferences jsonb not null default '{}',
  created_at timestamptz not null default now()
);
--> statement-breakpoint
CREATE TABLE roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
);
--> statement-breakpoint
CREATE TABLE user_roles (
  user_id uuid not null references users(id),
  role_id uuid not null references roles(id),
  primary key(user_id,role_id)
);
--> statement-breakpoint
CREATE TABLE user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  session_ref text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check(expires_at > created_at)
);
--> statement-breakpoint
CREATE TABLE anime (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  search_title text not null,
  synopsis text not null,
  year integer not null check(year between 1 and 9999),
  created_at timestamptz not null default now()
);
--> statement-breakpoint
CREATE TABLE anime_episodes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  anime_id uuid not null references anime(id),
  number numeric not null check(number >= 0),
  title text not null,
  created_at timestamptz not null default now(),
  unique(anime_id,number)
);
--> statement-breakpoint
CREATE TABLE manga (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null,
  search_title text not null,
  synopsis text not null,
  year integer not null check(year between 1 and 9999),
  created_at timestamptz not null default now()
);
--> statement-breakpoint
CREATE TABLE manga_chapters (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  manga_id uuid not null references manga(id),
  number numeric not null check(number >= 0),
  title text not null,
  created_at timestamptz not null default now(),
  unique(manga_id,number)
);
--> statement-breakpoint
CREATE TABLE genres (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null
);
--> statement-breakpoint
CREATE TABLE anime_genres (
  anime_id uuid not null references anime(id),
  genre_id uuid not null references genres(id),
  primary key(anime_id,genre_id)
);
--> statement-breakpoint
CREATE TABLE manga_genres (
  manga_id uuid not null references manga(id),
  genre_id uuid not null references genres(id),
  primary key(manga_id,genre_id)
);
--> statement-breakpoint
CREATE TABLE library_entries (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references user_profiles(id),
  anime_id uuid  references anime(id),
  manga_id uuid  references manga(id),
  check(num_nonnulls(anime_id,manga_id)=1),
  status text not null check(status in ('planned','in_progress','completed','paused','dropped')),
  created_at timestamptz not null default now(),
  unique(profile_id,anime_id),
  unique(profile_id,manga_id)
);
--> statement-breakpoint
CREATE TABLE user_favorites (
  entry_id uuid primary key references library_entries(id) on delete cascade,
  created_at timestamptz not null default now()
);
--> statement-breakpoint
CREATE TABLE watch_history (
  id uuid primary key default gen_random_uuid(),
  client_event_id uuid not null,
  unique(profile_id,client_event_id),
  profile_id uuid not null references user_profiles(id),
  delivery_id uuid not null references anime_episodes(id),
  position_seconds integer not null check(position_seconds >= 0),
  created_at timestamptz not null default now()
);
--> statement-breakpoint
CREATE TABLE watch_progress (
  primary key(profile_id,delivery_id),
  profile_id uuid not null references user_profiles(id),
  delivery_id uuid not null references anime_episodes(id),
  position_seconds integer not null check(position_seconds >= 0),
  created_at timestamptz not null default now()
);
--> statement-breakpoint
CREATE TABLE reading_history (
  id uuid primary key default gen_random_uuid(),
  client_event_id uuid not null,
  unique(profile_id,client_event_id),
  profile_id uuid not null references user_profiles(id),
  delivery_id uuid not null references manga_chapters(id),
  page integer not null check(page >= 0),
  created_at timestamptz not null default now()
);
--> statement-breakpoint
CREATE TABLE reading_progress (
  primary key(profile_id,delivery_id),
  profile_id uuid not null references user_profiles(id),
  delivery_id uuid not null references manga_chapters(id),
  page integer not null check(page >= 0),
  created_at timestamptz not null default now()
);
--> statement-breakpoint
CREATE TABLE providers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (length(slug) <= 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  version text not null,
  enabled boolean not null default false
);
--> statement-breakpoint
CREATE TABLE provider_policies (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id),
  capability text not null check(capability in ('metadata','episode_availability','playback','manga')),
  revision integer not null check(revision > 0),
  policy jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(provider_id,capability,revision)
);
--> statement-breakpoint
CREATE TABLE provider_mappings (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references providers(id),
  namespace text not null,
  external_id text not null,
  anime_id uuid  references anime(id),
  manga_id uuid  references manga(id),
  check(num_nonnulls(anime_id,manga_id)=1),
  unique(provider_id,namespace,external_id)
);
--> statement-breakpoint
CREATE TABLE provider_releases (
  id uuid primary key default gen_random_uuid(),
  mapping_id uuid not null references provider_mappings(id),
  external_key text not null,
  episode_id uuid  references anime_episodes(id),
  chapter_id uuid  references manga_chapters(id),
  check(num_nonnulls(episode_id,chapter_id)=1),
  language text not null,
  created_at timestamptz not null default now(),
  unique(mapping_id,external_key)
);
--> statement-breakpoint
CREATE TABLE sync_targets (
  id uuid primary key default gen_random_uuid(),
  mapping_id uuid not null references provider_mappings(id) unique,
  next_run_at timestamptz not null,
  cursor text
);
--> statement-breakpoint
CREATE TABLE sync_jobs (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references sync_targets(id),
  state text not null check(state in ('pending','running','completed','failed')),
  run_after timestamptz not null,
  attempts integer not null default 0 check(attempts >= 0),
  lease_until timestamptz,
  created_at timestamptz not null default now()
);
--> statement-breakpoint
CREATE TABLE publication_events (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references provider_releases(id),
  dedupe_key text not null unique,
  created_at timestamptz not null default now()
);
--> statement-breakpoint
CREATE TABLE event_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references publication_events(id) unique,
  available_at timestamptz not null,
  processed_at timestamptz,
  payload jsonb not null default '{}'
);
--> statement-breakpoint
CREATE TABLE notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references user_profiles(id),
  event_id uuid not null references publication_events(id),
  channel text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(profile_id,event_id,channel)
);
--> statement-breakpoint
CREATE TABLE notification_preferences (
  profile_id uuid not null references user_profiles(id),
  channel text not null,
  enabled boolean not null,
  primary key(profile_id,channel)
);
--> statement-breakpoint
CREATE TABLE audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid  references users(id),
  request_id uuid,
  action text not null,
  outcome text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
--> statement-breakpoint
CREATE INDEX user_profiles_user_idx ON user_profiles(user_id);
--> statement-breakpoint
CREATE INDEX user_sessions_active_idx ON user_sessions(user_id,expires_at) WHERE revoked_at IS NULL;
--> statement-breakpoint
CREATE INDEX anime_genres_reverse_idx ON anime_genres(genre_id,anime_id);
--> statement-breakpoint
CREATE INDEX manga_genres_reverse_idx ON manga_genres(genre_id,manga_id);
--> statement-breakpoint
CREATE INDEX library_entries_status_idx ON library_entries(profile_id,status,created_at);
--> statement-breakpoint
CREATE INDEX watch_history_profile_idx ON watch_history(profile_id,created_at DESC);
--> statement-breakpoint
CREATE INDEX reading_history_profile_idx ON reading_history(profile_id,created_at DESC);
--> statement-breakpoint
CREATE INDEX sync_jobs_pending_idx ON sync_jobs(run_after) WHERE state = 'pending';
--> statement-breakpoint
CREATE INDEX sync_targets_due_idx ON sync_targets(next_run_at);
--> statement-breakpoint
CREATE INDEX outbox_pending_idx ON event_outbox(available_at) WHERE processed_at IS NULL;
--> statement-breakpoint
CREATE INDEX notifications_unread_idx ON notifications(profile_id,created_at DESC) WHERE read_at IS NULL;
--> statement-breakpoint
CREATE INDEX audit_logs_actor_idx ON audit_logs(actor_id,created_at DESC);
