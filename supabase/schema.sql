-- Sistem PO Jajanan — skema database
-- Jalankan di Supabase SQL Editor. Aman dijalankan ulang: menjalankan versi terbaru file ini
-- juga meng-upgrade database yang dibuat dengan versi sebelumnya.
-- Semua nominal disimpan sebagai bilangan bulat Rupiah (bigint).

-- ============================================================
-- Tabel
-- ============================================================

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  no_wa text,
  catatan text,
  created_at timestamptz not null default now()
);
create index if not exists customers_nama_idx on customers (lower(nama));
create index if not exists customers_wa_idx on customers (no_wa);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  harga bigint not null check (harga >= 0),
  aktif boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists po_batches (
  id uuid primary key default gen_random_uuid(),
  nama text not null,
  tanggal_buka date,
  tanggal_tutup date,
  tanggal_ambil date,
  status text not null default 'draft' check (status in ('draft','buka','tutup','selesai')),
  created_at timestamptz not null default now()
);

create table if not exists batch_product_quotas (
  batch_id uuid not null references po_batches(id) on delete cascade,
  product_id uuid not null references products(id) on delete cascade,
  kuota integer not null check (kuota >= 0),
  primary key (batch_id, product_id)
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references po_batches(id) on delete restrict,
  customer_id uuid not null references customers(id) on delete restrict,
  cara_terima text not null default 'pickup' check (cara_terima in ('pickup','antar','kurir')),
  alamat text,
  ongkir bigint not null default 0 check (ongkir >= 0),
  tanggal_ambil date,
  jam_ambil time,
  status text not null default 'baru'
    check (status in ('baru','dikonfirmasi','diproduksi','siap','selesai','dibatalkan')),
  catatan text,
  created_by text default (auth.jwt() ->> 'email'),
  updated_by text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint alamat_wajib check (cara_terima = 'pickup' or coalesce(trim(alamat), '') <> '')
);
create index if not exists orders_batch_idx on orders (batch_id);
create index if not exists orders_customer_idx on orders (customer_id);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  nama_produk_snapshot text not null,
  harga_snapshot bigint not null check (harga_snapshot >= 0),
  qty integer not null check (qty > 0),
  catatan text
);
create index if not exists order_items_order_idx on order_items (order_id);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  jumlah bigint not null check (jumlah > 0),
  metode text not null check (metode in ('transfer','ewallet','tunai')),
  tanggal_bayar date not null default (now() at time zone 'Asia/Jakarta')::date,
  bukti_path text,
  dicatat_oleh text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now()
);
create index if not exists payments_order_idx on payments (order_id);

create table if not exists pengaturan (
  id integer primary key default 1 check (id = 1),
  nama_toko text not null default 'PO Jajanan',
  wa_admin text,
  info_pembayaran text
);
insert into pengaturan (id) values (1) on conflict (id) do nothing;

-- ============================================================
-- Upgrade v2: link pemesanan pembeli & foto produk
-- ============================================================

-- Baris di batch_product_quotas = produk yang dijual di batch; kuota null = tanpa batas
alter table batch_product_quotas alter column kuota drop not null;

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'orders' and column_name = 'sumber') then
    -- Batch lama belum punya daftar produk yang dijual: anggap semua produk aktif dijual
    insert into batch_product_quotas (batch_id, product_id, kuota)
    select b.id, p.id, null from po_batches b cross join products p
    where p.aktif and not exists (select 1 from batch_product_quotas q where q.batch_id = b.id)
    on conflict do nothing;
  end if;
end $$;

alter table products add column if not exists foto_path text;

alter table po_batches add column if not exists slug text;
alter table po_batches add column if not exists info_pembeli text;
alter table po_batches alter column slug set default 'po-' || substr(md5(gen_random_uuid()::text), 1, 8);
update po_batches set slug = 'po-' || substr(md5(id::text), 1, 8) where slug is null;
create unique index if not exists po_batches_slug_idx on po_batches (slug);

alter table orders add column if not exists sumber text not null default 'admin';
alter table orders drop constraint if exists orders_sumber_check;
alter table orders add constraint orders_sumber_check check (sumber in ('admin', 'link'));

-- ============================================================
-- Upgrade v3: HPP (harga pokok per pcs) & laba
-- hpp null = belum diisi. hpp_snapshot di item pesanan dibekukan seperti harga_snapshot,
-- jadi laba pesanan lama tidak berubah saat HPP produk diubah.
-- ============================================================

alter table products add column if not exists hpp bigint check (hpp >= 0);
-- Rincian biaya untuk menghitung HPP: { hasil: <pcs>, biaya: [{ nama, jumlah }] }
alter table products add column if not exists hpp_rincian jsonb;
alter table order_items add column if not exists hpp_snapshot bigint check (hpp_snapshot >= 0);

