# Aplikasi Kas Operasional SPBU

Dashboard berbasis web untuk mencatat transaksi dan memantau kas operasional SPBU. Repository ini memisahkan frontend dan backend agar bisa dicoba secara lokal, sementara versi frontend statis dapat dibuka melalui GitHub Pages.

🌐 **Demo website:** [https://ebessebastian2018-web.github.io/gas-station-cash-app/](https://ebessebastian2018-web.github.io/gas-station-cash-app/)

## Fitur

- Ringkasan pemasukan, pengeluaran, saldo shift, dan jumlah transaksi.
- Grafik arus kas untuk 7 atau 14 hari terakhir.
- Pencatatan transaksi tunai, transfer, atau kartu/QRIS.
- Catatan teks struk pembayaran pada transaksi pengeluaran.
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
├── .github/
│   └── workflows/
│       └── deploy-pages.yml
├── frontend/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── supabase/
│   ├── config.toml
│   └── migrations/
├── docs/
├── .gitignore
├── index.html
└── README.md
```

Frontend adalah halaman aplikasi. Backend Node.js menyajikan frontend sekaligus API untuk login dan operasi data saat dijalankan secara lokal. Database dan autentikasi dikelola oleh Supabase.

## Menjalankan aplikasi lokal

### Persiapan Supabase

1. Buat atau pilih project Supabase.
2. Buka **SQL Editor**, lalu jalankan seluruh isi [`backend/schema.sql`](backend/schema.sql) untuk membuat tabel, policy akses, serta kategori awal.
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

Saat mencatat pengeluaran, rincian struk dapat ditulis langsung (maksimal 2.000 karakter). Klik **Lihat struk** pada daftar transaksi untuk membaca teksnya. Jalankan ulang [`backend/schema.sql`](backend/schema.sql) pada project yang sudah ada agar kolom `receipt_text` tersedia.

> Jangan unggah `backend/.env` ke GitHub. File tersebut diabaikan oleh `.gitignore`. Gunakan hanya anon/publishable key; jangan pernah memasukkan service-role/secret key ke frontend.

## GitHub Pages

GitHub Pages hanya menjalankan frontend statis, bukan backend Node.js. Workflow [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) menerbitkan isi repository saat ada push ke branch `main` atau `master`, atau saat dijalankan manual di tab **Actions**.

1. Pastikan file perubahan sudah di-push ke repository GitHub.
2. Di **Settings → Pages**, pilih **GitHub Actions** sebagai build and deployment source.
3. Jalankan workflow **Deploy GitHub Pages** pada tab **Actions**, atau push perubahan ke branch `main`/`master`.
4. Pastikan URL dan publishable key Supabase di awal [`frontend/app.js`](frontend/app.js) menunjuk project yang ingin digunakan. Publishable key aman untuk frontend; jangan gunakan secret/service-role key.
5. Jalankan schema database di Supabase dan buat akun operator. Jika diperlukan, tambahkan URL GitHub Pages pada **Supabase → Authentication → URL Configuration → Redirect URLs**.

Untuk menjalankan versi lokal dengan backend, ikuti petunjuk di atas. Backend Node.js untuk penggunaan online perlu di-deploy ke layanan hosting yang mendukung server Node.js.

## Supabase migrations

Konfigurasi Supabase CLI berada di [`supabase/config.toml`](supabase/config.toml), dan schema awal yang sudah ada dicatat sebagai [`supabase/migrations/20261012000000_initial_schema.sql`](supabase/migrations/20261012000000_initial_schema.sql). Migration tersebut mencerminkan [`backend/schema.sql`](backend/schema.sql) untuk setup project baru; gunakan folder migrations sebagai riwayat perubahan database berikutnya.

Untuk menjalankan migration pada project Supabase:

```powershell
npx supabase login
npx supabase link --project-ref dxsuybxregdldmkduuye
npx supabase db push
```

Perintah `db push` mengubah database project yang terhubung. Jangan jalankan sebelum memeriksa migration dan memastikan target project benar. Workflow GitHub Pages hanya menerbitkan frontend; workflow tersebut tidak mengubah database Supabase.

### Menjalankan dengan VS Code Live Server

Live Server (biasanya `http://127.0.0.1:5500`) menggunakan Supabase langsung dari frontend. Pastikan project Supabase sudah menjalankan `backend/schema.sql`, lalu masuk dengan akun operator Supabase. Untuk memakai backend Node.js lokal, jalankan `node backend/app.js` dan buka `http://localhost:3000`.

## Dokumentasi database

Diagram ERD, relasi, constraint, indeks, dan kebijakan RLS tersedia di [`docs/skema-sistem-kas-spbu.md`](docs/skema-sistem-kas-spbu.md).

## Teknologi

- Frontend: HTML, CSS, JavaScript.
- Backend: Node.js built-in HTTP server.
- Database dan autentikasi: Supabase (PostgreSQL).

Ringkasan harian dan agregasi grafik menggunakan tanggal UTC. GitHub Pages memuat Supabase JS v2 dari jsDelivr CDN.
