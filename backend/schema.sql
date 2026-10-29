-- Arus Kas SPBU: kasir, shift, kategori, dan transaksi kas.

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

create table if not exists public.chart_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  account_type text not null check (account_type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.transaction_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  type text not null check (type in ('income', 'expense')),
  ledger_account_id uuid references public.chart_accounts(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.transaction_categories
  add column if not exists ledger_account_id uuid references public.chart_accounts(id) on delete restrict;

create table if not exists public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid references public.shifts(id) on delete restrict,
  category_id uuid not null references public.transaction_categories(id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  description text not null default '',
  payment_method text not null default 'cash' check (payment_method in ('cash', 'transfer', 'card')),
  receipt_text text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.cash_transactions add column if not exists receipt_text text;
alter table public.cash_transactions alter column shift_id drop not null;

create table if not exists public.app_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'owner')),
  created_at timestamptz not null default now()
);

create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null default current_date,
  description text not null,
  source_type text not null check (source_type in ('manual', 'cash_transaction')),
  source_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint journal_entries_source_unique unique (source_type, source_id)
);

create table if not exists public.journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_id uuid not null references public.chart_accounts(id) on delete restrict,
  debit numeric(14, 2) not null default 0 check (debit >= 0),
  credit numeric(14, 2) not null default 0 check (credit >= 0),
  constraint journal_entry_lines_one_side check (
    (debit > 0 and credit = 0) or (credit > 0 and debit = 0)
  )
);

create index if not exists shifts_cashier_opened_idx on public.shifts (cashier_id, opened_at desc);
create unique index if not exists shifts_one_open_at_a_time_idx on public.shifts (status) where status = 'open';
create index if not exists cash_transactions_shift_occurred_idx on public.cash_transactions (shift_id, occurred_at desc);
create index if not exists cash_transactions_category_idx on public.cash_transactions (category_id);
create index if not exists journal_entries_date_idx on public.journal_entries (entry_date desc);
create index if not exists journal_entry_lines_account_idx on public.journal_entry_lines (account_id, entry_id);

create or replace function public.has_app_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.app_user_roles
    where user_id = (select auth.uid()) and role = required_role
  );
$$;

revoke all on function public.has_app_role(text) from public;
grant execute on function public.has_app_role(text) to authenticated;

alter table public.app_user_roles enable row level security;
alter table public.cashiers enable row level security;
alter table public.shifts enable row level security;
alter table public.transaction_categories enable row level security;
alter table public.cash_transactions enable row level security;
alter table public.chart_accounts enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_entry_lines enable row level security;

grant all on table public.cashiers to service_role;
grant all on table public.shifts to service_role;
grant all on table public.transaction_categories to service_role;
grant all on table public.cash_transactions to service_role;
grant all on table public.app_user_roles to service_role;
grant all on table public.chart_accounts to service_role;
grant all on table public.journal_entries to service_role;
grant all on table public.journal_entry_lines to service_role;

revoke all on table public.app_user_roles from anon, authenticated;
revoke all on table public.cashiers from anon, authenticated;
revoke all on table public.shifts from anon, authenticated;
revoke all on table public.transaction_categories from anon, authenticated;
revoke all on table public.cash_transactions from anon, authenticated;
revoke all on table public.chart_accounts from anon, authenticated;
revoke all on table public.journal_entries from anon, authenticated;
revoke all on table public.journal_entry_lines from anon, authenticated;
grant select on table public.app_user_roles to authenticated;
grant select on table public.cashiers to authenticated;
grant select, insert, update on table public.shifts to authenticated;
grant select on table public.transaction_categories to authenticated;
grant select, insert on table public.cash_transactions to authenticated;
grant select on table public.chart_accounts to authenticated;
grant select on table public.journal_entries, public.journal_entry_lines to authenticated;

drop policy if exists app_user_roles_read_self on public.app_user_roles;
create policy app_user_roles_read_self on public.app_user_roles
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists cashiers_authenticated_read on public.cashiers;
create policy cashiers_authenticated_read on public.cashiers
  for select to authenticated using (public.has_app_role('admin') or public.has_app_role('owner'));

