drop index if exists public.document_activity_dedupe_idx;

alter table public.uploads
  drop column if exists duplicate_count;
