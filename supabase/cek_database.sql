-- Cek kesiapan database (HANYA MEMBACA, tidak mengubah apa pun).
-- Jalankan di Supabase SQL Editor. Setiap baris berstatus "KURANG" menunjukkan file yang perlu dijalankan.

with perlu(jenis, nama, file) as (values
  -- tabel & kolom dasar (schema.sql)
  ('kolom', 'products.foto_path', 'schema.sql'),
  ('kolom', 'products.hpp', 'schema.sql'),
  ('kolom', 'products.hpp_rincian', 'schema.sql'),
  ('kolom', 'order_items.hpp_snapshot', 'schema.sql'),
  ('kolom', 'po_batches.slug', 'schema.sql'),
  ('kolom', 'po_batches.info_pembeli', 'schema.sql'),
  ('kolom', 'orders.sumber', 'schema.sql'),
  ('view', 'order_summary', 'schema.sql'),
  ('fungsi', 'save_order', 'schema.sql'),
  ('fungsi', 'set_order_status', 'schema.sql'),
  ('fungsi', 'get_public_batch', 'schema.sql'),
  ('fungsi', 'submit_public_order', 'schema.sql'),
  ('bucket', 'bukti', 'schema.sql'),
  ('bucket', 'produk', 'schema.sql'),
  -- migrasi 1
  ('kolom', 'pengaturan.logo_path', 'migrations/20261016_1_pengaturan_toko.sql'),
  ('kolom', 'pengaturan.sampul_path', 'migrations/20261016_1_pengaturan_toko.sql'),
  ('kolom', 'pengaturan.tema', 'migrations/20261016_1_pengaturan_toko.sql'),
  ('kolom', 'pengaturan.gaya', 'migrations/20261016_1_pengaturan_toko.sql'),
  ('kolom', 'pengaturan.template_wa', 'migrations/20261016_1_pengaturan_toko.sql'),
  ('kolom', 'pengaturan.jam_buka', 'migrations/20261016_1_pengaturan_toko.sql'),
  ('kolom', 'pengaturan.jam_tutup', 'migrations/20261016_1_pengaturan_toko.sql'),
  ('kolom', 'pengaturan.hari_buka', 'migrations/20261016_1_pengaturan_toko.sql'),
  ('kolom', 'pengaturan.lokasi_ambil', 'migrations/20261016_1_pengaturan_toko.sql'),
  ('kolom', 'pengaturan.area_antar', 'migrations/20261016_1_pengaturan_toko.sql'),
  -- migrasi 2
  ('fungsi', 'simpan_menu_batch', 'migrations/20261016_2_fungsi_atomik.sql'),
  ('fungsi', 'terima_tunai_selesai', 'migrations/20261016_2_fungsi_atomik.sql'),
  ('fungsi', 'hapus_batch', 'migrations/20261016_2_fungsi_atomik.sql'),
  ('indeks', 'customers_norm_wa_idx', 'migrations/20261016_2_fungsi_atomik.sql'),
  ('indeks', 'order_items_product_idx', 'migrations/20261016_2_fungsi_atomik.sql'),
  -- migrasi 3
  ('fungsi', 'get_info_toko', 'migrations/20261016_3_info_toko_publik.sql')
)
select p.jenis, p.nama,
  case when (case p.jenis
    when 'kolom' then exists (select 1 from information_schema.columns c where c.table_schema = 'public'
                              and c.table_name = split_part(p.nama, '.', 1) and c.column_name = split_part(p.nama, '.', 2))
    when 'view' then exists (select 1 from information_schema.views v where v.table_schema = 'public' and v.table_name = p.nama)
    when 'fungsi' then exists (select 1 from pg_proc f join pg_namespace n on n.oid = f.pronamespace where n.nspname = 'public' and f.proname = p.nama)
    when 'indeks' then exists (select 1 from pg_indexes i where i.schemaname = 'public' and i.indexname = p.nama)
    when 'bucket' then exists (select 1 from storage.buckets b where b.id = p.nama)
  end) then 'OK' else 'KURANG' end as status,
  p.file as jalankan_file
from perlu p
order by status desc, p.file, p.jenis, p.nama;
