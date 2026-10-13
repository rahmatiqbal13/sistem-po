import type { OrderSummary } from '@/lib/types'
import { CARA_TERIMA, ORDER_STATUS, STATUS_BAYAR } from '@/lib/types'
import type { ItemWithOrder } from '@/lib/data'

type Row = Record<string, string | number>

async function download(rows: Row[], filename: string, format: 'xlsx' | 'csv', sheet = 'Data') {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.json_to_sheet(rows)
  if (format === 'csv') {
    // BOM agar Excel membaca UTF-8 dengan benar
    const blob = new Blob(['﻿' + XLSX.utils.sheet_to_csv(ws)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename + '.csv'
    a.click()
    URL.revokeObjectURL(a.href)
    return
  }
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheet)
  XLSX.writeFile(wb, filename + '.xlsx')
}

export function exportOrders(orders: OrderSummary[], items: ItemWithOrder[], filename: string, format: 'xlsx' | 'csv') {
  const byOrder = new Map<string, string[]>()
  for (const i of items) {
    const list = byOrder.get(i.order_id) ?? []
    list.push(`${i.nama_produk_snapshot} x${i.qty}${i.catatan ? ` (${i.catatan})` : ''}`)
    byOrder.set(i.order_id, list)
  }
  const rows = orders.map((o) => ({
    'Nama': o.customer_nama,
    'No WA': o.customer_wa ?? '',
    'Item': (byOrder.get(o.id) ?? []).join('; '),
    'Qty': Number(o.total_qty),
    'Subtotal': Number(o.subtotal),
    'Ongkir': Number(o.ongkir),
    'Total': Number(o.total),
    'Terbayar': Number(o.terbayar),
    'Sisa': Number(o.sisa),
    'Status bayar': o.status === 'dibatalkan' ? 'Tidak ditagih' : STATUS_BAYAR[o.status_bayar],
    'Status pesanan': ORDER_STATUS[o.status],
    'Cara terima': CARA_TERIMA[o.cara_terima],
    'Alamat': o.alamat ?? '',
    'Tanggal ambil': o.tanggal_ambil ?? '',
    'Jam ambil': o.jam_ambil?.slice(0, 5) ?? '',
    'Catatan': o.catatan ?? '',
  }))
  return download(rows, filename, format, 'Pesanan')
}

export function exportRekap(rekap: { nama: string; qty: number }[], filename: string, format: 'xlsx' | 'csv') {
  const rows: Row[] = rekap.map((r) => ({ 'Produk': r.nama, 'Total qty': r.qty }))
  rows.push({ 'Produk': 'TOTAL', 'Total qty': rekap.reduce((s, r) => s + r.qty, 0) })
  return download(rows, filename, format, 'Rekap produksi')
}
