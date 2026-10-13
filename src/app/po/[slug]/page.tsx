'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, ImageIcon, MessageCircle, Minus, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { CaraTerima } from '@/lib/types'
import { CARA_TERIMA } from '@/lib/types'
import { errMsg, rupiah, tanggal } from '@/lib/format'
import { fotoUrl } from '@/lib/foto'
import { Alert, Button, Field, cx, inputCls } from '@/components/ui'

interface PublicProduct { id: string; nama: string; harga: number; foto_path: string | null; sisa: number | null }
interface PublicBatch {
  nama: string; terbuka: boolean; tanggal_tutup: string | null; tanggal_ambil: string | null
  info_pembeli: string | null; nama_toko: string; wa_admin: string | null; info_pembayaran: string | null
  produk: PublicProduct[]
}
interface Hasil { kode: string; nama: string; subtotal: number; items: { nama: string; qty: number; harga: number }[] }

export default function PemesananPage() {
  const { slug } = useParams<{ slug: string }>()
  const [batch, setBatch] = useState<PublicBatch | null | undefined>(undefined)
  const [qty, setQty] = useState<Record<string, number>>({})
  const [catatanItem, setCatatanItem] = useState<Record<string, string>>({})
  const [nama, setNama] = useState('')
  const [wa, setWa] = useState('')
  const [cara, setCara] = useState<CaraTerima>('pickup')
  const [alamat, setAlamat] = useState('')
  const [catatan, setCatatan] = useState('')
  const [website, setWebsite] = useState('') // honeypot anti-bot, disembunyikan dari manusia
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [hasil, setHasil] = useState<{ data: Hasil; cara: CaraTerima } | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  async function load() {
    const { data, error } = await createClient().rpc('get_public_batch', { p_slug: slug })
    if (error) { setError(errMsg(error)); setBatch(null); return }
    setBatch(data as PublicBatch | null)
  }

  useEffect(() => { load() }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps

  if (batch === undefined) return <div className="py-16 text-center text-muted">Memuat…</div>
  if (batch === null) {
    return <Shell><div className="py-16 text-center"><h1 className="text-2xl font-bold">Link tidak ditemukan</h1><p className="mt-2 text-muted">Periksa kembali link dari penjual.</p></div></Shell>
  }

  if (hasil) return <Shell><Sukses batch={batch} hasil={hasil.data} cara={hasil.cara} onLagi={() => { setHasil(null); load() }} /></Shell>

  const items = batch.produk.filter((p) => (qty[p.id] ?? 0) > 0)
  const total = items.reduce((s, p) => s + p.harga * qty[p.id], 0)
  const totalQty = items.reduce((s, p) => s + qty[p.id], 0)
  const waDigits = wa.replace(/\D/g, '')
  const errs = {
    items: items.length === 0 ? 'Pilih minimal 1 produk.' : '',
    nama: nama.trim().length < 2 ? 'Nama wajib diisi.' : '',
    wa: waDigits.length < 9 || waDigits.length > 15 ? 'Isi nomor WhatsApp yang aktif.' : '',
    alamat: cara !== 'pickup' && !alamat.trim() ? 'Alamat wajib untuk pengantaran.' : '',
  }

  function ubah(p: PublicProduct, n: number) {
    const max = Math.min(50, p.sisa ?? 50)
    setQty((q) => ({ ...q, [p.id]: Math.max(0, Math.min(n, max)) }))
  }

  async function pesan() {
    setTouched(true)
    setError('')
    if (Object.values(errs).some(Boolean)) {
      if (errs.items) window.scrollTo({ top: 0, behavior: 'smooth' })
      else formRef.current?.scrollIntoView({ behavior: 'smooth' })
      return
    }
    if (website) return // bot
    setBusy(true)
    const { data, error } = await createClient().rpc('submit_public_order', {
      p_slug: slug,
      payload: {
        nama: nama.trim(), no_wa: wa, cara_terima: cara, alamat: cara === 'pickup' ? '' : alamat.trim(), catatan: catatan.trim(),
        items: items.map((p) => ({ product_id: p.id, qty: qty[p.id], catatan: catatanItem[p.id]?.trim() ?? '' })),
      },
    })
    setBusy(false)
    if (error) {
      setError(errMsg(error))
      load() // perbarui sisa kuota
      return
    }
    setHasil({ data: data as Hasil, cara })
    setQty({})
    setCatatanItem({})
    window.scrollTo({ top: 0 })
  }

  return (
    <Shell>
      <header className="mb-5">
        <div className="text-sm font-semibold text-accent">{batch.nama_toko}</div>
        <h1 className="text-2xl font-bold md:text-3xl">{batch.nama}</h1>
        <div className="mt-1 text-muted">
          {batch.tanggal_tutup && <>Ditutup {tanggal(batch.tanggal_tutup, { weekday: 'long', day: 'numeric', month: 'long' })}. </>}
          {batch.tanggal_ambil && <>Siap {tanggal(batch.tanggal_ambil, { weekday: 'long', day: 'numeric', month: 'long' })}.</>}
        </div>
        {batch.info_pembeli && <p className="mt-3 whitespace-pre-line rounded-xl bg-surface-2 px-3 py-2.5">{batch.info_pembeli}</p>}
      </header>

      {!batch.terbuka ? (
        <div className="rounded-2xl border border-line bg-surface px-4 py-10 text-center">
          <h2 className="text-xl font-bold">PO ini sudah ditutup</h2>
          <p className="mt-2 text-muted">Terima kasih. Nantikan PO berikutnya!</p>
          {batch.wa_admin && <a href={`https://wa.me/${batch.wa_admin}`} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 font-semibold text-on-accent"><MessageCircle size={18} aria-hidden />Hubungi penjual</a>}
        </div>
      ) : (
        <div className="pb-28">
          {error && <div className="mb-4"><Alert tone="bad">{error}</Alert></div>}

          <h2 className="mb-3 text-xl font-bold">1. Pilih produk</h2>
          {touched && errs.items && <div className="mb-3"><Alert tone="bad">{errs.items}</Alert></div>}
          <div className="grid gap-3 sm:grid-cols-2">
            {batch.produk.map((p) => {
              const n = qty[p.id] ?? 0
              const habis = p.sisa === 0
              const url = fotoUrl(p.foto_path)
              return (
                <div key={p.id} className={cx('overflow-hidden rounded-2xl border bg-surface', n > 0 ? 'border-accent' : 'border-line', habis && 'opacity-60')}>
                  <div className="flex gap-3 p-3">
                    {url
                      ? <img src={url} alt={p.nama} loading="lazy" className="size-24 shrink-0 rounded-xl object-cover" />
                      : <div className="grid size-24 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted"><ImageIcon size={28} aria-hidden /></div>}
                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="font-semibold">{p.nama}</div>
                      <div className="num font-bold text-accent">{rupiah(p.harga)}</div>
                      {p.sisa !== null && <div className={cx('text-sm', habis ? 'font-semibold text-bad' : 'text-muted')}>{habis ? 'Habis' : `Sisa ${p.sisa}`}</div>}
                      <div className="mt-auto flex items-center justify-end gap-1 pt-2">
                        {n > 0 && (
                          <>
                            <button type="button" onClick={() => ubah(p, n - 1)} className="grid size-11 place-items-center rounded-xl border border-line" aria-label={`Kurangi ${p.nama}`}><Minus size={18} /></button>
                            <span className="num w-8 text-center text-lg font-bold" aria-live="polite">{n}</span>
                          </>
                        )}
                        <button type="button" disabled={habis || (p.sisa !== null && n >= p.sisa) || n >= 50} onClick={() => ubah(p, n + 1)}
                          className={cx('grid min-h-11 place-items-center rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-40', n > 0 ? 'size-11' : 'px-4')}
                          aria-label={`Tambah ${p.nama}`}>
                          {n > 0 ? <Plus size={18} /> : 'Tambah'}
                        </button>
                      </div>
                    </div>
                  </div>
                  {n > 0 && (
                    <div className="px-3 pb-3">
                      <input value={catatanItem[p.id] ?? ''} maxLength={100} placeholder="Catatan (opsional), mis. tanpa sambal"
                        onChange={(e) => setCatatanItem((c) => ({ ...c, [p.id]: e.target.value }))}
                        className={cx(inputCls, 'text-sm')} aria-label={`Catatan ${p.nama}`} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div ref={formRef} className="mt-8 space-y-4">
            <h2 className="text-xl font-bold">2. Data pemesan</h2>
            <Field label="Nama" error={touched ? errs.nama : ''}>
              <input value={nama} maxLength={80} autoComplete="name" onChange={(e) => setNama(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Nomor WhatsApp" helper="Untuk konfirmasi pesanan. Contoh: 0812 3456 7890" error={touched ? errs.wa : ''}>
              <input value={wa} inputMode="tel" autoComplete="tel" onChange={(e) => setWa(e.target.value)} className={inputCls} />
            </Field>
            <label className="hidden" aria-hidden>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>

            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold">Cara terima</legend>
              <div role="radiogroup" className="grid grid-cols-3 gap-2">
                {(Object.keys(CARA_TERIMA) as CaraTerima[]).map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={cara === c} onClick={() => setCara(c)}
                    className={cx('min-h-12 rounded-xl border px-2 text-sm font-semibold', cara === c ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface')}>
                    {c === 'antar' ? 'Diantar' : CARA_TERIMA[c]}
                  </button>
                ))}
              </div>
            </fieldset>
            {cara !== 'pickup' && (
              <Field label="Alamat lengkap" helper="Ongkir akan dikonfirmasi penjual lewat WhatsApp." error={touched ? errs.alamat : ''}>
                <textarea rows={3} maxLength={300} value={alamat} onChange={(e) => setAlamat(e.target.value)} className={inputCls} />
              </Field>
            )}
            <Field label="Catatan untuk penjual (opsional)">
              <textarea rows={2} maxLength={300} value={catatan} onChange={(e) => setCatatan(e.target.value)} className={inputCls} />
            </Field>
          </div>

          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            <div className="mx-auto flex max-w-2xl items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm text-muted">{totalQty} item{cara !== 'pickup' && ' · belum termasuk ongkir'}</div>
                <div className="num text-[22px] font-bold leading-7">{rupiah(total)}</div>
              </div>
              <Button onClick={pesan} disabled={busy}>{busy ? 'Mengirim…' : 'Pesan sekarang'}</Button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-2xl px-4 py-6">{children}</main>
}

function Sukses({ batch, hasil, cara, onLagi }: { batch: PublicBatch; hasil: Hasil; cara: CaraTerima; onLagi: () => void }) {
  const pesanWa = [
    `Halo ${batch.nama_toko}, saya *${hasil.nama}* sudah pesan *${batch.nama}* (kode #${hasil.kode}):`,
    ...hasil.items.map((i) => `- ${i.nama} x${i.qty}`),
    `Total: ${rupiah(hasil.subtotal)}${cara !== 'pickup' ? ' + ongkir' : ''}`,
    `Cara terima: ${CARA_TERIMA[cara]}`,
  ].join('\n')

  return (
    <div className="space-y-4">
      <div className="text-center">
        <CheckCircle2 size={48} className="mx-auto text-ok" aria-hidden />
        <h1 className="mt-2 text-2xl font-bold">Pesanan diterima!</h1>
        <p className="mt-1 text-muted">Kode pesanan <b className="text-ink">#{hasil.kode}</b></p>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-4">
        <ul className="space-y-1">
          {hasil.items.map((i) => (
            <li key={i.nama} className="num flex justify-between gap-3"><span>{i.nama} ×{i.qty}</span><span>{rupiah(i.harga * i.qty)}</span></li>
          ))}
        </ul>
        <div className="num mt-2 flex justify-between border-t border-line pt-2 text-lg font-bold"><span>Total</span><span>{rupiah(hasil.subtotal)}</span></div>
        {cara !== 'pickup' && <p className="mt-1 text-sm text-muted">Belum termasuk ongkir. Penjual akan mengonfirmasi ongkir.</p>}
      </div>

      {batch.info_pembayaran && (
        <div className="rounded-2xl border border-line bg-surface p-4">
          <div className="font-bold">Pembayaran</div>
          <p className="mt-1 whitespace-pre-line">{batch.info_pembayaran}</p>
          <p className="mt-2 text-sm text-muted">Setelah transfer, kirim bukti lewat WhatsApp ke penjual.</p>
        </div>
      )}

      {batch.wa_admin && (
        <a href={`https://wa.me/${batch.wa_admin}?text=${encodeURIComponent(pesanWa)}`} target="_blank" rel="noopener"
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent font-bold text-on-accent">
          <MessageCircle size={20} aria-hidden />Konfirmasi via WhatsApp
        </a>
      )}
      <Button variant="ghost" className="w-full" onClick={onLagi}>Buat pesanan lain</Button>
    </div>
  )
}
