-- Programmazione Collettiva: schema concorrente e migrazione dal vecchio app_state.
-- Lo script e' idempotente e non elimina il vecchio archivio JSON.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_redazione_coordinator()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = any (
    array[
      'm.minnucci@collettiva.it',
      's.milani@collettiva.it',
      'm.nicoletti@collettiva.it'
    ]::text[]
  );
$$;

revoke all on function private.is_redazione_coordinator() from public;
grant execute on function private.is_redazione_coordinator() to authenticated;

create table if not exists public.app_config (
  id text primary key,
  bands jsonb not null default '[]'::jsonb,
  authors jsonb not null default '[]'::jsonb,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_email text
);

create table if not exists public.contents (
  id text primary key,
  title text not null,
  content_date date not null,
  slot text not null,
  author text not null default '',
  status text not null default 'idea',
  tags jsonb not null default '[]'::jsonb,
  live boolean not null default false,
  appointment boolean not null default false,
  sort_order numeric not null default 0,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_email text,
  deleted_at timestamptz,
  deleted_by uuid,
  deleted_by_email text,
  import_batch_id text,
  source_file text,
  source_sheet text,
  source_cell text,
  source_hash text,
  constraint contents_tags_array check (jsonb_typeof(tags) = 'array')
);

create index if not exists contents_calendar_idx
on public.contents (content_date, slot, sort_order)
where deleted_at is null;

create index if not exists contents_deleted_idx
on public.contents (deleted_at desc)
where deleted_at is not null;

create unique index if not exists contents_source_cell_unique
on public.contents (source_file, source_sheet, source_cell)
where source_file is not null and source_sheet is not null and source_cell is not null;

create table if not exists public.content_history (
  event_id bigint generated always as identity primary key,
  content_id text not null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  snapshot jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by uuid,
  changed_by_email text
);

create index if not exists content_history_content_idx
on public.content_history (content_id, changed_at desc);

create or replace function private.set_redazione_metadata()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_at := coalesce(new.created_at, now());
  else
    new.version := old.version + 1;
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();
  new.updated_by_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  if tg_table_name = 'contents' then
    if new.deleted_at is not null
      and (tg_op = 'INSERT' or old.deleted_at is null)
    then
      new.deleted_by := auth.uid();
      new.deleted_by_email := lower(coalesce(auth.jwt() ->> 'email', ''));
    elsif new.deleted_at is null then
      new.deleted_by := null;
      new.deleted_by_email := null;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.set_redazione_metadata() from public;

drop trigger if exists app_config_metadata on public.app_config;
create trigger app_config_metadata
before insert or update on public.app_config
for each row execute function private.set_redazione_metadata();

drop trigger if exists contents_metadata on public.contents;
create trigger contents_metadata
before insert or update on public.contents
for each row execute function private.set_redazione_metadata();

create or replace function private.log_content_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.content_history (
    content_id,
    action,
    snapshot,
    changed_by,
    changed_by_email
  )
  values (
    coalesce(new.id, old.id),
    tg_op,
    case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end,
    auth.uid(),
    lower(coalesce(auth.jwt() ->> 'email', ''))
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.log_content_change() from public;
revoke all on function private.log_content_change() from anon;
revoke all on function private.log_content_change() from authenticated;

drop trigger if exists contents_history on public.contents;
create trigger contents_history
after insert or update or delete on public.contents
for each row execute function private.log_content_change();

alter table public.app_config enable row level security;
alter table public.contents enable row level security;
alter table public.content_history enable row level security;

grant select on public.app_config to anon;
grant select, insert, update on public.app_config to authenticated;
grant select on public.contents to anon;
grant select, insert, update on public.contents to authenticated;
grant select on public.content_history to authenticated;

drop policy if exists "redazione config public read" on public.app_config;
drop policy if exists "redazione config coordinator read" on public.app_config;
drop policy if exists "redazione config coordinator insert" on public.app_config;
drop policy if exists "redazione config coordinator update" on public.app_config;

create policy "redazione config public read"
on public.app_config for select to anon
using (id = 'main');

create policy "redazione config coordinator read"
on public.app_config for select to authenticated
using (id = 'main' and private.is_redazione_coordinator());

create policy "redazione config coordinator insert"
on public.app_config for insert to authenticated
with check (id = 'main' and private.is_redazione_coordinator());

create policy "redazione config coordinator update"
on public.app_config for update to authenticated
using (id = 'main' and private.is_redazione_coordinator())
with check (id = 'main' and private.is_redazione_coordinator());

drop policy if exists "redazione contents public read" on public.contents;
drop policy if exists "redazione contents coordinator read" on public.contents;
drop policy if exists "redazione contents coordinator insert" on public.contents;
drop policy if exists "redazione contents coordinator update" on public.contents;

create policy "redazione contents public read"
on public.contents for select to anon
using (deleted_at is null);

create policy "redazione contents coordinator read"
on public.contents for select to authenticated
using (private.is_redazione_coordinator());

create policy "redazione contents coordinator insert"
on public.contents for insert to authenticated
with check (private.is_redazione_coordinator());

create policy "redazione contents coordinator update"
on public.contents for update to authenticated
using (private.is_redazione_coordinator())
with check (private.is_redazione_coordinator());

drop policy if exists "redazione history coordinator read" on public.content_history;
create policy "redazione history coordinator read"
on public.content_history for select to authenticated
using (private.is_redazione_coordinator());

insert into public.app_config (id, bands, authors)
select id, bands, authors
from public.app_state
where id = 'main'
on conflict (id) do nothing;

insert into public.contents (
  id,
  title,
  content_date,
  slot,
  author,
  status,
  tags,
  live,
  appointment,
  sort_order
)
select
  item ->> 'id',
  coalesce(item ->> 'title', ''),
  (item ->> 'date')::date,
  coalesce(item ->> 'slot', ''),
  coalesce(item ->> 'author', ''),
  coalesce(item ->> 'status', 'idea'),
  case
    when jsonb_typeof(item -> 'tags') = 'array' then item -> 'tags'
    else '[]'::jsonb
  end,
  coalesce((item ->> 'live')::boolean, false),
  coalesce((item ->> 'appointment')::boolean, false),
  coalesce((item ->> 'order')::numeric, 0)
from public.app_state
cross join lateral jsonb_array_elements(items) as item
where app_state.id = 'main'
  and item ? 'id'
  and nullif(item ->> 'date', '') is not null
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'contents'
  ) then
    alter publication supabase_realtime add table public.contents;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'app_config'
  ) then
    alter publication supabase_realtime add table public.app_config;
  end if;
end;
$$;