-- Item yang dibuat sebelum HPP produknya diisi ikut memakai HPP pertama yang diisi.
-- Setelah terisi, perubahan HPP berikutnya tidak menyentuh item lama.
create or replace function isi_hpp_item_lama()
returns trigger language plpgsql as $$
begin
  if new.hpp is not null then
    update order_items set hpp_snapshot = new.hpp
    where product_id = new.id and hpp_snapshot is null;
  end if;
  return new;
end;
$$;

drop trigger if exists products_isi_hpp on products;
create trigger products_isi_hpp after insert or update of hpp on products
for each row execute function isi_hpp_item_lama();

-- ============================================================
-- View ringkasan pesanan: total & status bayar dihitung, tidak disimpan
-- ============================================================

drop view if exists order_summary;
create view order_summary with (security_invoker = true) as
select
  o.*,
  c.nama as customer_nama,
  c.no_wa as customer_wa,
  coalesce(i.subtotal, 0) as subtotal,
  coalesce(i.total_qty, 0) as total_qty,
  coalesce(i.subtotal, 0) + o.ongkir as total,
  coalesce(p.terbayar, 0) as terbayar,
  greatest(coalesce(i.subtotal, 0) + o.ongkir - coalesce(p.terbayar, 0), 0) as sisa,
  case
    when coalesce(p.terbayar, 0) = 0 then 'belum'
    when coalesce(p.terbayar, 0) < coalesce(i.subtotal, 0) + o.ongkir then 'dp'
    else 'lunas'
  end as status_bayar,
  coalesce(p.terbayar, 0) > coalesce(i.subtotal, 0) + o.ongkir as kelebihan_bayar
from orders o
join customers c on c.id = o.customer_id
left join (
  select order_id, sum(harga_snapshot * qty) as subtotal, sum(qty) as total_qty
  from order_items group by order_id
) i on i.order_id = o.id
left join (
  select order_id, sum(jumlah) as terbayar from payments group by order_id
) p on p.order_id = o.id;

-- ============================================================
-- Simpan pesanan (buat / ubah) secara atomik + cek konflik edit
-- payload: { id?, expected_updated_at?, batch_id, customer_id, cara_terima, alamat,
--            ongkir, tanggal_ambil, jam_ambil, status, catatan,
--            items: [{ product_id, qty, catatan }] }
-- ============================================================

create or replace function save_order(payload jsonb)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_id uuid := nullif(payload->>'id', '')::uuid;
  v_expected timestamptz := nullif(payload->>'expected_updated_at', '')::timestamptz;
  v_current orders%rowtype;
  v_item jsonb;
  v_product products%rowtype;
begin
  if jsonb_array_length(coalesce(payload->'items', '[]'::jsonb)) = 0 then
    raise exception 'Pesanan minimal berisi 1 item' using errcode = 'P0001';
  end if;

  if v_id is null then
    insert into orders (batch_id, customer_id, cara_terima, alamat, ongkir, tanggal_ambil, jam_ambil, status, catatan)
    values (
      (payload->>'batch_id')::uuid,
      (payload->>'customer_id')::uuid,
      coalesce(payload->>'cara_terima', 'pickup'),
      nullif(payload->>'alamat', ''),
      coalesce((payload->>'ongkir')::bigint, 0),
      nullif(payload->>'tanggal_ambil', '')::date,
      nullif(payload->>'jam_ambil', '')::time,
      coalesce(payload->>'status', 'baru'),
      nullif(payload->>'catatan', '')
    )
    returning id into v_id;
  else
    select * into v_current from orders where id = v_id for update;
    if not found then
      raise exception 'Pesanan tidak ditemukan' using errcode = 'P0002';
    end if;
    if v_current.status = 'selesai' then
      raise exception 'Pesanan berstatus Selesai tidak dapat diedit' using errcode = 'P0001';
    end if;
    if v_expected is not null and v_current.updated_at <> v_expected then
      raise exception 'KONFLIK: pesanan ini baru saja diubah oleh %. Muat ulang untuk melihat perubahan terbaru.',
        coalesce(v_current.updated_by, 'pengguna lain') using errcode = 'P0409';
    end if;

    update orders set
      batch_id = (payload->>'batch_id')::uuid,
      customer_id = (payload->>'customer_id')::uuid,
      cara_terima = coalesce(payload->>'cara_terima', 'pickup'),
      alamat = nullif(payload->>'alamat', ''),
      ongkir = coalesce((payload->>'ongkir')::bigint, 0),
      tanggal_ambil = nullif(payload->>'tanggal_ambil', '')::date,
      jam_ambil = nullif(payload->>'jam_ambil', '')::time,
      status = coalesce(payload->>'status', v_current.status),
      catatan = nullif(payload->>'catatan', '')
    where id = v_id;

    delete from order_items where order_id = v_id;
  end if;

  for v_item in select * from jsonb_array_elements(payload->'items') loop
    select * into v_product from products where id = (v_item->>'product_id')::uuid;
    if not found then
      raise exception 'Produk tidak ditemukan' using errcode = 'P0002';
    end if;
    insert into order_items (order_id, product_id, nama_produk_snapshot, harga_snapshot, hpp_snapshot, qty, catatan)
    values (
      v_id,
      v_product.id,
      coalesce(v_item->>'nama_produk_snapshot', v_product.nama),
      -- harga & HPP lama dipertahankan saat edit (snapshot), produk baru memakai nilai katalog saat ini
      coalesce((v_item->>'harga_snapshot')::bigint, v_product.harga),
      coalesce((v_item->>'hpp_snapshot')::bigint, v_product.hpp),
      (v_item->>'qty')::int,
      nullif(v_item->>'catatan', '')
    );
  end loop;

  return v_id;
