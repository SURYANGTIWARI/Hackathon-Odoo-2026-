-- Brightloop database foundation.
-- Apply with the Supabase SQL Editor after reviewing this migration.
-- All amounts are INR and use NUMERIC(12,2); no currency conversion is implemented.

create type public.app_role as enum ('ADMIN', 'STAFF', 'CUSTOMER');
create type public.product_type as enum ('ONE_TIME', 'RECURRING', 'SERVICE', 'OTHER');
create type public.billing_interval as enum ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');
create type public.quotation_status as enum ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED');
create type public.subscription_status as enum ('PENDING', 'ACTIVE', 'PAUSED', 'CLOSED', 'EXPIRED');
create type public.invoice_status as enum ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID');
create type public.payment_method as enum ('CASH', 'BANK_TRANSFER', 'CARD', 'UPI', 'CHEQUE', 'OTHER');
create type public.payment_status as enum ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');
create type public.discount_type as enum ('FIXED', 'PERCENTAGE');
create type public.discount_scope as enum ('ALL', 'PRODUCTS', 'PLANS');

create sequence public.quotation_number_seq;
create sequence public.subscription_number_seq;
create sequence public.invoice_number_seq;

create table public.app_settings (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null unique default true check (singleton),
  default_currency char(3) not null default 'INR' check (default_currency = 'INR'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.app_settings (singleton, default_currency) values (true, 'INR')
on conflict (singleton) do nothing;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 160),
  role public.app_role not null default 'CUSTOMER',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  email text not null,
  phone text,
  business_name text,
  tax_identifier text,
  billing_address jsonb not null default '{}'::jsonb,
  shipping_address jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customers_email_nonempty check (length(trim(email)) > 0)
);
create unique index customers_email_lower_uidx on public.customers (lower(email));
create index customers_profile_id_idx on public.customers(profile_id);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  product_type public.product_type not null default 'OTHER',
  sales_price numeric(12,2) not null default 0 check (sales_price >= 0),
  cost_price numeric(12,2) not null default 0 check (cost_price >= 0),
  currency_code char(3) not null default 'INR' check (currency_code = 'INR'),
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_active_name_idx on public.products(is_active, name);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  additional_price numeric(12,2) not null default 0 check (additional_price >= 0),
  currency_code char(3) not null default 'INR' check (currency_code = 'INR'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id, name)
);
create index product_variants_product_idx on public.product_variants(product_id);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  description text,
  price numeric(12,2) not null check (price >= 0),
  currency_code char(3) not null default 'INR' check (currency_code = 'INR'),
  billing_interval public.billing_interval not null,
  minimum_quantity integer not null default 1 check (minimum_quantity > 0),
  available_from date,
  available_until date,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (available_until is null or available_from is null or available_until >= available_from)
);
create index plans_active_name_idx on public.plans(is_active, name);

create table public.plan_products (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  unique(plan_id, product_id)
);
create index plan_products_product_idx on public.plan_products(product_id);

create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  quotation_number text not null unique default ('QUO-' || to_char(current_date, 'YYYYMM') || '-' || lpad(nextval('public.quotation_number_seq')::text, 6, '0')),
  valid_until date,
  status public.quotation_status not null default 'DRAFT',
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  tax_amount numeric(12,2) not null default 0 check (tax_amount >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  currency_code char(3) not null default 'INR' check (currency_code = 'INR'),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_amount <= subtotal + tax_amount)
);
create index quotations_customer_idx on public.quotations(customer_id);
create index quotations_status_created_idx on public.quotations(status, created_at desc);
create index quotations_valid_until_idx on public.quotations(valid_until) where status in ('DRAFT', 'SENT');

create table public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  plan_id uuid references public.plans(id) on delete set null,
  description text not null check (length(trim(description)) > 0),
  quantity numeric(12,2) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  line_subtotal numeric(12,2) generated always as (round(quantity * unit_price, 2)) stored,
  tax_amount numeric(12,2) not null default 0 check (tax_amount >= 0),
  line_total numeric(12,2) not null default 0 check (line_total >= 0),
  currency_code char(3) not null default 'INR' check (currency_code = 'INR'),
  created_at timestamptz not null default now(),
  check ((product_id is not null) <> (plan_id is not null))
);
create index quotation_items_quotation_idx on public.quotation_items(quotation_id);
create index quotation_items_product_idx on public.quotation_items(product_id) where product_id is not null;
create index quotation_items_plan_idx on public.quotation_items(plan_id) where plan_id is not null;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  plan_id uuid references public.plans(id) on delete set null,
  subscription_number text not null unique default ('SUB-' || to_char(current_date, 'YYYYMM') || '-' || lpad(nextval('public.subscription_number_seq')::text, 6, '0')),
  start_date date not null,
  expiry_date date,
  billing_interval public.billing_interval not null,
  next_billing_date date,
  status public.subscription_status not null default 'PENDING',
  auto_renew boolean not null default true,
  paused_at timestamptz,
  pause_reason text,
  closed_at timestamptz,
  closure_reason text,
  currency_code char(3) not null default 'INR' check (currency_code = 'INR'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expiry_date is null or expiry_date >= start_date)
);
create index subscriptions_customer_idx on public.subscriptions(customer_id);
create index subscriptions_plan_idx on public.subscriptions(plan_id);
create index subscriptions_status_next_bill_idx on public.subscriptions(status, next_billing_date);
create index subscriptions_expiry_idx on public.subscriptions(expiry_date) where expiry_date is not null;

create table public.subscription_items (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  description text not null check (length(trim(description)) > 0),
  quantity numeric(12,2) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) generated always as (round(quantity * unit_price, 2)) stored,
  currency_code char(3) not null default 'INR' check (currency_code = 'INR'),
  created_at timestamptz not null default now(),
  check (product_id is not null or variant_id is not null)
);
create index subscription_items_subscription_idx on public.subscription_items(subscription_id);
create index subscription_items_product_idx on public.subscription_items(product_id) where product_id is not null;
create index subscription_items_variant_idx on public.subscription_items(variant_id) where variant_id is not null;

