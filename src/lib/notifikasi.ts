// Notifikasi perangkat untuk pesanan baru dari link. Hanya bekerja selama aplikasi terbuka
// (termasuk di latar belakang); bila aplikasi/tab ditutup, kabar tidak sampai.

/** Dikirim saat ada pesanan baru masuk, agar daftar pesanan memuat ulang */
export const PESANAN_BARU_EVENT = 'pesanan-baru'

export type IzinNotifikasi = 'granted' | 'denied' | 'default' | 'tidak-didukung'

export function izinNotifikasi(): IzinNotifikasi {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) return 'tidak-didukung'
  return Notification.permission
}

export async function daftarServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
  } catch { return null }
}

export async function mintaIzin(): Promise<IzinNotifikasi> {
  if (izinNotifikasi() === 'tidak-didukung') return 'tidak-didukung'
  await daftarServiceWorker()
  return Notification.requestPermission()
}

/** Tampilkan notifikasi lewat service worker (Android menolak `new Notification()` langsung) */
export async function tampilkanNotifikasi(judul: string, isi: string, url: string) {
  if (izinNotifikasi() !== 'granted') return
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await daftarServiceWorker())
  if (!reg) return
  await reg.showNotification(judul, { body: isi, icon: '/icon.svg', tag: url, data: { url } })
}
