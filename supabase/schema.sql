create extension if not exists "pgcrypto";

create type app_role as enum ('admin', 'subadmin', 'user');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role app_role not null default 'user',
  created_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.account_users (
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (account_id, user_id)
);

create table public.uploads (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  uploaded_by uuid not null references public.profiles(id),
  file_name text not null,
  row_count integer not null default 0,
  imported_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.modifier_mappings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  modified_by_id text not null,
  display_name text not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (account_id, modified_by_id)
);

create table public.document_activity (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  upload_id uuid references public.uploads(id) on delete set null,
  document_id text not null,
  document_name text not null,
  module text not null,
  action text not null,
  details text not null default '',
  modified_by_id text not null,
  modified_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index document_activity_account_modified_at_idx
  on public.document_activity (account_id, modified_at desc);

create index document_activity_search_idx
  on public.document_activity (account_id, document_id, module, action, modified_by_id);

create or replace view public.document_activity_view as
select
  da.id,
  da.account_id,
  da.upload_id,
  da.document_id,
  da.document_name,
  da.module,
  da.action,
  da.details,
  da.modified_by_id,
  coalesce(mm.display_name, da.modified_by_id) as modified_by_name,
  da.modified_at,
  da.created_at
from public.document_activity da
left join public.modifier_mappings mm
  on mm.account_id = da.account_id
 and mm.modified_by_id = da.modified_by_id;

create or replace function public.current_user_role()
returns app_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.can_access_account(target_account_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.account_users
    where account_id = target_account_id
      and user_id = auth.uid()
  ) or public.current_user_role() = 'admin'
$$;

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.account_users enable row level security;
alter table public.uploads enable row level security;
alter table public.modifier_mappings enable row level security;
alter table public.document_activity enable row level security;

create policy "Profiles are visible to authenticated users"
on public.profiles for select
to authenticated
using (true);

create policy "Admins manage profiles"
on public.profiles for all
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "Users can see accessible accounts"
on public.accounts for select
to authenticated
using (public.can_access_account(id));

create policy "Admins manage accounts"
on public.accounts for all
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "Users can see memberships"
on public.account_users for select
to authenticated
using (user_id = auth.uid() or public.current_user_role() = 'admin');

create policy "Admins manage memberships"
on public.account_users for all
to authenticated
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "Accessible users can read uploads"
on public.uploads for select
to authenticated
using (public.can_access_account(account_id));

create policy "Admins create uploads"
on public.uploads for insert
to authenticated
with check (public.current_user_role() = 'admin' and public.can_access_account(account_id));

create policy "Admins update uploads"
on public.uploads for update
to authenticated
using (public.current_user_role() = 'admin' and public.can_access_account(account_id))
with check (public.current_user_role() = 'admin' and public.can_access_account(account_id));

create policy "Accessible users read modifier mappings"
on public.modifier_mappings for select
to authenticated
using (public.can_access_account(account_id));

create policy "Admins manage modifier mappings"
on public.modifier_mappings for all
to authenticated
using (public.current_user_role() = 'admin' and public.can_access_account(account_id))
with check (public.current_user_role() = 'admin' and public.can_access_account(account_id));

create policy "Accessible users read document activity"
on public.document_activity for select
to authenticated
using (public.can_access_account(account_id));

create policy "Admins insert document activity"
on public.document_activity for insert
to authenticated
with check (public.current_user_role() = 'admin' and public.can_access_account(account_id));

create or replace function public.get_document_modules(target_account_id uuid)
returns text[]
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(array_agg(module order by module), array[]::text[])
  from (
    select distinct module
    from public.document_activity
    where account_id = target_account_id
      and public.can_access_account(target_account_id)
      and module <> ''
  ) distinct_modules;
$$;

create or replace function public.get_document_actions(target_account_id uuid)
returns text[]
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(array_agg(action order by action), array[]::text[])
  from (
    select distinct action
    from public.document_activity
    where account_id = target_account_id
      and public.can_access_account(target_account_id)
      and action <> ''
  ) distinct_actions;
$$;

create or replace function public.search_document_activity(
  target_account_id uuid,
  p_document_id text default null,
  p_document_name text default null,
  p_module text default null,
  p_action text default null,
  p_modified_by text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns table (
  id uuid,
  account_id uuid,
  upload_id uuid,
  document_id text,
  document_name text,
  module text,
  action text,
  details text,
  modified_by_id text,
  modified_by_name text,
  modified_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    da.id,
    da.account_id,
    da.upload_id,
    da.document_id,
    da.document_name,
    da.module,
    da.action,
    da.details,
    da.modified_by_id,
    coalesce(mm.display_name, da.modified_by_id) as modified_by_name,
    da.modified_at,
    da.created_at
  from public.document_activity da
  left join public.modifier_mappings mm
    on mm.account_id = da.account_id
   and mm.modified_by_id = da.modified_by_id
  where da.account_id = target_account_id
    and public.can_access_account(target_account_id)
    and (p_document_id is null or da.document_id ilike '%' || p_document_id || '%')
    and (p_document_name is null or da.document_name ilike '%' || p_document_name || '%')
    and (p_module is null or da.module = p_module)
    and (p_action is null or da.action = p_action)
    and (
      p_modified_by is null
      or da.modified_by_id ilike '%' || p_modified_by || '%'
      or coalesce(mm.display_name, '') ilike '%' || p_modified_by || '%'
    )
    and (p_from is null or da.modified_at >= p_from)
    and (p_to is null or da.modified_at <= p_to)
  order by da.modified_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 2500))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.count_document_activity(
  target_account_id uuid,
  p_document_id text default null,
  p_document_name text default null,
  p_module text default null,
  p_action text default null,
  p_modified_by text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 100,
  p_offset integer default 0
)
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select count(*)
  from public.document_activity da
  left join public.modifier_mappings mm
    on mm.account_id = da.account_id
   and mm.modified_by_id = da.modified_by_id
  where da.account_id = target_account_id
    and public.can_access_account(target_account_id)
    and (p_document_id is null or da.document_id ilike '%' || p_document_id || '%')
    and (p_document_name is null or da.document_name ilike '%' || p_document_name || '%')
    and (p_module is null or da.module = p_module)
    and (p_action is null or da.action = p_action)
    and (
      p_modified_by is null
      or da.modified_by_id ilike '%' || p_modified_by || '%'
      or coalesce(mm.display_name, '') ilike '%' || p_modified_by || '%'
    )
    and (p_from is null or da.modified_at >= p_from)
    and (p_to is null or da.modified_at <= p_to);
$$;