create or replace function public.validate_subscription_item_variant()
returns trigger language plpgsql
set search_path = ''
as $$
declare variant_product uuid;
begin
  if new.product_id is null and new.variant_id is null then
    raise exception 'A subscription item must reference a product or variant';
  end if;
  if new.variant_id is not null then
    select v.product_id into variant_product from public.product_variants v where v.id = new.variant_id;
    if variant_product is null then raise exception 'Product variant does not exist'; end if;
    if new.product_id is not null and new.product_id <> variant_product then
      raise exception 'Variant must belong to the selected product';
    end if;
    new.product_id := variant_product;
  end if;
  return new;
end;
$$;
create trigger subscription_item_variant_check before insert or update of product_id, variant_id on public.subscription_items
for each row execute function public.validate_subscription_item_variant();

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  subscription_id uuid references public.subscriptions(id) on delete restrict,
  invoice_number text not null unique default ('INV-' || to_char(current_date, 'YYYYMM') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0')),
  billing_date date not null default current_date,
  due_date date not null,
  billing_period_start date,
  billing_period_end date,
  status public.invoice_status not null default 'DRAFT',
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  tax_amount numeric(12,2) not null default 0 check (tax_amount >= 0),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  outstanding_amount numeric(12,2) not null default 0 check (outstanding_amount >= 0),
  currency_code char(3) not null default 'INR' check (currency_code = 'INR'),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((billing_period_start is null and billing_period_end is null) or (billing_period_start is not null and billing_period_end >= billing_period_start)),
  check (subscription_id is null or billing_period_start is not null),
  check (discount_amount <= subtotal + tax_amount),
  check (paid_amount <= total),
  check (outstanding_amount = total - paid_amount)
);
create unique index invoices_subscription_period_uidx on public.invoices(subscription_id, billing_period_start) where subscription_id is not null;
create index invoices_customer_idx on public.invoices(customer_id);
create index invoices_subscription_idx on public.invoices(subscription_id);
create index invoices_due_date_status_idx on public.invoices(due_date, status);
create index invoices_billing_date_idx on public.invoices(billing_date desc);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  plan_id uuid references public.plans(id) on delete set null,
  description text not null check (length(trim(description)) > 0),
  quantity numeric(12,2) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  tax_rate numeric(5,2) not null default 0 check (tax_rate between 0 and 100),
  line_subtotal numeric(12,2) generated always as (round(quantity * unit_price, 2)) stored,
  tax_amount numeric(12,2) not null default 0 check (tax_amount >= 0),
  line_total numeric(12,2) not null default 0 check (line_total >= 0),
  currency_code char(3) not null default 'INR' check (currency_code = 'INR'),
  created_at timestamptz not null default now(),
  check ((product_id is not null) <> (plan_id is not null))
);
create index invoice_items_invoice_idx on public.invoice_items(invoice_id);
create index invoice_items_product_idx on public.invoice_items(product_id) where product_id is not null;
create index invoice_items_plan_idx on public.invoice_items(plan_id) where plan_id is not null;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  currency_code char(3) not null default 'INR' check (currency_code = 'INR'),
  method public.payment_method not null,
  payment_date timestamptz not null default now(),
  status public.payment_status not null default 'PENDING',
  reference text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_invoice_idx on public.payments(invoice_id);
create index payments_customer_idx on public.payments(customer_id);
create index payments_status_date_idx on public.payments(status, payment_date desc);
create unique index payments_reference_uidx on public.payments(reference) where reference is not null;

create table public.discounts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  discount_type public.discount_type not null,
  value numeric(12,2) not null check (value > 0),
  currency_code char(3) not null default 'INR' check (currency_code = 'INR'),
  minimum_purchase numeric(12,2) not null default 0 check (minimum_purchase >= 0),
  minimum_quantity integer not null default 1 check (minimum_quantity > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit >= 0),
  used_count integer not null default 0 check (used_count >= 0),
  scope public.discount_scope not null default 'ALL',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_type <> 'PERCENTAGE' or value <= 100),
  check (ends_at is null or starts_at is null or ends_at >= starts_at),
  check (usage_limit is null or used_count <= usage_limit)
);
create index discounts_active_dates_idx on public.discounts(is_active, starts_at, ends_at);

create table public.discount_usages (
  id uuid primary key default gen_random_uuid(),
  discount_id uuid not null references public.discounts(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  invoice_id uuid references public.invoices(id) on delete set null,
  amount numeric(12,2) not null check (amount >= 0),
  currency_code char(3) not null default 'INR' check (currency_code = 'INR'),
  used_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);
create index discount_usages_customer_idx on public.discount_usages(customer_id, used_at desc);
create index discount_usages_discount_idx on public.discount_usages(discount_id, used_at desc);
create index discount_usages_invoice_idx on public.discount_usages(invoice_id);

create or replace function public.guard_discount_usage()
returns trigger language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare d public.discounts%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.discount_id <> old.discount_id then
      raise exception 'A discount usage cannot be reassigned to another discount';
    end if;
  end if;
  if tg_op = 'INSERT' then
    select * into d from public.discounts where id = new.discount_id for update;
    if not found or not d.is_active then raise exception 'Discount is not active'; end if;
    if d.starts_at is not null and d.starts_at > now() then raise exception 'Discount is not active yet'; end if;
    if d.ends_at is not null and d.ends_at < now() then raise exception 'Discount has expired'; end if;
    if d.usage_limit is not null and d.used_count >= d.usage_limit then raise exception 'Discount usage limit reached'; end if;
  end if;
  if new.invoice_id is not null then
    if not exists (select 1 from public.invoices i where i.id = new.invoice_id and i.customer_id = new.customer_id and i.status <> 'VOID' and i.discount_amount >= new.amount) then
      raise exception 'Discount usage invoice must belong to the same customer and include the applied discount';
    end if;
    if tg_op = 'INSERT' then
      if (select subtotal from public.invoices where id = new.invoice_id) < d.minimum_purchase then
        raise exception 'Invoice does not meet the discount minimum purchase';
      end if;
      if (select coalesce(sum(quantity), 0) from public.invoice_items where invoice_id = new.invoice_id) < d.minimum_quantity then
        raise exception 'Invoice does not meet the discount minimum quantity';
      end if;
      if d.scope = 'PRODUCTS' and not exists (select 1 from public.invoice_items where invoice_id = new.invoice_id and product_id is not null) then
        raise exception 'Discount requires a product line';
      end if;
      if d.scope = 'PLANS' and not exists (select 1 from public.invoice_items where invoice_id = new.invoice_id and plan_id is not null) then
        raise exception 'Discount requires a plan line';
      end if;
      if d.discount_type = 'FIXED' and new.amount > d.value then
        raise exception 'Discount usage exceeds its fixed value';
      end if;
      if d.discount_type = 'PERCENTAGE' and new.amount > round((select subtotal from public.invoices where id = new.invoice_id) * d.value / 100, 2) then
        raise exception 'Discount usage exceeds its percentage value';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create or replace function public.count_discount_usage()
returns trigger language plpgsql security definer
set search_path = '' set row_security = off
as $$
begin
  if tg_op = 'INSERT' then
    update public.discounts set used_count = used_count + 1 where id = new.discount_id;
    return new;
  end if;
  update public.discounts set used_count = greatest(0, used_count - 1) where id = old.discount_id;
  return old;
end;
$$;
create trigger discount_usage_guard before insert or update on public.discount_usages
for each row execute function public.guard_discount_usage();
create trigger discount_usage_count after insert or delete on public.discount_usages
for each row execute function public.count_discount_usage();

create table public.tax_rates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  percentage numeric(5,2) not null check (percentage between 0 and 100),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  entity text not null,
  record_id uuid,
  occurred_at timestamptz not null default now()
);
create index audit_logs_entity_time_idx on public.audit_logs(entity, occurred_at desc);
create index audit_logs_user_time_idx on public.audit_logs(user_id, occurred_at desc);

