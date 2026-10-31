# Brightloop Supabase setup

The migration is local only until you apply it. Review `migrations/20261031000000_brightloop_database_foundation.sql` before running it in the Supabase SQL Editor. Do not paste or commit secret keys.

## Apply the schema

1. Open Supabase Dashboard → SQL Editor.
2. Paste the complete migration file and run it against the intended project.
3. Confirm the `app_settings` row has `default_currency = INR`, and verify RLS is enabled on all tables.
4. Enable email confirmation and set the allowed Site URL and redirect URLs before inviting users.

Public Auth signups always create `CUSTOMER` profiles. The signup trigger reads only `full_name` from user metadata and ignores role metadata. It provisions the matching customer row. Staff provisioning uses the Edge Function; it invites a new Auth identity, changes the generated profile to `STAFF`, and removes its temporary customer row.

## Create the first ADMIN

1. Create the initial account privately through Supabase Dashboard → Authentication → Users (or arrange an invite through a trusted administrator). Do not put its credentials in source code.
2. Copy that Auth user's UUID from the Dashboard.
3. In SQL Editor, run the following transaction after replacing the UUID literal:

```sql
begin;
insert into public.profiles (id, full_name, role, is_active)
select id, coalesce(raw_user_meta_data ->> 'full_name', ''), 'ADMIN', true
from auth.users
where id = 'REPLACE_WITH_AUTH_USER_UUID'::uuid
on conflict (id) do update set role = 'ADMIN', is_active = true;
delete from public.customers where profile_id = 'REPLACE_WITH_AUTH_USER_UUID'::uuid;
commit;
```

Use this bootstrap only for the initial administrator. No credential or admin role is hardcoded in the app. The client cannot change its own profile role.

## Deploy the staff account function

Deploy `functions/staff-accounts/index.ts` with `supabase functions deploy staff-accounts` after linking the project. Keep JWT verification enabled. For local function testing, use `supabase/functions/.env` (ignored by Git) for any local-only values; do not copy a secret into Vite's `.env.local`. The function uses the caller's Auth JWT to verify an active `ADMIN` profile before performing any Auth Admin operation. The secret key is read only inside the Edge Function runtime from Supabase's injected `SUPABASE_SECRET_KEYS` (with legacy key support); it is never part of Vite or browser variables. Set the Edge Function `APP_ORIGIN` secret to the exact frontend origin if you want origin restriction. Invoke with POST JSON:

- Create invitation: `{"action":"create","email":"staff@example.com","full_name":"Staff Name"}`
- Activate/deactivate an existing staff profile: `{"action":"set_active","user_id":"AUTH_USER_UUID","active":false}`

Deactivating a staff profile makes the database role helper return no role, blocking its RLS access. The staff-account endpoint does not delete users.

## Invoice workflow

Use the atomic `create_quotation_with_items`, `create_subscription_with_items`, and `create_invoice_with_items` RPCs for header-and-line creation; direct client INSERT is revoked for those linked records. It creates a draft; call `issue_invoice(invoice_id)` to issue it. Successful payments are recorded against issued invoices, and invoice totals, paid amount, outstanding balance, and payment status are maintained from snapshots. Staff/customer catalog reads should use `products_catalog`; admins can retrieve costs through `admin_list_products_with_cost()`. Use `invoice_status_view.current_status` for a status that reflects the current date and can show newly overdue invoices without a scheduled job.

## INR formatter

Import `formatInr` from `src/lib/currency.js`. Supabase `NUMERIC(12,2)` values may arrive as strings; the formatter accepts numbers or numeric strings and returns `en-IN` INR formatting with two decimal places.
