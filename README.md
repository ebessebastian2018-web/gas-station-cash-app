# Aplikasi Kas Operasional SPBU

Dashboard berbasis web untuk mencatat transaksi dan memantau kas operasional SPBU. Repository ini memisahkan frontend dan backend agar bisa dicoba secara lokal, sementara versi frontend statis dapat dibuka melalui GitHub Pages.

🌐 **Demo website:** [https://ebessebastian2018-web.github.io/gas-station-cash-app/](https://ebessebastian2018-web.github.io/gas-station-cash-app/)

## Fitur

- Ringkasan pemasukan, pengeluaran, saldo shift, dan jumlah transaksi.
- Grafik arus kas untuk 7 atau 14 hari terakhir.
- Pencatatan transaksi tunai, transfer, atau kartu/QRIS.
- Pembukaan dan penutupan shift kasir.
- Pencarian dan filter transaksi.
- Login operator dan penyimpanan data menggunakan Supabase.

## Struktur repository

```text
.
├── backend/
│   ├── .env.example
│   ├── app.js
│   └── schema.sql
├── frontend/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── docs/
├── .gitignore
├── index.html
└── README.md
```

Frontend adalah halaman aplikasi. Backend Node.js menyajikan frontend sekaligus API untuk login dan operasi data saat dijalankan secara lokal. Database dan autentikasi dikelola oleh Supabase.

## Menjalankan aplikasi lokal

### Persiapan Supabase

1. Buat atau pilih project Supabase.
2. Buka **SQL Editor**, lalu jalankan seluruh isi [`backend/schema.sql`](backend/schema.sql) untuk membuat tabel, policy akses, dan kategori awal.
3. Buat akun operator melalui **Authentication → Users → Add user**. Konfirmasi email jika diminta.

### Jalankan frontend dan backend

Pastikan Node.js 18 atau lebih baru sudah terpasang. Dari folder repository:

1. Salin `backend/.env.example` menjadi `backend/.env`.
2. Isi file `backend/.env` dengan URL project dan **anon/publishable key** dari **Supabase → Project Settings → API**:

   ```env
   SUPABASE_URL=https://PROJECT_REF.supabase.co
   SUPABASE_ANON_KEY=sb_publishable_...
   PORT=3000
   ```

3. Jalankan server:

   ```powershell
   node backend/app.js
   ```

4. Buka [http://localhost:3000](http://localhost:3000), lalu masuk dengan akun operator Supabase.

Tidak ada paket npm tambahan yang perlu diinstal. Backend dan frontend lokal dilayani dari origin yang sama.

> Jangan unggah `backend/.env` ke GitHub. File tersebut diabaikan oleh `.gitignore`. Gunakan hanya anon/publishable key; jangan pernah memasukkan service-role/secret key ke frontend.

## GitHub Pages

GitHub Pages hanya menjalankan frontend statis, bukan backend Node.js. Untuk mengaktifkan demo Pages dengan project Supabase sendiri:

1. Di **Settings → Pages** repository, pilih **Deploy from a branch**, branch `main`, folder `/(root)`.
2. Atur `SUPABASE_URL` dan `SUPABASE_PUBLISHABLE_KEY` di awal [`frontend/app.js`](frontend/app.js) menggunakan URL dan publishable key project Supabase.
3. Jalankan [`backend/schema.sql`](backend/schema.sql) di Supabase dan buat akun operator.
4. Jika diperlukan, tambahkan URL GitHub Pages pada **Supabase → Authentication → URL Configuration → Redirect URLs**.

Untuk menjalankan versi lokal dengan backend, ikuti petunjuk di atas. Backend Node.js untuk penggunaan online perlu di-deploy ke layanan hosting yang mendukung server Node.js.

## Dokumentasi database

Diagram ERD, relasi, constraint, indeks, dan kebijakan RLS tersedia di [`docs/skema-sistem-kas-spbu.md`](docs/skema-sistem-kas-spbu.md).

## Teknologi

- Frontend: HTML, CSS, JavaScript.
- Backend: Node.js built-in HTTP server.
- Database dan autentikasi: Supabase (PostgreSQL).

Ringkasan harian dan agregasi grafik menggunakan tanggal UTC. GitHub Pages memuat Supabase JS v2 dari jsDelivr CDN.