create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated;

create or replace function app_private.current_role()
returns public.app_role
language sql stable security definer
set search_path = ''
set row_security = off
as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.is_active = true
$$;

create or replace function app_private.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
set row_security = off
as $$ select coalesce(app_private.current_role() = 'ADMIN'::public.app_role, false) $$;

create or replace function app_private.is_staff_or_admin()
returns boolean
language sql stable security definer
set search_path = ''
set row_security = off
as $$ select coalesce(app_private.current_role() in ('ADMIN'::public.app_role, 'STAFF'::public.app_role), false) $$;

create or replace function app_private.can_access_customer(p_customer_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
set row_security = off
as $$
  select case
    when app_private.current_role() in ('ADMIN'::public.app_role, 'STAFF'::public.app_role) then true
    when app_private.current_role() = 'CUSTOMER'::public.app_role then exists (
      select 1 from public.customers c
      where c.id = p_customer_id and c.profile_id = (select auth.uid())
    )
    else false
  end
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  safe_name text := coalesce(new.raw_user_meta_data ->> 'full_name', '');
begin
  -- Role metadata is deliberately ignored: every public Auth signup becomes CUSTOMER.
  insert into public.profiles(id, full_name, role)
  values (new.id, left(safe_name, 160), 'CUSTOMER')
  on conflict (id) do nothing;

  insert into public.customers(profile_id, email)
  values (new.id, coalesce(new.email, 'customer-' || new.id::text || '@invalid.local'))
  on conflict (profile_id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
create trigger on_auth_user_created_brightloop
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.sync_payment_customer()
returns trigger
language plpgsql security definer
set search_path = ''
set row_security = off
as $$
declare invoice_customer uuid;
begin
  select i.customer_id into invoice_customer from public.invoices i where i.id = new.invoice_id;
  if invoice_customer is null then raise exception 'Invoice does not exist'; end if;
  if new.customer_id is not null and new.customer_id <> invoice_customer then
    raise exception 'Payment customer must match invoice customer';
  end if;
  if exists (select 1 from public.invoices i where i.id = new.invoice_id and i.status in ('DRAFT', 'VOID')) then
    raise exception 'Payments can only be recorded against issued invoices';
  end if;
  new.customer_id := invoice_customer;
  return new;
end;
$$;

create or replace function public.recalculate_quotation(p_quotation_id uuid)
returns void language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare
  current_discount numeric(12,2);
begin
  select q.discount_amount into current_discount from public.quotations q where q.id = p_quotation_id for update;
  if not found then return; end if;
  update public.quotations q set
    subtotal = totals.subtotal,
    tax_amount = totals.tax_amount,
    total = greatest(0, totals.subtotal + totals.tax_amount - current_discount),
    updated_at = now()
  from (
    select coalesce(sum(qi.line_subtotal), 0)::numeric(12,2) as subtotal,
           coalesce(sum(qi.tax_amount), 0)::numeric(12,2) as tax_amount
    from public.quotation_items qi where qi.quotation_id = p_quotation_id
  ) totals
  where q.id = p_quotation_id;
end;
$$;

create or replace function public.recalculate_invoice(p_invoice_id uuid)
returns void language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare
  t_subtotal numeric(12,2);
  t_tax numeric(12,2);
  t_discount numeric(12,2);
  t_total numeric(12,2);
  t_paid numeric(12,2);
  t_due date;
  t_status public.invoice_status;
begin
  -- Lock the header before reading child rows so concurrent item/payment writes recalculate from a fresh snapshot.
  select i.discount_amount, i.due_date into t_discount, t_due from public.invoices i where i.id = p_invoice_id for update;
  if not found then return; end if;
  select coalesce(sum(ii.line_subtotal), 0), coalesce(sum(ii.tax_amount), 0)
  into t_subtotal, t_tax from public.invoice_items ii where ii.invoice_id = p_invoice_id;
  t_total := greatest(0, t_subtotal + t_tax - t_discount);
  select coalesce(sum(p.amount), 0)::numeric(12,2) into t_paid
  from public.payments p where p.invoice_id = p_invoice_id and p.status = 'SUCCEEDED';
  if t_paid > t_total then raise exception 'Successful payments cannot exceed invoice total'; end if;
  if t_total = 0 then t_status := 'PAID';
  elsif t_paid >= t_total then t_status := 'PAID';
  elsif t_paid > 0 then t_status := 'PARTIALLY_PAID';
  elsif t_due < current_date then t_status := 'OVERDUE';
  else t_status := 'ISSUED';
  end if;
  update public.invoices set subtotal = t_subtotal, tax_amount = t_tax,
    total = t_total, paid_amount = t_paid, outstanding_amount = t_total - t_paid,
    status = case when status = 'DRAFT' or status = 'VOID' then status else t_status end,
    updated_at = now()
  where id = p_invoice_id;
end;
$$;

create or replace function public.recalculate_quotation_from_header()
returns trigger language plpgsql security definer
set search_path = '' set row_security = off
as $$
begin
  perform public.recalculate_quotation(new.id);
  return new;
end;
$$;
create trigger quotations_recalculate_discount after update of discount_amount on public.quotations
for each row execute function public.recalculate_quotation_from_header();

create or replace function public.recalculate_invoice_from_header()
returns trigger language plpgsql security definer
set search_path = '' set row_security = off
as $$
begin
  perform public.recalculate_invoice(new.id);
  return new;
end;
$$;
create trigger invoices_recalculate_discount after update of discount_amount, due_date on public.invoices
for each row execute function public.recalculate_invoice_from_header();

create or replace function public.recalculate_invoice_from_item()
returns trigger language plpgsql security definer
set search_path = '' set row_security = off
as $$
begin
  if tg_op <> 'INSERT' then perform public.recalculate_invoice(old.invoice_id); end if;
  if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.invoice_id is distinct from old.invoice_id) then
    perform public.recalculate_invoice(new.invoice_id);
  elsif tg_op = 'UPDATE' then
    perform public.recalculate_invoice(new.invoice_id);
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.recalculate_quotation_from_item()
returns trigger language plpgsql security definer
set search_path = '' set row_security = off
as $$
begin
  if tg_op <> 'INSERT' then perform public.recalculate_quotation(old.quotation_id); end if;
  if tg_op <> 'DELETE' then perform public.recalculate_quotation(new.quotation_id); end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.recalculate_invoice_from_payment()
returns trigger language plpgsql security definer
set search_path = '' set row_security = off
as $$
begin
  if tg_op <> 'INSERT' then perform public.recalculate_invoice(old.invoice_id); end if;
  if tg_op <> 'DELETE' then perform public.recalculate_invoice(new.invoice_id); end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger quotation_items_recalculate after insert or update or delete on public.quotation_items
for each row execute function public.recalculate_quotation_from_item();
create trigger invoice_items_recalculate after insert or update or delete on public.invoice_items
for each row execute function public.recalculate_invoice_from_item();
create trigger payments_set_customer before insert or update of invoice_id, customer_id on public.payments
for each row execute function public.sync_payment_customer();
create trigger payments_recalculate after insert or update or delete on public.payments
for each row execute function public.recalculate_invoice_from_payment();

-- Tax and line totals are snapshots. Later product/plan/tax edits never rewrite existing documents.
create or replace function public.set_document_line_amounts()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.tax_amount := round(new.quantity * new.unit_price * new.tax_rate / 100, 2);
  new.line_total := round(new.quantity * new.unit_price, 2) + new.tax_amount;
  return new;
end;
$$;
create trigger quotation_item_amounts before insert or update of quantity, unit_price, tax_rate on public.quotation_items
for each row execute function public.set_document_line_amounts();
create trigger invoice_item_amounts before insert or update of quantity, unit_price, tax_rate on public.invoice_items
for each row execute function public.set_document_line_amounts();

create or replace function public.write_audit_log()
returns trigger language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare target_id uuid;
begin
  if tg_op = 'DELETE' then target_id := old.id; else target_id := new.id; end if;
  insert into public.audit_logs(user_id, action, entity, record_id)
  values ((select auth.uid()), tg_op, tg_table_name, target_id);
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

-- updated_at maintenance
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger customers_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger product_variants_updated_at before update on public.product_variants for each row execute function public.set_updated_at();
create trigger plans_updated_at before update on public.plans for each row execute function public.set_updated_at();
create trigger quotations_updated_at before update on public.quotations for each row execute function public.set_updated_at();
create trigger subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
create trigger invoices_updated_at before update on public.invoices for each row execute function public.set_updated_at();
create trigger payments_updated_at before update on public.payments for each row execute function public.set_updated_at();
create trigger discounts_updated_at before update on public.discounts for each row execute function public.set_updated_at();
create trigger tax_rates_updated_at before update on public.tax_rates for each row execute function public.set_updated_at();
create trigger app_settings_updated_at before update on public.app_settings for each row execute function public.set_updated_at();

-- Audit business record mutations; the audit table itself is intentionally immutable.
create trigger audit_customers after insert or update or delete on public.customers for each row execute function public.write_audit_log();
create trigger audit_products after insert or update or delete on public.products for each row execute function public.write_audit_log();
create trigger audit_product_variants after insert or update or delete on public.product_variants for each row execute function public.write_audit_log();
create trigger audit_plans after insert or update or delete on public.plans for each row execute function public.write_audit_log();
create trigger audit_plan_products after insert or update or delete on public.plan_products for each row execute function public.write_audit_log();
create trigger audit_quotations after insert or update or delete on public.quotations for each row execute function public.write_audit_log();
create trigger audit_quotation_items after insert or update or delete on public.quotation_items for each row execute function public.write_audit_log();
create trigger audit_subscriptions after insert or update or delete on public.subscriptions for each row execute function public.write_audit_log();
create trigger audit_subscription_items after insert or update or delete on public.subscription_items for each row execute function public.write_audit_log();
create trigger audit_invoices after insert or update or delete on public.invoices for each row execute function public.write_audit_log();
create trigger audit_invoice_items after insert or update or delete on public.invoice_items for each row execute function public.write_audit_log();
create trigger audit_payments after insert or update or delete on public.payments for each row execute function public.write_audit_log();
create trigger audit_discounts after insert or update or delete on public.discounts for each row execute function public.write_audit_log();
create trigger audit_discount_usages after insert or update or delete on public.discount_usages for each row execute function public.write_audit_log();
create trigger audit_tax_rates after insert or update or delete on public.tax_rates for each row execute function public.write_audit_log();
create trigger audit_profiles after insert or update or delete on public.profiles for each row execute function public.write_audit_log();
create trigger audit_app_settings after insert or update or delete on public.app_settings for each row execute function public.write_audit_log();

-- Current invoice state is time-sensitive; this view reflects overdue status even without a write.
create view public.invoice_status_view with (security_invoker = true) as
select i.*,
  case
    when i.status = 'VOID' then 'VOID'::public.invoice_status
    when i.status = 'DRAFT' then 'DRAFT'::public.invoice_status
    when i.outstanding_amount = 0 then 'PAID'::public.invoice_status
    when i.due_date < current_date then 'OVERDUE'::public.invoice_status
    when i.paid_amount > 0 then 'PARTIALLY_PAID'::public.invoice_status
    else 'ISSUED'::public.invoice_status
  end as current_status
from public.invoices i;

-- RLS: enable on every application table.
alter table public.app_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.plans enable row level security;
alter table public.plan_products enable row level security;
alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.discounts enable row level security;
alter table public.discount_usages enable row level security;
alter table public.tax_rates enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table public.app_settings, public.profiles, public.customers, public.products, public.product_variants, public.plans, public.plan_products, public.quotations, public.quotation_items, public.subscriptions, public.subscription_items, public.invoices, public.invoice_items, public.payments, public.discounts, public.discount_usages, public.tax_rates, public.audit_logs from public, anon, authenticated;

-- Profile roles cannot be changed using the client API. Admin account provisioning is server-side/manual.
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
create policy profiles_read_self_or_admin on public.profiles for select to authenticated
using (id = (select auth.uid()) or app_private.is_admin());
create policy profiles_update_self_or_admin_name on public.profiles for update to authenticated
using (id = (select auth.uid()) or app_private.is_admin())
with check (id = (select auth.uid()) or app_private.is_admin());
create policy profiles_no_client_insert on public.profiles for insert to authenticated with check (false);
create policy profiles_no_client_delete on public.profiles for delete to authenticated using (false);

-- Customer can only see/update their linked customer record; staff may operate customer records.
grant select, insert, delete on public.customers to authenticated;
grant update (email, phone, business_name, tax_identifier, billing_address, shipping_address, notes) on public.customers to authenticated;
create policy customers_select on public.customers for select to authenticated
using (app_private.is_staff_or_admin() or profile_id = (select auth.uid()));
create policy customers_insert_staff_or_self on public.customers for insert to authenticated
with check (app_private.is_staff_or_admin() or profile_id = (select auth.uid()));
create policy customers_update_staff_or_self on public.customers for update to authenticated
using (app_private.is_staff_or_admin() or profile_id = (select auth.uid()))
with check (app_private.is_staff_or_admin() or profile_id = (select auth.uid()));
create policy customers_delete_admin on public.customers for delete to authenticated
using (app_private.is_admin());

-- Catalog: staff/customer select grants deliberately omit products.cost_price.
grant select (id, name, product_type, sales_price, currency_code, notes, is_active, created_by, created_at, updated_at) on public.products to authenticated;
grant insert, update, delete on public.products to authenticated;
create policy products_read_active_or_staff on public.products for select to authenticated
using (is_active or app_private.is_staff_or_admin());
create policy products_insert_admin on public.products for insert to authenticated with check (app_private.is_admin());
create policy products_update_admin on public.products for update to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy products_delete_admin on public.products for delete to authenticated using (app_private.is_admin());

create view public.products_catalog with (security_invoker = true) as
select id, name, product_type, sales_price, currency_code, notes, is_active, created_by, created_at, updated_at
from public.products;
grant select on public.products_catalog to authenticated;

-- Admin-only cost access through a checked RPC, because RLS cannot hide individual columns.
create or replace function public.admin_list_products_with_cost()
returns table (id uuid, name text, product_type public.product_type, sales_price numeric, cost_price numeric, currency_code char(3), notes text, is_active boolean, created_at timestamptz, updated_at timestamptz)
language plpgsql stable security definer
set search_path = '' set row_security = off
as $$
begin
  if not app_private.is_admin() then raise exception 'Admin role required' using errcode = '42501'; end if;
  return query select p.id, p.name, p.product_type, p.sales_price, p.cost_price, p.currency_code, p.notes, p.is_active, p.created_at, p.updated_at from public.products p;
end;
$$;
revoke all on function public.admin_list_products_with_cost() from public, anon;
grant execute on function public.admin_list_products_with_cost() to authenticated;

grant select, insert, update, delete on public.product_variants to authenticated;
create policy variants_select_active_or_staff on public.product_variants for select to authenticated
using (is_active and exists (select 1 from public.products p where p.id = product_id and p.is_active) or app_private.is_staff_or_admin());
create policy variants_insert_admin on public.product_variants for insert to authenticated with check (app_private.is_admin());
create policy variants_update_admin on public.product_variants for update to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy variants_delete_admin on public.product_variants for delete to authenticated using (app_private.is_admin());

grant select, insert, update, delete on public.plans to authenticated;
create policy plans_select_active_or_staff on public.plans for select to authenticated
using ((is_active and (available_from is null or available_from <= current_date) and (available_until is null or available_until >= current_date)) or app_private.is_staff_or_admin());
create policy plans_insert_admin on public.plans for insert to authenticated with check (app_private.is_admin());
create policy plans_update_admin on public.plans for update to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy plans_delete_admin on public.plans for delete to authenticated using (app_private.is_admin());

grant select, insert, update, delete on public.plan_products to authenticated;
create policy plan_products_select on public.plan_products for select to authenticated
using (app_private.is_staff_or_admin() or exists (select 1 from public.plans p where p.id = plan_id and p.is_active));
create policy plan_products_insert_admin on public.plan_products for insert to authenticated with check (app_private.is_admin());
create policy plan_products_update_admin on public.plan_products for update to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy plan_products_delete_admin on public.plan_products for delete to authenticated using (app_private.is_admin());

-- Documents: customers receive read-only access scoped through their customer record.
grant select, delete on public.quotations to authenticated;
grant insert (customer_id, quotation_number, valid_until, status, discount_amount, currency_code, notes, created_by) on public.quotations to authenticated;
grant update (customer_id, quotation_number, valid_until, status, discount_amount, currency_code, notes) on public.quotations to authenticated;
create policy quotations_select on public.quotations for select to authenticated using (app_private.can_access_customer(customer_id));
create policy quotations_insert_staff on public.quotations for insert to authenticated with check (app_private.is_staff_or_admin());
create policy quotations_update_staff on public.quotations for update to authenticated using (app_private.is_staff_or_admin()) with check (app_private.is_staff_or_admin());
create policy quotations_delete_admin on public.quotations for delete to authenticated using (app_private.is_admin());

grant select, delete on public.quotation_items to authenticated;
grant insert (quotation_id, product_id, plan_id, description, quantity, unit_price, tax_rate, currency_code) on public.quotation_items to authenticated;
grant update (quotation_id, product_id, plan_id, description, quantity, unit_price, tax_rate, currency_code) on public.quotation_items to authenticated;
create policy quotation_items_select on public.quotation_items for select to authenticated
using (exists (select 1 from public.quotations q where q.id = quotation_id and app_private.can_access_customer(q.customer_id)));
create policy quotation_items_insert_staff on public.quotation_items for insert to authenticated with check (app_private.is_staff_or_admin());
create policy quotation_items_update_staff on public.quotation_items for update to authenticated using (app_private.is_staff_or_admin()) with check (app_private.is_staff_or_admin());
create policy quotation_items_delete_admin on public.quotation_items for delete to authenticated using (app_private.is_admin());

grant select, insert, update, delete on public.subscriptions to authenticated;
create policy subscriptions_select on public.subscriptions for select to authenticated using (app_private.can_access_customer(customer_id));
create policy subscriptions_insert_staff on public.subscriptions for insert to authenticated with check (app_private.is_staff_or_admin());
create policy subscriptions_update_staff on public.subscriptions for update to authenticated using (app_private.is_staff_or_admin()) with check (app_private.is_staff_or_admin());
create policy subscriptions_delete_admin on public.subscriptions for delete to authenticated using (app_private.is_admin());

grant select, insert, update, delete on public.subscription_items to authenticated;
create policy subscription_items_select on public.subscription_items for select to authenticated
using (exists (select 1 from public.subscriptions s where s.id = subscription_id and app_private.can_access_customer(s.customer_id)));
create policy subscription_items_insert_staff on public.subscription_items for insert to authenticated with check (app_private.is_staff_or_admin());
create policy subscription_items_update_staff on public.subscription_items for update to authenticated using (app_private.is_staff_or_admin()) with check (app_private.is_staff_or_admin());
create policy subscription_items_delete_admin on public.subscription_items for delete to authenticated using (app_private.is_admin());

grant select, delete on public.invoices to authenticated;
grant insert (customer_id, subscription_id, invoice_number, billing_date, due_date, billing_period_start, billing_period_end, discount_amount, currency_code, notes, created_by) on public.invoices to authenticated;
grant update (customer_id, subscription_id, invoice_number, billing_date, due_date, billing_period_start, billing_period_end, discount_amount, currency_code, notes) on public.invoices to authenticated;
create policy invoices_select on public.invoices for select to authenticated using (app_private.can_access_customer(customer_id));
create policy invoices_insert_staff on public.invoices for insert to authenticated with check (app_private.is_staff_or_admin());
create policy invoices_update_staff on public.invoices for update to authenticated using (app_private.is_staff_or_admin()) with check (app_private.is_staff_or_admin());
create policy invoices_delete_admin on public.invoices for delete to authenticated using (app_private.is_admin());

grant select, delete on public.invoice_items to authenticated;
grant insert (invoice_id, product_id, plan_id, description, quantity, unit_price, tax_rate, currency_code) on public.invoice_items to authenticated;
grant update (invoice_id, product_id, plan_id, description, quantity, unit_price, tax_rate, currency_code) on public.invoice_items to authenticated;
create policy invoice_items_select on public.invoice_items for select to authenticated
using (exists (select 1 from public.invoices i where i.id = invoice_id and app_private.can_access_customer(i.customer_id)));
create policy invoice_items_insert_staff on public.invoice_items for insert to authenticated with check (app_private.is_staff_or_admin());
create policy invoice_items_update_staff on public.invoice_items for update to authenticated using (app_private.is_staff_or_admin()) with check (app_private.is_staff_or_admin());
create policy invoice_items_delete_admin on public.invoice_items for delete to authenticated using (app_private.is_admin());

grant select, insert, update, delete on public.payments to authenticated;
create policy payments_select on public.payments for select to authenticated using (app_private.can_access_customer(customer_id));
create policy payments_insert_staff on public.payments for insert to authenticated with check (app_private.is_staff_or_admin());
create policy payments_update_staff on public.payments for update to authenticated using (app_private.is_staff_or_admin()) with check (app_private.is_staff_or_admin());
create policy payments_delete_admin on public.payments for delete to authenticated using (app_private.is_admin());

-- Atomic invoice header + line creation. A failing line insert rolls back the entire RPC transaction.
create or replace function public.create_invoice_with_items(p_invoice jsonb, p_items jsonb)
returns uuid language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare
  new_invoice_id uuid;
  item jsonb;
begin
  if not app_private.is_staff_or_admin() then raise exception 'Staff or Admin role required' using errcode = '42501'; end if;
  if p_invoice is null or p_items is null or jsonb_typeof(p_invoice) is distinct from 'object' or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Invoice details and at least one line item are required';
  end if;
  insert into public.invoices (
    customer_id, subscription_id, billing_date, due_date, billing_period_start,
    billing_period_end, discount_amount, notes, created_by
  ) values (
    (p_invoice ->> 'customer_id')::uuid,
    nullif(p_invoice ->> 'subscription_id', '')::uuid,
    coalesce(nullif(p_invoice ->> 'billing_date', '')::date, current_date),
    (p_invoice ->> 'due_date')::date,
    nullif(p_invoice ->> 'billing_period_start', '')::date,
    nullif(p_invoice ->> 'billing_period_end', '')::date,
    0,
    p_invoice ->> 'notes',
    (select auth.uid())
  ) returning id into new_invoice_id;

  for item in select value from jsonb_array_elements(p_items) loop
    insert into public.invoice_items (
      invoice_id, product_id, plan_id, description, quantity, unit_price, tax_rate
    ) values (
      new_invoice_id,
      nullif(item ->> 'product_id', '')::uuid,
      nullif(item ->> 'plan_id', '')::uuid,
      item ->> 'description',
      (item ->> 'quantity')::numeric,
      (item ->> 'unit_price')::numeric,
      coalesce(nullif(item ->> 'tax_rate', '')::numeric, 0)
    );
  end loop;
  update public.invoices set discount_amount = coalesce(nullif(p_invoice ->> 'discount_amount', '')::numeric, 0) where id = new_invoice_id;
  return new_invoice_id;
end;
$$;
revoke all on function public.create_invoice_with_items(jsonb, jsonb) from public, anon;
grant execute on function public.create_invoice_with_items(jsonb, jsonb) to authenticated;
revoke insert (customer_id, subscription_id, invoice_number, billing_date, due_date, billing_period_start, billing_period_end, discount_amount, currency_code, notes, created_by) on public.invoices from authenticated;
revoke insert (invoice_id, product_id, plan_id, description, quantity, unit_price, tax_rate, currency_code) on public.invoice_items from authenticated;

-- Atomic quotation header + line creation.
create or replace function public.create_quotation_with_items(p_quotation jsonb, p_items jsonb)
returns uuid language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare
  new_quotation_id uuid;
  item jsonb;
begin
  if not app_private.is_staff_or_admin() then raise exception 'Staff or Admin role required' using errcode = '42501'; end if;
  if p_quotation is null or p_items is null or jsonb_typeof(p_quotation) is distinct from 'object' or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Quotation details and at least one line item are required';
  end if;
  insert into public.quotations(customer_id, valid_until, status, notes, discount_amount, created_by)
  values (
    (p_quotation ->> 'customer_id')::uuid,
    nullif(p_quotation ->> 'valid_until', '')::date,
    coalesce(nullif(p_quotation ->> 'status', '')::public.quotation_status, 'DRAFT'),
    p_quotation ->> 'notes', 0, (select auth.uid())
  ) returning id into new_quotation_id;
  for item in select value from jsonb_array_elements(p_items) loop
    insert into public.quotation_items(quotation_id, product_id, plan_id, description, quantity, unit_price, tax_rate)
    values (
      new_quotation_id,
      nullif(item ->> 'product_id', '')::uuid,
      nullif(item ->> 'plan_id', '')::uuid,
      item ->> 'description', (item ->> 'quantity')::numeric,
      (item ->> 'unit_price')::numeric, coalesce(nullif(item ->> 'tax_rate', '')::numeric, 0)
    );
  end loop;
  update public.quotations set discount_amount = coalesce(nullif(p_quotation ->> 'discount_amount', '')::numeric, 0) where id = new_quotation_id;
  return new_quotation_id;
end;
$$;
revoke all on function public.create_quotation_with_items(jsonb, jsonb) from public, anon;
grant execute on function public.create_quotation_with_items(jsonb, jsonb) to authenticated;
revoke insert (customer_id, quotation_number, valid_until, status, discount_amount, currency_code, notes, created_by) on public.quotations from authenticated;
revoke insert (quotation_id, product_id, plan_id, description, quantity, unit_price, tax_rate, currency_code) on public.quotation_items from authenticated;

-- Atomic subscription header + item creation with historical unit-price snapshots.
create or replace function public.create_subscription_with_items(p_subscription jsonb, p_items jsonb)
returns uuid language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare
  new_subscription_id uuid;
  item jsonb;
begin
  if not app_private.is_staff_or_admin() then raise exception 'Staff or Admin role required' using errcode = '42501'; end if;
  if p_subscription is null or p_items is null or jsonb_typeof(p_subscription) is distinct from 'object' or jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Subscription details and at least one line item are required';
  end if;
  insert into public.subscriptions(customer_id, plan_id, start_date, expiry_date, billing_interval, next_billing_date, auto_renew, created_by)
  values (
    (p_subscription ->> 'customer_id')::uuid,
    nullif(p_subscription ->> 'plan_id', '')::uuid,
    (p_subscription ->> 'start_date')::date,
    nullif(p_subscription ->> 'expiry_date', '')::date,
    (p_subscription ->> 'billing_interval')::public.billing_interval,
    nullif(p_subscription ->> 'next_billing_date', '')::date,
    coalesce(nullif(p_subscription ->> 'auto_renew', '')::boolean, true),
    (select auth.uid())
  ) returning id into new_subscription_id;
  for item in select value from jsonb_array_elements(p_items) loop
    insert into public.subscription_items(subscription_id, product_id, variant_id, description, quantity, unit_price)
    values (
      new_subscription_id,
      nullif(item ->> 'product_id', '')::uuid,
      nullif(item ->> 'variant_id', '')::uuid,
      item ->> 'description', (item ->> 'quantity')::numeric, (item ->> 'unit_price')::numeric
    );
  end loop;
  return new_subscription_id;
end;
$$;
revoke all on function public.create_subscription_with_items(jsonb, jsonb) from public, anon;
grant execute on function public.create_subscription_with_items(jsonb, jsonb) to authenticated;
revoke insert on public.subscriptions, public.subscription_items from authenticated;

-- State transitions are server-controlled so clients cannot mark unpaid invoices PAID.
create or replace function public.issue_invoice(p_invoice_id uuid)
returns void language plpgsql security definer
set search_path = '' set row_security = off
as $$
begin
  if not app_private.is_staff_or_admin() then raise exception 'Staff or Admin role required' using errcode = '42501'; end if;
  if not exists (select 1 from public.invoice_items ii where ii.invoice_id = p_invoice_id) then
    raise exception 'An invoice needs at least one line item before issue';
  end if;
  update public.invoices set status = 'ISSUED' where id = p_invoice_id and status = 'DRAFT';
  if not found then raise exception 'Only draft invoices can be issued'; end if;
  perform public.recalculate_invoice(p_invoice_id);
end;
$$;
create or replace function public.void_invoice(p_invoice_id uuid)
returns void language plpgsql security definer
set search_path = '' set row_security = off
as $$
declare current_paid numeric(12,2); current_state public.invoice_status;
begin
  if not app_private.is_staff_or_admin() then raise exception 'Staff or Admin role required' using errcode = '42501'; end if;
  select paid_amount, status into current_paid, current_state from public.invoices where id = p_invoice_id for update;
  if not found then raise exception 'Invoice not found'; end if;
  if current_paid <> 0 or current_state in ('PAID', 'PARTIALLY_PAID') then raise exception 'Invoices with successful payments cannot be voided'; end if;
  if current_state = 'VOID' then return; end if;
  update public.invoices set status = 'VOID' where id = p_invoice_id;
end;
$$;
revoke all on function public.issue_invoice(uuid) from public, anon;
revoke all on function public.void_invoice(uuid) from public, anon;
grant execute on function public.issue_invoice(uuid), public.void_invoice(uuid) to authenticated;

-- Configuration tables: staff may view discounts and tax rates, only admin may change them.
grant select, delete on public.discounts to authenticated;
grant insert (name, discount_type, value, currency_code, minimum_purchase, minimum_quantity, starts_at, ends_at, usage_limit, scope, is_active, created_by) on public.discounts to authenticated;
grant update (name, discount_type, value, currency_code, minimum_purchase, minimum_quantity, starts_at, ends_at, usage_limit, scope, is_active) on public.discounts to authenticated;
create policy discounts_select on public.discounts for select to authenticated
using (app_private.is_staff_or_admin() or (is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now())));
create policy discounts_insert_admin on public.discounts for insert to authenticated with check (app_private.is_admin());
create policy discounts_update_admin on public.discounts for update to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy discounts_delete_admin on public.discounts for delete to authenticated using (app_private.is_admin());

