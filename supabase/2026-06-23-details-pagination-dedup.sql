alter table public.document_activity
  add column if not exists details text not null default '';

alter table public.uploads
  add column if not exists imported_count integer not null default 0,
  add column if not exists duplicate_count integer not null default 0;

drop view if exists public.document_activity_view;

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

create unique index if not exists document_activity_dedupe_idx
on public.document_activity (
  account_id,
  document_id,
  document_name,
  module,
  action,
  modified_by_id,
  modified_at
);

create index if not exists document_activity_module_idx
  on public.document_activity (account_id, module);

create index if not exists document_activity_action_idx
  on public.document_activity (account_id, action);

drop policy if exists "Admins update uploads" on public.uploads;

create policy "Admins update uploads"
on public.uploads for update
to authenticated
using (public.current_user_role() = 'admin' and public.can_access_account(account_id))
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