drop policy if exists shifts_authenticated_read on public.shifts;
create policy shifts_authenticated_read on public.shifts
  for select to authenticated using (public.has_app_role('admin') or public.has_app_role('owner'));
drop policy if exists shifts_authenticated_insert on public.shifts;
create policy shifts_authenticated_insert on public.shifts
  for insert to authenticated with check (
    public.has_app_role('admin')
    and status = 'open'
    and closed_at is null
    and closing_cash is null
    and opened_at <= now() + interval '1 minute'
    and exists (
      select 1 from public.cashiers
      where cashiers.id = shifts.cashier_id and cashiers.active
    )
  );
drop policy if exists shifts_authenticated_update on public.shifts;
create policy shifts_authenticated_update on public.shifts
  for update to authenticated using (public.has_app_role('admin') and status = 'open')
  with check (public.has_app_role('admin') and status = 'closed');

create or replace function public.guard_shift_close()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_app_role('admin')
    or old.status <> 'open'
    or new.status <> 'closed'
    or new.id <> old.id
    or new.cashier_id <> old.cashier_id
    or new.opened_at <> old.opened_at
    or new.opening_cash <> old.opening_cash
    or new.notes is distinct from old.notes
    or new.closed_at is null
    or new.closed_at < old.opened_at
    or new.closed_at > now() + interval '1 minute'
    or new.closing_cash is null then
    raise exception 'Admin hanya dapat menutup shift aktif tanpa mengubah data pembukaannya.';
  end if;
  return new;
end;
$$;

drop trigger if exists shifts_guard_close on public.shifts;
create trigger shifts_guard_close
  before update on public.shifts
  for each row execute function public.guard_shift_close();

drop policy if exists categories_authenticated_read on public.transaction_categories;
create policy categories_authenticated_read on public.transaction_categories
  for select to authenticated using (public.has_app_role('admin') or public.has_app_role('owner'));

drop policy if exists transactions_authenticated_read on public.cash_transactions;
create policy transactions_authenticated_read on public.cash_transactions
  for select to authenticated using (public.has_app_role('owner'));
drop policy if exists transactions_authenticated_insert on public.cash_transactions;
create policy transactions_authenticated_insert on public.cash_transactions
  for insert to authenticated with check (
    (
      public.has_app_role('owner')
      and (
        cash_transactions.shift_id is null
        or exists (
          select 1 from public.shifts
          where shifts.id = cash_transactions.shift_id and shifts.status = 'open'
        )
      )
    )
    or (
      public.has_app_role('admin')
      and cash_transactions.shift_id is not null
      and exists (
        select 1 from public.transaction_categories
        where transaction_categories.id = cash_transactions.category_id
          and transaction_categories.type = 'income'
          and transaction_categories.active
      )
      and exists (
        select 1 from public.shifts
        where shifts.id = cash_transactions.shift_id and shifts.status = 'open'
      )
    )
  );

drop policy if exists chart_accounts_owner_read on public.chart_accounts;
create policy chart_accounts_owner_read on public.chart_accounts
  for select to authenticated using (public.has_app_role('owner'));

drop policy if exists journal_entries_owner_read on public.journal_entries;
create policy journal_entries_owner_read on public.journal_entries
  for select to authenticated using (public.has_app_role('owner'));

drop policy if exists journal_entry_lines_owner_read on public.journal_entry_lines;
create policy journal_entry_lines_owner_read on public.journal_entry_lines
  for select to authenticated using (public.has_app_role('owner'));

drop policy if exists cash_receipts_authenticated_read on storage.objects;
drop policy if exists cash_receipts_authenticated_insert on storage.objects;
drop policy if exists cash_receipts_authenticated_delete on storage.objects;
alter table public.cash_transactions drop column if exists receipt_path;