grant select, insert, delete on public.discount_usages to authenticated;
create policy discount_usages_select on public.discount_usages for select to authenticated using (app_private.can_access_customer(customer_id));
create policy discount_usages_insert_staff on public.discount_usages for insert to authenticated with check (app_private.is_staff_or_admin());
create policy discount_usages_update_denied on public.discount_usages for update to authenticated using (false) with check (false);
create policy discount_usages_delete_admin on public.discount_usages for delete to authenticated using (app_private.is_admin());

grant select, insert, update, delete on public.tax_rates to authenticated;
create policy tax_rates_select_staff_admin on public.tax_rates for select to authenticated using (app_private.is_staff_or_admin());
create policy tax_rates_insert_admin on public.tax_rates for insert to authenticated with check (app_private.is_admin());
create policy tax_rates_update_admin on public.tax_rates for update to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy tax_rates_delete_admin on public.tax_rates for delete to authenticated using (app_private.is_admin());

grant select on public.app_settings to authenticated;
grant insert (singleton, default_currency) on public.app_settings to authenticated;
grant update (default_currency) on public.app_settings to authenticated;
create policy app_settings_select_admin on public.app_settings for select to authenticated using (app_private.is_admin());
create policy app_settings_insert_admin on public.app_settings for insert to authenticated with check (app_private.is_admin());
create policy app_settings_update_admin on public.app_settings for update to authenticated using (app_private.is_admin()) with check (app_private.is_admin());
create policy app_settings_delete_denied on public.app_settings for delete to authenticated using (false);

