-- ---------------------------------------------------------------------------
-- The whole store: a folder tree, the files in it, and the three small tables
-- that let a free-tier project run without a second service.
--
-- Two decisions run through all of it and are worth reading before the DDL.
--
-- 1. OBJECT KEYS MIRROR ROW IDS, NEVER THE FOLDER TREE. A file's bytes live at
--    `library/<file id>.pdf` and nowhere else. If keys mirrored the visible
--    path instead, renaming one folder would mean copying every object beneath
--    it and deleting the originals: an O(n) multi-object operation, with no
--    transaction around it, at up to 50MB a copy, against a 1GB quota. With id
--    keys, rename and move are single-row UPDATEs that never touch storage, and
--    the download filename is built from `files.name` at request time so it
--    still follows the rename.
--
-- 2. THE TREE IS AN ADJACENCY LIST. The usual argument for a materialised path
--    is cheap recursive delete, and ON DELETE CASCADE already provides that,
--    transactionally. What is left is the comparison that matters: under
--    adjacency a move is one UPDATE, under a materialised path it is a rewrite
--    of every descendant — the same partial-write hazard on every move and
--    every rename. Breadcrumbs are the one thing a path makes cheaper, and at
--    this scale the whole tree is a few kilobytes, so `lib/tree.ts` reads it
--    once and walks it in memory.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ── folders ────────────────────────────────────────────────────────────────

