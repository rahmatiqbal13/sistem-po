-- ============================================================
-- Migrasi 2026-10-26 (1): perbaikan keamanan hasil audit
-- Jalankan SEKALI di Supabase SQL Editor setelah migrasi 2026-10-18. Aman diulang.
--
-- 1. Daftar admin resmi (admin_toko). Akses data hanya untuk akun di daftar ini, bukan semua akun yang login.
--    Akun yang sudah ada saat migrasi dijalankan otomatis menjadi "pemilik".
-- 2. Pembatas pesanan dari link publik per alamat IP (mencegah banjir pesanan palsu).
-- 3. Log aktivitas tetap tersimpan walau pesanannya dihapus, dan penghapusan pesanan ikut dicatat.
-- 4. Tanggal bayar bawaan memakai tanggal WIB.
-- 5. Unggahan hanya JPEG/PNG/WebP/HEIC (SVG tidak diterima).
-- Tidak ada data pesanan/pembeli yang diubah atau dihapus.
-- ============================================================

begin;

-- Migrasi sebelumnya wajib sudah dijalankan (tabel order_log & fungsi ringkas_item dibuat di sana)
do $$
begin
  if to_regclass('public.order_log') is null or to_regprocedure('public.ringkas_item(uuid)') is null then
    raise exception 'Jalankan dulu migrations/20261018_1_log_notifikasi_cadangan.sql (dan migrasi lain yang berstatus KURANG di cek_database.sql), lalu jalankan file ini lagi.';
  end if;
end $$;

-- ------------------------------------------------------------
-- 1. Daftar admin & aturan akses
-- ------------------------------------------------------------
create table if not exists admin_toko (
  user_id uuid primary key references auth.users(id) on delete cascade,
  peran text not null default 'admin' check (peran in ('pemilik', 'admin')),
  created_at timestamptz not null default now()
);
alter table admin_toko enable row level security;

-- Pertama kali: semua akun yang sudah ada adalah pemilik toko
insert into admin_toko (user_id, peran)
select id, 'pemilik' from auth.users
where not exists (select 1 from admin_toko)
on conflict do nothing;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from admin_toko where user_id = auth.uid())
$$;
revoke all on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated;

drop policy if exists admin_baca on admin_toko;
create policy admin_baca on admin_toko for select to authenticated using (is_admin());
-- Tidak ada policy tulis: daftar admin hanya diubah dari server (service role) lewat halaman Kelola admin

do $$
declare t text;
begin
  foreach t in array array['customers','products','po_batches','batch_product_quotas','orders','order_items','payments','pengaturan'] loop
    execute format('drop policy if exists pemilik_all on %I', t);
    execute format('create policy pemilik_all on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

drop policy if exists pemilik_baca on order_log;
create policy pemilik_baca on order_log for select to authenticated using (is_admin());

drop policy if exists bukti_pemilik on storage.objects;
create policy bukti_pemilik on storage.objects for all to authenticated
  using (bucket_id = 'bukti' and public.is_admin()) with check (bucket_id = 'bukti' and public.is_admin());
drop policy if exists produk_pemilik on storage.objects;
create policy produk_pemilik on storage.objects for all to authenticated
  using (bucket_id = 'produk' and public.is_admin()) with check (bucket_id = 'produk' and public.is_admin());

-- ------------------------------------------------------------
-- 2. Pembatas pesanan dari link publik
--    Maks. 5 pesanan per IP per jam, dan maks. 100 pesanan per batch per 10 menit (rem darurat).
-- ------------------------------------------------------------
create table if not exists batas_pesanan_publik (
  id bigint generated always as identity primary key,
  ip text not null,
  batch_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists batas_pesanan_ip_idx on batas_pesanan_publik (ip, created_at);
create index if not exists batas_pesanan_batch_idx on batas_pesanan_publik (batch_id, created_at);
alter table batas_pesanan_publik enable row level security;
-- Tanpa policy: hanya bisa disentuh fungsi security definer di bawah

-- IP pembeli dari header permintaan API Supabase (cf-connecting-ip diisi Cloudflare, tidak bisa dipalsukan pengirim)
create or replace function ip_peminta()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.headers', true)::json ->> 'cf-connecting-ip', ''),
    nullif(trim(split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1)), ''),
    'tidak-diketahui')