insert into public.chart_accounts (code, name, account_type) values
  ('1001', 'Kas Tunai', 'asset'),
  ('1002', 'Bank / QRIS', 'asset'),
  ('1201', 'Persediaan BBM', 'asset'),
  ('4001', 'Pendapatan Penjualan BBM', 'revenue'),
  ('4002', 'Pendapatan Penjualan Non-BBM', 'revenue'),
  ('4099', 'Pendapatan Lain-lain', 'revenue'),
  ('5101', 'Beban Operasional SPBU', 'expense'),
  ('5199', 'Beban Lain-lain', 'expense')
on conflict (code) do update set
  name = excluded.name,
  account_type = excluded.account_type;

insert into public.cashiers (full_name)
select 'Kasir Utama'
where not exists (select 1 from public.cashiers where full_name = 'Kasir Utama');

insert into public.transaction_categories (name, type) values
  ('Penjualan BBM', 'income'),
  ('Penjualan non-BBM', 'income'),
  ('Isi angin', 'income'),
  ('Tambal ban bocor', 'income'),
  ('Ganti ban', 'income'),
  ('Ganti oli', 'income'),
  ('Penerimaan lain', 'income'),
  ('Pembelian stok BBM', 'expense'),
  ('Operasional SPBU', 'expense'),
  ('Setoran bank', 'expense'),
  ('Pengeluaran lain', 'expense')
on conflict (name) do nothing;

update public.transaction_categories category
set ledger_account_id = account.id
from public.chart_accounts account
where (category.name, account.code) in (
  ('Penjualan BBM', '4001'),
  ('Penjualan non-BBM', '4002'),
  ('Isi angin', '4099'),
  ('Tambal ban bocor', '4099'),
  ('Ganti ban', '4099'),
  ('Ganti oli', '4099'),
  ('Penerimaan lain', '4099'),
  ('Pembelian stok BBM', '1201'),
  ('Operasional SPBU', '5101'),
  ('Setoran bank', '1002'),
  ('Pengeluaran lain', '5199')
)
and category.ledger_account_id is null;

create or replace function public.post_cash_transaction_journal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  transaction_category public.transaction_categories%rowtype;
  transaction_account_id uuid;
  payment_account_id uuid;
  journal_id uuid;
  description_text text;
begin
  select * into transaction_category
  from public.transaction_categories
  where id = new.category_id;

  select id into payment_account_id
  from public.chart_accounts
  where code = case when new.payment_method = 'cash' then '1001' else '1002' end;

  transaction_account_id := transaction_category.ledger_account_id;
  if transaction_account_id is null then
    select id into transaction_account_id
    from public.chart_accounts
    where code = case when transaction_category.type = 'income' then '4099' else '5199' end;
  end if;

  if transaction_account_id is null or payment_account_id is null then
    raise exception 'Akun untuk jurnal transaksi belum tersedia.';
  end if;

  description_text := concat_ws(' — ', transaction_category.name, nullif(trim(new.description), ''));
  insert into public.journal_entries (entry_date, description, source_type, source_id, created_by)
  values (new.occurred_at::date, description_text, 'cash_transaction', new.id, auth.uid())
  returning id into journal_id;

  if transaction_category.type = 'income' then
    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values
      (journal_id, payment_account_id, new.amount, 0),
      (journal_id, transaction_account_id, 0, new.amount);
  else
    insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
    values
      (journal_id, transaction_account_id, new.amount, 0),
      (journal_id, payment_account_id, 0, new.amount);
  end if;

  return new;
end;
$$;

drop trigger if exists cash_transactions_post_journal on public.cash_transactions;
create trigger cash_transactions_post_journal
  after insert on public.cash_transactions
  for each row execute function public.post_cash_transaction_journal();

insert into public.journal_entries (entry_date, description, source_type, source_id)
select
  cash_tx.occurred_at::date,
  concat_ws(' — ', category.name, nullif(trim(cash_tx.description), '')),
  'cash_transaction',
  cash_tx.id
