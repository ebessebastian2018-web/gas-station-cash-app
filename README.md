# Bas Station

Dashboard web Bas Station membantu mencatat transaksi dan memantau kas operasional SPBU. Frontend statis terhubung langsung ke Supabase dan dipublikasikan melalui GitHub Pages.

🌐 **Demo website:** [https://ebessebastian2018-web.github.io/gas-station-cash-app/](https://ebessebastian2018-web.github.io/gas-station-cash-app/)

## Struktur repository

```text
.
├── .github/
│   └── workflows/
│       └── deploy-pages.yml
├── backend/
│   └── schema.sql
├── frontend/
│   ├── app.js
│   ├── images/
│   │   ├── station-main.jpg
│   │   ├── station-night.jpg
│   │   └── station-sunset.jpg
│   ├── index.html
│   └── styles.css
├── index.html
├── .gitignore
└── README.md
```

`frontend/` berisi halaman, JavaScript, dan stylesheet aplikasi. `backend/` hanya berisi SQL untuk menyiapkan database dan kebijakan akses Supabase; tidak ada server Node.js.
Halaman [`index.html`](index.html) di root mengarahkan pengunjung GitHub Pages berbasis branch ke aplikasi di `frontend/`.

## Persiapan Supabase

1. Pilih project Supabase yang akan digunakan.
2. Buka **SQL Editor**, lalu jalankan seluruh isi [`backend/schema.sql`](backend/schema.sql).
3. Buat akun operator melalui **Authentication → Users → Add user**. Konfirmasi email jika diminta.
4. Pastikan URL dan publishable key di awal [`frontend/app.js`](frontend/app.js) mengarah ke project tersebut. Publishable key boleh digunakan di frontend; jangan pernah menggunakan service-role/secret key.

Schema membuat tabel operasional, bucket privat `cash-receipts` (maksimal 5 MB per gambar JPG/PNG), serta policy akses untuk operator terautentikasi. Jalankan ulang schema pada project lama untuk menambahkan dukungan foto struk.

## Menjalankan lokal

Buka `frontend/index.html` dengan VS Code Live Server (atau server file statis lainnya), lalu masuk menggunakan akun operator Supabase. Aplikasi lokal akan menggunakan database Supabase yang sama dengan situs online.

## GitHub Pages

Workflow [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) otomatis menerbitkan isi folder `frontend/` saat ada push ke branch `main` atau `master`, atau ketika workflow dijalankan manual.

Di repository GitHub, buka **Settings → Pages** dan pilih **GitHub Actions** sebagai build and deployment source. Setelah itu, push perubahan ke branch utama; aplikasi tersedia di URL demo di atas.

GitHub Pages hanya menyajikan frontend statis. Workflow deploy tidak mengubah database. Jalankan perubahan struktur database secara manual melalui Supabase SQL Editor dan simpan perubahan tersebut di [`backend/schema.sql`](backend/schema.sql).

Jika login ditolak karena URL redirect, tambahkan URL GitHub Pages atau URL lokal yang digunakan ke **Supabase → Authentication → URL Configuration → Redirect URLs**.

## Fitur

- Ringkasan pemasukan, pengeluaran, saldo shift, dan jumlah transaksi.
- Grafik arus kas 7 atau 14 hari terakhir.
- Pencatatan transaksi tunai, transfer, atau kartu/QRIS.
- Catatan teks struk pembayaran pada transaksi pengeluaran.
- Upload dan pratinjau foto struk penjualan (JPG/PNG, maksimal 5 MB).
- Pembukaan dan penutupan shift kasir.
- Pencarian dan filter transaksi.
- Login operator dan penyimpanan data menggunakan Supabase.
- Beranda pengantar Bas Station dengan foto suasana pom bensin.

Foto beranda dari [Pexels](https://www.pexels.com/license/), dengan kredit pada halaman login.

## Teknologi

- Frontend: HTML, CSS, JavaScript.
- Database dan autentikasi: Supabase (PostgreSQL).
- Hosting frontend: GitHub Pages.

Ringkasan harian dan agregasi grafik menggunakan tanggal UTC. GitHub Pages memuat Supabase JS v2 dari jsDelivr CDN.
