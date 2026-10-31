# Brightloop Supabase setup

These migrations are local project files and have **not** been applied. The schema is designed for INR only; monetary columns use fixed precision `NUMERIC(12,2)` (tax percentages use `NUMERIC(5,2)`). Do not put a Supabase service-role/secret key in the Vite app or `.env.local`.

## Fresh-project migration sequence

Because the original foundation migration is still unapplied, use a **new, empty Supabase project** and apply both files in timestamp order before enabling application traffic:

1. `supabase/migrations/20261031000000_brightloop_database_foundation.sql`
2. `supabase/migrations/20261031010000_brightloop_security_workflows.sql`

Prefer the Supabase CLI migration workflow for a linked project (`supabase link`, then `supabase db push`). Alternatively, run each complete SQL file in order through SQL Editor on a new project. Choose one method: SQL Editor execution does not automatically update the CLI migration history, so reconcile that history before any later `db push`. Do not run the second file alone, and do not rerun either file on a database where its objects already exist. Review the migration output for errors before configuring the app. These changes are local only; no migration was applied as part of this work.

The second migration creates exactly-one-ADMIN enforcement and the hardened workflows. Enable email confirmation and configure the Auth Site URL and redirect URLs before inviting users. Add the frontend's local and production `/reset-password` URLs to the Auth redirect allow-list so recovery links can return to the password update screen. Configure `APP_ORIGIN` for the Edge Function to the exact frontend origin.

## First administrator and replacement

Public signup creates only `CUSTOMER`; role metadata supplied by a browser is ignored. To bootstrap the first administrator securely:

1. Create the user's Auth identity privately in Supabase Dashboard → Authentication → Users. Do not hardcode or commit credentials.
2. Copy that user's Auth UUID.
3. Run the following once in SQL Editor after replacing the UUID. The unique partial index rejects a second ADMIN.

```sql
begin;
update public.profiles
set role = 'ADMIN', is_active = true
where id = 'REPLACE_WITH_AUTH_USER_UUID'::uuid
  and role = 'CUSTOMER';
delete from public.customers where profile_id = 'REPLACE_WITH_AUTH_USER_UUID'::uuid;
commit;
```

For a controlled administrator replacement, create and verify the replacement Auth identity first. In one SQL Editor transaction, demote and deactivate the old ADMIN, then promote and activate the replacement profile and remove its customer row. Verify both profile IDs and the resulting single ADMIN before commit. Example:

```sql
begin;
update public.profiles set role = 'STAFF', is_active = false
where id = 'OLD_ADMIN_AUTH_UUID'::uuid and role = 'ADMIN';
update public.profiles set role = 'ADMIN', is_active = true
where id = 'NEW_ADMIN_AUTH_UUID'::uuid and role = 'CUSTOMER';
delete from public.customers where profile_id = 'NEW_ADMIN_AUTH_UUID'::uuid;
commit;
```

Do not use this replacement procedure unless both UUIDs have been verified in `auth.users` and the new account is under the organization's control. If either update affects zero rows, stop and roll back. The partial unique index guarantees no committed state can contain two ADMIN profiles.

## Staff invitations and deactivation

Deploy `supabase/functions/staff-accounts/index.ts` only after the migrations have been applied and reviewed. Keep platform JWT verification enabled. The function verifies the caller's Auth user and active ADMIN profile, and its database promotion RPC independently verifies the same Admin on the server side. The function uses Supabase's server-side secret key only in the Edge Function runtime; never expose it to the browser. For local function development, use an ignored `supabase/functions/.env` file.

Create an invitation with POST JSON:

```json
{"action":"create","email":"staff@example.com","full_name":"Staff Name","idempotency_key":"GENERATE-A-NEW-UUID"}
```

A retry after a timeout must reuse the same `idempotency_key`. A different request uses a new UUID; because email is unique in the request ledger, an abandoned request for the same email must first be resolved by an administrator. The database stores the Admin actor, normalized email, request state, and Auth user reference, and prevents a second pending/completed invite for the same email. An invitation remains a CUSTOMER until the Admin-verified promotion transaction succeeds; a failed promotion is safe to retry and is not rolled back by deleting the Auth identity.

Activate/deactivate with:

```json
{"action":"set_active","user_id":"STAFF_AUTH_UUID","active":false}
```

Deactivation first marks the profile inactive, which immediately removes application access under RLS, then applies a long Auth ban to prevent future sign-ins/refreshes. Reactivation lifts the ban before restoring database access. Supabase access JWTs are stateless and may remain cryptographically valid until they expire; RLS checks the inactive profile on every database request, so those tokens do not retain Brightloop data access. Auth session revocation behavior depends on the Auth service's token/session lifecycle; the endpoint does not claim that an already-issued access JWT is erased.

## Tax, invoice, and quotation workflow

Create quotations and invoices with `create_quotation_with_items` and `create_invoice_with_items`; create subscriptions with `create_subscription_with_items`. The RPCs accept tax-rate IDs, validate that the rate is configured and active, and calculate immutable line tax snapshots. A subscription's customer and a linked invoice's customer must match. Direct client inserts into financial line items and updates to financial totals/status are restricted; line items can be edited only while their parent remains a draft. Issue invoices using `issue_invoice(uuid)`. Use `void_invoice(uuid)` for eligible unpaid invoices; financial documents are not hard-deleted. Retire catalog entries by setting `is_active = false`; historical product/plan references are protected by restrictive foreign keys.

Recurring invoice generation is handled by `generate_due_recurring_invoices(p_as_of, p_limit)`. It locks due subscriptions, uses canonical cycle boundaries, enforces a unique period per subscription, blocks overlaps and unresolved prior balances, and is safe to retry. Invoke it only from a trusted scheduled server-side job using the service role; never call it with a service key from the browser. The database function is ready for a future scheduler, but no scheduler has been configured or run here. Payment of an eligible recurring invoice records an idempotent renewal event and advances subscription expiry. If a subscription was closed after an invoice was issued, that invoice can still settle but will not reopen the closed subscription.

Staff/admin can manage configured tax rates; financial records store the selected rate and calculated amount at document creation. Later tax-rate edits do not change existing invoice or quotation snapshots. Discounts are selected by ID, calculated in SQL, reserved transactionally for invoices, limited once per invoice, and reversed when an eligible invoice is voided.

## Currency formatter

Import `formatInr` from `src/lib/currency.js`. It accepts finite numbers or numeric strings (including Supabase `NUMERIC` strings); null, blank strings, booleans, and non-finite values throw `TypeError` rather than silently formatting as zero.
