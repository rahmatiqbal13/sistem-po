export type BatchStatus = 'draft' | 'buka' | 'tutup' | 'selesai'
export type OrderStatus = 'baru' | 'dikonfirmasi' | 'diproduksi' | 'siap' | 'selesai' | 'dibatalkan'
export type CaraTerima = 'pickup' | 'antar' | 'kurir'
export type StatusBayar = 'belum' | 'dp' | 'lunas'
export type Metode = 'transfer' | 'ewallet' | 'tunai'

export interface Customer { id: string; nama: string; no_wa: string | null; catatan: string | null }
export interface Product { id: string; nama: string; harga: number; aktif: boolean }
export interface Batch {
  id: string; nama: string; status: BatchStatus
  tanggal_buka: string | null; tanggal_tutup: string | null; tanggal_ambil: string | null
}
export interface Quota { batch_id: string; product_id: string; kuota: number }

export interface Order {
  id: string; batch_id: string; customer_id: string
  cara_terima: CaraTerima; alamat: string | null; ongkir: number
  tanggal_ambil: string | null; jam_ambil: string | null
  status: OrderStatus; catatan: string | null
  created_by: string | null; updated_by: string | null
  created_at: string; updated_at: string
}

export interface OrderSummary extends Order {
  customer_nama: string; customer_wa: string | null
  subtotal: number; total_qty: number; total: number
  terbayar: number; sisa: number; status_bayar: StatusBayar; kelebihan_bayar: boolean
}

export interface OrderItem {
  id: string; order_id: string; product_id: string | null
  nama_produk_snapshot: string; harga_snapshot: number; qty: number; catatan: string | null
}

export interface Payment {
  id: string; order_id: string; jumlah: number; metode: Metode
  tanggal_bayar: string; bukti_path: string | null; dicatat_oleh: string | null; created_at: string
}

export const BATCH_STATUS: Record<BatchStatus, string> = {
  draft: 'Draft', buka: 'Buka', tutup: 'Tutup', selesai: 'Selesai',
}
export const ORDER_STATUS: Record<OrderStatus, string> = {
  baru: 'Baru', dikonfirmasi: 'Dikonfirmasi', diproduksi: 'Diproduksi',
  siap: 'Siap', selesai: 'Selesai', dibatalkan: 'Dibatalkan',
}
export const CARA_TERIMA: Record<CaraTerima, string> = {
  pickup: 'Ambil sendiri', antar: 'Diantar sendiri', kurir: 'Kurir online',
}
export const STATUS_BAYAR: Record<StatusBayar, string> = {
  belum: 'Belum bayar', dp: 'DP', lunas: 'Lunas',
}
export const METODE: Record<Metode, string> = {
  transfer: 'Transfer bank', ewallet: 'E-wallet', tunai: 'Tunai (COD)',
}
