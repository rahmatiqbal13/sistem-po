# PRD: Sistem Pencatatan Pre-Order (PO) Jajanan

**Status:** Draft v1 (siap direview)
**Tanggal:** 13 Oktober 2026
**Pemilik produk:** Iqbal (bersama istri sebagai pengguna utama kedua)
**Jenis:** Alat internal usaha rumahan, bukan produk komersial

---

## 1. Executive Summary

### 1.1 Problem Statement
Usaha PO jajanan (kebab, roti maryam, dan produk lain) dijalankan berdua. Pesanan masuk lewat chat (WA/DM) dan dicatat manual. Akibatnya: pesanan bisa terlewat atau tercatat ganda, status bayar (lunas/DP/belum) sulit dilacak, dan jumlah yang harus diproduksi per batch PO harus dihitung ulang dari chat satu per satu.

### 1.2 Tujuan (Goals)
1. Semua pesanan satu batch PO tercatat di satu tempat, dapat diakses suami dan istri dari HP maupun desktop.
2. Status pembayaran setiap pesanan terlihat jelas (belum bayar / DP / lunas) beserta sisa tagihannya.
3. Rekap produksi per batch (total qty per produk) tersedia otomatis, tanpa hitung manual.
4. Daftar pengambilan/pengantaran per hari tersedia dalam satu layar.

### 1.3 Non-Goals (v1)
- **Pemesanan mandiri oleh pembeli** (halaman publik/form pembeli). *Diputuskan: v1 hanya dicatat oleh Anda berdua.*
- **Payment gateway / integrasi QRIS otomatis.** Pembayaran dicatat manual.
- **Integrasi WhatsApp API otomatis.** Hanya tombol buka chat WA dengan teks siap pakai (P1).
- **Perhitungan ongkir otomatis / integrasi kurir.** Ongkir diisi manual.
- **Stok bahan baku, HPP, laporan laba rugi, akuntansi.**
- **Multi-outlet, multi-tenant, loyalty/poin, voucher.**
- **Login untuk pembeli.**
- **Native app.** v1 memakai web responsif (PWA).

### 1.4 Success Metrics
Angka di bawah adalah target uji coba, bukan hasil ukur. Baseline sekarang belum diukur dan perlu dicatat di batch PO pertama.

| Metrik | Target | Cara ukur |
|---|---|---|
| Waktu mencatat 1 pesanan (3 item) | ≤ 60 detik | Stopwatch pada 10 pesanan pertama |
| Pesanan terlewat/tercatat ganda per batch | 0 | Cocokkan dengan chat di akhir batch |
| Waktu melihat rekap produksi satu batch | ≤ 5 detik (1 klik dari halaman batch) | Uji manual |
| Pesanan dengan status bayar yang salah di akhir batch | 0 | Cocokkan dengan mutasi rekening/uang tunai |
| Pemakaian aktif | Dipakai di 3 batch PO berturut-turut tanpa kembali ke catatan manual | Observasi sendiri |

---

## 2. Persona & Pengguna

| Pengguna | Deskripsi | Perangkat utama |
|---|---|---|
| **Pemilik (Iqbal & istri)** | Dua akun dengan hak akses sama penuh. Mencatat pesanan, pembayaran, dan mengelola produk/batch. | HP (utama), desktop (rekap & laporan) |

Pembeli **bukan** pengguna sistem. Data pembeli hanya dicatat oleh pemilik.

---

## 3. UX & Functionality

### 3.1 Alur Utama (User Flow)

1. **Buat Batch PO**: isi nama batch, tanggal buka, tanggal tutup, tanggal produksi/pengambilan.
2. **Pesanan masuk lewat chat**: pilih atau tambah pembeli → pilih produk dan qty → pilih cara terima barang → simpan.
3. **Catat pembayaran**: tambah pembayaran (jumlah, metode, tanggal) pada pesanan; status bayar terhitung otomatis.
4. **Tutup batch**: lihat rekap produksi, cetak/salin daftar produksi.
5. **Hari H**: buka daftar pengambilan/pengantaran, tandai pesanan "selesai"; pesanan COD ditandai lunas saat uang diterima.

### 3.2 Fitur P0 (Wajib untuk v1)

**A. Manajemen Batch PO**
- Buat, edit, tutup batch. Status batch: Draft, Buka, Tutup, Selesai.
- Setiap pesanan terhubung ke tepat satu batch.

**B. Katalog Produk**
- Nama, harga, status aktif/nonaktif.
- Harga tersimpan pada pesanan saat dibuat (perubahan harga nanti tidak mengubah pesanan lama).
- Kuota per produk per batch bersifat opsional.