$$;
revoke all on function ip_peminta() from public, anon, authenticated;

create or replace function cek_batas_pesanan(p_batch uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip text := ip_peminta();
begin
  delete from batas_pesanan_publik where created_at < now() - interval '1 day';
  if (select count(*) from batas_pesanan_publik where ip = v_ip and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Terlalu banyak pesanan dari jaringan ini. Coba lagi nanti atau hubungi kami lewat WhatsApp.';
  end if;
  if (select count(*) from batas_pesanan_publik where batch_id = p_batch and created_at > now() - interval '10 minutes') >= 100 then
    raise exception 'Sedang banyak pesanan masuk. Coba lagi beberapa menit lagi.';
  end if;
  insert into batas_pesanan_publik (ip, batch_id) values (v_ip, p_batch);
end;
$$;
revoke all on function cek_batas_pesanan(uuid) from public, anon, authenticated;

-- Sama dengan versi di schema.sql, ditambah pemanggilan cek_batas_pesanan
create or replace function submit_public_order(p_slug text, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b po_batches%rowtype;
  v_nama text := left(trim(coalesce(payload->>'nama', '')), 80);
  v_wa text := norm_wa(payload->>'no_wa');
  v_cara text := coalesce(payload->>'cara_terima', 'pickup');
  v_alamat text := nullif(trim(coalesce(payload->>'alamat', '')), '');
  v_catatan text := nullif(trim(coalesce(payload->>'catatan', '')), '');
  v_cust customers%rowtype;
  v_order uuid;
  v_item jsonb;
  v_p record;
  v_qty integer;
  v_used integer;
  v_total_qty integer := 0;
  v_subtotal bigint := 0;
  v_items jsonb := '[]'::jsonb;
  v_recent integer;
begin
  -- Kunci baris batch agar pengecekan kuota tidak balapan antar pembeli
  select * into b from po_batches where slug = p_slug for update;
  if not found then
    raise exception 'PO tidak ditemukan.';
  end if;
  if not batch_terbuka(b) then
    raise exception 'PO ini sudah ditutup.';
  end if;

  if length(v_nama) < 2 then
    raise exception 'Nama wajib diisi.';
  end if;
  if v_wa is null or length(v_wa) not between 10 and 15 then
    raise exception 'Nomor WhatsApp tidak valid.';
  end if;
  if v_cara not in ('pickup', 'antar', 'kurir') then
    raise exception 'Cara terima tidak valid.';
  end if;
  if v_cara <> 'pickup' and v_alamat is null then
    raise exception 'Alamat wajib diisi untuk pengantaran.';
  end if;
  if length(coalesce(v_alamat, '')) > 300 or length(coalesce(v_catatan, '')) > 300 then
    raise exception 'Alamat atau catatan terlalu panjang.';
  end if;
  if jsonb_typeof(payload->'items') <> 'array'
     or jsonb_array_length(payload->'items') not between 1 and 20 then
    raise exception 'Pilih minimal 1 produk.';
  end if;

  perform cek_batas_pesanan(b.id);

  -- Pembeli dikenali dari nomor WA; pembeli lama tidak diubah datanya
  select * into v_cust from customers where norm_wa(no_wa) = v_wa order by created_at limit 1;
  if not found then
    insert into customers (nama, no_wa) values (v_nama, v_wa) returning * into v_cust;
  elsif lower(v_cust.nama) <> lower(v_nama) then
    v_catatan := concat_ws(E'\n', v_catatan, 'Nama di link: ' || v_nama);
  end if;

  select count(*) into v_recent from orders
  where customer_id = v_cust.id and batch_id = b.id and sumber = 'link'
    and created_at > now() - interval '1 hour';
  if v_recent >= 3 then
    raise exception 'Terlalu banyak pesanan dari nomor ini. Silakan hubungi kami lewat WhatsApp.';
  end if;

  insert into orders (batch_id, customer_id, cara_terima, alamat, ongkir, tanggal_ambil, status,
                      catatan, sumber, created_by, updated_by)
  values (b.id, v_cust.id, v_cara, case when v_cara = 'pickup' then null else v_alamat end, 0,
          b.tanggal_ambil, 'baru', v_catatan, 'link', 'link pemesanan', 'link pemesanan')
  returning id into v_order;

  for v_item in select * from jsonb_array_elements(payload->'items') loop
    v_qty := nullif(v_item->>'qty', '')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 50 then
      raise exception 'Jumlah per produk harus 1–50.';
    end if;

    select p.id, p.nama, p.harga, p.hpp, q.kuota into v_p
    from batch_product_quotas q join products p on p.id = q.product_id and p.aktif
    where q.batch_id = b.id and q.product_id = nullif(v_item->>'product_id', '')::uuid;
    if not found then
      raise exception 'Ada produk yang tidak tersedia di PO ini. Muat ulang halaman.';
    end if;

    if v_p.kuota is not null then
      select coalesce(sum(oi.qty), 0) into v_used
      from order_items oi join orders o on o.id = oi.order_id
      where o.batch_id = b.id and o.status <> 'dibatalkan' and oi.product_id = v_p.id;
      if v_used + v_qty > v_p.kuota then
        raise exception 'Maaf, % tinggal %.', v_p.nama, greatest(v_p.kuota - v_used, 0);
      end if;
    end if;

    insert into order_items (order_id, product_id, nama_produk_snapshot, harga_snapshot, hpp_snapshot, qty, catatan)
    values (v_order, v_p.id, v_p.nama, v_p.harga, v_p.hpp, v_qty,
            left(nullif(trim(coalesce(v_item->>'catatan', '')), ''), 100));

    v_subtotal := v_subtotal + v_p.harga * v_qty;
    v_total_qty := v_total_qty + v_qty;
    v_items := v_items || jsonb_build_object('nama', v_p.nama, 'qty', v_qty, 'harga', v_p.harga);
  end loop;

  if v_total_qty > 100 then
    raise exception 'Total pesanan maksimal 100 pcs. Untuk pesanan besar, hubungi kami lewat WhatsApp.';
  end if;

  return jsonb_build_object(
    'kode', upper(substr(v_order::text, 1, 6)),
    'nama', v_nama,
    'subtotal', v_subtotal,
    'items', v_items
  );
end;
$$;

revoke all on function submit_public_order(text, jsonb) from public;
grant execute on function submit_public_order(text, jsonb) to anon, authenticated;

-- ------------------------------------------------------------
-- 3. Log tetap ada saat pesanan dihapus
-- ------------------------------------------------------------
alter table order_log alter column order_id drop not null;
alter table order_log drop constraint if exists order_log_order_id_fkey;
alter table order_log add constraint order_log_order_id_fkey
  foreign key (order_id) references orders(id) on delete set null;

create or replace function log_hapus_pesanan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into order_log (order_id, aksi, detail, oleh)
  values (old.id, 'dihapus', jsonb_build_object(
      'kode', upper(substr(old.id::text, 1, 6)),
      'pembeli', (select nama from customers where id = old.customer_id),
      'status', old.status,
      'item', ringkas_item(old.id)),
    auth.jwt() ->> 'email');
  return old;
end;
$$;
revoke all on function log_hapus_pesanan() from public, anon, authenticated;

drop trigger if exists orders_log_hapus on orders;
create trigger orders_log_hapus before delete on orders
for each row execute function log_hapus_pesanan();

-- ------------------------------------------------------------
-- 4. Tanggal bayar bawaan = tanggal WIB (sebelumnya UTC: bayar sebelum jam 7 pagi tercatat kemarin)
-- ------------------------------------------------------------
alter table payments alter column tanggal_bayar set default (now() at time zone 'Asia/Jakarta')::date;

-- ------------------------------------------------------------
-- 5. Jenis file yang boleh diunggah
-- ------------------------------------------------------------
update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'produk';
update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where id = 'bukti';

commit;

notify pgrst, 'reload schema';
