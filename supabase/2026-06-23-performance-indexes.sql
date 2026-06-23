create extension if not exists pg_trgm;

create index if not exists document_activity_account_modified_at_desc_idx
  on public.document_activity (account_id, modified_at desc);

create index if not exists document_activity_account_action_lower_idx
  on public.document_activity (account_id, lower(trim(action)));

create index if not exists document_activity_account_module_lower_idx
  on public.document_activity (account_id, lower(trim(module)));

create index if not exists document_activity_account_modified_by_lower_idx
  on public.document_activity (account_id, lower(trim(modified_by_id)));

create index if not exists document_activity_document_id_trgm_idx
  on public.document_activity using gin (document_id gin_trgm_ops);

create index if not exists document_activity_document_name_trgm_idx
  on public.document_activity using gin (document_name gin_trgm_ops);

create index if not exists document_activity_modified_by_trgm_idx
  on public.document_activity using gin (modified_by_id gin_trgm_ops);

create index if not exists modifier_mappings_account_modified_by_idx
  on public.modifier_mappings (account_id, modified_by_id);

create index if not exists modifier_mappings_display_name_trgm_idx
  on public.modifier_mappings using gin (display_name gin_trgm_ops);

analyze public.document_activity;
analyze public.modifier_mappings;