end;
$$;

-- Ubah status pesanan dengan cek konflik
create or replace function set_order_status(p_id uuid, p_status text, p_expected timestamptz default null)
returns timestamptz
language plpgsql
security invoker
as $$
declare
  v_current orders%rowtype;
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
  update orders set status = p_status where id = p_id returning updated_at into v_new;
  return v_new;
end;
$$;

-- updated_at & updated_by otomatis
create or replace function touch_order()
returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := coalesce(auth.jwt() ->> 'email', new.updated_by);
  return new;
end;
$$;

drop trigger if exists orders_touch on orders;
create trigger orders_touch before update on orders
for each row execute function touch_order();

-- ============================================================
-- Row Level Security: hanya akun di daftar admin_toko (bukan sekadar akun yang login)
-- Pertama kali dijalankan, semua akun yang sudah ada di Authentication → Users menjadi pemilik.
-- ============================================================

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


alter table customers enable row level security;
alter table products enable row level security;
alter table po_batches enable row level security;
alter table batch_product_quotas enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;
alter table pengaturan enable row level security;

do $$
declare t text;
begin
  foreach t in array array['customers','products','po_batches','batch_product_quotas','orders','order_items','payments','pengaturan'] loop
    execute format('drop policy if exists pemilik_all on %I', t);
    execute format('create policy pemilik_all on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

revoke all on function save_order(jsonb) from anon, public;
revoke all on function set_order_status(uuid, text, timestamptz) from anon, public;
grant execute on function save_order(jsonb) to authenticated;
grant execute on function set_order_status(uuid, text, timestamptz) to authenticated;

-- ============================================================
-- Storage: bucket privat untuk bukti transfer
-- ============================================================

insert into storage.buckets (id, name, public)
values ('bukti', 'bukti', false)
on conflict (id) do nothing;

drop policy if exists bukti_pemilik on storage.objects;
create policy bukti_pemilik on storage.objects for all to authenticated
  using (bucket_id = 'bukti' and public.is_admin()) with check (bucket_id = 'bukti' and public.is_admin());

-- Bucket publik untuk foto produk (dibaca siapa saja, ditulis hanya pemilik)
insert into storage.buckets (id, name, public)
values ('produk', 'produk', true)
on conflict (id) do update set public = true;

drop policy if exists produk_pemilik on storage.objects;
create policy produk_pemilik on storage.objects for all to authenticated
  using (bucket_id = 'produk' and public.is_admin()) with check (bucket_id = 'produk' and public.is_admin());

-- ============================================================
-- Link pemesanan publik (tanpa login)
-- Pembeli TIDAK punya akses tabel. Mereka hanya bisa memanggil dua fungsi di bawah,
-- yang berjalan sebagai pemilik (security definer) dan memvalidasi semuanya di server.
-- ============================================================

-- 0812-3456 / +62 812 3456 / 812... → 628123456
create or replace function norm_wa(s text)
returns text language sql immutable as $$
  select case
    when d = '' then null
    when d like '0%' then '62' || substr(d, 2)
    when d like '8%' then '62' || d
    else d
  end
  from (select regexp_replace(coalesce(s, ''), '\D', '', 'g') as d) x
$$;

create or replace function batch_terbuka(b po_batches)
returns boolean language sql stable as $$
  select b.status = 'buka'
    and (b.tanggal_tutup is null or b.tanggal_tutup >= (now() at time zone 'Asia/Jakarta')::date)
$$;

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

-- Pembatas pesanan dari link publik: maks. 5 pesanan per IP per jam, dan maks. 100 per batch per 10 menit
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

-- payload: { nama, no_wa, cara_terima, alamat, catatan, items: [{ product_id, qty, catatan }] }
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

revoke all on function get_public_batch(text) from public;
revoke all on function submit_public_order(text, jsonb) from public;
grant execute on function get_public_batch(text) to anon, authenticated;
grant execute on function submit_public_order(text, jsonb) to anon, authenticated;

-- ============================================================
-- Muat ulang schema cache API agar kolom/fungsi baru langsung dikenali
-- (mencegah error "Could not find the '...' column ... in the schema cache")
-- ============================================================

notify pgrst, 'reload schema';
