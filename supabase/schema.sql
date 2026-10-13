-- Sistem PO Jajanan — skema database
-- Jalankan sekali di Supabase SQL Editor (aman dijalankan ulang untuk objek "or replace").
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
  tanggal_bayar date not null default current_date,
  bukti_path text,
  dicatat_oleh text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now()
);
create index if not exists payments_order_idx on payments (order_id);

-- ============================================================
-- View ringkasan pesanan: total & status bayar dihitung, tidak disimpan
-- ============================================================

create or replace view order_summary with (security_invoker = true) as
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
    insert into order_items (order_id, product_id, nama_produk_snapshot, harga_snapshot, qty, catatan)
    values (
      v_id,
      v_product.id,
      coalesce(v_item->>'nama_produk_snapshot', v_product.nama),
      -- harga lama dipertahankan saat edit (snapshot), produk baru memakai harga katalog saat ini
      coalesce((v_item->>'harga_snapshot')::bigint, v_product.harga),
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
-- Row Level Security: hanya akun yang login (pendaftaran publik dimatikan)
-- ============================================================

alter table customers enable row level security;
alter table products enable row level security;
alter table po_batches enable row level security;
alter table batch_product_quotas enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table payments enable row level security;

do $$
declare t text;
begin
  foreach t in array array['customers','products','po_batches','batch_product_quotas','orders','order_items','payments'] loop
    execute format('drop policy if exists pemilik_all on %I', t);
    execute format('create policy pemilik_all on %I for all to authenticated using (true) with check (true)', t);
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
  using (bucket_id = 'bukti') with check (bucket_id = 'bukti');
