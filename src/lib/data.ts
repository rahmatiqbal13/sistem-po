import { createClient } from '@/lib/supabase/client'
import type { OrderItem, OrderStatus, OrderSummary } from '@/lib/types'
import { today } from '@/lib/format'

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
  const map = new Map<string, { nama: string; qty: number }>()
  for (const i of items) {
    if (i.orders.status === 'dibatalkan') continue
    const key = i.product_id ?? i.nama_produk_snapshot
    const cur = map.get(key) ?? { nama: i.nama_produk_snapshot, qty: 0 }
    cur.qty += i.qty
    map.set(key, cur)
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty)
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

/** Hari H: catat sisa tagihan sebagai tunai (COD) lalu tandai Selesai. */
export async function terimaTunaiSelesai(o: OrderSummary) {
  if (Number(o.sisa) > 0) {
    const { error } = await createClient().from('payments').insert({
      order_id: o.id, jumlah: Number(o.sisa), metode: 'tunai', tanggal_bayar: today(),
    })
    if (error) throw error
  }
  await setOrderStatus(o.id, 'selesai', o.updated_at)
}