grant select on public.audit_logs to authenticated;
create policy audit_logs_admin_select on public.audit_logs for select to authenticated using (app_private.is_admin());
create policy audit_logs_no_client_insert on public.audit_logs for insert to authenticated with check (false);
create policy audit_logs_no_client_update on public.audit_logs for update to authenticated using (false) with check (false);
create policy audit_logs_no_client_delete on public.audit_logs for delete to authenticated using (false);
-- No client INSERT/UPDATE/DELETE grants exist for audit_logs; trigger writes bypass RLS.

grant select on public.invoice_status_view to authenticated;
revoke all on sequence public.quotation_number_seq, public.subscription_number_seq, public.invoice_number_seq from public, anon, authenticated;
grant usage, select on sequence public.quotation_number_seq, public.subscription_number_seq, public.invoice_number_seq to authenticated;

-- Narrow public RPC exposure: internal authorization helpers are only callable in policies.
revoke all on function app_private.current_role() from public, anon;
revoke all on function app_private.is_admin() from public, anon;
revoke all on function app_private.is_staff_or_admin() from public, anon;
revoke all on function app_private.can_access_customer(uuid) from public, anon;
grant execute on function app_private.current_role() to authenticated;
grant execute on function app_private.is_admin() to authenticated;
grant execute on function app_private.is_staff_or_admin() to authenticated;
grant execute on function app_private.can_access_customer(uuid) to authenticated;

-- Protect security-definer internals from direct invocation; table triggers invoke them as owner.
revoke all on function public.sync_payment_customer() from public, anon, authenticated;
revoke all on function public.recalculate_quotation(uuid) from public, anon, authenticated;
revoke all on function public.recalculate_invoice(uuid) from public, anon, authenticated;
revoke all on function public.recalculate_invoice_from_item() from public, anon, authenticated;
revoke all on function public.recalculate_quotation_from_item() from public, anon, authenticated;
revoke all on function public.recalculate_invoice_from_payment() from public, anon, authenticated;
revoke all on function public.recalculate_invoice_from_header() from public, anon, authenticated;
revoke all on function public.recalculate_quotation_from_header() from public, anon, authenticated;
revoke all on function public.write_audit_log() from public, anon, authenticated;
revoke all on function public.guard_discount_usage() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.set_document_line_amounts() from public, anon, authenticated;
revoke all on function public.validate_subscription_item_variant() from public, anon, authenticated;
revoke all on function public.count_discount_usage() from public, anon, authenticated;
