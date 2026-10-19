// Service worker minimal: hanya untuk menampilkan notifikasi pesanan baru dan membukanya saat diketuk.
// Tidak menyimpan cache halaman (mode offline tidak dicakup).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/pesanan'
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const tab = list.find((c) => new URL(c.url).origin === self.location.origin)
    if (tab) {
      await tab.focus()
      try { await tab.navigate(url) } catch {}
      return
    }
    await self.clients.openWindow(url)
  })())
})
