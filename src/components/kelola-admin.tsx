'use client'

import { useCallback, useEffect, useState } from 'react'
import { Copy, Share2, Trash2, UserPlus } from 'lucide-react'
import { tanggal } from '@/lib/format'
import { Alert, Button, Field, ICON, cx, inputCls, useConfirm } from './ui'

type Admin = { id: string; email: string; dibuat: string; terakhirMasuk: string | null; aktif: boolean }

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json' } })
  const data = await res.json().catch(() => ({ error: 'Server tidak merespons dengan benar.' }))
  if (!res.ok) throw new Error(data.error ?? 'Terjadi kesalahan.')
  return data as T
}

/** Kartu berisi link aktivasi: salin atau kirim lewat WhatsApp */
function KartuLink({ email, link, onTutup }: { email: string; link: string; onTutup: () => void }) {
  const [tersalin, setTersalin] = useState(false)
  const pesan = `Halo! Kamu diundang menjadi admin toko. Buka link ini untuk membuat password (berlaku sekitar 1 jam, sekali pakai):\n${link}\n\nLalu masuk dengan email ${email}.`
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-sage-100 px-4 py-3 text-sage-900">
      <div className="text-sm font-bold">Link aktivasi untuk {email}</div>
      <div className="break-all text-xs">{link}</div>
      <div className="text-xs">Sekali pakai, berlaku sekitar 1 jam. Bila kedaluwarsa, buat link baru dari daftar admin.</div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={async () => {
          try { await navigator.clipboard.writeText(link); setTersalin(true); setTimeout(() => setTersalin(false), 1800) } catch {}
        }}><Copy size={16} {...ICON} />{tersalin ? 'Tersalin' : 'Salin link'}</Button>
        <a className="btn btn-secondary" href={`https://wa.me/?text=${encodeURIComponent(pesan)}`} target="_blank" rel="noopener">
          <Share2 size={16} {...ICON} />Kirim lewat WA
        </a>
        <Button variant="ghost" onClick={onTutup}>Tutup</Button>
      </div>
    </div>
  )
}

/** Daftar admin toko + undang & hapus. Semua admin punya akses yang sama. */
export function KelolaAdmin() {
  const [admins, setAdmins] = useState<Admin[] | null>(null)
  const [saya, setSaya] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [link, setLink] = useState<{ email: string; link: string } | null>(null)
  const [confirm, dialog] = useConfirm()

  const load = useCallback(async () => {
    try {
      const d = await api<{ admins: Admin[]; saya: string }>('/api/admin')
      setAdmins(d.admins)
      setSaya(d.saya)
    } catch (e) { setError((e as Error).message); setAdmins([]) }
  }, [])
  useEffect(() => { load() }, [load])

  async function undang(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setError(''); setInfo(''); setLink(null)
    try {
      const d = await api<{ emailTerkirim: boolean; link: string | null }>('/api/admin', { method: 'POST', body: JSON.stringify({ email }) })
      const target = email.trim().toLowerCase()
      setInfo(d.emailTerkirim
        ? `Undangan dikirim ke ${target}. Bila email tidak sampai, bagikan link di bawah lewat WhatsApp.`
        : `Akun ${target} dibuat, tetapi email undangan gagal terkirim. Bagikan link di bawah lewat WhatsApp.`)
      if (d.link) setLink({ email: target, link: d.link })
      setEmail('')
      load()
    } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }

  async function buatLink(a: Admin) {
    setError(''); setInfo('')
    try { const d = await api<{ link: string }>(`/api/admin/${a.id}/link`, { method: 'POST' }); setLink({ email: a.email, link: d.link }) }
    catch (e) { setError((e as Error).message) }
  }

  async function hapus(a: Admin) {
    const ok = await confirm({
      title: `Hapus admin ${a.email}?`, danger: true, confirmLabel: 'Hapus admin', cancelLabel: 'Batal',
      body: <>Akun ini tidak bisa masuk lagi. Riwayat pesanan & pembayaran yang dicatatnya tetap tersimpan.</>,
    })
    if (!ok) return
    setError(''); setInfo('')
    try { await api(`/api/admin/${a.id}`, { method: 'DELETE' }); if (link?.email === a.email) setLink(null); load() }
    catch (e) { setError((e as Error).message) }
  }

  return (
    <section aria-labelledby="ttl-admin" className="flex flex-col gap-4 rounded-card bg-surface p-6">
      <div>
        <h2 id="ttl-admin" className="text-section">Admin toko</h2>
        <div className="mt-0.5 text-sm text-neutral-800">Semua admin bisa mengelola pesanan, produk, batch, dan pengaturan.</div>
      </div>
      {error && <Alert>{error}</Alert>}
      {info && <Alert tone="ok">{info}</Alert>}
      {link && <KartuLink email={link.email} link={link.link} onTutup={() => setLink(null)} />}

      {admins === null ? <div className="text-sm text-neutral-800">Memuat daftar admin…</div> : admins.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {admins.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border-2 border-[var(--line)] px-3.5 py-2.5">
              <div className="min-w-0 flex-[1_1_220px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate font-bold">{a.email}</span>
                  {a.id === saya && <span className="tag bg-accent-100 text-accent-900">Anda</span>}
                  <span className={cx('tag', a.aktif ? 'bg-sage-200 text-sage-900' : 'bg-accent-200 text-accent-900')}>
                    {a.aktif ? 'Aktif' : 'Menunggu aktivasi'}
                  </span>
                </div>
                <div className="text-xs text-neutral-800">
                  {a.terakhirMasuk ? `Terakhir masuk ${tanggal(a.terakhirMasuk, { day: 'numeric', month: 'short', year: 'numeric' })}`
                    : `Diundang ${tanggal(a.dibuat, { day: 'numeric', month: 'short', year: 'numeric' })}`}
                </div>
              </div>
              {a.id !== saya && (
                <div className="flex flex-wrap gap-1">
                  {!a.aktif && (
                    <Button variant="ghost" className="min-h-[40px] px-2.5 text-caption" onClick={() => buatLink(a)}>Link aktivasi</Button>
                  )}
                  <button type="button" onClick={() => hapus(a)} aria-label={`Hapus admin ${a.email}`} title="Hapus admin"
                    className="btn btn-icon size-10 min-h-0 text-accent-800 hover:bg-accent-100"><Trash2 size={16} {...ICON} /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={undang} className="flex flex-wrap items-end gap-2">
        <Field label="Undang admin baru" htmlFor="adm-email" className="min-w-0 flex-[1_1_240px]"
          helper="Undangan dikirim ke email ini. Link aktivasi juga bisa dibagikan lewat WhatsApp.">
          <input id="adm-email" type="email" required placeholder="nama@email.com" value={email}
            onChange={(e) => { setEmail(e.target.value); setError('') }} className={inputCls} />
        </Field>
        <Button type="submit" disabled={busy} className="mb-[26px]"><UserPlus size={16} {...ICON} />{busy ? 'Mengundang…' : 'Undang'}</Button>
      </form>
      {dialog}
    </section>
  )
}
