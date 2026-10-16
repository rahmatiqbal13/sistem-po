// Batas lama login admin. Setelah lewat, admin wajib masuk ulang walaupun token masih bisa diperbarui.
export const SESSION_MAX_MS = 24 * 60 * 60 * 1000

type Amr = { method?: string; timestamp?: number } | string

/**
 * Waktu login (ms) dari klaim `amr` di token Supabase. Klaim ini ditandatangani server dan
 * tidak berubah saat token diperbarui, jadi aman dipakai sebagai awal sesi.
 */
export function waktuLogin(claims: { amr?: Amr[] } | null | undefined): number | null {
  const ts = (claims?.amr ?? [])
    .map((a) => (typeof a === 'object' ? a.timestamp : undefined))
    .filter((t): t is number => typeof t === 'number')
  return ts.length ? Math.min(...ts) * 1000 : null
}

/** Sisa waktu sesi dalam ms (≤ 0 berarti habis). null bila waktu login tidak diketahui. */
export function sisaSesi(claims: { amr?: Amr[] } | null | undefined, now = Date.now()): number | null {
  const t = waktuLogin(claims)
  return t == null ? null : t + SESSION_MAX_MS - now
}
