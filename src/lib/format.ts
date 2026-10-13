export function rupiah(n: number | null | undefined): string {
  return 'Rp' + Math.round(n ?? 0).toLocaleString('id-ID')
}

export function tanggal(d: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!d) return '—'
  const date = d.length === 10 ? new Date(d + 'T00:00:00') : new Date(d)
  return date.toLocaleDateString('id-ID', opts ?? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export function jam(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : ''
}

export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Ambil angka bulat dari input teks "15.000" → 15000 */
export function parseRupiah(s: string): number {
  const n = parseInt(s.replace(/[^\d]/g, ''), 10)
  return Number.isFinite(n) ? n : 0
}

export function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return 'Terjadi kesalahan'
}
