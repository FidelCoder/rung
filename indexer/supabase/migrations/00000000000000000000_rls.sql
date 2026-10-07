-- Chunk 4 — row-level security for writable application data.
--
-- Two kinds of data live in the Supabase database (BOT-chain-funding-draft-tasks.md):
--
--   * chain-derived read models written by the ponder indexer — projects,
--     stages, contributions, stage_events, rounds, applications, assets,
--     registry_state. Financial truth stays on chain, so client roles get
--     SELECT only and these tables are never writable from the app.
--   * writable application data — offchain builder drafts and the shared
--     IPFS/metadata cache. These are the only tables client roles may write,
--     and only behind row-level security.
--
-- Ordering: `pnpm indexer` creates the chain-derived tables, and it may not
-- have run when this migration is applied. Every statement that touches them
-- is guarded, so the migration succeeds either way — the guarded statements
-- are no-ops until the tables exist. Re-run the migration after the first
-- indexer boot (or on a database that already has them) to pick up grants and
-- the read-model view.
--
-- Assumes ponder's default schema (`public`) and a Supabase database where
-- migrations run as `postgres`.

-- ─────────────────────────────────────────────────────────────────────────────
-- Wallet helper: the address that owns a row, taken from the Supabase Auth
-- JWT (`request.jwt.claims`). Wallet adapters that put the address in a
-- `wallet`/`wallet_address` claim are preferred; `sub` is the fallback for
-- email-less SIWE users whose auth user id is the address. Returns NULL for
-- unauthenticated requests, which makes every owner-scoped policy fail closed.
-- ─────────────────────────────────────────────────────────────────────────────
create schema if not exists app;

create or replace function app.current_wallet()
returns text
language sql
stable
as $$
  select nullif(
    lower(
      coalesce(
        current_setting('request.jwt.claims', true)::jsonb ->> 'wallet',
        current_setting('request.jwt.claims', true)::jsonb ->> 'wallet_address',
        current_setting('request.jwt.claims', true)::jsonb ->> 'sub'
      )
    ),
    ''
  );
$$;

comment on function app.current_wallet() is
  'Lowercase 0x wallet from the request JWT (wallet claim, else sub); NULL when unauthenticated.';

grant usage on schema app to anon, authenticated, service_role;
grant execute on function app.current_wallet() to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Writable application data
-- ─────────────────────────────────────────────────────────────────────────────

