-- ============================================================
-- Migrasi 2026-10-16: pengaturan toko (Sistem PO v3)
-- Jalankan SEKALI di Supabase SQL Editor pada database yang sudah ada (file pertama),
-- setelah supabase/schema.sql. Aman diulang.
--
-- Hanya MENAMBAH kolom baru di tabel `pengaturan` (semua boleh kosong) dan
-- memperbarui fungsi get_public_batch agar ikut mengirim kolom itu ke halaman pembeli.
-- Tidak ada tabel/kolom yang dihapus atau diubah, dan data lama tidak tersentuh.
-- ============================================================

begin;

-- Logo & foto sampul toko (file di bucket publik `produk`, folder logo/ dan sampul/)
alter table pengaturan add column if not exists logo_path text;
alter table pengaturan add column if not exists sampul_path text;

-- Tema tampilan: nama palet di src/lib/tema.ts & gaya kartu (Lembut/Tegas); kosong = bawaan
alter table pengaturan add column if not exists tema text;
alter table pengaturan add column if not exists gaya text;

-- Template pesan WhatsApp per jenis { diterima, tagihan, siap, lunas, selesai }; kosong = pesan otomatis
alter table pengaturan add column if not exists template_wa jsonb;

-- Jam operasional & lokasi ambil; hari_buka berisi angka hari (0 = Minggu … 6 = Sabtu)
alter table pengaturan add column if not exists jam_buka time;
alter table pengaturan add column if not exists jam_tutup time;
alter table pengaturan add column if not exists hari_buka smallint[];
alter table pengaturan add column if not exists lokasi_ambil text;
alter table pengaturan add column if not exists area_antar text;

-- Sama dengan versi di schema.sql, ditambah kolom pengaturan di atas
create or replace function get_public_batch(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b po_batches%rowtype;
  s pengaturan%rowtype;
begin
  select * into b from po_batches where slug = p_slug;
  if not found then
    return null;
  end if;
  select * into s from pengaturan where id = 1;

  return jsonb_build_object(
    'nama', b.nama,
    'terbuka', batch_terbuka(b),
    'tanggal_tutup', b.tanggal_tutup,
    'tanggal_ambil', b.tanggal_ambil,
    'info_pembeli', b.info_pembeli,
    'nama_toko', s.nama_toko,
    'logo_path', s.logo_path,
    'sampul_path', s.sampul_path,
    'tema', s.tema,
    'gaya', s.gaya,
    'jam_buka', to_char(s.jam_buka, 'HH24:MI'),
    'jam_tutup', to_char(s.jam_tutup, 'HH24:MI'),
    'hari_buka', s.hari_buka,
    'lokasi_ambil', s.lokasi_ambil,
    'area_antar', s.area_antar,
    'wa_admin', norm_wa(s.wa_admin),
    'info_pembayaran', s.info_pembayaran,
    'produk', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'nama', p.nama, 'harga', p.harga, 'foto_path', p.foto_path,
        'sisa', case when q.kuota is null then null else greatest(q.kuota - coalesce(u.qty, 0), 0) end
      ) order by p.nama)
      from batch_product_quotas q
      join products p on p.id = q.product_id and p.aktif
      left join (
        select oi.product_id, sum(oi.qty) as qty
        from order_items oi join orders o on o.id = oi.order_id
        where o.batch_id = b.id and o.status <> 'dibatalkan'
        group by oi.product_id
      ) u on u.product_id = p.id
      where q.batch_id = b.id
    ), '[]'::jsonb)
  );
end;
$$;

commit;

-- Muat ulang cache skema API agar kolom baru langsung dikenali
notify pgrst, 'reload schema';
