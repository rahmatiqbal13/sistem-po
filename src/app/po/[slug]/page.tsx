'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { Check, MessageCircle, Minus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { CaraTerima } from '@/lib/types'
import { errMsg, rupiah, tanggal } from '@/lib/format'
import { fotoUrl } from '@/lib/foto'
import { pasangTema } from '@/lib/tema'
import { teksOperasional, type Operasional } from '@/lib/operasional'
import { Alert, Button, Field, ICON, ProductPhoto, cx, useDialogFocus } from '@/components/ui'

interface PublicProduct { id: string; nama: string; harga: number; foto_path: string | null; sisa: number | null }
interface PublicBatch extends Operasional {
  nama: string; terbuka: boolean; tanggal_tutup: string | null; tanggal_ambil: string | null
  info_pembeli: string | null; nama_toko: string; logo_path: string | null; sampul_path: string | null; tema: string | null; gaya: string | null; wa_admin: string | null; info_pembayaran: string | null
  produk: PublicProduct[]
}
interface Hasil { kode: string; nama: string; subtotal: number; items: { nama: string; qty: number; harga: number }[] }

const CARA: Record<CaraTerima, string> = { pickup: 'Ambil sendiri', antar: 'Diantar', kurir: 'Kurir online' }
const TGL_PANJANG: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }

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
  const [review, setReview] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hasil, setHasil] = useState<{ data: Hasil; cara: CaraTerima } | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  useDialogFocus(sheetRef, review)

  async function load() {
    const { data, error } = await createClient().rpc('get_public_batch', { p_slug: slug })
    if (error) { setError(errMsg(error)); setBatch(null); return }
    setBatch(data as PublicBatch | null)
    if (data) pasangTema((data as PublicBatch).tema, (data as PublicBatch).gaya)
  }

  useEffect(() => { load() }, [slug]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (batch) document.title = `${batch.nama} · ${batch.nama_toko}` }, [batch])

  useEffect(() => {
    if (!review) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) setReview(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [review, busy])

  if (batch === undefined) return <Shell><div className="py-16 text-neutral-800">Memuat…</div></Shell>
  if (batch === null) {
    return (
      <Shell>
        <div className="flex flex-col items-start gap-3 rounded-card bg-surface p-6">
          <h1>Link tidak ditemukan</h1>
          <p className="m-0 text-neutral-800">Periksa kembali link dari penjual.</p>
        </div>
      </Shell>
    )
  }

  if (hasil) return <Shell><Sukses batch={batch} hasil={hasil.data} cara={hasil.cara} onLagi={() => { setHasil(null); load() }} /></Shell>

  const chosen = batch.produk.filter((p) => (qty[p.id] ?? 0) > 0)
  const total = chosen.reduce((s, p) => s + p.harga * qty[p.id], 0)
  const totalQty = chosen.reduce((s, p) => s + qty[p.id], 0)
  const waDigits = wa.replace(/\D/g, '')
  const errs = {
    items: chosen.length === 0 ? 'Pilih minimal 1 produk.' : '',
    nama: nama.trim().length < 2 ? 'Nama wajib diisi.' : '',
    wa: waDigits.length < 9 || waDigits.length > 15 ? 'Isi nomor WhatsApp yang aktif.' : '',
    alamat: cara !== 'pickup' && !alamat.trim() ? 'Alamat wajib untuk pengantaran.' : '',
  }
  const err = touched ? errs : { items: '', nama: '', wa: '', alamat: '' }

  function ubah(p: PublicProduct, n: number) {
    const max = Math.min(50, p.sisa ?? 50)
    setQty((q) => ({ ...q, [p.id]: Math.max(0, Math.min(n, max)) }))
  }

  function pesan() {
    setError('')
    // Arahkan ke masalah pertama: bagian produk, atau kolom isian yang belum benar
    const firstId = errs.items ? 'pilih-produk' : errs.nama ? 'f-nama' : errs.wa ? 'f-wa' : errs.alamat ? 'f-alamat' : ''
    if (firstId) {
      setTouched(true)
      requestAnimationFrame(() => {
        const el = document.getElementById(firstId)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el?.focus({ preventScroll: true })
      })
      return
    }
    setReview(true)
  }

  async function kirim() {
    if (website) return // bot
    setBusy(true)
    const { data, error } = await createClient().rpc('submit_public_order', {
      p_slug: slug,
      payload: {
        nama: nama.trim(), no_wa: wa, cara_terima: cara, alamat: cara === 'pickup' ? '' : alamat.trim(), catatan: catatan.trim(),
        items: chosen.map((p) => ({ product_id: p.id, qty: qty[p.id], catatan: catatanItem[p.id]?.trim() ?? '' })),
      },
    })
    setBusy(false)
    setReview(false)
    if (error) {
      setError(errMsg(error))
      load() // perbarui sisa kuota
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setHasil({ data: data as Hasil, cara })
    setQty({})
    setCatatanItem({})
    setTouched(false)
    window.scrollTo({ top: 0 })
  }

  return (
    <>
      <Shell>
        <header className="relative flex flex-col gap-1.5">
          {batch.sampul_path && (
            <img src={fotoUrl(batch.sampul_path)!} alt="" className="mb-1 aspect-[3/1] w-full rounded-card object-cover" />
          )}
          {!batch.sampul_path && <>
            <div aria-hidden="true" className="absolute -right-10 -top-[50px] -z-10 size-[150px] rounded-full bg-accent-300 opacity-55" />
            <div aria-hidden="true" className="absolute right-[70px] top-[60px] -z-10 size-[64px] rounded-full bg-sage-300 opacity-70" />
          </>}
          <div className={cx('flex items-center gap-2.5 text-label font-bold text-accent-700', batch.sampul_path && batch.logo_path && '-mt-10 ml-3 items-end')}>
            {batch.logo_path && (
              <img src={fotoUrl(batch.logo_path)!} alt=""
                className={cx('shrink-0 rounded-full object-cover', batch.sampul_path ? 'size-16 border-[3px] border-bg shadow-[var(--pop-sm)]' : 'size-[40px]')} />
            )}
            {batch.nama_toko}
          </div>
          <h1>{batch.nama}</h1>
          {(batch.tanggal_tutup || batch.tanggal_ambil) && (
            <div className="text-neutral-800">
              {batch.tanggal_tutup && <>PO ditutup {tanggal(batch.tanggal_tutup, TGL_PANJANG)}. </>}
              {batch.tanggal_ambil && <>Pengantaran/ambil mulai {tanggal(batch.tanggal_ambil, TGL_PANJANG)}.</>}
            </div>
          )}
          {teksOperasional(batch) && (
            <p className="mb-0 mt-2 rounded-lg bg-sage-100 px-4 py-3 text-sm text-sage-900">{teksOperasional(batch)}</p>
          )}
          {batch.info_pembeli && (
            <p className="mb-0 mt-2 whitespace-pre-line rounded-lg bg-sage-200 px-4 py-3 text-sage-900">{batch.info_pembeli}</p>
          )}
        </header>

        {!batch.terbuka ? (
          <div className="flex flex-col items-start gap-3 rounded-card bg-surface p-6">
            <h2>PO ini sudah ditutup</h2>
            <p className="m-0 text-neutral-800">Terima kasih. Pantau PO berikutnya lewat WhatsApp penjual.</p>
            {batch.wa_admin && <a href={`https://wa.me/${batch.wa_admin}`} className="btn btn-primary btn-lg">Hubungi penjual</a>}
          </div>
        ) : (
          <>
            {error && <Alert>{error}</Alert>}

            <section className="flex flex-col gap-3">
              <h2 id="pilih-produk" tabIndex={-1}>1. Pilih produk</h2>
              {err.items && <div role="alert" className="rounded-full bg-accent-700 px-4 py-3 font-bold text-accent-100">{err.items}</div>}
              {batch.produk.length === 0 && <p className="m-0 text-neutral-800">Belum ada produk di PO ini.</p>}
              {batch.produk.map((p) => {
                const n = qty[p.id] ?? 0
                const habis = p.sisa === 0
                const maxed = habis || (p.sisa !== null && n >= p.sisa) || n >= 50
                return (
                  <div key={p.id} className={cx('flex flex-col gap-3 rounded-tile p-4 outline-2 -outline-offset-2',
                    n > 0 ? 'outline-accent' : 'outline-transparent', 'bg-surface', habis && 'border-2 border-dashed border-neutral-400 opacity-80')}>
                    <div className="flex flex-wrap items-center gap-3">
                      <ProductPhoto url={fotoUrl(p.foto_path)} size={88} alt={p.nama} washed={false} />
                      <div className="flex min-w-[140px] flex-1 flex-col">
                        <div className="text-card font-bold leading-snug">{p.nama}</div>
                        <div className="font-bold text-accent-700">{rupiah(p.harga)}</div>
                        {p.sisa !== null && (
                          <div className={cx('text-label', habis ? 'font-bold text-accent-800' : 'text-neutral-800')}>{habis ? 'Habis' : `Sisa ${p.sisa}`}</div>
                        )}
                      </div>
                      <div className="ml-auto flex items-center gap-1.5">
                        {n > 0 && (
                          <>
                            <button type="button" onClick={() => ubah(p, n - 1)} aria-label={`Kurangi ${p.nama}`}
                              className="grid size-[44px] place-items-center rounded-full border border-divider bg-bg text-ink hover:bg-neutral-200">
                              <Minus size={18} {...ICON} />
                            </button>
                            <span aria-live="polite" className="min-w-8 text-center text-section font-bold">{n}</span>
                          </>
                        )}
                        <button type="button" disabled={maxed} onClick={() => ubah(p, n + 1)} aria-label={`Tambah ${p.nama}`}
                          className={cx('btn btn-primary min-w-[44px]', n > 0 ? 'px-0 text-section' : 'px-5')}>
                          {n > 0 ? '+' : 'Tambah'}
                        </button>
                      </div>
                    </div>
                    {n > 0 && (
                      <input value={catatanItem[p.id] ?? ''} maxLength={100} placeholder="Catatan (opsional), mis. tanpa sambal"
                        onChange={(e) => setCatatanItem((c) => ({ ...c, [p.id]: e.target.value }))}
                        className="input min-h-[44px] bg-bg text-label" aria-label={`Catatan untuk ${p.nama}`} />
                    )}
                  </div>
                )
              })}
            </section>

            <section className="flex flex-col gap-4">
              <h2>2. Data pemesan</h2>
              <Field label="Nama" htmlFor="f-nama" error={err.nama} required>
                <input id="f-nama" value={nama} maxLength={80} autoComplete="name" aria-invalid={!!err.nama}
                  onChange={(e) => setNama(e.target.value)} className="input" />
              </Field>
              <Field label="Nomor WhatsApp" htmlFor="f-wa" helper="Untuk konfirmasi pesanan. Contoh: 0812 3456 7890" error={err.wa} required>
                <input id="f-wa" value={wa} inputMode="tel" autoComplete="tel" aria-invalid={!!err.wa}
                  onChange={(e) => setWa(e.target.value)} className="input" />
              </Field>
              <label className="hidden" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
              <div className="flex flex-col">
                <div id="f-cara" className="mb-[5px] text-label font-bold">Cara terima</div>
                <div role="radiogroup" aria-labelledby="f-cara" className="grid grid-cols-3 gap-1.5">
                  {(Object.keys(CARA) as CaraTerima[]).map((c) => (
                    <button key={c} type="button" role="radio" aria-checked={cara === c} onClick={() => setCara(c)}
                      className={cx('min-h-[44px] rounded-full border px-1.5 text-label font-bold leading-tight',
                        cara === c ? 'border-accent bg-accent text-bg' : 'border-divider bg-surface text-ink')}>
                      {CARA[c]}
                    </button>
                  ))}
                </div>
              </div>
              {cara !== 'pickup' && (
                <Field label="Alamat lengkap" htmlFor="f-alamat" helper="Ongkir akan dikonfirmasi penjual lewat WhatsApp." error={err.alamat} required>
                  <textarea id="f-alamat" rows={3} maxLength={300} value={alamat} aria-invalid={!!err.alamat}
                    onChange={(e) => setAlamat(e.target.value)} className="input" />
                </Field>
              )}
              <Field label="Catatan untuk penjual (opsional)" htmlFor="f-cat">
                <textarea id="f-cat" rows={2} maxLength={300} value={catatan} onChange={(e) => setCatatan(e.target.value)} className="input" />
              </Field>
            </section>
          </>
        )}
      </Shell>

      {/* Bar total */}
      {batch.terbuka && !review && (
        <div className="fixed inset-x-0 bottom-0 z-40 rounded-t-lg bg-surface px-4 pb-[calc(13.2px+env(safe-area-inset-bottom))] pt-3 shadow-lg">
          <div className="mx-auto flex max-w-[640px] items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-label text-neutral-800">{totalQty} item{cara !== 'pickup' && ' · belum termasuk ongkir'}</div>
              <div className="text-stat font-bold leading-tight">{rupiah(total)}</div>
            </div>
            <Button className="btn-lg" onClick={pesan}>Pesan sekarang</Button>
          </div>
        </div>
      )}

      {/* Periksa pesanan (bottom sheet) */}
      {review && (
        <div className="dialog-backdrop place-items-[end_center] p-0" onClick={() => !busy && setReview(false)}>
          <div ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="rv-t" onClick={(e) => e.stopPropagation()}
            className="dialog max-h-[92dvh] w-[min(640px,100%)] overflow-y-auto rounded-b-none pb-[calc(26.4px+env(safe-area-inset-bottom))]">
            <div aria-hidden="true" className="h-[5px] w-[44px] self-center rounded-full bg-neutral-400" />
            <div>
              <h2 id="rv-t" className="text-stat">Periksa pesanan</h2>
              <p className="mb-0 mt-1 text-neutral-800">Pastikan data sudah benar sebelum dikirim ke penjual.</p>
            </div>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 rounded-lg bg-bg p-4">
              <dt className="text-neutral-800">Nama</dt><dd className="m-0 font-bold">{nama.trim()}</dd>
              <dt className="text-neutral-800">WhatsApp</dt><dd className="m-0 whitespace-nowrap font-bold">{wa}</dd>
              <dt className="text-neutral-800">Cara terima</dt><dd className="m-0 font-bold">{CARA[cara]}</dd>
              {cara !== 'pickup' && <><dt className="text-neutral-800">Alamat</dt><dd className="m-0">{alamat.trim()}</dd></>}
            </dl>
            <div className="flex flex-col gap-1.5 px-2">
              {chosen.map((p) => (
                <div key={p.id} className="flex justify-between gap-3">
                  <span>{p.nama} <b>×{qty[p.id]}</b></span><span className="whitespace-nowrap">{rupiah(p.harga * qty[p.id])}</span>
                </div>
              ))}
              <div className="mt-1 flex justify-between border-t border-divider pt-2 text-section font-bold"><span>Total</span><span>{rupiah(total)}</span></div>
              {cara !== 'pickup' && <p className="m-0 text-label text-neutral-800">Belum termasuk ongkir. Penjual akan mengonfirmasi ongkir lewat WhatsApp.</p>}
            </div>
            <Button className="btn-lg" onClick={kirim} disabled={busy}>{busy ? 'Mengirim…' : 'Kirim pesanan'}</Button>
            <Button variant="ghost" className="text-accent-800 hover:text-accent-800" onClick={() => setReview(false)} disabled={busy}>Ubah pesanan</Button>
          </div>
        </div>
      )}
    </>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative isolate mx-auto flex max-w-[640px] flex-col gap-6 px-4 pb-[calc(140px+env(safe-area-inset-bottom))] pt-8">
      {children}
    </main>
  )
}

function Sukses({ batch, hasil, cara, onLagi }: { batch: PublicBatch; hasil: Hasil; cara: CaraTerima; onLagi: () => void }) {
  const pesanWa = [
    `Halo ${batch.nama_toko}, saya *${hasil.nama}* sudah pesan *${batch.nama}* (kode #${hasil.kode}):`,
    ...hasil.items.map((i) => `- ${i.nama} x${i.qty}`),
    `Total: ${rupiah(hasil.subtotal)}${cara !== 'pickup' ? ' + ongkir' : ''}`,
    `Cara terima: ${CARA[cara]}`,
  ].join('\n')

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-start gap-2">
        <div className="grid size-[72px] place-items-center rounded-full bg-sage-600 text-sage-100">
          <Check size={36} {...ICON} />
        </div>
        <h1 className="mt-2">Pesanan diterima</h1>
        <p className="m-0 text-neutral-800">Kode pesanan <b className="text-card text-ink">#{hasil.kode}</b></p>
      </div>

      <div className="flex flex-col gap-1.5 rounded-card bg-surface p-6">
        {hasil.items.map((i) => (
          <div key={i.nama} className="flex justify-between gap-3"><span>{i.nama} ×{i.qty}</span><span>{rupiah(i.harga * i.qty)}</span></div>
        ))}
        <div className="mt-1 flex justify-between border-t border-divider pt-2 text-section font-bold"><span>Total</span><span>{rupiah(hasil.subtotal)}</span></div>
        {cara !== 'pickup' && <p className="m-0 text-label text-neutral-800">Belum termasuk ongkir. Penjual akan mengonfirmasi ongkir.</p>}
      </div>

      {batch.info_pembayaran && (
        <div className="rounded-card bg-sage-200 p-6 text-sage-900">
          <div className="text-card font-bold">Pembayaran</div>
          <p className="mb-0 mt-1 whitespace-pre-line">{batch.info_pembayaran}</p>
          <p className="mb-0 mt-2 text-label">Setelah transfer, kirim bukti lewat WhatsApp ke penjual.</p>
        </div>
      )}

      {batch.wa_admin && (
        <a href={`https://wa.me/${batch.wa_admin}?text=${encodeURIComponent(pesanWa)}`} target="_blank" rel="noopener"
          className="btn btn-primary btn-lg">
          <MessageCircle size={20} {...ICON} />Konfirmasi via WhatsApp
        </a>
      )}
      <Button variant="ghost" onClick={onLagi}>Buat pesanan lain</Button>
    </div>
  )
}