create table public.folders (
  id         uuid primary key default gen_random_uuid(),
  parent_id  uuid references public.folders(id) on delete cascade,
  name       text not null check (
               length(name) between 1 and 120
               and name = btrim(name)
               and name !~ '[/\\[:cntrl:]]'
               and name not in ('.', '..')
             ),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sibling names are unique case-insensitively, INCLUDING at the root.
-- `nulls not distinct` is the whole point: without it `parent_id is null` never
-- collides with itself, and every folder at the root could be called "Reports".
create unique index folders_sibling_name_key
  on public.folders (parent_id, lower(name)) nulls not distinct;

create index folders_parent_idx on public.folders (parent_id);

-- A folder cannot be moved inside its own subtree.
--
-- The foreign key cannot express this, and the result of getting it wrong is
-- not a visible error: it is a detached ring of folders, unreachable from the
-- root, that nothing notices until a breadcrumb walk climbs it forever.
create or replace function public.folders_reject_cycle() returns trigger
language plpgsql as $$
declare
  cur  uuid := new.parent_id;
  hops int  := 0;
begin
  while cur is not null loop
    if cur = new.id then
      raise exception 'a folder cannot be moved inside itself';
    end if;
    hops := hops + 1;
    if hops > 64 then
      raise exception 'folder tree too deep';
    end if;
    select parent_id into cur from public.folders where id = cur;
  end loop;
  return new;
end $$;

create trigger folders_no_cycle
  before update of parent_id on public.folders
  for each row execute function public.folders_reject_cycle();

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger folders_touch before update on public.folders
  for each row execute function public.touch_updated_at();

-- ── files ──────────────────────────────────────────────────────────────────

create type public.file_status as enum ('pending', 'ready');

create table public.files (
  id           uuid primary key default gen_random_uuid(),
  folder_id    uuid references public.folders(id) on delete cascade,
  name         text not null check (
                 length(name) between 1 and 200
                 and name = btrim(name)
                 and name !~ '[/\\[:cntrl:]]'
               ),
  status       public.file_status not null default 'pending',
  size_bytes   bigint not null default 0
                 check (size_bytes >= 0 and size_bytes <= 52428800),
  page_count   int check (page_count is null or page_count > 0),
  has_thumb    boolean not null default false,
  -- Derived from `id`, but stored rather than recomputed: the object a row owns
  -- should be a fact in the row, not a convention in the code that deletes it.
  object_key   text not null,
  thumb_key    text,
  created_by   text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Only 'ready' rows compete for a name. A half-finished upload must not block
-- a retry under the same name, which is exactly what a total index would do.
create unique index files_sibling_name_key
  on public.files (folder_id, lower(name)) nulls not distinct
  where status = 'ready';

create index files_folder_idx  on public.files (folder_id)       where status = 'ready';
create index files_created_idx on public.files (created_at desc) where status = 'ready';
create index files_pending_idx on public.files (created_at)      where status = 'pending';
create index files_name_trgm   on public.files using gin (name gin_trgm_ops);

create trigger files_touch before update on public.files
  for each row execute function public.touch_updated_at();

-- ── orphan objects: a transactional outbox ─────────────────────────────────
--
-- This is what makes recursive delete safe, and it is the reason application
-- code never walks the tree to delete anything.
--
-- Deleting a row and deleting its bytes cannot be one transaction: storage is
-- a different system. So pick the failure that is recoverable. Bytes-first with
-- a failed row delete leaves a row pointing at nothing — the file still lists
-- and 404s when opened, which only an admin can clear. Row-first with a failed
-- object delete leaves an object nobody references — invisible, costing quota
-- only, and mechanically reclaimable.
--
-- Row-first it is, and this table is the tombstone. The AFTER DELETE trigger
-- writes it inside the same transaction as the delete, so
-- `delete from folders where id = $1` cascades through every descendant folder
-- and file and enqueues every object in the subtree, atomically. The storage
-- calls that follow are best-effort: whatever fails is still queued for the
-- daily cron.

create table public.orphan_objects (
  id         bigserial primary key,
  bucket     text not null,
  object_key text not null,
  queued_at  timestamptz not null default now(),
  attempts   int not null default 0,
  unique (bucket, object_key)
);

create or replace function public.files_queue_object_deletion() returns trigger
language plpgsql as $$
begin
  insert into public.orphan_objects (bucket, object_key)
    values ('library', old.object_key)
    on conflict (bucket, object_key) do nothing;
  if old.thumb_key is not null then
    insert into public.orphan_objects (bucket, object_key)
      values ('thumbs', old.thumb_key)
      on conflict (bucket, object_key) do nothing;
  end if;
  return old;
end $$;

create trigger files_enqueue_objects after delete on public.files
  for each row execute function public.files_queue_object_deletion();

-- Note a failed drain, so an object that can never be deleted — removed by
-- hand in the dashboard, say — becomes visible instead of being retried
-- silently for ever.
create or replace function public.bump_orphan_attempts(p_ids bigint[])
returns void
language sql as $$
  update public.orphan_objects
     set attempts = attempts + 1
   where id = any(p_ids);
$$;

-- ── accounts ───────────────────────────────────────────────────────────────
-- Every email that has ever opened the door. The address is a label, not a
-- credential — the password is the whole gate — so this is a record of who is
-- reading, and a row appears the first time an address is used.

create table public.accounts (
  email         text primary key,
  role          text not null check (role in ('reader', 'admin')),
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  visits        int not null default 1
);

create index accounts_last_seen_idx on public.accounts (last_seen_at desc);

-- Record a sign-in, creating the account if this address has never been seen.
--
-- A function rather than an upsert from the app because `visits` must be
-- incremented in SQL: read-then-write from two tabs signing in at once has
-- both read 4 and both write 5.
--
-- `role` is overwritten each time on purpose. It records what the address most
-- recently proved, and an address removed from ADMIN_EMAILS should stop
-- reading as an admin here the next time it signs in — this table must not
-- become a second, staler source of truth about who administers the drive.
create or replace function public.note_sign_in(p_email text, p_role text)
returns void
language sql as $$
  insert into public.accounts (email, role)
  values (lower(btrim(p_email)), p_role)
  on conflict (email) do update set
    role         = excluded.role,
    last_seen_at = now(),
    visits       = public.accounts.visits + 1;
$$;

-- ── the door's rate limit ──────────────────────────────────────────────────
-- Replaces the Upstash dependency the sibling libraries carry. On a serverless
-- host an in-process Map makes "ten attempts" mean ten per lambda rather than
-- ten per address, which is not a limit at all. One table and one function is
-- cheaper than a second service and is actually correct.

create table public.door_attempts (
  key      text primary key,
  count    int not null default 0,
  reset_at timestamptz not null
);

create or replace function public.note_door_attempt(
  p_key text,
  p_window_seconds int,
  p_max int
) returns table (allowed boolean, retry_after_seconds int)
language plpgsql as $$
declare
  r public.door_attempts;
begin
  insert into public.door_attempts (key, count, reset_at)
    values (p_key, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update set
    count    = case when public.door_attempts.reset_at <= now()
                    then 1 else public.door_attempts.count + 1 end,
    reset_at = case when public.door_attempts.reset_at <= now()
                    then now() + make_interval(secs => p_window_seconds)
                    else public.door_attempts.reset_at end
  returning * into r;

  return query select
    r.count <= p_max,
    greatest(0, ceil(extract(epoch from (r.reset_at - now()))))::int;
end $$;

-- ── heartbeat ──────────────────────────────────────────────────────────────
-- A free Supabase project pauses after seven days without activity, and a
-- paused project fails everything: listing, reading, signing in. One row,
-- touched once a day by the cron in app/api/cron/maintain, keeps the clock
-- permanently reset. Note this prevents a pause; it cannot cure one.

create table public.heartbeat (
  id      int primary key default 1 check (id = 1),
  beat_at timestamptz not null default now()
);

insert into public.heartbeat (id) values (1) on conflict do nothing;

-- ── access control ─────────────────────────────────────────────────────────
--
-- RLS on, and DELIBERATELY NO POLICIES.
--
-- This app authenticates with its own HMAC-signed cookie (lib/auth/session),
-- not Supabase Auth, so there is no auth.uid() for a policy to key on. Making
-- RLS meaningful would mean minting Supabase-shaped JWTs signed with the
-- project secret — reimplementing an authorisation system that already exists
-- one layer up. So every access decision stays in Next.js, in requireAdmin()
-- and getReader(), and the server talks to this database as the service role.
--
-- Which makes RLS here sound pointless. It is not. The service role bypasses
-- it, but the ANON key does not, and the anon key is public by design and ends
-- up in devtools. RLS on with no policies is the difference between "the anon
-- key is harmless" and "the anon key is harmless until someone flips a bucket
-- public by accident".

alter table public.folders        enable row level security;
alter table public.files          enable row level security;
alter table public.accounts       enable row level security;
alter table public.orphan_objects enable row level security;
alter table public.door_attempts  enable row level security;
alter table public.heartbeat      enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;

-- ── buckets ────────────────────────────────────────────────────────────────
--
-- Both private. Thumbnails too: the first page of a PDF is usually its title
-- page, so a public thumbnail bucket would publish the table of contents of a
-- library that was deliberately put behind a password.
--
-- `allowed_mime_types` checks the content-type the client declares, so it
-- guards against accidents rather than against the admin. The real defences
-- against a mislabelled file are that only the admin can upload at all, that
-- the file route always sets application/pdf with nosniff whatever is stored,
-- that the CSP carries object-src 'none', and that commitUpload reads the
-- first eight bytes and insists on %PDF-.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('library', 'library', false, 52428800, array['application/pdf']),
  ('thumbs',  'thumbs',  false,   262144, array['image/webp', 'image/png'])
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
