// Jam operasional & lokasi ambil toko. Fungsi murni agar mudah diuji.

/** Urutan tampil Sen–Min; angka = getDay() (0 = Minggu) */
export const URUT_HARI = [1, 2, 3, 4, 5, 6, 0] as const
export const NAMA_HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'] as const

export interface Operasional {
  jam_buka: string | null; jam_tutup: string | null; hari_buka: number[] | null
  lokasi_ambil: string | null; area_antar: string | null
}

/** "Sen, Sel, Rab" · "setiap hari" · "" bila belum diisi */
export function teksHari(hari: number[] | null | undefined): string {
  if (!hari?.length) return ''
  if (hari.length === 7) return 'setiap hari'
  return URUT_HARI.filter((d) => hari.includes(d)).map((d) => NAMA_HARI[d]).join(', ')
}

/** Ringkasan untuk pembeli: "Ambil di X, 09:00–17:00 (Sen, Sel). Antar: Y." Bagian kosong dilewati. */
export function teksOperasional(o: Partial<Operasional>): string {
  const jam = o.jam_buka && o.jam_tutup ? `${o.jam_buka.slice(0, 5)}–${o.jam_tutup.slice(0, 5)}` : ''
  const hari = teksHari(o.hari_buka)
  const waktu = [jam, hari && `(${hari})`].filter(Boolean).join(' ')
  const lokasi = o.lokasi_ambil?.trim()
  const ambil = lokasi ? `Ambil di ${lokasi}${waktu ? ', ' + waktu : ''}.` : waktu ? `Buka ${waktu}.` : ''
  const antar = o.area_antar?.trim() ? `Antar: ${o.area_antar.trim()}.` : ''
  return [ambil, antar].filter(Boolean).join(' ')
}
