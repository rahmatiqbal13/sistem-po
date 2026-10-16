import { createClient } from '@/lib/supabase/client'
import type { OrderItem, OrderStatus, OrderSummary } from '@/lib/types'
import { hitungLaba } from '@/lib/calc'

export async function fetchBatchOrders(batchId: string): Promise<OrderSummary[]> {
  const { data, error } = await createClient()
    .from('order_summary').select('*').eq('batch_id', batchId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as OrderSummary[]
}

export type ItemWithOrder = OrderItem & { orders: { batch_id: string; status: OrderStatus } }

export async function fetchBatchItems(batchId: string): Promise<ItemWithOrder[]> {
  const { data, error } = await createClient()
    .from('order_items').select('*, orders!inner(batch_id, status)').eq('orders.batch_id', batchId)
  if (error) throw error
  return (data ?? []) as ItemWithOrder[]
}

/** Total qty per produk dari pesanan aktif (Dibatalkan tidak dihitung). */
export function rekapProduksi(items: ItemWithOrder[]) {
  const map = new Map<string, { id: string | null; nama: string; qty: number }>()
  for (const i of items) {
    if (i.orders.status === 'dibatalkan') continue
    const key = i.product_id ?? i.nama_produk_snapshot
    const cur = map.get(key) ?? { id: i.product_id, nama: i.nama_produk_snapshot, qty: 0 }
    cur.qty += i.qty
    map.set(key, cur)
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty)
}

/** Pendapatan, HPP, dan laba kotor per produk + total, dari pesanan aktif (Dibatalkan tidak dihitung). */
export function rekapLaba(items: ItemWithOrder[]) {
  const aktif = items.filter((i) => i.orders.status !== 'dibatalkan')
  const groups = new Map<string, ItemWithOrder[]>()
  for (const i of aktif) {
    const key = i.product_id ?? i.nama_produk_snapshot
    groups.set(key, [...(groups.get(key) ?? []), i])
  }
  const toLaba = (list: ItemWithOrder[]) => hitungLaba(list.map((i) => ({
    harga: Number(i.harga_snapshot), hpp: i.hpp_snapshot == null ? null : Number(i.hpp_snapshot), qty: i.qty,
  })))
  const produk = [...groups.values()].map((list) => ({
    nama: list[0].nama_produk_snapshot,
    qty: list.reduce((s, i) => s + i.qty, 0),
    ...toLaba(list),
  })).sort((a, b) => b.laba - a.laba)
  return { produk, total: toLaba(aktif) }
}

export function ringkasan(orders: OrderSummary[]) {
  const aktif = orders.filter((o) => o.status !== 'dibatalkan')
  return {
    jumlah: aktif.length,
    total: aktif.reduce((s, o) => s + Number(o.total), 0),
    terbayar: aktif.reduce((s, o) => s + Number(o.terbayar), 0),
    sisa: aktif.reduce((s, o) => s + Number(o.sisa), 0),
    lunas: aktif.filter((o) => o.status_bayar === 'lunas').length,
    dp: aktif.filter((o) => o.status_bayar === 'dp').length,
    belum: aktif.filter((o) => o.status_bayar === 'belum').length,
    dibatalkan: orders.length - aktif.length,
  }
}

export async function setOrderStatus(id: string, status: OrderStatus, expected?: string) {
  const { data, error } = await createClient().rpc('set_order_status', {
    p_id: id, p_status: status, p_expected: expected ?? null,
  })
  if (error) throw error
  return data as string
}

/** Hari H: catat sisa tagihan sebagai tunai (COD) lalu tandai Selesai, dalam satu transaksi di server. */
export async function terimaTunaiSelesai(o: OrderSummary) {
  const { data, error } = await createClient().rpc('terima_tunai_selesai', { p_id: o.id, p_expected: o.updated_at })
  if (error) throw error
  return data as string
}
