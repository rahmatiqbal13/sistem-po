'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Pengaturan } from '@/lib/types'
import { errMsg } from '@/lib/format'
import { Alert, Button, Field, Loading, PageHeader, inputCls } from '@/components/ui'

export default function PengaturanPage() {
  const router = useRouter()
  const [form, setForm] = useState<Pengaturan | null>(null)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    createClient().from('pengaturan').select('nama_toko, wa_admin, info_pembayaran').eq('id', 1).maybeSingle()
      .then(({ data }) => setForm((data as Pengaturan) ?? { nama_toko: 'PO Jajanan', wa_admin: '', info_pembayaran: '' }))
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setBusy(true)
    const { error } = await createClient().from('pengaturan').upsert({
      id: 1,
      nama_toko: form.nama_toko.trim() || 'PO Jajanan',
      wa_admin: form.wa_admin?.trim() || null,
      info_pembayaran: form.info_pembayaran?.trim() || null,
    })
    setBusy(false)
    setMsg(error ? { tone: 'bad', text: errMsg(error) } : { tone: 'ok', text: 'Pengaturan tersimpan.' })
  }

  async function logout() {
    await createClient().auth.signOut()
    router.replace('/login')
  }

  if (!form) return <Loading />
  const set = (k: keyof Pengaturan) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [k]: e.target.value })
    setMsg(null)
  }

  return (
    <>
      <PageHeader title="Pengaturan toko" subtitle="Ditampilkan kepada pembeli di link pemesanan." />
      <form onSubmit={save} className="flex max-w-[600px] flex-col gap-4 rounded-card bg-surface p-6">
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <Field label="Nama toko" htmlFor="st-nama" helper="Judul di halaman pemesanan.">
          <input id="st-nama" value={form.nama_toko} onChange={set('nama_toko')} className={inputCls} />
        </Field>
        <Field label="Nomor WhatsApp admin" htmlFor="st-wa"
          helper="Pembeli diarahkan ke nomor ini untuk konfirmasi & kirim bukti transfer. Contoh: 0812 3456 7890">
          <input id="st-wa" inputMode="tel" value={form.wa_admin ?? ''} onChange={set('wa_admin')} className={inputCls} />
        </Field>
        <Field label="Info pembayaran" htmlFor="st-info" helper="Contoh: BCA 1234567890 a.n. Iqbal · DANA 0812…">
          <textarea id="st-info" rows={3} value={form.info_pembayaran ?? ''} onChange={set('info_pembayaran')} className={inputCls} />
        </Field>
        <div><Button type="submit" disabled={busy} className="min-h-[46px] px-6">{busy ? 'Menyimpan…' : 'Simpan pengaturan'}</Button></div>
      </form>
      {/* Di HP tidak ada sidebar, jadi tombol keluar diletakkan di sini */}
      <div className="md:hidden"><Button variant="secondary" className="min-h-[46px] px-6" onClick={logout}>Keluar</Button></div>
    </>
  )
}
