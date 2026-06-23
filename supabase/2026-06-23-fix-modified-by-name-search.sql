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
    and (p_module is null or lower(trim(da.module)) = lower(trim(p_module)))
    and (p_action is null or lower(trim(da.action)) = lower(trim(p_action)))
    and (
      p_modified_by is null
      or lower(trim(da.modified_by_id)) like '%' || lower(trim(p_modified_by)) || '%'
      or lower(trim(coalesce(mm.display_name, ''))) like '%' || lower(trim(p_modified_by)) || '%'
      or lower(trim(coalesce(mm.display_name, da.modified_by_id))) like '%' || lower(trim(p_modified_by)) || '%'
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
    and (p_module is null or lower(trim(da.module)) = lower(trim(p_module)))
    and (p_action is null or lower(trim(da.action)) = lower(trim(p_action)))
    and (
      p_modified_by is null
      or lower(trim(da.modified_by_id)) like '%' || lower(trim(p_modified_by)) || '%'
      or lower(trim(coalesce(mm.display_name, ''))) like '%' || lower(trim(p_modified_by)) || '%'
      or lower(trim(coalesce(mm.display_name, da.modified_by_id))) like '%' || lower(trim(p_modified_by)) || '%'
    )
    and (p_from is null or da.modified_at >= p_from)
    and (p_to is null or da.modified_at <= p_to);
$$;
