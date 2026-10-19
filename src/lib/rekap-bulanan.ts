// Rekap lintas batch per bulan. Fungsi murni agar mudah diuji.
import { hitungLaba } from './calc.ts'

export interface PesananBulanan {
  id: string; status: string; tanggal_ambil: string | null; created_at: string
  subtotal: number; ongkir: number; terbayar: number; sisa: number
}
export interface ItemBulanan {
  order_id: string; product_id: string | null; nama_produk_snapshot: string
  harga_snapshot: number; hpp_snapshot: number | null; qty: number
}

export interface Bulan {
  /** YYYY-MM */
  bulan: string
  pesanan: number
  /** Penjualan produk (tanpa ongkir) */
  penjualan: number
  ongkir: number
  terbayar: number
  sisa: number
  laba: number
  /** Pcs yang belum punya HPP sehingga tidak masuk laba */
  tanpaHpp: number
  qty: number
  terlaris: { nama: string; qty: number } | null
}

/** Bulan pesanan = bulan tanggal ambil (hari produksi), atau bulan dicatat bila tanggal ambil kosong */
export function bulanPesanan(o: Pick<PesananBulanan, 'tanggal_ambil' | 'created_at'>): string {
  return (o.tanggal_ambil ?? o.created_at).slice(0, 7)
}

/** Ringkasan per bulan dari pesanan aktif (Dibatalkan tidak dihitung), urut bulan terbaru dulu */
export function rekapBulanan(orders: PesananBulanan[], items: ItemBulanan[]): Bulan[] {
  const bulanOrder = new Map<string, string>()
  const out = new Map<string, Bulan>()
  for (const o of orders) {
    if (o.status === 'dibatalkan') continue
    const b = bulanPesanan(o)
    bulanOrder.set(o.id, b)
    const cur = out.get(b) ?? { bulan: b, pesanan: 0, penjualan: 0, ongkir: 0, terbayar: 0, sisa: 0, laba: 0, tanpaHpp: 0, qty: 0, terlaris: null }
    cur.pesanan += 1
    cur.penjualan += Number(o.subtotal)
    cur.ongkir += Number(o.ongkir)
    cur.terbayar += Number(o.terbayar)
    cur.sisa += Number(o.sisa)
    out.set(b, cur)
  }

  const perBulan = new Map<string, ItemBulanan[]>()
  for (const i of items) {
    const b = bulanOrder.get(i.order_id)
    if (b) perBulan.set(b, [...(perBulan.get(b) ?? []), i])
  }
  for (const [b, list] of perBulan) {
    const cur = out.get(b)!
    const l = hitungLaba(list.map((i) => ({ harga: Number(i.harga_snapshot), hpp: i.hpp_snapshot == null ? null : Number(i.hpp_snapshot), qty: i.qty })))
    cur.laba = l.laba
    cur.tanpaHpp = l.tanpaHpp
    const qty = new Map<string, { nama: string; qty: number }>()
    for (const i of list) {
      const k = i.product_id ?? i.nama_produk_snapshot
      const p = qty.get(k) ?? { nama: i.nama_produk_snapshot, qty: 0 }
      p.qty += i.qty
      qty.set(k, p)
      cur.qty += i.qty
    }
    cur.terlaris = [...qty.values()].sort((a, b) => b.qty - a.qty || a.nama.localeCompare(b.nama))[0] ?? null
  }
  return [...out.values()].sort((a, b) => b.bulan.localeCompare(a.bulan))
}

export function namaBulan(b: string, opts: Intl.DateTimeFormatOptions = { month: 'long', year: 'numeric' }): string {
  return new Date(b + '-01T00:00:00').toLocaleDateString('id-ID', opts)
}
