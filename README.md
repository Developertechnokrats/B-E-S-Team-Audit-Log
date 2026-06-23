# Document Activity Dashboard

Netlify + Supabase dashboard for account-based document activity uploads and filtering.

## Features

- Supabase Auth login
- Admin, subadmin, and user roles
- Users can belong to multiple accounts
- Admin can switch accounts and upload CSV/XLSX data for any account
- Users can view and filter assigned account data
- Admin can map `Modified By (Id)` values to display names
- Supabase SQL schema and RLS policies included

## Local setup

```bash
npm install
cp .env.example .env
npm run dev
```

Add your Supabase URL and anon key to `.env`.

## Supabase setup

Run `supabase/schema.sql` in the Supabase SQL editor. After creating your first auth user, insert a matching row into `profiles` with role `admin`.

Expected upload headers:

```text
Document ID, Document Name, Module, Action, Modified By (Id), Date & Time
```