from public.cash_transactions cash_tx
join public.transaction_categories category on category.id = cash_tx.category_id
where not exists (
  select 1 from public.journal_entries journal_row
  where journal_row.source_type = 'cash_transaction' and journal_row.source_id = cash_tx.id
)
on conflict (source_type, source_id) do nothing;

insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
select journal_row.id, posting.account_id, posting.debit, posting.credit
from public.journal_entries journal_row
join public.cash_transactions cash_tx
  on journal_row.source_type = 'cash_transaction' and journal_row.source_id = cash_tx.id
join public.transaction_categories category on category.id = cash_tx.category_id
cross join lateral (
  select
    case
      when category.type = 'income' then payment_account.id
      else coalesce(category.ledger_account_id, fallback_account.id)
    end as account_id,
    cash_tx.amount as debit,
    0::numeric as credit
  from public.chart_accounts payment_account
  left join public.chart_accounts fallback_account
    on fallback_account.code = case when category.type = 'income' then '4099' else '5199' end
  where payment_account.code = case when cash_tx.payment_method = 'cash' then '1001' else '1002' end
  union all
  select
    case
      when category.type = 'income' then coalesce(category.ledger_account_id, fallback_account.id)
      else payment_account.id
    end as account_id,
    0::numeric as debit,
    cash_tx.amount as credit
  from public.chart_accounts payment_account
  left join public.chart_accounts fallback_account
    on fallback_account.code = case when category.type = 'income' then '4099' else '5199' end
  where payment_account.code = case when cash_tx.payment_method = 'cash' then '1001' else '1002' end
) posting
where not exists (
  select 1 from public.journal_entry_lines line where line.entry_id = journal_row.id
);

create or replace function public.create_manual_journal_entry(
  p_entry_date date,
  p_description text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  journal_id uuid;
  debit_total numeric;
  credit_total numeric;
  line_count integer;
begin
  if not public.has_app_role('owner') then
    raise exception 'Hanya owner yang dapat mencatat jurnal umum.';
  end if;
  if p_entry_date is null or nullif(trim(p_description), '') is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Tanggal, keterangan, dan baris jurnal wajib diisi.';
  end if;

  select count(*), coalesce(sum(line.debit), 0), coalesce(sum(line.credit), 0)
  into line_count, debit_total, credit_total
  from jsonb_to_recordset(p_lines) as line(account_id uuid, debit numeric, credit numeric);

  if line_count < 2 or debit_total <= 0 or debit_total <> credit_total then
    raise exception 'Jurnal harus memiliki minimal dua baris dan total debit harus sama dengan kredit.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as line(account_id uuid, debit numeric, credit numeric)
    where line.account_id is null
      or line.debit is null or line.credit is null
      or line.debit < 0 or line.credit < 0
      or line.debit <> round(line.debit, 2)
      or line.credit <> round(line.credit, 2)
      or ((line.debit > 0) = (line.credit > 0))
      or not exists (
        select 1 from public.chart_accounts account
        where account.id = line.account_id and account.active
      )
  ) then
    raise exception 'Setiap baris harus memilih akun dan mengisi debit atau kredit saja.';
  end if;

  insert into public.journal_entries (entry_date, description, source_type, created_by)
  values (p_entry_date, trim(p_description), 'manual', auth.uid())
  returning id into journal_id;

  insert into public.journal_entry_lines (entry_id, account_id, debit, credit)
  select journal_id, line.account_id, line.debit, line.credit
  from jsonb_to_recordset(p_lines) as line(account_id uuid, debit numeric, credit numeric);

  return journal_id;
end;
$$;

revoke all on function public.create_manual_journal_entry(date, text, jsonb) from public;
grant execute on function public.create_manual_journal_entry(date, text, jsonb) to authenticated;

insert into public.app_user_roles (user_id, role) values
  ('968e2437-698a-44e3-ae91-a127e2475da9', 'owner'),
  ('852217c1-9fa8-4e00-bb70-2adf8eef2faa', 'admin')
on conflict (user_id) do update set role = excluded.role;
