'use client'

import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fotoUrl } from '@/lib/foto'
import { pasangTema } from '@/lib/tema'

type InfoToko = { nama_toko: string; logo_path: string | null; tema: string | null; gaya: string | null }
const INFO_KEY = 'po-info-toko'

/** Nama, logo & tema toko untuk halaman sebelum masuk (lewat fungsi publik get_info_toko).
 *  Salinan terakhir disimpan di perangkat agar langsung tampil tanpa kedip "PO Jajanan". */
function useInfoToko() {
  const [info, setInfo] = useState<InfoToko | null>(null)
  useEffect(() => {
    try { const c = localStorage.getItem(INFO_KEY); if (c) setInfo(JSON.parse(c)) } catch {}
    createClient().rpc('get_info_toko').then(({ data }) => {
      if (!data) return
      const t = data as InfoToko
      setInfo(t)
      pasangTema(t.tema, t.gaya)
      try { localStorage.setItem(INFO_KEY, JSON.stringify(t)) } catch {}
    })
  }, [])
  return info
}

/** Kartu formulir untuk login, lupa password, dan reset password: logo & nama toko di atas judul */
export function AuthCard({ title, subtitle, tabTitle, onSubmit, children }: {
  title: string; subtitle: ReactNode; tabTitle: string; onSubmit: (e: FormEvent) => void; children: ReactNode
}) {
  const info = useInfoToko()
  const nama = info?.nama_toko || 'PO Jajanan'
  const logo = fotoUrl(info?.logo_path)
  useEffect(() => { document.title = `${tabTitle} · ${nama}` }, [tabTitle, nama])

  return (
    <main className="relative isolate grid min-h-dvh place-items-center overflow-hidden px-4 py-6">
      <div aria-hidden="true" className="absolute -left-[160px] -top-[160px] -z-10 size-[420px] rounded-full bg-accent-300 opacity-55" />
      <div aria-hidden="true" className="absolute -bottom-[110px] -right-[90px] -z-10 size-[300px] rounded-full bg-sage-300 opacity-70" />
      <div aria-hidden="true" className="absolute right-[18%] top-[14%] -z-10 size-[90px] rounded-full bg-sage-400 opacity-50" />
      <form onSubmit={onSubmit} className="relative flex w-full max-w-[420px] flex-col gap-4 rounded-card bg-surface p-8 shadow-md">
        <div className="flex items-center gap-2.5">
          <div aria-hidden="true" className="grid size-[44px] shrink-0 place-items-center overflow-hidden rounded-full bg-accent font-heading font-extrabold text-card text-bg">
            {logo ? <img src={logo} alt="" className="size-full object-cover" /> : nama.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 font-heading text-section font-extrabold [overflow-wrap:anywhere]">{nama}</div>
        </div>
        <div>
          <h1>{title}</h1>
          <p className="mb-0 mt-1 text-neutral-800">{subtitle}</p>
        </div>
        {children}
      </form>
    </main>
  )
}
