-- Brightloop hardening and billing workflows.
-- Apply only after 20261031000000_brightloop_database_foundation.sql on a fresh project.
-- The first migration has not been applied yet; run both before enabling application traffic.
begin;

-- Exactly one administrator may exist. Replacement is a controlled SQL Editor operation.
create unique index profiles_single_admin_uidx on public.profiles ((role)) where role = 'ADMIN';

-- Customer records created by staff cannot be linked to an arbitrary Auth identity.
revoke insert on public.customers from authenticated;
grant insert (email, phone, business_name, tax_identifier, billing_address, shipping_address, notes) on public.customers to authenticated;

-- Link tax configuration to each line; tax_rate remains a database-generated historical snapshot.
alter table public.quotation_items add column tax_rate_id uuid;
alter table public.invoice_items add column tax_rate_id uuid;
alter table public.subscription_items add column tax_rate_id uuid;
alter table public.quotation_items add constraint quotation_items_tax_rate_fk foreign key (tax_rate_id) references public.tax_rates(id) on delete restrict;
alter table public.invoice_items add constraint invoice_items_tax_rate_fk foreign key (tax_rate_id) references public.tax_rates(id) on delete restrict;
alter table public.subscription_items add constraint subscription_items_tax_rate_fk foreign key (tax_rate_id) references public.tax_rates(id) on delete restrict;

-- Product and plan references on financial snapshots are preserved; catalog records are soft-deleted.
alter table public.quotation_items drop constraint quotation_items_product_id_fkey;
alter table public.quotation_items add constraint quotation_items_product_id_fkey foreign key (product_id) references public.products(id) on delete restrict;
alter table public.quotation_items drop constraint quotation_items_plan_id_fkey;
alter table public.quotation_items add constraint quotation_items_plan_id_fkey foreign key (plan_id) references public.plans(id) on delete restrict;
alter table public.invoice_items drop constraint invoice_items_product_id_fkey;
alter table public.invoice_items add constraint invoice_items_product_id_fkey foreign key (product_id) references public.products(id) on delete restrict;
alter table public.invoice_items drop constraint invoice_items_plan_id_fkey;
alter table public.invoice_items add constraint invoice_items_plan_id_fkey foreign key (plan_id) references public.plans(id) on delete restrict;
alter table public.subscription_items drop constraint subscription_items_product_id_fkey;
alter table public.subscription_items add constraint subscription_items_product_id_fkey foreign key (product_id) references public.products(id) on delete restrict;
alter table public.subscription_items drop constraint subscription_items_variant_id_fkey;
alter table public.subscription_items add constraint subscription_items_variant_id_fkey foreign key (variant_id) references public.product_variants(id) on delete restrict;

-- A composite FK prevents a variant from being moved to a different product after it is referenced.
alter table public.product_variants add constraint product_variants_id_product_id_uniq unique (id, product_id);
alter table public.subscription_items add constraint subscription_items_variant_product_fk
  foreign key (variant_id, product_id) references public.product_variants(id, product_id) on update restrict on delete restrict;

-- Discount selection is explicit; amount remains a server-calculated snapshot.
alter table public.quotations add column discount_id uuid;
alter table public.invoices add column discount_id uuid;
alter table public.quotations add constraint quotations_discount_fk foreign key (discount_id) references public.discounts(id) on delete restrict;
alter table public.invoices add constraint invoices_discount_fk foreign key (discount_id) references public.discounts(id) on delete restrict;
create index quotations_discount_idx on public.quotations(discount_id) where discount_id is not null;
create index invoices_discount_idx on public.invoices(discount_id) where discount_id is not null;

