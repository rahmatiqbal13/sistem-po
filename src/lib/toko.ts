import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Pengaturan } from '@/lib/types'
import { pasangTema } from '@/lib/tema'

export const TOKO_DEFAULT: Pengaturan = { nama_toko: 'PO Jajanan', wa_admin: null, info_pembayaran: null, logo_path: null, sampul_path: null, tema: null, gaya: null, template_wa: null, cadangan_terakhir: null,
  jam_buka: null, jam_tutup: null, hari_buka: null, lokasi_ambil: null, area_antar: null,
}
/** Dikirim setelah pengaturan disimpan agar sidebar ikut memperbarui nama & logo */
export const TOKO_EVENT = 'toko-updated'

export async function fetchToko(): Promise<Pengaturan> {
  const { data } = await createClient().from('pengaturan')
    .select('*').eq('id', 1).maybeSingle()
  const t = { ...TOKO_DEFAULT, ...(data as Partial<Pengaturan> | null) }
  // Kolom time dari Postgres berformat HH:MM:SS; input type=time & tampilan memakai HH:MM
  return { ...t, jam_buka: t.jam_buka?.slice(0, 5) ?? null, jam_tutup: t.jam_tutup?.slice(0, 5) ?? null }
}

export function useToko(): Pengaturan {
  const [toko, setToko] = useState(TOKO_DEFAULT)
  useEffect(() => {
    // Tema dari database menimpa salinan di perangkat (bisa usang jika diganti dari perangkat lain)
    const load = () => {
      fetchToko().then((t) => {
        setToko(t)
        pasangTema(t.tema, t.gaya)
        // Salinan untuk halaman login: setelah keluar, nama & logo terbaru langsung tampil
        try {
          localStorage.setItem('po-info-toko', JSON.stringify({ nama_toko: t.nama_toko, logo_path: t.logo_path, tema: t.tema, gaya: t.gaya }))
        } catch {}
      })
    }
    load()
    window.addEventListener(TOKO_EVENT, load)
    return () => window.removeEventListener(TOKO_EVENT, load)
  }, [])
  return toko
}
