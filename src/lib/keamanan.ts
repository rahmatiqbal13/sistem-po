// Pengaman kecil untuk input dari luar. Fungsi murni agar mudah diuji.

const ASAL = 'http://situs.invalid'

/**
 * Jalur tujuan setelah login/konfirmasi: hanya jalur di situs ini.
 * Dicek dengan parser URL browser, jadi trik seperti `//evil.com`, `/\evil.com`, atau tab/baris baru ikut tertolak.
 */
export function jalurAman(raw: string | null | undefined, cadangan: string): string {
  if (!raw || !raw.startsWith('/')) return cadangan
  try {
    const u = new URL(raw, ASAL)
    return u.origin === ASAL ? u.pathname + u.search + u.hash : cadangan
  } catch { return cadangan }
}

/**
 * Isi sel CSV yang diawali = + - @ (atau tab/CR) dibaca Excel sebagai formula.
 * Teks seperti itu (mis. nama dari link pemesanan publik) diberi awalan ' agar tampil sebagai teks biasa.
 */
export function selCsvAman<T>(v: T): T | string {
  return typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
}