**C. Pencatatan Pembeli**
- Nama dan nomor WhatsApp. Pencarian cepat berdasarkan nama atau nomor.
- Pembeli lama dapat dipilih ulang, tidak perlu input ulang.

**D. Pencatatan Pesanan**
- Item (produk, qty, catatan per item, mis. "tanpa sambal"), subtotal otomatis.
- Cara terima: **Ambil sendiri**, **Diantar sendiri**, atau **Kurir online**. Untuk antar dan kurir wajib mengisi alamat; ongkir diisi manual.
- Total pesanan = subtotal + ongkir.
- Status pesanan: Baru, Dikonfirmasi, Diproduksi, Siap, Selesai, Dibatalkan.
- Edit pesanan diizinkan selama belum berstatus Selesai.

**E. Pencatatan Pembayaran**
- Satu pesanan dapat memiliki beberapa pembayaran (mendukung DP lalu pelunasan).
- Metode: Transfer bank, E-wallet, Tunai (COD).
- Status bayar dihitung otomatis dari total pembayaran:
  - **Belum bayar**: total bayar = 0
  - **DP**: 0 < total bayar < total pesanan
  - **Lunas**: total bayar ≥ total pesanan
- Sisa tagihan ditampilkan di setiap pesanan.
- Unggah bukti transfer bersifat opsional (satu foto per pembayaran).

**F. Rekap dan Laporan per Batch**
- Rekap produksi: total qty per produk.
- Ringkasan keuangan: total pesanan, total terbayar, total belum terbayar, jumlah pesanan per status bayar.
- Daftar pengambilan/pengantaran, dikelompokkan per tanggal dan cara terima.
- Ekspor ke Excel/CSV (daftar pesanan dan rekap produksi).

**G. Autentikasi**
- Login email + password untuk dua akun pemilik. Halaman data tidak dapat diakses tanpa login.

### 3.3 Fitur P1 (Setelah v1 dipakai 3 batch)
- Tombol "Kirim ke WhatsApp": membuka chat pembeli dengan teks konfirmasi pesanan dan tagihan siap pakai (tanpa API, hanya tautan `wa.me`).
- Pengingat pesanan yang belum lunas mendekati hari H.
- Cetak/PDF nota sederhana per pesanan.
- Duplikasi batch lama sebagai template batch baru.
- Riwayat pembelian per pembeli (pelanggan setia, produk favorit).

### 3.4 Fitur P2 (Hanya jika kebutuhan terbukti)
- Form pemesanan mandiri untuk pembeli (halaman publik per batch).
- Rekap bulanan lintas batch dan grafik tren.
- Penjualan non-PO (langsung di tempat).

### 3.5 Acceptance Criteria (terukur)

- [ ] Menyimpan pesanan baru dengan 3 item selesai dalam ≤ 60 detik oleh pengguna yang sudah terbiasa.
- [ ] Total pesanan = jumlah (harga × qty) semua item + ongkir; selisih terhadap hitungan manual = Rp0.
- [ ] Status bayar berubah otomatis (Belum bayar → DP → Lunas) sesaat setelah pembayaran disimpan, tanpa muat ulang halaman manual.
- [ ] Pembayaran melebihi total pesanan ditandai peringatan "kelebihan bayar" dan tidak diam-diam dianggap lunas tanpa tanda.
- [ ] Rekap produksi menampilkan total qty per produk, dan total semuanya sama dengan jumlah qty seluruh pesanan aktif (pesanan Dibatalkan tidak dihitung).
- [ ] Pesanan berstatus Dibatalkan tetap tersimpan (tidak dihapus permanen) dan tidak masuk rekap produksi maupun total tagihan.
- [ ] Jika kuota produk diisi dan qty pesanan melebihi sisa kuota, sistem menampilkan peringatan sebelum menyimpan.
- [ ] Daftar pesanan mendukung filter status bayar, status pesanan, dan cara terima, serta pencarian nama/nomor; filter aktif tampil sebagai chip dan dapat direset satu klik.
- [ ] Ekspor Excel/CSV dapat dibuka di Excel tanpa error format dan jumlah barisnya sama dengan jumlah pesanan pada filter aktif.
- [ ] Dua akun yang mengedit pesanan berbeda secara bersamaan tidak saling menimpa data; jika mengedit pesanan yang sama, pengguna kedua mendapat peringatan.

---

## 4. Arah Desain UI/UX

