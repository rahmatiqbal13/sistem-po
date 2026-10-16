-- ============================================================
-- Migrasi 2026-10-16 (3): info toko untuk halaman login
-- Jalankan SEKALI di Supabase SQL Editor setelah file migrasi 1 & 2. Aman diulang.
--
-- Halaman login dibuka sebelum masuk, sedangkan tabel `pengaturan` hanya bisa dibaca akun yang login.
-- Fungsi ini hanya mengembalikan nama toko, logo, dan tema: data yang memang sudah tampil
-- di link pemesanan pembeli. Nomor WA & info pembayaran TIDAK ikut.
-- Hanya MENAMBAH satu fungsi; tidak ada tabel/kolom/data yang diubah.
-- ============================================================

begin;

create or replace function get_info_toko()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('nama_toko', s.nama_toko, 'logo_path', s.logo_path, 'tema', s.tema, 'gaya', s.gaya)
  from pengaturan s where s.id = 1
$$;

revoke all on function get_info_toko() from public;
grant execute on function get_info_toko() to anon, authenticated;

commit;

notify pgrst, 'reload schema';