-- Record safe, repeatable staff invitations and profile operations.
create table public.staff_invite_requests (
  idempotency_key uuid primary key,
  email text not null unique check (email = lower(trim(email)) and length(trim(email)) > 0),
  full_name text not null check (length(trim(full_name)) between 1 and 160),
  requested_by uuid not null references public.profiles(id) on delete restrict,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  status text not null default 'PENDING' check (status in ('PENDING', 'COMPLETED', 'FAILED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.staff_invite_requests enable row level security;
revoke all on table public.staff_invite_requests from public, anon, authenticated;
grant all on table public.staff_invite_requests to service_role;
create policy staff_invite_requests_no_client_select on public.staff_invite_requests for select to authenticated using (false);
create policy staff_invite_requests_no_client_insert on public.staff_invite_requests for insert to authenticated with check (false);
create policy staff_invite_requests_no_client_update on public.staff_invite_requests for update to authenticated using (false) with check (false);
create policy staff_invite_requests_no_client_delete on public.staff_invite_requests for delete to authenticated using (false);

-- Audit a subscription renewal once, keyed by the paid invoice that caused it.
create table public.subscription_renewals (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete restrict,
  invoice_id uuid not null unique references public.invoices(id) on delete restrict,
  previous_expiry_date date,
  renewed_until date not null,
  renewed_by uuid references public.profiles(id) on delete set null,
  renewed_at timestamptz not null default now()
);
create index subscription_renewals_subscription_idx on public.subscription_renewals(subscription_id, renewed_at desc);
alter table public.subscription_renewals enable row level security;
revoke all on table public.subscription_renewals from public, anon, authenticated;
grant select on public.subscription_renewals to authenticated;
create policy subscription_renewals_customer_or_staff_select on public.subscription_renewals for select to authenticated
using (app_private.is_staff_or_admin() or exists (
  select 1 from public.subscriptions s
  where s.id = subscription_id and app_private.can_access_customer(s.customer_id)
));
create policy subscription_renewals_no_client_insert on public.subscription_renewals for insert to authenticated with check (false);
create policy subscription_renewals_no_client_update on public.subscription_renewals for update to authenticated using (false) with check (false);
create policy subscription_renewals_no_client_delete on public.subscription_renewals for delete to authenticated using (false);

-- Recurrence uses the original start date and cycle number, avoiding monthly date drift.
alter table public.subscriptions add column billing_cycle_number integer not null default 0 check (billing_cycle_number >= 0);
alter table public.subscriptions add column notes text;
alter table public.subscriptions add constraint subscriptions_paused_at_check check (status <> 'PAUSED' or paused_at is not null);
alter table public.subscriptions add constraint subscriptions_closed_at_check check (status <> 'CLOSED' or closed_at is not null);

-- Subscription and invoice customer IDs must match for every linked invoice.
create unique index subscriptions_id_customer_uidx on public.subscriptions(id, customer_id);
alter table public.invoices add constraint invoices_subscription_customer_fk
  foreign key (subscription_id, customer_id) references public.subscriptions(id, customer_id) on delete restrict;

-- One configured discount can be applied at most once to an invoice.
alter table public.discount_usages drop constraint discount_usages_invoice_id_fkey;
alter table public.discount_usages add constraint discount_usages_invoice_id_fkey foreign key (invoice_id) references public.invoices(id) on delete restrict;
create unique index discount_usages_discount_invoice_uidx on public.discount_usages(discount_id, invoice_id) where invoice_id is not null;

-- A single applied discount is stored on each invoice and must equal the usage ledger.
alter table public.discount_usages add column is_reversed boolean not null default false;

-- Due terms are a business setting; never a floating point amount.
alter table public.app_settings add column invoice_due_days smallint not null default 7 check (invoice_due_days between 0 and 365);
grant update (invoice_due_days) on public.app_settings to authenticated;

-- Secure actor attribution for server-only staff operations. Regular user writes use auth.uid().
create or replace function public.write_audit_log()
returns trigger language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare
  target_id uuid;
  actor_id uuid;
begin
  if tg_op = 'DELETE' then target_id := old.id; else target_id := new.id; end if;
  actor_id := (select auth.uid());
  if coalesce(auth.role(), '') = 'service_role' then
    actor_id := nullif(current_setting('brightloop.audit_actor', true), '')::uuid;
  end if;
  insert into public.audit_logs(user_id, action, entity, record_id)
  values (actor_id, tg_op, tg_table_name, target_id);
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.billing_cycle_start(p_start date, p_interval public.billing_interval, p_cycle integer)
returns date language sql immutable strict
set search_path = ''
as $$
  select case p_interval
    when 'DAILY' then p_start + p_cycle
    when 'WEEKLY' then p_start + (7 * p_cycle)
    when 'MONTHLY' then (p_start + make_interval(months => p_cycle))::date
    when 'YEARLY' then (p_start + make_interval(years => p_cycle))::date
  end
$$;

create or replace function public.billing_cycle_end(p_start date, p_interval public.billing_interval, p_cycle integer)
returns date language sql immutable strict
set search_path = ''
as $$ select public.billing_cycle_start(p_start, p_interval, p_cycle + 1) - 1 $$;

alter table public.subscriptions add constraint subscriptions_cycle_date_check check (
  next_billing_date is null or next_billing_date = public.billing_cycle_start(start_date, billing_interval, billing_cycle_number)
);

-- Recalculate line taxes from an active configured rate; ignore caller-provided tax snapshots.
create or replace function public.set_document_line_amounts()
returns trigger language plpgsql
set search_path = ''
as $$
declare configured_rate numeric(5,2);
begin
  if new.tax_rate_id is null then
    configured_rate := 0;
  else
    select tr.percentage into configured_rate from public.tax_rates tr
    where tr.id = new.tax_rate_id and tr.is_active;
    if not found then raise exception 'Selected tax rate is missing or inactive'; end if;
  end if;
  new.tax_rate := configured_rate;
  new.tax_amount := round(new.quantity * new.unit_price * configured_rate / 100, 2);
  new.line_total := round(new.quantity * new.unit_price, 2) + new.tax_amount;
  return new;
end;
$$;
drop trigger quotation_item_amounts on public.quotation_items;
drop trigger invoice_item_amounts on public.invoice_items;
create trigger quotation_item_amounts before insert or update of quantity, unit_price, tax_rate_id on public.quotation_items
for each row execute function public.set_document_line_amounts();
create trigger invoice_item_amounts before insert or update of quantity, unit_price, tax_rate_id on public.invoice_items
for each row execute function public.set_document_line_amounts();

-- Tax snapshots are selected by reference; callers cannot supply an arbitrary percentage.
revoke insert (quotation_id, product_id, plan_id, description, quantity, unit_price, tax_rate, currency_code) on public.quotation_items from authenticated;
revoke update (quotation_id, product_id, plan_id, description, quantity, unit_price, tax_rate, currency_code) on public.quotation_items from authenticated;
grant insert (quotation_id, product_id, plan_id, description, quantity, unit_price, tax_rate_id, currency_code) on public.quotation_items to authenticated;
grant update (quotation_id, product_id, plan_id, description, quantity, unit_price, tax_rate_id, currency_code) on public.quotation_items to authenticated;
revoke insert (invoice_id, product_id, plan_id, description, quantity, unit_price, tax_rate, currency_code) on public.invoice_items from authenticated;
revoke update (invoice_id, product_id, plan_id, description, quantity, unit_price, tax_rate, currency_code) on public.invoice_items from authenticated;
grant insert (invoice_id, product_id, plan_id, description, quantity, unit_price, tax_rate_id, currency_code) on public.invoice_items to authenticated;
grant update (invoice_id, product_id, plan_id, description, quantity, unit_price, tax_rate_id, currency_code) on public.invoice_items to authenticated;

-- Item snapshots may only be edited while their document is still a draft.
create or replace function public.guard_document_item_mutation()
returns trigger language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare parent_status text; parent_id uuid;
begin
  if tg_table_name = 'invoice_items' then
    if tg_op='UPDATE' and new.invoice_id is distinct from old.invoice_id then raise exception 'An invoice line cannot be moved between invoices'; end if;
    parent_id := case when tg_op = 'DELETE' then old.invoice_id else new.invoice_id end;
    select i.status::text into parent_status from public.invoices i where i.id = parent_id for update;
  else
    if tg_op='UPDATE' and new.quotation_id is distinct from old.quotation_id then raise exception 'A quotation line cannot be moved between quotations'; end if;
    parent_id := case when tg_op = 'DELETE' then old.quotation_id else new.quotation_id end;
    select q.status::text into parent_status from public.quotations q where q.id = parent_id for update;
  end if;
  if parent_status is distinct from 'DRAFT' then
    raise exception 'Financial document items are immutable after the document leaves draft';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
create trigger invoice_items_draft_only before insert or update or delete on public.invoice_items
for each row execute function public.guard_document_item_mutation();
create trigger quotation_items_draft_only before insert or update or delete on public.quotation_items
for each row execute function public.guard_document_item_mutation();

create or replace function public.calculate_quotation_discount(p_quotation_id uuid, p_discount_id uuid)
returns numeric(12,2) language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare d public.discounts%rowtype; v_subtotal numeric(12,2); v_quantity numeric;
begin
  if p_discount_id is null then return 0; end if;
  select * into d from public.discounts where id = p_discount_id and is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now());
  if not found then raise exception 'Discount is not active'; end if;
  select coalesce(sum(qi.quantity) filter (where d.scope='ALL' or (d.scope='PRODUCTS' and qi.product_id is not null) or (d.scope='PLANS' and qi.plan_id is not null)),0),
         coalesce(sum(qi.line_subtotal) filter (where d.scope='ALL' or (d.scope='PRODUCTS' and qi.product_id is not null) or (d.scope='PLANS' and qi.plan_id is not null)),0)
    into v_quantity,v_subtotal from public.quotation_items qi where qi.quotation_id=p_quotation_id;
  if v_subtotal < d.minimum_purchase or v_quantity < d.minimum_quantity then raise exception 'Quotation does not meet discount minimums'; end if;
  if d.discount_type='FIXED' then return least(d.value,v_subtotal); end if;
  return round(v_subtotal*d.value/100,2);
end;
$$;

create or replace function public.calculate_invoice_discount(p_invoice_id uuid, p_discount_id uuid)
returns numeric(12,2) language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare d public.discounts%rowtype; v_subtotal numeric(12,2); v_quantity numeric;
begin
  if p_discount_id is null then return 0; end if;
  select * into d from public.discounts where id=p_discount_id for update;
  if not found or not d.is_active or (d.starts_at is not null and d.starts_at>now()) or (d.ends_at is not null and d.ends_at<now()) then
    raise exception 'Discount is not active';
  end if;
  if d.usage_limit is not null and d.used_count >= d.usage_limit then raise exception 'Discount usage limit reached'; end if;
  select coalesce(sum(ii.quantity) filter (where d.scope='ALL' or (d.scope='PRODUCTS' and ii.product_id is not null) or (d.scope='PLANS' and ii.plan_id is not null)),0),
         coalesce(sum(ii.line_subtotal) filter (where d.scope='ALL' or (d.scope='PRODUCTS' and ii.product_id is not null) or (d.scope='PLANS' and ii.plan_id is not null)),0)
    into v_quantity,v_subtotal from public.invoice_items ii where ii.invoice_id=p_invoice_id;
  if v_subtotal<d.minimum_purchase or v_quantity<d.minimum_quantity then raise exception 'Invoice does not meet discount minimums'; end if;
  if d.discount_type='FIXED' then return least(d.value,v_subtotal); end if;
  return round(v_subtotal*d.value/100,2);
end;
$$;

create or replace function public.guard_discount_usage()
returns trigger language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare v_discount uuid; v_invoice uuid; v_customer uuid; v_amount numeric(12,2); v_reversed boolean; v_invoice_discount uuid; v_invoice_amount numeric(12,2); v_invoice_customer uuid; v_total numeric(12,2); old_usage_id uuid;
begin
  if tg_op='DELETE' then raise exception 'Discount usage ledger entries cannot be deleted; reverse them by voiding an eligible invoice'; end if;
  if tg_op='UPDATE' and (new.discount_id is distinct from old.discount_id or new.invoice_id is distinct from old.invoice_id or new.customer_id is distinct from old.customer_id or new.amount is distinct from old.amount or new.currency_code is distinct from old.currency_code or new.used_at is distinct from old.used_at or new.created_by is distinct from old.created_by) then raise exception 'Discount usage ledger entries are immutable'; end if;
  v_discount := case when tg_op='DELETE' then old.discount_id else new.discount_id end;
  v_invoice := case when tg_op='DELETE' then old.invoice_id else new.invoice_id end;
  v_customer := case when tg_op='DELETE' then old.customer_id else new.customer_id end;
  v_amount := case when tg_op='DELETE' then old.amount else new.amount end;
  v_reversed := case when tg_op='DELETE' then old.is_reversed else new.is_reversed end;
  if tg_op='INSERT' then perform 1 from public.discounts d where d.id=v_discount for update; elsif tg_op='UPDATE' then old_usage_id:=old.id; end if;
  if v_invoice is not null and not v_reversed then
    select i.discount_id,i.discount_amount,i.customer_id into v_invoice_discount,v_invoice_amount,v_invoice_customer
    from public.invoices i where i.id=v_invoice for update;
    if not found or v_invoice_customer is distinct from v_customer or v_invoice_discount is distinct from v_discount or v_invoice_amount is distinct from v_amount then
      raise exception 'Discount usage must match its invoice, customer, and applied discount';
    end if;
    select coalesce(sum(du.amount),0) into v_total from public.discount_usages du
    where du.invoice_id=v_invoice and not du.is_reversed and (old_usage_id is null or du.id<>old_usage_id);
    if v_total+v_amount is distinct from v_invoice_amount then raise exception 'Discount usage aggregate must equal the invoice discount'; end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
create or replace function public.count_discount_usage()
returns trigger language plpgsql security definer
set search_path = '' set row_security = off
as $$
begin
  if tg_op='INSERT' then
    if not new.is_reversed then update public.discounts set used_count=used_count+1 where id=new.discount_id; end if;
    return new;
  elsif tg_op='DELETE' then
    if not old.is_reversed then update public.discounts set used_count=greatest(0,used_count-1) where id=old.discount_id; end if;
    return old;
  end if;
  if old.is_reversed is distinct from new.is_reversed then
    update public.discounts set used_count=greatest(0,used_count + case when new.is_reversed then -1 else 1 end) where id=new.discount_id;
  end if;
  return new;
end;
$$;
drop trigger discount_usage_guard on public.discount_usages;
drop trigger discount_usage_count on public.discount_usages;
create trigger discount_usage_guard before insert or update or delete on public.discount_usages for each row execute function public.guard_discount_usage();
create trigger discount_usage_count after insert or update of is_reversed or delete on public.discount_usages for each row execute function public.count_discount_usage();
revoke insert, update, delete on public.discount_usages from authenticated;

-- Header and line creation uses configured discounts and tax IDs only; snapshots are computed inside SQL.
create or replace function public.create_quotation_with_items(p_quotation jsonb, p_items jsonb)
returns uuid language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare new_quotation_id uuid; item jsonb; selected_discount uuid; discount_value numeric(12,2);
begin
  if not app_private.is_staff_or_admin() then raise exception 'Staff or Admin role required' using errcode='42501'; end if;
  if p_quotation is null or p_items is null or jsonb_typeof(p_quotation) is distinct from 'object' or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Quotation details and at least one item are required';
  end if;
  selected_discount := nullif(p_quotation->>'discount_id','')::uuid;
  insert into public.quotations(customer_id,valid_until,status,notes,discount_amount,discount_id,created_by)
  values ((p_quotation->>'customer_id')::uuid,nullif(p_quotation->>'valid_until','')::date,'DRAFT',p_quotation->>'notes',0,null,(select auth.uid()))
  returning id into new_quotation_id;
  for item in select value from jsonb_array_elements(p_items) loop
    insert into public.quotation_items(quotation_id,product_id,plan_id,description,quantity,unit_price,tax_rate_id)
    values(new_quotation_id,nullif(item->>'product_id','')::uuid,nullif(item->>'plan_id','')::uuid,item->>'description',(item->>'quantity')::numeric,(item->>'unit_price')::numeric,nullif(item->>'tax_rate_id','')::uuid);
  end loop;
  discount_value := public.calculate_quotation_discount(new_quotation_id,selected_discount);
  update public.quotations set discount_id=selected_discount,discount_amount=discount_value where id=new_quotation_id;
  return new_quotation_id;
end;
$$;
revoke all on function public.create_quotation_with_items(jsonb,jsonb) from public,anon;
grant execute on function public.create_quotation_with_items(jsonb,jsonb) to authenticated;
revoke update (status,discount_amount,discount_id) on public.quotations from authenticated;

create or replace function public.create_invoice_with_items(p_invoice jsonb,p_items jsonb)
returns uuid language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare new_invoice_id uuid; item jsonb; selected_discount uuid; discount_value numeric(12,2); due_days smallint;
begin
  if not app_private.is_staff_or_admin() and coalesce(auth.role(),'')<>'service_role' then raise exception 'Staff, Admin, or scheduler role required' using errcode='42501'; end if;
  if p_invoice is null or p_items is null or jsonb_typeof(p_invoice) is distinct from 'object' or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Invoice details and at least one item are required';
  end if;
  selected_discount := nullif(p_invoice->>'discount_id','')::uuid;
  select invoice_due_days into due_days from public.app_settings where singleton;
  insert into public.invoices(customer_id,subscription_id,billing_date,due_date,billing_period_start,billing_period_end,discount_amount,discount_id,notes,created_by)
  values((p_invoice->>'customer_id')::uuid,nullif(p_invoice->>'subscription_id','')::uuid,
    coalesce(nullif(p_invoice->>'billing_date','')::date,current_date),
    coalesce(nullif(p_invoice->>'due_date','')::date,current_date+coalesce(due_days,7)),
    nullif(p_invoice->>'billing_period_start','')::date,nullif(p_invoice->>'billing_period_end','')::date,0,null,p_invoice->>'notes',(select auth.uid()))
  returning id into new_invoice_id;
  for item in select value from jsonb_array_elements(p_items) loop
    insert into public.invoice_items(invoice_id,product_id,plan_id,description,quantity,unit_price,tax_rate_id)
    values(new_invoice_id,nullif(item->>'product_id','')::uuid,nullif(item->>'plan_id','')::uuid,item->>'description',(item->>'quantity')::numeric,(item->>'unit_price')::numeric,nullif(item->>'tax_rate_id','')::uuid);
  end loop;
  discount_value := public.calculate_invoice_discount(new_invoice_id,selected_discount);
  update public.invoices set discount_id=selected_discount,discount_amount=discount_value where id=new_invoice_id;
  if selected_discount is not null then
    insert into public.discount_usages(discount_id,customer_id,invoice_id,amount,currency_code,created_by)
    values(selected_discount,(select customer_id from public.invoices where id=new_invoice_id),new_invoice_id,discount_value,'INR',(select auth.uid()));
  end if;
  return new_invoice_id;
end;
$$;
revoke all on function public.create_invoice_with_items(jsonb,jsonb) from public,anon;
grant execute on function public.create_invoice_with_items(jsonb,jsonb) to authenticated,service_role;
revoke update (customer_id,subscription_id,billing_period_start,billing_period_end,discount_amount,discount_id,status) on public.invoices from authenticated;

-- Subscription item taxes are selected from configured rates; future invoices take new snapshots.
revoke insert (subscription_id,product_id,variant_id,description,quantity,unit_price) on public.subscription_items from authenticated;
revoke update (subscription_id,product_id,variant_id,description,quantity,unit_price) on public.subscription_items from authenticated;
grant insert (subscription_id,product_id,variant_id,description,quantity,unit_price,tax_rate_id) on public.subscription_items to authenticated;
grant update (subscription_id,product_id,variant_id,description,quantity,unit_price,tax_rate_id) on public.subscription_items to authenticated;
create or replace function public.create_subscription_with_items(p_subscription jsonb,p_items jsonb)
returns uuid language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare new_subscription_id uuid; item jsonb;
begin
  if not app_private.is_staff_or_admin() then raise exception 'Staff or Admin role required' using errcode='42501'; end if;
  if p_subscription is null or p_items is null or jsonb_typeof(p_subscription) is distinct from 'object' or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)=0 then
    raise exception 'Subscription details and at least one item are required';
  end if;
  insert into public.subscriptions(customer_id,plan_id,start_date,expiry_date,billing_interval,next_billing_date,billing_cycle_number,status,auto_renew,created_by,notes)
  values((p_subscription->>'customer_id')::uuid,nullif(p_subscription->>'plan_id','')::uuid,(p_subscription->>'start_date')::date,
    nullif(p_subscription->>'expiry_date','')::date,(p_subscription->>'billing_interval')::public.billing_interval,null,0,'PENDING',
    coalesce(nullif(p_subscription->>'auto_renew','')::boolean,true),(select auth.uid()),p_subscription->>'notes') returning id into new_subscription_id;
  for item in select value from jsonb_array_elements(p_items) loop
    insert into public.subscription_items(subscription_id,product_id,variant_id,description,quantity,unit_price,tax_rate_id)
    values(new_subscription_id,nullif(item->>'product_id','')::uuid,nullif(item->>'variant_id','')::uuid,item->>'description',(item->>'quantity')::numeric,(item->>'unit_price')::numeric,nullif(item->>'tax_rate_id','')::uuid);
  end loop;
  return new_subscription_id;
end;
$$;
revoke all on function public.create_subscription_with_items(jsonb,jsonb) from public,anon;
grant execute on function public.create_subscription_with_items(jsonb,jsonb) to authenticated;

-- Subscription state and billing-cycle writes are only available through checked operations.
revoke update on public.subscriptions from authenticated;
grant update (plan_id,expiry_date,billing_interval,auto_renew,notes) on public.subscriptions to authenticated;

create or replace function public.activate_subscription(p_subscription_id uuid)
returns void language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare s public.subscriptions%rowtype;
begin
  if not app_private.is_staff_or_admin() then raise exception 'Staff or Admin role required' using errcode='42501'; end if;
  select * into s from public.subscriptions where id=p_subscription_id for update;
  if not found or s.status<>'PENDING' then raise exception 'Only pending subscriptions can be activated'; end if;
  if not exists(select 1 from public.subscription_items si where si.subscription_id=s.id) then raise exception 'Subscription requires at least one item'; end if;
  if s.expiry_date is not null and s.expiry_date<current_date then raise exception 'Expired subscriptions cannot be activated'; end if;
  update public.subscriptions set status='ACTIVE',next_billing_date=s.start_date,billing_cycle_number=0 where id=s.id;
end;
$$;

create or replace function public.pause_subscription(p_subscription_id uuid,p_reason text default null)
returns void language plpgsql security definer
set search_path = '' set row_security = off
as $$
begin
  if not app_private.is_staff_or_admin() then raise exception 'Staff or Admin role required' using errcode='42501'; end if;
  update public.subscriptions set status='PAUSED',paused_at=now(),pause_reason=left(p_reason,500)
  where id=p_subscription_id and status='ACTIVE';
  if not found then raise exception 'Only active subscriptions can be paused'; end if;
end;
$$;

create or replace function public.resume_subscription(p_subscription_id uuid)
returns void language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare s public.subscriptions%rowtype;
begin
  if not app_private.is_staff_or_admin() then raise exception 'Staff or Admin role required' using errcode='42501'; end if;
  select * into s from public.subscriptions where id=p_subscription_id for update;
  if not found or s.status<>'PAUSED' then raise exception 'Only paused subscriptions can be resumed'; end if;
  if s.expiry_date is not null and s.expiry_date<current_date then raise exception 'Expired subscriptions must be renewed'; end if;
  update public.subscriptions set status='ACTIVE',paused_at=null,pause_reason=null where id=s.id;
end;
$$;

create or replace function public.close_subscription(p_subscription_id uuid,p_reason text default null)
returns void language plpgsql security definer
set search_path = '' set row_security = off
as $$
begin
  if not app_private.is_staff_or_admin() then raise exception 'Staff or Admin role required' using errcode='42501'; end if;
  update public.subscriptions set status='CLOSED',closed_at=now(),closure_reason=left(p_reason,500),auto_renew=false,next_billing_date=null
  where id=p_subscription_id and status in ('PENDING','ACTIVE','PAUSED','EXPIRED');
  if not found then raise exception 'Subscription cannot be closed from its current state'; end if;
end;
$$;

create or replace function public.renew_subscription(p_invoice_id uuid)
returns void language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare i public.invoices%rowtype; s public.subscriptions%rowtype;
begin
  if not app_private.is_staff_or_admin() and coalesce(auth.role(),'')<>'service_role' then raise exception 'Staff, Admin, or scheduler role required' using errcode='42501'; end if;
  select * into i from public.invoices where id=p_invoice_id for update;
  if not found or i.subscription_id is null or i.status<>'PAID' then raise exception 'Renewal requires a paid recurring invoice'; end if;
  if exists(select 1 from public.subscription_renewals where invoice_id=i.id) then return; end if;
  select * into s from public.subscriptions where id=i.subscription_id for update;
  if s.customer_id<>i.customer_id or i.billing_period_end is null then raise exception 'Invoice subscription relationship is invalid'; end if;
  if s.status='CLOSED' then return; end if;
  insert into public.subscription_renewals(subscription_id,invoice_id,previous_expiry_date,renewed_until,renewed_by)
  values(s.id,i.id,s.expiry_date,i.billing_period_end,(select auth.uid()));
  update public.subscriptions set
    expiry_date=greatest(coalesce(expiry_date,i.billing_period_end),i.billing_period_end),
    status=case when status in ('EXPIRED','PENDING') then 'ACTIVE'::public.subscription_status else status end
  where id=s.id and status<>'CLOSED';
end;
$$;

create or replace function public.guard_recurring_invoice_period()
returns trigger language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare s public.subscriptions%rowtype; expected_start date; expected_end date;
begin
  if new.subscription_id is null then
    if new.billing_period_start is not null or new.billing_period_end is not null then raise exception 'Non-recurring invoices cannot carry a subscription billing period'; end if;
    return new;
  end if;
  select * into s from public.subscriptions where id=new.subscription_id for update;
  if not found or s.customer_id<>new.customer_id then raise exception 'Invoice customer must match subscription customer'; end if;
  expected_start:=public.billing_cycle_start(s.start_date,s.billing_interval,s.billing_cycle_number);
  expected_end:=public.billing_cycle_end(s.start_date,s.billing_interval,s.billing_cycle_number);
  if new.billing_period_start is distinct from expected_start or new.billing_period_end is distinct from expected_end or s.next_billing_date is distinct from expected_start then
    raise exception 'Invoice must use the subscription next canonical billing period';
  end if;
  if exists(select 1 from public.invoices i where i.subscription_id=new.subscription_id and i.id is distinct from new.id
    and daterange(i.billing_period_start,i.billing_period_end,'[]') && daterange(new.billing_period_start,new.billing_period_end,'[]')) then
    raise exception 'Recurring invoice period overlaps an existing invoice';
  end if;
  return new;
end;
$$;
create trigger invoices_period_guard before insert or update of subscription_id,customer_id,billing_period_start,billing_period_end on public.invoices
for each row execute function public.guard_recurring_invoice_period();

create or replace function public.advance_subscription_cycle_after_invoice()
returns trigger language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare s public.subscriptions%rowtype; next_cycle integer;
begin
  if new.subscription_id is null then return new; end if;
  select * into s from public.subscriptions where id=new.subscription_id for update;
  next_cycle:=s.billing_cycle_number+1;
  update public.subscriptions set billing_cycle_number=next_cycle,
    next_billing_date=public.billing_cycle_start(start_date,billing_interval,next_cycle)
  where id=s.id;
  return new;
end;
$$;
create trigger invoices_advance_subscription_cycle after insert on public.invoices
for each row execute function public.advance_subscription_cycle_after_invoice();

-- Renew only after a successful invoice payment; duplicate calls are idempotent by invoice ID.
create or replace function public.renew_subscription_after_paid_invoice()
returns trigger language plpgsql security definer
set search_path = '' set row_security = off
as $$
begin
  if new.status='PAID' and old.status is distinct from 'PAID' and new.subscription_id is not null then
    perform public.renew_subscription(new.id);
  end if;
  return new;
end;
$$;
create trigger invoices_renew_after_paid after update of status on public.invoices
for each row execute function public.renew_subscription_after_paid_invoice();

create or replace function public.generate_recurring_invoice(p_subscription_id uuid,p_period_start date,p_as_of date default current_date)
returns uuid language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare s public.subscriptions%rowtype; existing_invoice uuid; new_invoice uuid; due_days smallint; items jsonb;
begin
  if not app_private.is_staff_or_admin() and coalesce(auth.role(),'')<>'service_role' then raise exception 'Staff, Admin, or scheduler role required' using errcode='42501'; end if;
  select * into s from public.subscriptions where id=p_subscription_id for update;
  if not found then raise exception 'Subscription not found'; end if;
  select id into existing_invoice from public.invoices where subscription_id=s.id and billing_period_start=p_period_start;
  if existing_invoice is not null then return existing_invoice; end if;
  if s.status not in ('ACTIVE','EXPIRED') or not s.auto_renew or s.next_billing_date is distinct from p_period_start or p_period_start>p_as_of or (s.expiry_date is not null and p_period_start>s.expiry_date) then
    raise exception 'Subscription is not due for this recurring invoice';
  end if;
  if exists(select 1 from public.invoices i where i.subscription_id=s.id and i.status in ('DRAFT','ISSUED','PARTIALLY_PAID','OVERDUE') and i.outstanding_amount>0) then
    raise exception 'Resolve the prior invoice before generating another billing period';
  end if;
  select jsonb_agg(jsonb_build_object('product_id',si.product_id,'plan_id',null,'description',si.description,'quantity',si.quantity,'unit_price',si.unit_price,'tax_rate_id',si.tax_rate_id))
  into items from public.subscription_items si where si.subscription_id=s.id;
  if items is null or jsonb_array_length(items)=0 then raise exception 'Subscription has no billable items'; end if;
  select invoice_due_days into due_days from public.app_settings where singleton;
  new_invoice:=public.create_invoice_with_items(
    jsonb_build_object('customer_id',s.customer_id,'subscription_id',s.id,'billing_date',p_period_start,'due_date',p_period_start+coalesce(due_days,7),
      'billing_period_start',p_period_start,'billing_period_end',public.billing_cycle_end(s.start_date,s.billing_interval,s.billing_cycle_number)),
    items
  );
  perform public.issue_invoice(new_invoice);
  return new_invoice;
end;
$$;

create or replace function public.generate_due_recurring_invoices(p_as_of date default current_date,p_limit integer default 100)
returns table(subscription_id uuid,invoice_id uuid)
language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare s record; generated uuid; count_generated integer:=0;
begin
  if not app_private.is_staff_or_admin() and coalesce(auth.role(),'')<>'service_role' then raise exception 'Staff, Admin, or scheduler role required' using errcode='42501'; end if;
  if p_limit<1 or p_limit>500 then raise exception 'Limit must be between 1 and 500'; end if;
  for s in select sub.id,sub.next_billing_date from public.subscriptions sub
    where sub.status in ('ACTIVE','EXPIRED') and sub.auto_renew and sub.next_billing_date<=p_as_of
    order by sub.next_billing_date,sub.id limit p_limit for update skip locked
  loop
    exit when count_generated>=p_limit;
    begin
      generated:=public.generate_recurring_invoice(s.id,s.next_billing_date,p_as_of);
      subscription_id:=s.id; invoice_id:=generated; return next;
      count_generated:=count_generated+1;
    exception when others then
      -- One subscription's invalid/blocked period must not prevent other due invoices.
      continue;
    end;
  end loop;
  update public.subscriptions set status='EXPIRED',next_billing_date=null
  where status='ACTIVE' and expiry_date is not null and expiry_date<p_as_of
    and (not auto_renew or next_billing_date is null or next_billing_date>expiry_date);
end;
$$;

-- Explicit quotation state transitions preserve sent/accepted snapshots.
revoke update (status) on public.quotations from authenticated;
create or replace function public.transition_quotation(p_quotation_id uuid,p_status public.quotation_status)
returns void language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare old_status public.quotation_status;
begin
  if not app_private.is_staff_or_admin() then raise exception 'Staff or Admin role required' using errcode='42501'; end if;
  select status into old_status from public.quotations where id=p_quotation_id for update;
  if not found then raise exception 'Quotation not found'; end if;
  if not ((old_status='DRAFT' and p_status in ('SENT','REJECTED')) or (old_status='SENT' and p_status in ('ACCEPTED','REJECTED','EXPIRED')) or (old_status='ACCEPTED' and p_status='CONVERTED')) then
    raise exception 'Invalid quotation status transition';
  end if;
  if p_status='EXPIRED' and exists(select 1 from public.quotations where id=p_quotation_id and (valid_until is null or valid_until>=current_date)) then
    raise exception 'Quotation has not expired';
  end if;
  update public.quotations set status=p_status where id=p_quotation_id;
end;
$$;

-- Invoice voiding releases the discount reservation while retaining the immutable usage audit row.
create or replace function public.void_invoice(p_invoice_id uuid)
returns void language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare current_paid numeric(12,2); current_state public.invoice_status;
begin
  if not app_private.is_staff_or_admin() then raise exception 'Staff or Admin role required' using errcode='42501'; end if;
  select paid_amount,status into current_paid,current_state from public.invoices where id=p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if current_paid<>0 or current_state in ('PAID','PARTIALLY_PAID') then raise exception 'Invoices with successful payments cannot be voided'; end if;
  if current_state='VOID' then return; end if;
  update public.invoices set status='VOID' where id=p_invoice_id;
  update public.discount_usages set is_reversed=true where invoice_id=p_invoice_id and not is_reversed;
end;
$$;

-- Service-only profile operations are atomic with their audit events.
create or replace function public.service_promote_staff_profile(p_request_id uuid,p_user_id uuid,p_actor_id uuid,p_full_name text)
returns void language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare op public.staff_invite_requests%rowtype; u_email text; customer_record uuid;
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select * into op from public.staff_invite_requests where idempotency_key=p_request_id for update;
  if not found or op.requested_by<>p_actor_id or op.full_name<>left(trim(p_full_name),160) then raise exception 'Staff invitation request not found or payload mismatch'; end if;
  if op.status='COMPLETED' and op.auth_user_id=p_user_id then return; end if;
  if not exists(select 1 from public.profiles where id=p_actor_id and role='ADMIN' and is_active) then raise exception 'Active administrator required'; end if;
  select lower(email) into u_email from auth.users where id=p_user_id and raw_app_meta_data->>'staff_invite_request_id'=p_request_id::text;
  if u_email is null or u_email<>op.email then raise exception 'Auth user does not match this invitation'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id and role='CUSTOMER' and is_active) then raise exception 'Only the newly invited customer profile can be promoted'; end if;
  select id into customer_record from public.customers where profile_id=p_user_id;
  if customer_record is null then raise exception 'Temporary customer row not found'; end if;
  if exists(select 1 from public.subscriptions where customer_id=customer_record) or exists(select 1 from public.invoices where customer_id=customer_record) or exists(select 1 from public.quotations where customer_id=customer_record) then
    raise exception 'An account with business records cannot be promoted through staff provisioning';
  end if;
  perform set_config('brightloop.audit_actor',p_actor_id::text,true);
  update public.profiles set role='STAFF',full_name=left(trim(p_full_name),160),is_active=true where id=p_user_id;
  delete from public.customers where id=customer_record;
  update public.staff_invite_requests set auth_user_id=p_user_id,status='COMPLETED',updated_at=now() where idempotency_key=p_request_id;