Mengikuti panduan UI universal (keterbacaan, hierarki, navigasi, data padat) yang Anda lampirkan.

**Prinsip umum**
- **Mobile-first**: layar HP adalah desain utama (pencatatan sering dilakukan sambil memegang HP dan membalas chat). Desktop memakai kolom lebih lebar dan sidebar, bukan sekadar HP yang diperbesar.
- Satu warna aksen utama (mis. oranye hangat atau hijau) untuk tombol utama dan item aktif; sisanya netral. Tidak lebih dari satu warna aksen dominan per layar.
- Tanpa dekorasi berlebihan: kurangi bayangan, gradien, dan ornamen.

**Keterbacaan**
- Teks isi minimal 16px, judul seksi 32px tebal (desktop) / lebih kecil proporsional (HP), angka kunci 28px tebal, detail pendukung 14px.
- Label di atas field (tidak hanya placeholder), disertai contoh/helper text. Pesan error muncul dekat field.
- Tinggi minimum tombol dan target sentuh 44px. Tombol memakai kata lengkap ("Simpan pesanan", "Catat pembayaran"), bukan ikon saja.
- Nama pembeli, tanggal, dan status tidak dipotong (truncate).
- Satu aksi utama per layar/seksi; aksi sekunder di posisi konsisten.

**Status**
- Warna selalu dipasangkan dengan ikon dan teks.
  - Lunas: hijau
  - DP: kuning
  - Belum bayar: merah
  - Dibatalkan / non-aktif: netral
- Status pesanan memakai gaya netral/aksen yang tidak bentrok dengan status bayar.

**Navigasi**
- **HP**: bottom navigation 4 menu: **Pesanan**, **Batch**, **Rekap**, **Produk**. Tombol besar "+ Pesanan Baru" sebagai aksi paling dominan.
- **Desktop**: sidebar tetap dengan menu yang sama, halaman aktif ditandai jelas.
- Menu konsisten di semua halaman.

**Halaman utama (dashboard batch) — urutan: ringkasan → detail**
1. Kartu ringkasan: total pesanan, total terbayar, sisa belum bayar, jumlah pesanan belum lunas. Kartu dapat diklik dan langsung memfilter daftar pesanan.
2. Rekap produksi singkat (qty per produk).
3. Daftar pesanan: kolom identitas (nama, tanggal ambil) tetap terlihat, angka rata kanan format Rupiah, baris bergaris tipis (zebra) di desktop; di HP berupa kartu dengan informasi tidak berulang.
4. Total data dan pagination di tempat yang lazim (jumlah di kiri, halaman di kanan).

**Formulir pesanan**: dibuat bertahap di HP (pembeli → item → cara terima → simpan), dengan total berjalan terlihat di bagian bawah layar.

**Rekomendasi proses**: buat mockup layar utama (HP + desktop) lebih dulu sebelum coding, dan audit kontras serta ukuran target sentuh pada mockup.

---

## 5. Technical Specs

### 5.1 Stack (disesuaikan dengan keahlian Anda)
| Layer | Pilihan | Alasan |
|---|---|---|
| Frontend + API | Next.js 15 (App Router) + TypeScript + Tailwind CSS | Satu framework, cocok untuk PWA responsif |
| Database + Auth + Storage | Supabase (PostgreSQL, Auth, Storage) | Auth siap pakai, penyimpanan foto bukti transfer, Row Level Security |
| Hosting | Vercel | Deploy otomatis, sudah Anda kuasai |
| Ekspor | Pustaka CSV/XLSX sisi server | Memenuhi kebutuhan ekspor |

### 5.2 Struktur Data Inti

```
Customer
 - id, nama, no_wa, catatan, created_at

Product
 - id, nama, harga, aktif

PoBatch
 - id, nama, tanggal_buka, tanggal_tutup, tanggal_ambil, status (draft/buka/tutup/selesai)

BatchProductQuota (opsional)
 - batch_id, product_id, kuota

Order
 - id, batch_id, customer_id
 - cara_terima (pickup/antar/kurir), alamat, ongkir
 - tanggal_ambil, jam_ambil (opsional)
 - status (baru/dikonfirmasi/diproduksi/siap/selesai/dibatalkan)
 - catatan, total (dihitung), created_by, created_at, updated_at

OrderItem
 - id, order_id, product_id, nama_produk_snapshot, harga_snapshot, qty, catatan

Payment
 - id, order_id, jumlah, metode (transfer/ewallet/tunai), tanggal_bayar
 - bukti_url (opsional), dicatat_oleh
```

