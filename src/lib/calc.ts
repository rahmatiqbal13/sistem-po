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

// ============================================================
// HPP & laba
// HPP = harga pokok (modal) per pcs. Laba kotor = harga jual − HPP, belum dikurangi
// biaya tetap (sewa, gaji, dll). Ongkir tidak dihitung sebagai pendapatan produk.
// ============================================================

export interface RincianHpp {
  /** Jumlah pcs yang dihasilkan dari seluruh biaya di bawah (satu kali produksi/resep) */
  hasil: number
  biaya: { nama: string; jumlah: number }[]
}

/** HPP per pcs dari rincian biaya satu kali produksi, dibulatkan ke atas agar modal tidak kurang. */
export function hitungHpp(r: RincianHpp): number {
  const total = r.biaya.reduce((s, b) => s + Math.max(Math.round(b.jumlah || 0), 0), 0)
  const hasil = Math.round(r.hasil || 0)
  return hasil > 0 ? Math.ceil(total / hasil) : 0
}

/** Margin laba terhadap harga jual, dalam persen (1 desimal). Harga 0 → 0. */
export function marginPersen(harga: number, hpp: number): number {
  return harga > 0 ? Math.round(((harga - hpp) / harga) * 1000) / 10 : 0
}

/** Harga jual agar margin mencapai target (persen dari harga jual), dibulatkan ke atas ke kelipatan `bulat`. */
export function hargaDariMargin(hpp: number, target: number, bulat = 500): number {
  if (target >= 100) return 0
  const harga = hpp / (1 - target / 100)
  return Math.ceil(harga / bulat) * bulat
}

export interface ItemLaba { harga: number; hpp: number | null; qty: number }

/**
 * Pendapatan, HPP, dan laba kotor dari daftar item.
 * Item yang HPP-nya belum diisi (null) tidak ikut dihitung labanya; jumlahnya dilaporkan di `tanpaHpp`
 * agar angka laba tidak terlihat lebih besar dari kenyataan.
 */
export function hitungLaba(items: ItemLaba[]) {
  let pendapatan = 0, hpp = 0, pendapatanTanpaHpp = 0, tanpaHpp = 0
  for (const i of items) {
    const omzet = Math.round(i.harga) * Math.round(i.qty)
    if (i.hpp == null) { pendapatanTanpaHpp += omzet; tanpaHpp += i.qty; continue }
    pendapatan += omzet
    hpp += Math.round(i.hpp) * Math.round(i.qty)
  }
  const laba = pendapatan - hpp
  return { pendapatan, hpp, laba, margin: marginPersen(pendapatan, hpp), pendapatanTanpaHpp, tanpaHpp }
}
