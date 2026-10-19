-- ============================================================
-- Migrasi 2026-10-18 (1): log aktivitas pesanan, notifikasi pesanan baru, catatan cadangan
-- Jalankan SEKALI di Supabase SQL Editor setelah migrasi 2026-10-16. Aman diulang.
--
-- Hanya MENAMBAH tabel, trigger, dan satu kolom. Tidak ada data lama yang diubah atau dihapus.
-- Riwayat dicatat mulai saat migrasi ini dijalankan; perubahan sebelumnya tidak punya log.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Log aktivitas: siapa mengubah apa pada pesanan.
--    Ditulis otomatis oleh trigger, jadi semua jalur (form admin, link pembeli, tombol cepat) tercatat.
--    aksi: dibuat | diubah | status | bayar | bayar_hapus
-- ------------------------------------------------------------
create table if not exists order_log (
  id bigint generated always as identity primary key,
  order_id uuid not null references orders(id) on delete cascade,
  aksi text not null,
  detail jsonb not null default '{}'::jsonb,
  oleh text,
  created_at timestamptz not null default now()
);
create index if not exists order_log_order_idx on order_log (order_id, created_at);

alter table order_log enable row level security;
-- Hanya dibaca dari aplikasi; tulisan hanya lewat trigger (security definer) agar log tidak bisa dipalsukan
drop policy if exists pemilik_baca on order_log;
create policy pemilik_baca on order_log for select to authenticated using (true);

-- Ringkasan item pesanan saat ini, mis. "Kebab x2, Roti maryam x1"
create or replace function ringkas_item(p_order uuid)
returns text language sql stable set search_path = public as $$
  select coalesce(string_agg(nama_produk_snapshot || ' x' || qty, ', ' order by nama_produk_snapshot), '')
  from order_items where order_id = p_order
$$;

create or replace function log_pesanan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_oleh text := coalesce(auth.jwt() ->> 'email', case when new.sumber = 'link' then 'Pembeli (link)' end);
  v_item text := ringkas_item(new.id);
  v_ubah text[] := '{}';
  v_item_lama text;
begin
  -- Pesanan sudah terhapus sebelum commit: tidak perlu dicatat
  if not exists (select 1 from orders where id = new.id) then return null; end if;

  if tg_op = 'INSERT' then
    insert into order_log (order_id, aksi, detail, oleh)
    values (new.id, 'dibuat', jsonb_build_object('sumber', new.sumber, 'item', v_item), v_oleh);
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into order_log (order_id, aksi, detail, oleh)
    values (new.id, 'status', jsonb_build_object('dari', old.status, 'ke', new.status, 'item', v_item), v_oleh);
  end if;

  if new.batch_id is distinct from old.batch_id then v_ubah := v_ubah || 'batch'; end if;
  if new.customer_id is distinct from old.customer_id then v_ubah := v_ubah || 'pembeli'; end if;
  if new.cara_terima is distinct from old.cara_terima then v_ubah := v_ubah || 'cara_terima'; end if;
  if new.alamat is distinct from old.alamat then v_ubah := v_ubah || 'alamat'; end if;
  if new.ongkir is distinct from old.ongkir then v_ubah := v_ubah || 'ongkir'; end if;
  if new.tanggal_ambil is distinct from old.tanggal_ambil or new.jam_ambil is distinct from old.jam_ambil then
    v_ubah := v_ubah || 'jadwal';
  end if;
  if new.catatan is distinct from old.catatan then v_ubah := v_ubah || 'catatan'; end if;

  -- Item diganti lewat save_order: bandingkan dengan ringkasan item di log terakhir.
  -- Pesanan dari sebelum migrasi belum punya log pembanding; perubahan itemnya baru terlacak
  -- setelah ada satu entri log (setiap entri menyimpan ringkasan item).
  select detail ->> 'item' into v_item_lama from order_log
  where order_id = new.id and detail ? 'item' order by created_at desc, id desc limit 1;
  if v_item_lama is not null and v_item_lama <> v_item then v_ubah := v_ubah || 'item'; end if;

  if array_length(v_ubah, 1) > 0 then
    insert into order_log (order_id, aksi, detail, oleh)
    values (new.id, 'diubah', jsonb_build_object('bagian', to_jsonb(v_ubah), 'item', v_item), v_oleh);
  end if;
  return null;
end;
$$;

-- Ditunda sampai akhir transaksi: save_order mengganti item SETELAH baris pesanan diubah,
-- jadi ringkasan item yang dicatat adalah isi akhirnya.
drop trigger if exists orders_log on orders;
create constraint trigger orders_log after insert or update on orders
deferrable initially deferred
for each row execute function log_pesanan();

create or replace function log_pembayaran()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p payments%rowtype;
begin
  if tg_op = 'DELETE' then p := old; else p := new; end if;
  -- Pembayaran ikut terhapus bersama pesanannya: tidak dicatat
  if not exists (select 1 from orders where id = p.order_id) then return null; end if;
  insert into order_log (order_id, aksi, detail, oleh)
  values (p.order_id, case when tg_op = 'DELETE' then 'bayar_hapus' else 'bayar' end,
    jsonb_build_object('jumlah', p.jumlah, 'metode', p.metode, 'tanggal', p.tanggal_bayar),
    coalesce(auth.jwt() ->> 'email', p.dicatat_oleh));
  return null;
end;
$$;

drop trigger if exists payments_log on payments;
create trigger payments_log after insert or delete on payments
for each row execute function log_pembayaran();

revoke all on function log_pesanan() from public, anon, authenticated;
revoke all on function log_pembayaran() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 2. Notifikasi pesanan baru: aplikasi admin mendengarkan pesanan yang masuk (Supabase Realtime).
--    RLS tetap berlaku: hanya akun yang login yang menerima kabarnya.
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders') then
    alter publication supabase_realtime add table orders;
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. Kapan terakhir data dicadangkan (diisi saat admin mengunduh cadangan dari Pengaturan)
-- ------------------------------------------------------------
alter table pengaturan add column if not exists cadangan_terakhir timestamptz;

commit;

notify pgrst, 'reload schema';