end;
$$;

create or replace function public.service_set_staff_active(p_user_id uuid,p_actor_id uuid,p_active boolean)
returns void language plpgsql security definer
set search_path = '' set row_security = off
as $$
begin
  if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles where id=p_actor_id and role='ADMIN' and is_active) then raise exception 'Active administrator required'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id and role='STAFF') then raise exception 'Staff account not found'; end if;
  perform set_config('brightloop.audit_actor',p_actor_id::text,true);
  update public.profiles set is_active=p_active where id=p_user_id and role='STAFF' and is_active is distinct from p_active;
end;
$$;

-- Least privilege for service-only functions and user callable operations.
revoke all on function public.calculate_quotation_discount(uuid,uuid) from public,anon,authenticated;
revoke all on function public.calculate_invoice_discount(uuid,uuid) from public,anon,authenticated;
revoke all on function public.service_promote_staff_profile(uuid,uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.service_set_staff_active(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.service_promote_staff_profile(uuid,uuid,uuid,text) to service_role;
grant execute on function public.service_set_staff_active(uuid,uuid,boolean) to service_role;
revoke all on function public.activate_subscription(uuid) from public,anon;
revoke all on function public.pause_subscription(uuid,text) from public,anon;
revoke all on function public.resume_subscription(uuid) from public,anon;
revoke all on function public.close_subscription(uuid,text) from public,anon;
revoke all on function public.renew_subscription(uuid) from public,anon;
revoke all on function public.generate_recurring_invoice(uuid,date,date) from public,anon;
revoke all on function public.generate_due_recurring_invoices(date,integer) from public,anon;
revoke all on function public.transition_quotation(uuid,public.quotation_status) from public,anon;
grant execute on function public.activate_subscription(uuid),public.pause_subscription(uuid,text),public.resume_subscription(uuid),public.close_subscription(uuid,text),public.renew_subscription(uuid),public.transition_quotation(uuid,public.quotation_status) to authenticated;
grant execute on function public.renew_subscription(uuid),public.generate_recurring_invoice(uuid,date,date),public.generate_due_recurring_invoices(date,integer) to service_role;

-- Keep the selected tax and discount values out of direct client-controlled document columns.
revoke insert (quotation_id,product_id,plan_id,description,quantity,unit_price,tax_rate_id,currency_code) on public.quotation_items from authenticated;
revoke insert (invoice_id,product_id,plan_id,description,quantity,unit_price,tax_rate_id,currency_code) on public.invoice_items from authenticated;
revoke insert (subscription_id,product_id,variant_id,description,quantity,unit_price,tax_rate_id) on public.subscription_items from authenticated;
revoke update (subscription_id,product_id,variant_id,description,quantity,unit_price,tax_rate_id) on public.subscription_items from authenticated;

-- Update records cannot be relinked to a different subscription/customer or billing cycle.
revoke update (customer_id,subscription_id,billing_period_start,billing_period_end) on public.invoices from authenticated;
revoke update (discount_amount,discount_id,status) on public.invoices from authenticated;

-- Preserve historical documents and catalog references; retire records with is_active=false.
revoke delete on public.quotations, public.invoices, public.products, public.product_variants, public.plans from authenticated;
alter table public.subscriptions drop constraint subscriptions_plan_id_fkey;
alter table public.subscriptions add constraint subscriptions_plan_id_fkey foreign key (plan_id) references public.plans(id) on delete restrict;
alter table public.plan_products drop constraint plan_products_plan_id_fkey;
alter table public.plan_products add constraint plan_products_plan_id_fkey foreign key (plan_id) references public.plans(id) on delete restrict;

-- Scheduler invoice issuance uses the same guarded operation as staff and admins.
create or replace function public.issue_invoice(p_invoice_id uuid)
returns void language plpgsql security definer
set search_path = '' set row_security = off
as $$
begin
  if not app_private.is_staff_or_admin() and coalesce(auth.role(),'')<>'service_role' then raise exception 'Staff, Admin, or scheduler role required' using errcode='42501'; end if;
  if not exists(select 1 from public.invoice_items where invoice_id=p_invoice_id) then raise exception 'An invoice needs at least one line item before issue'; end if;
  update public.invoices set status='ISSUED' where id=p_invoice_id and status='DRAFT';
  if not found then raise exception 'Only draft invoices can be issued'; end if;
  perform public.recalculate_invoice(p_invoice_id);
end;
$$;
revoke all on function public.issue_invoice(uuid) from public,anon;
grant execute on function public.issue_invoice(uuid) to authenticated,service_role;
revoke update (discount_amount,discount_id,status) on public.quotations from authenticated;

-- Audit service-only functions; ordinary table triggers continue to audit authenticated actions.
revoke all on function public.guard_recurring_invoice_period() from public,anon,authenticated;
revoke all on function public.advance_subscription_cycle_after_invoice() from public,anon,authenticated;
revoke all on function public.renew_subscription_after_paid_invoice() from public,anon,authenticated;
revoke all on function public.guard_document_item_mutation() from public,anon,authenticated;
revoke all on function public.set_document_line_amounts() from public,anon,authenticated;
revoke all on function public.guard_discount_usage() from public,anon,authenticated;
revoke all on function public.count_discount_usage() from public,anon,authenticated;

commit;
