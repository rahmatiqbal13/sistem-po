/**
 * Alamat aplikasi untuk link yang dibuka di perangkat lain (aktivasi admin, reset password).
 * Isi NEXT_PUBLIC_APP_URL dengan alamat yang bisa dibuka penerima: domain hosting saat online,
 * atau http://<IP-komputer>:3000 untuk uji coba lewat Wi-Fi yang sama. Kosong = alamat yang sedang dibuka.
 */
export function alamatAplikasi(cadangan: string): string {
  const v = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '')
  return v || cadangan
}
