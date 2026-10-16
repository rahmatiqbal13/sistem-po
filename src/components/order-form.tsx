'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Minus, Plus, Search, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { CaraTerima, Customer, Order, OrderItem, OrderStatus, Product, Quota } from '@/lib/types'
import { CARA_TERIMA, ORDER_STATUS } from '@/lib/types'
import { totalPesanan, subtotal as hitungSubtotal } from '@/lib/calc'
import { errMsg, parseRupiah, rupiah } from '@/lib/format'
import { fotoUrl } from '@/lib/foto'
import { useBatch } from './batch-context'
import { Alert, Button, Field, ICON, Kicker, Loading, ProductPhoto, cx, inputCls } from './ui'

interface Line { product_id: string; nama: string; harga: number; hpp: number | null; qty: number; catatan: string; snapshot: boolean }

const STEPS = ['Pembeli', 'Item', 'Cara terima'] as const
const SECTION = 'flex-col gap-4 rounded-card bg-surface p-6'

export function OrderForm({ orderId }: { orderId?: string }) {
  const router = useRouter()
  const { batches, batchId: ctxBatchId } = useBatch()
  const [ready, setReady] = useState(!orderId)
  // Edit langsung membuka langkah Item (yang paling sering diubah)
  const [step, setStep] = useState(orderId ? 1 : 0)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState('')
  const [confirmOver, setConfirmOver] = useState(false)
  const [busy, setBusy] = useState(false)

  // data
  const [products, setProducts] = useState<Product[]>([])
  const [quotas, setQuotas] = useState<Quota[]>([])
  const [used, setUsed] = useState<Record<string, number>>({})

  // form
  const [pickedBatchId, setBatchId] = useState<string>('')
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [lines, setLines] = useState<Record<string, Line>>({})
  const [cara, setCara] = useState<CaraTerima>('pickup')
  const [alamat, setAlamat] = useState('')
  const [ongkir, setOngkir] = useState('')
  const [pickedTgl, setTglAmbil] = useState<string | null>(null)
  const [jamAmbil, setJamAmbil] = useState('')
  const [catatan, setCatatan] = useState('')
  const [status, setStatus] = useState<OrderStatus>('baru')
  const [updatedAt, setUpdatedAt] = useState<string | undefined>()
  const [touched, setTouched] = useState(false)

  // Pesanan baru: batch bawaan = batch yang dipilih di aplikasi, tanggal ambil = tanggal ambil batch
  const batchId = pickedBatchId || (orderId ? '' : ctxBatchId ?? batches.find((b) => b.status === 'buka')?.id ?? '')
  const tglAmbil = pickedTgl ?? batches.find((b) => b.id === batchId)?.tanggal_ambil ?? ''

  // Muat pesanan saat edit
  useEffect(() => {
    if (!orderId) return
    const supabase = createClient()
    ;(async () => {
      const { data: o } = await supabase.from('orders').select('*, customers(*)').eq('id', orderId).single()
      const { data: items } = await supabase.from('order_items').select('*').eq('order_id', orderId)
      if (!o) { setError('Pesanan tidak ditemukan.'); setReady(true); return }
      const order = o as Order & { customers: Customer }
      setBatchId(order.batch_id)
      setCustomer(order.customers)
      setCara(order.cara_terima)
      setAlamat(order.alamat ?? '')
      setOngkir(order.ongkir ? String(order.ongkir) : '')
      setTglAmbil(order.tanggal_ambil ?? '')
      setJamAmbil(order.jam_ambil?.slice(0, 5) ?? '')
      setCatatan(order.catatan ?? '')
      setStatus(order.status)
      setUpdatedAt(order.updated_at)
      setLines(Object.fromEntries(((items ?? []) as OrderItem[]).filter((i) => i.product_id).map((i) => [i.product_id!, {
        product_id: i.product_id!, nama: i.nama_produk_snapshot, harga: Number(i.harga_snapshot),
        hpp: i.hpp_snapshot == null ? null : Number(i.hpp_snapshot), qty: i.qty, catatan: i.catatan ?? '', snapshot: true,
      }])))
      if (order.status === 'selesai') setError('Pesanan berstatus Selesai tidak dapat diedit.')
      setReady(true)
    })()
  }, [orderId])

  // Produk aktif + produk yang sudah ada di pesanan
  useEffect(() => {
    createClient().from('products').select('*').order('nama').then(({ data }) => setProducts((data ?? []) as Product[]))
  }, [])

  // Kuota & qty terpakai di batch (di luar pesanan ini, tanpa yang dibatalkan)
  useEffect(() => {
    if (!batchId) return
    const supabase = createClient()
    supabase.from('batch_product_quotas').select('*').eq('batch_id', batchId).then(({ data }) => setQuotas((data ?? []) as Quota[]))
    supabase.from('order_items').select('product_id, qty, order_id, orders!inner(batch_id, status)')
      .eq('orders.batch_id', batchId).neq('orders.status', 'dibatalkan')
      .then(({ data }) => {
        const m: Record<string, number> = {}
        for (const r of data ?? []) {
          if (r.order_id === orderId || !r.product_id) continue
          m[r.product_id] = (m[r.product_id] ?? 0) + r.qty
        }
        setUsed(m)
      })
  }, [batchId, orderId])

  const visibleProducts = products.filter((p) => p.aktif || lines[p.id])
  const lineList = Object.values(lines).filter((l) => l.qty > 0)
  const itemsForCalc = lineList.map((l) => ({ harga: l.harga, qty: l.qty }))
  const nOngkir = cara === 'pickup' ? 0 : parseRupiah(ongkir)
  const sub = hitungSubtotal(itemsForCalc)
  const total = totalPesanan(itemsForCalc, nOngkir)
  const totalQty = lineList.reduce((s, l) => s + l.qty, 0)
  const batch = batches.find((b) => b.id === batchId)

  const overQuota = useMemo(() => quotas.flatMap((q) => {
    if (q.kuota == null) return []
    const qty = lines[q.product_id]?.qty ?? 0
    const sisa = q.kuota - (used[q.product_id] ?? 0)
    return qty > 0 && qty > sisa ? [{ nama: lines[q.product_id].nama, sisa: Math.max(sisa, 0), qty }] : []
  }), [quotas, lines, used])

  function setQty(p: Product, qty: number) {
    setLines((cur) => {
      const prev = cur[p.id]
      const n = Math.max(0, Math.min(999, qty))
      if (n <= 0 && !prev) return cur
      return { ...cur, [p.id]: prev ? { ...prev, qty: n } : { product_id: p.id, nama: p.nama, harga: Number(p.harga), hpp: null, qty: n, catatan: '', snapshot: false } }
    })
  }

  const errs = {
    customer: !customer ? 'Pilih atau tambah pembeli.' : '',
    items: lineList.length === 0 ? 'Tambahkan minimal 1 item.' : '',
    alamat: cara !== 'pickup' && !alamat.trim() ? 'Alamat wajib untuk pengantaran.' : '',
    batch: !batchId ? 'Pilih batch.' : '',
  }
  const shown = touched ? errs : { customer: '', items: '', alamat: '', batch: '' }

  function next() {
    if ((step === 0 && errs.customer) || (step === 1 && errs.items)) return setTouched(true)
    setTouched(false)
    setError('')
    setStep((s) => Math.min(s + 1, 2))
    window.scrollTo({ top: 0 })
  }

  async function save(force = false) {
    setTouched(true)
    const firstErr = Object.values(errs).find(Boolean)
    if (firstErr) {
      setError(firstErr)
      setConfirmOver(false)
      setStep(errs.customer || errs.batch ? 0 : errs.items ? 1 : 2)
      const id = errs.customer ? (document.getElementById('nb-nama') ? 'nb-nama' : 'nb-cari') : errs.batch ? 'nb-batch' : errs.items ? 'h-item' : 'nb-alamat'
      // Tunggu langkah (HP) tampil, lalu arahkan ke kolomnya
      setTimeout(() => {
        const el = document.getElementById(id)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el?.focus({ preventScroll: true })
      }, 50)
      return
    }
    if (overQuota.length && !force) {
      setError('')
      setConfirmOver(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setBusy(true)
    setError('')
    setConfirmOver(false)
    const payload = {
      id: orderId,
      expected_updated_at: updatedAt,
      batch_id: batchId,
      customer_id: customer!.id,
      cara_terima: cara,
      alamat: cara === 'pickup' ? '' : alamat.trim(),
      ongkir: nOngkir,
      tanggal_ambil: tglAmbil,
      jam_ambil: jamAmbil,
      catatan: catatan.trim(),
      status,
      items: lineList.map((l) => ({
        product_id: l.product_id, qty: l.qty, catatan: l.catatan.trim(),
        ...(l.snapshot ? { harga_snapshot: l.harga, hpp_snapshot: l.hpp, nama_produk_snapshot: l.nama } : {}),
      })),
    }
    const { data, error } = await createClient().rpc('save_order', { payload })
    setBusy(false)
    if (error) {
      if (error.message.startsWith('KONFLIK')) setConflict(error.message.replace('KONFLIK: ', ''))
      else setError(errMsg(error))
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    router.replace(`/pesanan/${data}`)
  }

  if (!ready) return <Loading />

  // Di HP hanya langkah aktif yang tampil; di desktop semuanya
  const showStep = (n: number) => (step === n ? 'flex' : 'hidden md:flex')
  const isSelesai = !!orderId && status === 'selesai'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0 flex-[1_1_320px]">
          {batch && <Kicker>{batch.nama}</Kicker>}
          <h1 className="mt-1.5">{orderId ? 'Edit pesanan' : 'Pesanan baru'}</h1>
        </div>
        <Button variant="ghost" onClick={() => router.back()} className="px-3.5">Batal</Button>
      </div>

      {/* Indikator langkah (HP) */}
      <ol aria-label="Langkah" className="m-0 grid list-none grid-cols-3 gap-1.5 p-0 md:hidden">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" onClick={() => { setStep(i); setTouched(false) }} aria-current={i === step ? 'step' : undefined}
              className={cx('min-h-[44px] w-full rounded-full px-1.5 text-sm font-bold leading-tight',
                i === step ? 'bg-accent text-bg' : i < step ? 'bg-accent-200 text-accent-900' : 'bg-surface text-ink')}>
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>

      {conflict && (
        <Alert>
          {conflict}
          <div className="mt-2"><Button variant="secondary" className="bg-bg" onClick={() => window.location.reload()}>Muat ulang pesanan</Button></div>
        </Alert>
      )}
      {error && <Alert>{error}</Alert>}
      {confirmOver && overQuota.length > 0 && (
        <div role="alertdialog" aria-labelledby="ov-t" className="flex flex-col gap-2 rounded-card bg-accent-200 p-6 text-accent-900">
          <div id="ov-t" className="text-card font-bold">Kuota terlampaui</div>
          {overQuota.map((o) => <div key={o.nama}>{o.nama}: pesan {o.qty}, sisa kuota {o.sisa}</div>)}
          <div className="mt-1 flex flex-wrap gap-2">
            <Button onClick={() => save(true)} className="px-5">Tetap simpan</Button>
            <Button variant="secondary" className="border-accent-500" onClick={() => { setConfirmOver(false); setStep(1) }}>Ubah jumlah</Button>
          </div>
        </div>
      )}

      {/* Urutan kode 1 → 2 → 3 (urutan Tab & pembaca layar); di layar lebar Item pindah ke kolom kanan */}
      <div className="grid items-start gap-4 xl:grid-cols-2 xl:grid-rows-[auto_1fr]">
        {/* 1. Pembeli */}
        <section aria-labelledby="h-pembeli" className={cx(SECTION, showStep(0), 'xl:col-start-1 xl:row-start-1')}>
          <h2 id="h-pembeli" className="text-section">1. Pembeli</h2>
          <CustomerPicker value={customer} onChange={(c) => { setCustomer(c); setError('') }} error={shown.customer} />
          <Field label="Batch PO" htmlFor="nb-batch"
            error={batch && batch.status !== 'buka' ? `Batch “${batch.nama}” sedang tidak berstatus Buka.` : shown.batch}>
            <select id="nb-batch" value={batchId} onChange={(e) => { setBatchId(e.target.value); if (!orderId) setTglAmbil(null) }} className={inputCls}>
              {!batchId && <option value="">Pilih batch</option>}
              {batches.map((b) => <option key={b.id} value={b.id}>{b.nama}</option>)}
            </select>
          </Field>
        </section>

        {/* 2. Item */}
        <section aria-labelledby="h-item" className={cx(SECTION, 'min-w-0 xl:col-start-2 xl:row-span-2 xl:row-start-1', showStep(1))}>
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="h-item" tabIndex={-1} className="text-section">2. Item</h2>
            {totalQty > 0 && <span className="text-sm text-neutral-800">{totalQty} item dipilih</span>}
          </div>
          {shown.items && <div role="alert" className="text-label font-bold text-accent-800">{shown.items}</div>}
          {visibleProducts.length === 0 ? (
            <div className="text-neutral-800">Belum ada produk aktif. Tambahkan di menu Produk.</div>
          ) : (
            <div className="flex flex-col">
              {visibleProducts.map((p) => {
                const line = lines[p.id]
                const qty = line?.qty ?? 0
                const q = quotas.find((x) => x.product_id === p.id)
                const sisa = q?.kuota != null ? q.kuota - (used[p.id] ?? 0) : null
                const over = sisa !== null && qty > sisa
                const harga = line?.harga ?? Number(p.harga)
                return (
                  <div key={p.id} className="flex flex-col gap-2 border-b border-divider py-3 last:border-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <ProductPhoto url={fotoUrl(p.foto_path)} size={64} />
                      <div className="min-w-[140px] flex-1">
                        <div className="font-bold leading-snug">{p.nama}{!p.aktif && ' (nonaktif)'}</div>
                        <div className="text-sm text-neutral-800">
                          {rupiah(harga)}
                          {sisa !== null && <span className={cx(over && 'font-bold text-accent-800')}> · sisa kuota {Math.max(sisa - qty, 0)}</span>}
                        </div>
                      </div>
                      <div className="ml-auto flex items-center gap-1">
                        <button type="button" onClick={() => setQty(p, qty - 1)} disabled={qty === 0} aria-label={`Kurangi ${p.nama}`}
                          className="grid size-[44px] place-items-center rounded-full border border-divider bg-bg text-ink hover:bg-neutral-200">
                          <Minus size={18} {...ICON} />
                        </button>
                        <input inputMode="numeric" value={qty || ''} placeholder="0" aria-label={`Jumlah ${p.nama}`}
                          onChange={(e) => setQty(p, parseInt(e.target.value.replace(/\D/g, '') || '0', 10))}
                          className="input min-h-[44px] w-[56px] bg-bg px-1 text-center text-card font-bold" />
                        <button type="button" onClick={() => setQty(p, qty + 1)} aria-label={`Tambah ${p.nama}`}
                          className="grid size-[44px] place-items-center rounded-full bg-accent text-bg hover:bg-accent-800">
                          <Plus size={18} {...ICON} />
                        </button>
                      </div>
                    </div>
                    {qty > 0 && (
                      <input value={line?.catatan ?? ''} maxLength={100} placeholder="Catatan item, mis. tanpa sambal" aria-label={`Catatan untuk ${p.nama}`}
                        onChange={(e) => setLines((cur) => ({ ...cur, [p.id]: { ...cur[p.id], catatan: e.target.value } }))}
                        className="input min-h-[44px] bg-bg text-label" />
                    )}
                    {over && <div className="text-sm font-bold text-accent-800">Melebihi sisa kuota ({Math.max(sisa, 0)}).</div>}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* 3. Cara terima */}
        <section aria-labelledby="h-cara" className={cx(SECTION, showStep(2), 'xl:col-start-1 xl:row-start-2')}>
          <h2 id="h-cara" className="text-section">3. Cara terima</h2>
          <div role="radiogroup" aria-labelledby="h-cara" className="grid grid-cols-3 gap-1.5">
            {(Object.keys(CARA_TERIMA) as CaraTerima[]).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={cara === c} onClick={() => setCara(c)}
                className={cx('min-h-[44px] rounded-full border px-1.5 text-label font-bold leading-tight',
                  cara === c ? 'border-accent bg-accent-200 text-accent-900' : 'border-divider bg-bg text-ink')}>
                {CARA_TERIMA[c]}
              </button>
            ))}
          </div>
          {cara !== 'pickup' && (
            <>
              <Field label="Alamat" htmlFor="nb-alamat" helper="Wajib untuk pengantaran." error={shown.alamat} required>
                <textarea id="nb-alamat" rows={2} value={alamat} onChange={(e) => setAlamat(e.target.value)}
                  aria-invalid={!!shown.alamat} className={inputCls} />
              </Field>
              <Field label="Ongkir (Rp)" htmlFor="nb-ongkir" helper="Diisi manual. Contoh: 10000">
                <input id="nb-ongkir" inputMode="numeric" value={ongkir} onChange={(e) => setOngkir(e.target.value)} className={inputCls} />
              </Field>
            </>
          )}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            <Field label="Tanggal ambil/antar" htmlFor="nb-tgl">
              <input id="nb-tgl" type="date" value={tglAmbil} onChange={(e) => setTglAmbil(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Jam (opsional)" htmlFor="nb-jam">
              <input id="nb-jam" type="time" value={jamAmbil} onChange={(e) => setJamAmbil(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <Field label="Catatan pesanan (opsional)" htmlFor="nb-cat">
            <textarea id="nb-cat" rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} className={inputCls} />
          </Field>
          {orderId && !isSelesai && (
            <Field label="Status pesanan" htmlFor="nb-status">
              <select id="nb-status" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)} className={inputCls}>
                {Object.entries(ORDER_STATUS).filter(([v]) => v !== 'selesai').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          )}
        </section>
      </div>

      {/* Total berjalan */}
      <div className="no-print sticky bottom-[calc(13.2px+env(safe-area-inset-bottom))] z-20 flex items-center gap-3 rounded-card bg-neutral-100 py-3 pl-6 pr-3 shadow-lg">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-neutral-800">
            {totalQty} item · subtotal {rupiah(sub)}{nOngkir > 0 ? ` + ongkir ${rupiah(nOngkir)}` : ''}
          </div>
          <div className="text-stat font-bold leading-tight">{rupiah(total)}</div>
        </div>
        {step < 2 && <Button className="btn-lg md:hidden" onClick={next}>Lanjut</Button>}
        <Button className={cx('btn-lg', step < 2 && 'hidden md:inline-flex')} onClick={() => save()} disabled={busy || isSelesai}>
          {busy ? 'Menyimpan…' : <><Check size={18} {...ICON} />Simpan pesanan</>}
        </Button>
      </div>
    </div>
  )
}

function inisial(nama: string) {
  return nama.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
}

function CustomerPicker({ value, onChange, error }: { value: Customer | null; onChange: (c: Customer | null) => void; error: string }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Customer[]>([])
  const [adding, setAdding] = useState(false)
  const [nama, setNama] = useState('')
  const [wa, setWa] = useState('')
  const [err, setErr] = useState('')
  const reqId = useRef(0)

  useEffect(() => {
    const term = q.trim()
    const id = ++reqId.current
    const t = setTimeout(async () => {
      let query = createClient().from('customers').select('*').order('created_at', { ascending: false }).limit(6)
      if (term) {
        const safe = term.replace(/[%,()]/g, '')
        const digits = term.replace(/\D/g, '')
        query = query.or(digits.length >= 3 ? `nama.ilike.%${safe}%,no_wa.ilike.%${digits}%` : `nama.ilike.%${safe}%`)
      }
      const { data } = await query
      if (id === reqId.current) setResults((data ?? []) as Customer[])
    }, term ? 200 : 0)
    return () => clearTimeout(t)
  }, [q])

  async function add() {
    if (!nama.trim()) return setErr('Nama wajib diisi.')
    const { data, error } = await createClient().from('customers')
      .insert({ nama: nama.trim(), no_wa: wa.replace(/[^\d+]/g, '') || null }).select('*').single()
    if (error) return setErr(errMsg(error))
    onChange(data as Customer)
    setAdding(false)
  }

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-full bg-accent-100 p-2 outline-2 -outline-offset-2 outline-accent">
        <div aria-hidden="true" className="grid size-[44px] shrink-0 place-items-center rounded-full bg-accent-300 font-bold text-accent-900">{inisial(value.nama)}</div>
        <div className="min-w-0 flex-1">
          <div className="font-bold">{value.nama}</div>
          <div className="whitespace-nowrap text-sm text-neutral-800">{value.no_wa || 'Tanpa nomor WA'}</div>
        </div>
        <Button variant="secondary" className="bg-bg" onClick={() => onChange(null)}>Ganti</Button>
      </div>
    )
  }

  if (adding) {
    return (
      <div className="flex flex-col gap-3 rounded-lg bg-bg p-4">
        <div className="font-bold">Pembeli baru</div>
        <Field label="Nama" htmlFor="nb-nama" error={err} required>
          <input id="nb-nama" autoFocus autoComplete="off" value={nama} onChange={(e) => setNama(e.target.value)} className="input bg-neutral-100" />
        </Field>
        <Field label="Nomor WhatsApp" htmlFor="nb-wa" helper="Contoh: 0812 3456 7890">
          <input id="nb-wa" inputMode="tel" value={wa} onChange={(e) => setWa(e.target.value)} className="input bg-neutral-100" />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button onClick={add} className="px-5">Simpan pembeli</Button>
          <Button variant="ghost" onClick={() => { setAdding(false); setErr('') }}>Batal</Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <Field label="Cari pembeli" htmlFor="nb-cari" error={error}>
        <div className="relative">
          <Search size={18} {...ICON} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-800" />
          <input id="nb-cari" autoFocus autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ketik nama atau nomor WA"
            aria-invalid={!!error} className={cx(inputCls, 'pl-[42px]')} />
        </div>
      </Field>
      <div className="flex flex-col overflow-hidden rounded-lg bg-bg">
        {results.map((c) => (
          <button key={c.id} type="button" onClick={() => onChange(c)}
            className="flex min-h-[52px] items-center justify-between gap-3 border-b border-divider px-4 py-2 text-left leading-snug hover:bg-accent-100">
            <span className="min-w-0 flex-1 font-bold">{c.nama}</span>
            <span className="whitespace-nowrap text-sm text-neutral-800">{c.no_wa}</span>
          </button>
        ))}
        <button type="button" onClick={() => {
          const t = q.trim(), digits = t.replace(/\D/g, '')
          const isWa = digits.length >= 6 && digits.length === t.replace(/[\s-]/g, '').length
          setNama(isWa ? '' : t)
          setWa(isWa ? t : '')
          setAdding(true)
        }} className="flex min-h-[52px] items-center gap-2.5 px-4 py-2 text-left font-bold text-accent-700 hover:bg-accent-100">
          <UserPlus size={18} {...ICON} />{q.trim() ? `Tambah pembeli baru: “${q.trim()}”` : 'Tambah pembeli baru'}
        </button>
      </div>
    </>
  )
}
