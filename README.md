# Sistem PO Jajanan

Pencatatan pre-order jajanan untuk dua pemilik usaha. Spesifikasi lengkap: [prd-sistem-po-jajanan.md](prd-sistem-po-jajanan.md).

Stack: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + Supabase (Postgres, Auth, Storage). Deploy ke Vercel.

## Setup

1. **Buat project Supabase**, lalu buka *SQL Editor* dan jalankan seluruh isi [supabase/schema.sql](supabase/schema.sql).
   Ini membuat tabel, view `order_summary`, fungsi `save_order` / `set_order_status`, RLS, dan bucket privat `bukti`.
2. **Matikan pendaftaran publik**: *Authentication → Sign In / Providers → Email* → nonaktifkan "Allow new users to sign up".
3. **Buat dua akun pemilik**: *Authentication → Users → Add user* (centang *Auto Confirm User*).
4. **Isi environment**: salin `.env.example` menjadi `.env.local`, isi URL dan anon key dari *Project Settings → API*.
5. Jalankan:
   ```bash
   npm install
   npm run dev
   ```
   Buka http://localhost:3000 dan login.

Urutan pemakaian pertama: **Produk** (isi katalog) → **Batch** (buat batch berstatus Buka) → **+ Pesanan Baru**.

## Deploy ke Vercel

Import repo ke Vercel, isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` di Environment Variables, lalu deploy.
Aktifkan backup harian di Supabase (atau ekspor Excel tiap akhir batch).

## Struktur

| Lokasi | Isi |
|---|---|
| `supabase/schema.sql` | Skema, view, fungsi, RLS, storage |
| `src/proxy.ts` | Semua halaman wajib login |
| `src/app/(app)/pesanan` | Dashboard batch (ringkasan, rekap singkat, daftar + filter + ekspor), detail, formulir |
| `src/app/(app)/batch` | Batch PO + kuota per produk |
| `src/app/(app)/rekap` | Rekap produksi, ringkasan keuangan, daftar pengambilan per hari |
| `src/app/(app)/produk` | Katalog produk |
| `src/lib/calc.ts` | Rumus total & status bayar (diuji di `calc.test.ts`) |

## Catatan desain

- **Status bayar tidak disimpan**; dihitung di view `order_summary` dari jumlah pembayaran vs total.
- **Harga disnapshot** di `order_items` saat pesanan dibuat; mengubah harga produk tidak mengubah pesanan lama.
- **Konflik edit**: setiap simpan mengirim `updated_at` yang dibaca; jika pesanan sudah diubah akun lain, simpan ditolak dan pengguna diminta memuat ulang.
- **Dibatalkan** tidak menghapus data; tidak dihitung di rekap produksi maupun tagihan.
- Semua nominal disimpan sebagai bilangan bulat Rupiah.

## Perintah

```bash
npm run dev     # server pengembangan
npm run build   # build produksi
npm run lint
npm test        # uji rumus total & status bayar
```
