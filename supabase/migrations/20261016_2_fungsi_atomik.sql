-- ============================================================
-- Migrasi 2026-10-16 (2): proses multi-langkah dibuat atomik + indeks + batas unggah
-- Jalankan SEKALI di Supabase SQL Editor setelah 20261016_1_pengaturan_toko.sql. Aman diulang.
--
-- Hanya MENAMBAH fungsi & indeks baru dan mengatur batas ukuran file bucket.
-- Tidak ada tabel/kolom yang dihapus atau diubah, dan data lama tidak tersentuh.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Simpan menu batch (produk dijual + kuota) dalam satu transaksi.
--    Sebelumnya: hapus semua lalu tambah ulang dari browser; bila langkah kedua gagal,
--    batch kehilangan semua produknya dan link pembeli kosong.
--    p_menu: [{ product_id, kuota }]  — kuota kosong/null = tanpa batas
-- ------------------------------------------------------------
create or replace function simpan_menu_batch(p_batch_id uuid, p_menu jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if jsonb_typeof(p_menu) <> 'array' or jsonb_array_length(p_menu) = 0 then
    raise exception 'Pilih minimal 1 produk yang dijual.' using errcode = 'P0001';
  end if;
  perform 1 from po_batches where id = p_batch_id for update;
  if not found then
    raise exception 'Batch tidak ditemukan' using errcode = 'P0002';
  end if;

  delete from batch_product_quotas where batch_id = p_batch_id;
  insert into batch_product_quotas (batch_id, product_id, kuota)
  select p_batch_id, (m->>'product_id')::uuid,
         case when coalesce(m->>'kuota', '') = '' then null else greatest((m->>'kuota')::integer, 0) end
  from jsonb_array_elements(p_menu) m;
end;
$$;

-- ------------------------------------------------------------
-- 2. Terima tunai & selesai: catat sisa tagihan sebagai tunai lalu tandai Selesai, sekaligus.
--    Sebelumnya dua langkah terpisah; bila langkah kedua gagal (mis. konflik edit),
--    pembayaran sudah tercatat dan menekan ulang membuat pembayaran ganda.
-- ------------------------------------------------------------
create or replace function terima_tunai_selesai(p_id uuid, p_expected timestamptz default null)
returns timestamptz
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_current orders%rowtype;
  v_sisa bigint;
  v_new timestamptz;
begin
  select * into v_current from orders where id = p_id for update;
  if not found then
    raise exception 'Pesanan tidak ditemukan' using errcode = 'P0002';
  end if;
  if p_expected is not null and v_current.updated_at <> p_expected then
    raise exception 'KONFLIK: pesanan ini baru saja diubah oleh %. Muat ulang untuk melihat perubahan terbaru.',
      coalesce(v_current.updated_by, 'pengguna lain') using errcode = 'P0409';
  end if;
  if v_current.status = 'dibatalkan' then
    raise exception 'Pesanan dibatalkan tidak bisa diselesaikan.' using errcode = 'P0001';
  end if;

  select sisa into v_sisa from order_summary where id = p_id;
  if coalesce(v_sisa, 0) > 0 then
    insert into payments (order_id, jumlah, metode, tanggal_bayar)
    values (p_id, v_sisa, 'tunai', (now() at time zone 'Asia/Jakarta')::date);
  end if;

  update orders set status = 'selesai' where id = p_id returning updated_at into v_new;
  return v_new;
end;
$$;

-- ------------------------------------------------------------
-- 3. Hapus batch yang tidak jadi, dengan pengecekan di server dan dalam satu transaksi.
--    Ditolak bila ada pesanan aktif atau pembayaran; pesanan Dibatalkan tanpa pembayaran ikut terhapus.
--    Mengembalikan jumlah pesanan Dibatalkan yang ikut terhapus.
-- ------------------------------------------------------------
create or replace function hapus_batch(p_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_nama text;
  v_aktif integer;
  v_hapus integer;
begin
  select nama into v_nama from po_batches where id = p_id for update;
  if not found then
    raise exception 'Batch tidak ditemukan' using errcode = 'P0002';
  end if;

  select count(*) into v_aktif from orders where batch_id = p_id and status <> 'dibatalkan';
  if v_aktif > 0 then
    raise exception 'Batch “%” masih punya % pesanan aktif. Batalkan atau pindahkan pesanan itu dulu, atau tandai batch Selesai.',
      v_nama, v_aktif using errcode = 'P0001';
  end if;
  if exists (select 1 from payments p join orders o on o.id = p.order_id where o.batch_id = p_id) then
    raise exception 'Batch “%” punya pembayaran tercatat, jadi tidak bisa dihapus. Tandai batch Selesai saja.',
      v_nama using errcode = 'P0001';
  end if;

  delete from orders where batch_id = p_id;
  get diagnostics v_hapus = row_count;
  delete from po_batches where id = p_id;
  return v_hapus;
end;
$$;

revoke all on function simpan_menu_batch(uuid, jsonb) from anon, public;
revoke all on function terima_tunai_selesai(uuid, timestamptz) from anon, public;
revoke all on function hapus_batch(uuid) from anon, public;
grant execute on function simpan_menu_batch(uuid, jsonb) to authenticated;
grant execute on function terima_tunai_selesai(uuid, timestamptz) to authenticated;
grant execute on function hapus_batch(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. Indeks untuk kueri yang sering dipakai
-- ------------------------------------------------------------
-- Pembeli lewat link dicari dari nomor WA yang dinormalkan (submit_public_order)
create index if not exists customers_norm_wa_idx on customers (norm_wa(no_wa));
-- Hitung kuota terpakai per produk & trigger isi HPP item lama
create index if not exists order_items_product_idx on order_items (product_id);
-- Hapus/ubah produk (cascade ke kuota batch)
create index if not exists batch_product_quotas_product_idx on batch_product_quotas (product_id);
-- Daftar pesanan per batch, urut terbaru
create index if not exists orders_batch_created_idx on orders (batch_id, created_at desc);

-- ------------------------------------------------------------
-- 5. Batas unggah file: hanya gambar. Foto produk/logo/sampul sudah dikecilkan di browser (< 1 MB);
--    foto bukti transfer diunggah apa adanya dari kamera HP.
--    Hanya berlaku untuk unggahan baru; file yang sudah ada tidak terpengaruh.
-- ------------------------------------------------------------
update storage.buckets set file_size_limit = 5 * 1024 * 1024, allowed_mime_types = array['image/*']
where id = 'produk';
update storage.buckets set file_size_limit = 15 * 1024 * 1024, allowed_mime_types = array['image/*']
where id = 'bukti';

commit;

notify pgrst, 'reload schema';
