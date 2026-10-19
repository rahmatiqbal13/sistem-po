'use client'

import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { izinNotifikasi, mintaIzin, tampilkanNotifikasi, type IzinNotifikasi } from '@/lib/notifikasi'
import { Alert, Button, ICON } from './ui'

/** Izin notifikasi perangkat untuk pesanan baru dari link (per HP/laptop) */
export function SetelanNotifikasi() {
  const [izin, setIzin] = useState<IzinNotifikasi | null>(null)
  useEffect(() => { setIzin(izinNotifikasi()) }, [])

  async function aktifkan() {
    const hasil = await mintaIzin()
    setIzin(hasil)
    if (hasil === 'granted') tampilkanNotifikasi('Notifikasi aktif', 'Pesanan baru dari link akan muncul seperti ini.', '/pesanan')
  }

  return (
    <section aria-labelledby="ttl-notif" className="flex flex-col gap-4 rounded-card bg-surface p-6">
      <div>
        <h2 id="ttl-notif" className="text-section">Notifikasi pesanan baru</h2>
        <div className="mt-0.5 text-sm text-neutral-800">
          Kabar saat pembeli mengisi link pemesanan. Diatur terpisah di setiap HP atau laptop.
        </div>
      </div>
      {izin === 'granted' && <Alert tone="ok">Aktif di perangkat ini.</Alert>}
      {izin === 'denied' && (
        <Alert tone="warn">Notifikasi diblokir di browser ini. Izinkan lewat pengaturan situs di browser, lalu muat ulang halaman.</Alert>
      )}
      {izin === 'tidak-didukung' && (
        <Alert tone="warn">Browser ini belum mendukung notifikasi. Di iPhone, pasang aplikasi ke layar utama dulu (Bagikan → Tambah ke Layar Utama), lalu buka dari ikonnya.</Alert>
      )}
      {izin === 'default' && (
        <Button className="self-start px-5" onClick={aktifkan}><Bell size={18} {...ICON} />Aktifkan di perangkat ini</Button>
      )}
      <p className="m-0 text-sm text-neutral-800">
        Saat aplikasi sedang dibuka, kabar muncul di bagian bawah layar. Notifikasi perangkat hanya sampai selama aplikasi
        masih terbuka (boleh di latar belakang); bila aplikasi atau tab ditutup, pesanan baru tetap terlihat saat aplikasi dibuka lagi.
      </p>
    </section>
  )
}
