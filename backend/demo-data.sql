-- Data contoh untuk mengisi riwayat, laporan, jurnal, dan buku besar.
-- Aman dijalankan ulang: ID tetap dan transaksi yang sudah ada tidak diubah.
-- Transaksi demo tidak dikaitkan dengan shift dan tidak mengubah saldo shift aktif.

do $$
begin
  if exists (
    select required.name
    from (values
      ('Penjualan BBM'),
      ('Penjualan non-BBM'),
      ('Isi angin'),
      ('Tambal ban bocor'),
      ('Ganti oli'),
      ('Penerimaan lain'),
      ('Operasional SPBU')
    ) as required(name)
    where not exists (
      select 1
      from public.transaction_categories category
      where category.name = required.name
        and category.active
        and category.type = case
          when required.name = 'Operasional SPBU' then 'expense'
          else 'income'
        end
    )
  ) then
    raise exception 'Kategori demo belum lengkap. Jalankan backend/schema.sql terlebih dahulu.';
  end if;
end;
$$;

insert into public.cash_transactions (
  id,
  shift_id,
  category_id,
  amount,
  description,
  payment_method,
  receipt_text,
  occurred_at
)
select
  sample.id,
  null,
  category.id,
  sample.amount,
  sample.description,
  sample.payment_method,
  sample.receipt_text,
  ((current_timestamp at time zone 'Asia/Jakarta')::date - sample.days_ago + time '12:00')
    at time zone 'Asia/Jakarta'
from (values
  ('a47e6d3c-39d9-4c72-8c3f-101010000001'::uuid, 'Penjualan BBM', 125000::numeric, 'Penjualan V1 12,5 liter', 'cash', 'V1 · 12,5 liter × Rp10.000/liter', 0),
  ('a47e6d3c-39d9-4c72-8c3f-101010000002'::uuid, 'Isi angin', 10000::numeric, 'Layanan isi angin', 'cash', 'Layanan isi angin', 0),
  ('a47e6d3c-39d9-4c72-8c3f-101010000003'::uuid, 'Tambal ban bocor', 25000::numeric, 'Layanan tambal ban', 'cash', 'Layanan tambal ban bocor', 1),
  ('a47e6d3c-39d9-4c72-8c3f-101010000004'::uuid, 'Ganti oli', 85000::numeric, 'Layanan ganti oli', 'transfer', 'Layanan ganti oli', 2),
  ('a47e6d3c-39d9-4c72-8c3f-101010000005'::uuid, 'Penjualan non-BBM', 50000::numeric, 'Penjualan barang non-BBM', 'card', 'Penjualan barang non-BBM', 3),
  ('a47e6d3c-39d9-4c72-8c3f-101010000006'::uuid, 'Operasional SPBU', 45000::numeric, 'Pembelian perlengkapan operasional', 'cash', 'Pembelian perlengkapan operasional', 4),
  ('a47e6d3c-39d9-4c72-8c3f-101010000007'::uuid, 'Penerimaan lain', 20000::numeric, 'Penerimaan lain-lain', 'transfer', 'Penerimaan lain-lain', 6)
) as sample(id, category_name, amount, description, payment_method, receipt_text, days_ago)
join public.transaction_categories category
  on category.name = sample.category_name
  and category.active
on conflict (id) do nothing;
