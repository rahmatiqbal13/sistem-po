# Sistem PO Jajanan

Pencatatan pre-order jajanan untuk dua pemilik usaha. Spesifikasi lengkap: [prd-sistem-po-jajanan.md](prd-sistem-po-jajanan.md).

Stack: Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + Supabase (Postgres, Auth, Storage). Deploy ke Vercel.

## Setup

1. **Buat project Supabase**, lalu matikan pendaftaran publik: *Authentication → Sign In / Providers* → nonaktifkan
   "Allow new users to sign up" dan "Allow anonymous sign-ins".
2. **Buat akun pemilik**: *Authentication → Users → Add user* (centang *Auto Confirm User*).
3. Buka *SQL Editor* dan jalankan seluruh isi [supabase/schema.sql](supabase/schema.sql), lalu semua file di
   [supabase/migrations/](supabase/migrations/) berurutan.
   Ini membuat tabel, view `order_summary`, fungsi, RLS, dan bucket privat `bukti`. Akun yang sudah ada saat itu
   otomatis menjadi **pemilik** (tabel `admin_toko`). Admin berikutnya diundang dari *Pengaturan → Admin toko*.
   Hanya akun di `admin_toko` yang bisa membuka data; akun lain yang login tetap ditolak.
4. **Isi environment**: salin `.env.example` menjadi `.env.local`, isi URL dan anon key dari *Project Settings → API*.
5. Jalankan:
   ```bash
   npm install
   npm run dev
   ```
   Buka http://localhost:3000 dan login.

Urutan pemakaian pertama: **Pengaturan toko** (nomor WA admin & info rekening) → **Produk** (isi katalog, foto opsional) → **Batch** (buat batch berstatus Buka) → bagikan **link pemesanan** atau catat lewat **+ Pesanan Baru**.

**Upgrade database:** setiap kali `supabase/schema.sql` diperbarui, jalankan ulang seluruh isinya di SQL Editor. File ini aman dijalankan berulang dan otomatis meng-upgrade data yang sudah ada.

## Link pemesanan untuk pembeli

Setiap batch punya link publik `/po/<slug>` (tombol *Salin link* / *Bagikan ke WA* di halaman Batch).

- Pembeli tidak login dan **tidak punya akses ke tabel**. Mereka hanya bisa memanggil fungsi `get_public_batch` (lihat menu) dan `submit_public_order` (kirim pesanan). Harga, kuota, dan status batch divalidasi di server.
- Hanya produk yang dicentang di batch yang tampil. Link berhenti menerima pesanan saat status batch bukan *Buka* atau tanggal tutup sudah lewat.
- Pembeli dikenali dari nomor WA. Pesanan dari link berlabel **Dari link**, dan pembeli dengan lebih dari satu pesanan aktif di batch diberi tanda **Cek ganda**.
- Bukti transfer dikirim pembeli lewat WhatsApp, tidak diunggah ke sistem.
- Foto produk diperkecil di browser (maks. 800px, WebP) sebelum diunggah ke bucket publik `produk`. Foto lama otomatis dihapus saat diganti.

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
| `src/app/(app)/produk` | Katalog produk + foto |
| `src/app/(app)/pengaturan` | Nama toko, WA admin, info pembayaran |
| `src/app/po/[slug]` | Halaman pemesanan publik untuk pembeli |
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
