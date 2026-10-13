// Rumus inti. Semua nominal bilangan bulat Rupiah.
// Rumus yang sama dipakai view `order_summary` di database; file ini untuk tampilan
// sebelum disimpan (total berjalan, peringatan) dan diuji di calc.test.ts.

export type StatusBayar = 'belum' | 'dp' | 'lunas'

export interface ItemLike { harga: number; qty: number }

export function subtotal(items: ItemLike[]): number {
  return items.reduce((sum, i) => sum + Math.round(i.harga) * Math.round(i.qty), 0)
}

export function totalPesanan(items: ItemLike[], ongkir: number): number {
  return subtotal(items) + Math.round(ongkir || 0)
}

export function statusBayar(total: number, terbayar: number): StatusBayar {
  if (terbayar <= 0) return 'belum'
  if (terbayar < total) return 'dp'
  return 'lunas'
}

export function sisaTagihan(total: number, terbayar: number): number {
  return Math.max(total - terbayar, 0)
}

export function kelebihanBayar(total: number, terbayar: number): number {
  return Math.max(terbayar - total, 0)
}

/** Sisa kuota per produk. `terpakai` = qty pesanan aktif lain di batch yang sama. */
export function sisaKuota(kuota: number, terpakai: number): number {
  return kuota - terpakai
}
