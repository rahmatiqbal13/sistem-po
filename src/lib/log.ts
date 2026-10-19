// Teks log aktivitas pesanan (tabel order_log). Fungsi murni agar mudah diuji.
import { rupiah } from './format.ts'

export interface LogPesanan {
  id: number
  aksi: 'dibuat' | 'diubah' | 'status' | 'bayar' | 'bayar_hapus'
  detail: { sumber?: string; item?: string; dari?: string; ke?: string; bagian?: string[]; jumlah?: number; metode?: string }
  oleh: string | null
  created_at: string
}

const STATUS: Record<string, string> = {
  baru: 'Baru', dikonfirmasi: 'Dikonfirmasi', diproduksi: 'Diproduksi', siap: 'Siap', selesai: 'Selesai', dibatalkan: 'Dibatalkan',
}
const METODE: Record<string, string> = { transfer: 'Transfer bank', ewallet: 'E-wallet', tunai: 'Tunai (COD)' }
const BAGIAN: Record<string, string> = {
  item: 'item', jadwal: 'jadwal ambil', cara_terima: 'cara terima', alamat: 'alamat', ongkir: 'ongkir',
  catatan: 'catatan', pembeli: 'pembeli', batch: 'batch',
}

/** Kalimat utama + baris rincian (opsional) untuk satu entri log */
export function teksLog(l: LogPesanan): { judul: string; rincian?: string } {
  const d = l.detail
  switch (l.aksi) {
    case 'dibuat':
      return { judul: d.sumber === 'link' ? 'Pesanan masuk lewat link pemesanan' : 'Pesanan dicatat', rincian: d.item || undefined }
    case 'status':
      return { judul: `Status: ${STATUS[d.dari ?? ''] ?? d.dari} → ${STATUS[d.ke ?? ''] ?? d.ke}` }
    case 'diubah': {
      const bagian = (d.bagian ?? []).map((b) => BAGIAN[b] ?? b)
      return {
        judul: `Diubah: ${bagian.join(', ') || 'detail pesanan'}`,
        rincian: d.bagian?.includes('item') && d.item ? `Item sekarang: ${d.item}` : undefined,
      }
    }
    case 'bayar':
    case 'bayar_hapus':
      return { judul: `Pembayaran ${rupiah(d.jumlah)} (${METODE[d.metode ?? ''] ?? d.metode}) ${l.aksi === 'bayar' ? 'dicatat' : 'dihapus'}` }
  }
}
