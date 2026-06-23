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
