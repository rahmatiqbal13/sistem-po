// Pengingat tagihan di kartu pesanan. Fungsi murni agar mudah diuji.

export interface DataTagih {
  status: string
  sisa: number
  /** Tanggal ambil pesanan; kosong = memakai tanggal ambil batch */
  tanggalAmbil: string | null
}

/** Jarak hari dari `hariIni` ke `tanggal` (YYYY-MM-DD); negatif = sudah lewat */
export function selisihHari(tanggal: string, hariIni: string): number {
  return Math.round((Date.parse(tanggal + 'T00:00:00Z') - Date.parse(hariIni + 'T00:00:00Z')) / 864e5)
}

/**
 * Teks pengingat bila pesanan belum lunas dan jadwal ambil/antarnya besok, hari ini, atau sudah lewat.
 * null = tidak perlu diingatkan.
 */
export function pengingatTagih(d: DataTagih, hariIni: string, tanggalBatch: string | null = null): string | null {
  if (d.status === 'dibatalkan' || d.status === 'selesai' || d.sisa <= 0) return null
  const tgl = d.tanggalAmbil ?? tanggalBatch
  if (!tgl) return null
  const h = selisihHari(tgl, hariIni)
  if (h > 1) return null
  return h === 1 ? 'Belum lunas · ambil besok' : h === 0 ? 'Belum lunas · ambil hari ini' : 'Belum lunas · jadwal sudah lewat'
}