-- Offchain campaign draft (Chunk 5: create/edit a draft before publishing).
-- `owner` is the lowercase wallet from the JWT; `project_id` is filled in once
-- the draft has been published onchain — no foreign key, because that id lives
-- in the chain-derived `projects` table.
create table if not exists public.drafts (
  id uuid primary key default gen_random_uuid(),
  owner text not null,
  kind text not null default 'project',
  project_id bigint,
  title text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.drafts is
  'Offchain builder drafts; one owner wallet per row, enforced by RLS.';

create index if not exists drafts_owner_idx
  on public.drafts (lower(owner), updated_at desc);

-- Shared cache for IPFS/HTTP metadata referenced by projects, stages and
-- rounds. Readable by everyone, written only by the service role (BYPASSRLS):
-- there is deliberately no insert/update policy for client roles.
create table if not exists public.metadata_cache (
  uri text primary key,
  content_hash text,
  payload jsonb not null default '{}'::jsonb,
  fetched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.metadata_cache is
  'Cached project/stage/round metadata keyed by URI; chain holds only its hash.';

create index if not exists metadata_cache_hash_idx
  on public.metadata_cache (content_hash);

-- ─────────────────────────────────────────────────────────────────────────────
-- Client roles lose write access to everything in `public`, now and for
-- tables created later (ponder's chain-derived tables are created after this
-- migration and must stay read-only for app roles).
-- ─────────────────────────────────────────────────────────────────────────────
alter default privileges in schema public
  revoke insert, update, delete, truncate, references, trigger
  on tables from anon, authenticated;
alter default privileges in schema public
  revoke usage, select, update
  on sequences from anon, authenticated;

do $$
declare
  rel text;
begin
  for rel in
    select format('%I.%I', schemaname, tablename) from pg_tables where schemaname = 'public'
  loop
    execute format(
      'revoke insert, update, delete, truncate on table %s from anon, authenticated',
      rel
    );
  end loop;

  for rel in
    select format('%I.%I', schemaname, sequencename) from pg_sequences where schemaname = 'public'
  loop
    execute format(
      'revoke usage, select, update on sequence %s from anon, authenticated',
      rel
    );
  end loop;
end $$;

-- The chain-derived read model stays queryable by everyone (project pages,
-- round lists load from it), but only through SELECT — not even the server-side
-- service role may write it: ponder's own database role is the only writer.
-- Guarded, because ponder creates these tables when it first boots.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'projects', 'stages', 'contributions', 'stage_events',
    'rounds', 'applications', 'assets', 'registry_state'
  ]
  loop
    if to_regclass('public.' || tbl) is not null then
      execute format(
        'grant select on table public.%I to anon, authenticated, service_role',
        tbl
      );
      execute format(
        'revoke insert, update, delete, truncate on table public.%I from anon, authenticated, service_role',
        tbl
      );
    end if;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row-level security: the only client-writable tables.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.drafts enable row level security;
alter table public.metadata_cache enable row level security;

drop policy if exists drafts_select on public.drafts;
create policy drafts_select
  on public.drafts for select
  to authenticated
  using (lower(owner) = app.current_wallet());

drop policy if exists drafts_insert on public.drafts;
create policy drafts_insert
  on public.drafts for insert
  to authenticated
  with check (lower(owner) = app.current_wallet());

drop policy if exists drafts_update on public.drafts;
create policy drafts_update
  on public.drafts for update
  to authenticated
  using (lower(owner) = app.current_wallet())
  with check (lower(owner) = app.current_wallet());

drop policy if exists drafts_delete on public.drafts;
create policy drafts_delete
  on public.drafts for delete
  to authenticated
  using (lower(owner) = app.current_wallet());

drop policy if exists metadata_cache_select on public.metadata_cache;
create policy metadata_cache_select
  on public.metadata_cache for select
  to anon, authenticated
  using (true);

grant select on table public.drafts, public.metadata_cache to anon, authenticated;
grant insert, update, delete on table public.drafts to authenticated;
-- The server (service role) owns writes for both app tables; it is not a
-- client role, so RLS does not gate it — scope drafts by owner in server code.
grant select, insert, update, delete on table public.drafts, public.metadata_cache
  to service_role;

-- Keep updated_at honest without trusting the client.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists drafts_set_updated_at on public.drafts;
create trigger drafts_set_updated_at
  before update on public.drafts
  for each row execute function public.set_updated_at();

drop trigger if exists metadata_cache_set_updated_at on public.metadata_cache;
create trigger metadata_cache_set_updated_at
  before update on public.metadata_cache
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Read-model view over the chain-derived `stages` table.
--
-- Mirrors the table's columns one for one (Postgres names: `stage_number`,
-- `delivery_deadline`, …; ponder's GraphQL layer exposes the same fields in
-- camelCase). `security_invoker` makes the view run as the caller, so it can
-- never be used to widen access beyond the base table's grants.
--
-- Created only once `public.stages` exists — see the ordering note at the top.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.stages') is null then
    raise notice 'stage_read_model skipped: public.stages does not exist yet — run `pnpm indexer`, then re-run this migration';
    return;
  end if;

  execute $view$
    create or replace view public.stage_read_model
      with (security_invoker = on)
    as select
      address,
      project_id,
      stage_number,
      builder,
      asset,
      goal,
      deadline,
      delivery_deadline,
      raised,
      claimed,
      cancelled,
      review_state,
      submitted_at,
      rejected_at,
      evidence_uri,
      evidence_hash,
      review_reason,
      terms_uri,
      terms_hash,
      updated_at_block,
      updated_at
    from public.stages
  $view$;

  execute 'comment on view public.stage_read_model is ' ||
    quote_literal('Chain-derived stage read model over public.stages; read-only (security invoker).');
  execute 'grant select on table public.stage_read_model to anon, authenticated, service_role';
end $$;
