-- Arus Kas SPBU: empat entitas inti untuk kasir, shift, kategori, dan transaksi.

create table if not exists public.cashiers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  cashier_id uuid not null references public.cashiers(id) on delete restrict,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_cash numeric(14, 2) not null default 0 check (opening_cash >= 0),
  closing_cash numeric(14, 2) check (closing_cash is null or closing_cash >= 0),
  status text not null default 'open' check (status in ('open', 'closed')),
  notes text,
  constraint shifts_closed_state check (
    (status = 'open' and closed_at is null and closing_cash is null)
    or (status = 'closed' and closed_at is not null and closing_cash is not null)
  )
);

create table if not exists public.transaction_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null check (type in ('income', 'expense')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts(id) on delete restrict,
  category_id uuid not null references public.transaction_categories(id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  description text not null default '',
  payment_method text not null default 'cash' check (payment_method in ('cash', 'transfer', 'card')),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists shifts_cashier_opened_idx on public.shifts (cashier_id, opened_at desc);
create unique index if not exists shifts_one_open_at_a_time_idx on public.shifts (status) where status = 'open';
create index if not exists cash_transactions_shift_occurred_idx on public.cash_transactions (shift_id, occurred_at desc);
create index if not exists cash_transactions_category_idx on public.cash_transactions (category_id);

alter table public.cashiers enable row level security;
alter table public.shifts enable row level security;
alter table public.transaction_categories enable row level security;
alter table public.cash_transactions enable row level security;

grant all on table public.cashiers to service_role;
grant all on table public.shifts to service_role;
grant all on table public.transaction_categories to service_role;
grant all on table public.cash_transactions to service_role;

grant select on table public.cashiers to authenticated;
grant select, insert, update on table public.shifts to authenticated;
grant select on table public.transaction_categories to authenticated;
grant select, insert on table public.cash_transactions to authenticated;

drop policy if exists cashiers_authenticated_read on public.cashiers;
create policy cashiers_authenticated_read on public.cashiers
  for select to authenticated using (true);

drop policy if exists shifts_authenticated_read on public.shifts;
create policy shifts_authenticated_read on public.shifts
  for select to authenticated using (true);
drop policy if exists shifts_authenticated_insert on public.shifts;
create policy shifts_authenticated_insert on public.shifts
  for insert to authenticated with check (true);
drop policy if exists shifts_authenticated_update on public.shifts;
create policy shifts_authenticated_update on public.shifts
  for update to authenticated using (true) with check (true);

drop policy if exists categories_authenticated_read on public.transaction_categories;
create policy categories_authenticated_read on public.transaction_categories
  for select to authenticated using (true);

drop policy if exists transactions_authenticated_read on public.cash_transactions;
create policy transactions_authenticated_read on public.cash_transactions
  for select to authenticated using (true);
drop policy if exists transactions_authenticated_insert on public.cash_transactions;
create policy transactions_authenticated_insert on public.cash_transactions
  for insert to authenticated with check (true);

insert into public.cashiers (full_name)
select 'Kasir Utama'
where not exists (select 1 from public.cashiers where full_name = 'Kasir Utama');

insert into public.transaction_categories (name, type) values
  ('Penjualan BBM', 'income'),
  ('Penjualan non-BBM', 'income'),
  ('Penerimaan lain', 'income'),
  ('Pembelian stok BBM', 'expense'),
  ('Operasional SPBU', 'expense'),
  ('Setoran bank', 'expense'),
  ('Pengeluaran lain', 'expense')
on conflict (name) do nothing;