Status bayar **tidak disimpan** sebagai kolom terpisah; dihitung dari jumlah `Payment` dibanding total pesanan, untuk menghindari data tidak sinkron.

### 5.3 Keamanan dan Data
- Row Level Security aktif di semua tabel; hanya dua akun pemilik yang terdaftar yang dapat membaca/menulis.
- Pendaftaran akun publik dinonaktifkan di Supabase (akun dibuat manual).
- Bukti transfer disimpan di bucket privat dengan URL bertanda tangan sementara.
- Nomor WA dan alamat pembeli adalah data pribadi. Kumpulkan seperlunya, dan hapus/anonimkan data pembeli yang sudah tidak diperlukan bila diminta.
- Backup: aktifkan backup harian Supabase atau ekspor CSV berkala ke penyimpanan terpisah.

### 5.4 Non-Functional
- Halaman daftar pesanan termuat ≤ 2 detik pada jaringan 4G untuk 100 pesanan.
- Dapat dipasang ke layar utama HP (PWA). Mode offline **tidak** dicakup di v1.
- Dukungan browser: dua versi mayor terakhir Chrome dan Safari (HP dan desktop).

---

## 6. Risiko dan Mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| **Scope melebar sebelum kebutuhan inti terbukti** (pola umum di proyek sendiri) | v1 tidak pernah selesai dipakai | Non-Goals di §1.3 mengikat. Fitur P1/P2 hanya dikerjakan setelah v1 dipakai 3 batch PO nyata. |
| Kebiasaan lama (catat di chat/buku) tetap berjalan paralel | Data sistem tidak lengkap, sistem ditinggalkan | Wajibkan seluruh pesanan satu batch dicatat di sistem; evaluasi di akhir batch (metrik "0 pesanan terlewat"). |
| Pencatatan terlalu lama sehingga malas dipakai | Adopsi gagal | Target ≤ 60 detik per pesanan; uji dengan 10 pesanan nyata sebelum menambah fitur lain. |
| Suami dan istri mengedit data bersamaan | Data tertimpa | Peringatan konflik edit; log siapa yang membuat/mengubah. |
| Salah hitung sisa bayar karena pembulatan/ongkir | Selisih uang | Semua nominal disimpan sebagai bilangan bulat Rupiah; uji otomatis rumus total dan status bayar. |
| Foto bukti transfer/nomor WA bocor | Masalah privasi | Bucket privat, RLS, akun terbatas. |
| Kehilangan data | Riwayat pesanan hilang | Backup harian dan ekspor berkala. |

---

## 7. Roadmap

Estimasi mengasumsikan satu developer paruh waktu (Anda). Sesuaikan dengan waktu luang.

| Fase | Isi | Estimasi |
|---|---|---|
| **0. Validasi (sebelum coding)** | Catat 1 batch PO berikutnya di spreadsheet dengan struktur kolom yang sama dengan skema §5.2. Ukur waktu pencatatan dan jumlah kesalahan sebagai baseline. | 1 batch PO |
| **1. MVP** | Auth, produk, pembeli, batch, pesanan, pembayaran, rekap produksi, ekspor, UI mobile-first + desktop | 2–3 minggu |
| **2. Pakai nyata** | Pakai v1 di 3 batch PO berturut-turut, kumpulkan masalah nyata, perbaiki bug | 3 batch PO |
| **3. P1** | Tombol WhatsApp, pengingat belum lunas, nota PDF, duplikasi batch, riwayat pembeli | 1–2 minggu |
| **4. P2 (opsional)** | Form pesan mandiri, laporan bulanan | Dinilai ulang setelah Fase 3 |

---

## 8. Open Questions

- **[Anda & istri]** Apakah satu pembeli bisa memesan di beberapa batch sekaligus? (Skema saat ini mendukung.)
- **[Anda & istri]** Apakah harga produk pernah berbeda per pembeli (reseller/grosir)? Jika ya, perlu field harga khusus per pesanan.
- **[Anda & istri]** Apakah ada batas jam tutup PO per hari (cut-off) yang harus ditegakkan sistem, atau cukup tanggal tutup batch?
- **[Anda]** Apakah foto bukti transfer benar-benar diperlukan, atau cukup dicek sendiri di mutasi rekening? (Menghapusnya menyederhanakan v1.)
- **[Anda]** Apakah ada produk dengan varian (mis. kebab ukuran S/M/L, topping)? Jika ya, tentukan apakah varian dimodelkan sebagai produk terpisah (lebih sederhana) atau sebagai opsi per produk.
