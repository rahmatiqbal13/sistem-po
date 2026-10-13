'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Minus, Plus, Search, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { CaraTerima, Customer, Order, OrderItem, OrderStatus, Product, Quota } from '@/lib/types'
import { CARA_TERIMA, ORDER_STATUS } from '@/lib/types'
import { totalPesanan, subtotal as hitungSubtotal } from '@/lib/calc'
import { errMsg, parseRupiah, rupiah } from '@/lib/format'
import { useBatch } from './batch-context'
import { Alert, Button, Field, Loading, cx, inputCls } from './ui'

interface Line { product_id: string; nama: string; harga: number; qty: number; catatan: string; snapshot: boolean }

const STEPS = ['Pembeli', 'Item', 'Cara terima'] as const

export function OrderForm({ orderId }: { orderId?: string }) {
  const router = useRouter()
  const { batches, batchId: ctxBatchId } = useBatch()
  const [ready, setReady] = useState(!orderId)
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState('')
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
        qty: i.qty, catatan: i.catatan ?? '', snapshot: true,
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
  const sub = hitungSubtotal(itemsForCalc)
  const total = totalPesanan(itemsForCalc, parseRupiah(ongkir))
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
      if (qty <= 0 && !prev) return cur
      return { ...cur, [p.id]: prev ? { ...prev, qty: Math.max(0, qty) } : { product_id: p.id, nama: p.nama, harga: p.harga, qty, catatan: '', snapshot: false } }
    })
  }

  const errs = {
    customer: !customer ? 'Pilih atau tambah pembeli.' : '',
    items: lineList.length === 0 ? 'Tambahkan minimal 1 item.' : '',
    alamat: cara !== 'pickup' && !alamat.trim() ? 'Alamat wajib untuk pengantaran.' : '',
    batch: !batchId ? 'Pilih batch.' : '',
  }

  function next() {
    setTouched(true)
    if (step === 0 && errs.customer) return
    if (step === 1 && errs.items) return
    setTouched(false)
    setStep((s) => Math.min(s + 1, 2))
    window.scrollTo({ top: 0 })
  }

  async function save() {
    setTouched(true)
    const firstErr = Object.values(errs).find(Boolean)
    if (firstErr) {
      setError(firstErr)
      setStep(errs.customer ? 0 : errs.items ? 1 : 2)
      return
    }
    if (overQuota.length && !window.confirm(
      'Kuota terlampaui:\n' + overQuota.map((o) => `• ${o.nama}: pesan ${o.qty}, sisa kuota ${o.sisa}`).join('\n') + '\n\nTetap simpan?'
    )) return

    setBusy(true)
    setError('')
    const payload = {
      id: orderId,
      expected_updated_at: updatedAt,
      batch_id: batchId,
      customer_id: customer!.id,
      cara_terima: cara,
      alamat: cara === 'pickup' ? '' : alamat.trim(),
      ongkir: cara === 'pickup' ? 0 : parseRupiah(ongkir),
      tanggal_ambil: tglAmbil,
      jam_ambil: jamAmbil,
      catatan: catatan.trim(),
      status,
      items: lineList.map((l) => ({
        product_id: l.product_id, qty: l.qty, catatan: l.catatan.trim(),
        ...(l.snapshot ? { harga_snapshot: l.harga, nama_produk_snapshot: l.nama } : {}),
      })),
    }
    const { data, error } = await createClient().rpc('save_order', { payload })
    setBusy(false)
    if (error) {
      if (error.message.startsWith('KONFLIK')) setConflict(error.message.replace('KONFLIK: ', ''))
      else setError(errMsg(error))
      return
    }
    router.replace(`/pesanan/${data}`)
  }

  if (!ready) return <Loading />

  const sectionCls = (n: number) => cx('space-y-4', step === n ? 'block' : 'hidden md:block')

  return (
    <div className="pb-32 md:pb-28">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold md:text-3xl">{orderId ? 'Edit pesanan' : 'Pesanan baru'}</h1>
        <Button variant="ghost" onClick={() => router.back()}>Batal</Button>
      </div>

      {/* Indikator langkah (HP) */}
      <ol className="mb-5 grid grid-cols-3 gap-2 md:hidden">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button type="button" onClick={() => setStep(i)}
              className={cx('w-full border-t-4 pt-1.5 text-left text-sm font-semibold',
                i === step ? 'border-accent text-accent' : i < step ? 'border-accent/40 text-ink' : 'border-line text-muted')}>
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>

      {conflict && (
        <div className="mb-4">
          <Alert tone="bad">
            {conflict}
            <div className="mt-2"><Button variant="secondary" onClick={() => window.location.reload()}>Muat ulang pesanan</Button></div>
          </Alert>
        </div>
      )}
      {error && <div className="mb-4"><Alert tone="bad">{error}</Alert></div>}

      <div className="grid gap-6 md:grid-cols-2 md:gap-8">
        {/* 1. Pembeli */}
        <section className={sectionCls(0)}>
          <h2 className="hidden text-xl font-bold md:block">1. Pembeli</h2>
          <CustomerPicker value={customer} onChange={setCustomer} error={touched ? errs.customer : ''} />

          <div className="hidden md:block">
            <BatchSelect batchId={batchId} onChange={setBatchId} />
          </div>
        </section>

        {/* 2. Item */}
        <section className={cx(sectionCls(1), 'md:row-span-2')}>
          <h2 className="hidden text-xl font-bold md:block">2. Item</h2>
          {touched && errs.items && <Alert tone="bad">{errs.items}</Alert>}
          {visibleProducts.length === 0 ? (
            <Alert>Belum ada produk aktif. Tambahkan di menu Produk.</Alert>
          ) : (
            <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {visibleProducts.map((p) => {
                const line = lines[p.id]
                const qty = line?.qty ?? 0
                const q = quotas.find((x) => x.product_id === p.id)
                const sisa = q?.kuota != null ? q.kuota - (used[p.id] ?? 0) : null
                const harga = line?.harga ?? p.harga
                return (
                  <div key={p.id} className="p-3">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{p.nama}{!p.aktif && <span className="text-sm font-normal text-muted"> (nonaktif)</span>}</div>
                        <div className="num text-sm text-muted">
                          {rupiah(harga)}
                          {sisa !== null && <> · sisa kuota <span className={cx(qty > sisa && 'font-semibold text-bad')}>{Math.max(sisa - qty, 0)}</span></>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setQty(p, qty - 1)} disabled={qty === 0}
                          className="grid size-11 place-items-center rounded-xl border border-line disabled:opacity-40" aria-label={`Kurangi ${p.nama}`}>
                          <Minus size={18} />
                        </button>
                        <input inputMode="numeric" value={qty || ''} placeholder="0" aria-label={`Qty ${p.nama}`}
                          onChange={(e) => setQty(p, parseInt(e.target.value.replace(/\D/g, '') || '0', 10))}
                          className="num h-11 w-12 rounded-xl border border-line bg-surface text-center font-bold" />
                        <button type="button" onClick={() => setQty(p, qty + 1)}
                          className="grid size-11 place-items-center rounded-xl bg-accent text-on-accent" aria-label={`Tambah ${p.nama}`}>
                          <Plus size={18} />
                        </button>
                      </div>
                    </div>
                    {qty > 0 && (
                      <input value={line?.catatan ?? ''} placeholder="Catatan item, mis. tanpa sambal"
                        onChange={(e) => setLines((cur) => ({ ...cur, [p.id]: { ...cur[p.id], catatan: e.target.value } }))}
                        className={cx(inputCls, 'mt-2 text-sm')} aria-label={`Catatan ${p.nama}`} />
                    )}
                    {sisa !== null && qty > sisa && (
                      <p className="mt-1 text-sm font-medium text-bad">Melebihi sisa kuota ({Math.max(sisa, 0)}).</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* 3. Cara terima */}
        <section className={sectionCls(2)}>
          <h2 className="hidden text-xl font-bold md:block">3. Cara terima</h2>
          <div role="radiogroup" aria-label="Cara terima" className="grid grid-cols-3 gap-2">
            {(Object.keys(CARA_TERIMA) as CaraTerima[]).map((c) => (
              <button key={c} type="button" role="radio" aria-checked={cara === c} onClick={() => setCara(c)}
                className={cx('min-h-12 rounded-xl border px-2 text-sm font-semibold',
                  cara === c ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface')}>
                {CARA_TERIMA[c]}
              </button>
            ))}
          </div>
          {cara !== 'pickup' && (
            <>
              <Field label="Alamat" error={touched ? errs.alamat : ''} helper="Wajib untuk pengantaran.">
                <textarea rows={2} value={alamat} onChange={(e) => setAlamat(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Ongkir (Rp)" helper="Diisi manual. Contoh: 10000">
                <input inputMode="numeric" value={ongkir} onChange={(e) => setOngkir(e.target.value)} className={cx(inputCls, 'num')} />
              </Field>
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tanggal ambil/antar">
              <input type="date" value={tglAmbil} onChange={(e) => setTglAmbil(e.target.value)} className={inputCls} />
            </Field>
            <Field label="Jam (opsional)">
              <input type="time" value={jamAmbil} onChange={(e) => setJamAmbil(e.target.value)} className={inputCls} />
            </Field>
          </div>
          <Field label="Catatan pesanan (opsional)">
            <textarea rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} className={inputCls} />
          </Field>
          {orderId && (
            <Field label="Status pesanan">
              <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)} className={inputCls}>
                {Object.entries(ORDER_STATUS).filter(([v]) => v !== 'selesai').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
          )}
          <div className="md:hidden"><BatchSelect batchId={batchId} onChange={setBatchId} /></div>
          {batch && batch.status !== 'buka' && (
            <Alert>Batch “{batch.nama}” sedang tidak berstatus Buka.</Alert>
          )}
        </section>
      </div>

      {/* Total berjalan */}
      <div className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] md:left-64">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm text-muted">{totalQty} item · subtotal {rupiah(sub)}{cara !== 'pickup' && parseRupiah(ongkir) > 0 ? ` + ongkir ${rupiah(parseRupiah(ongkir))}` : ''}</div>
            <div className="num text-[22px] font-bold leading-7">{rupiah(total)}</div>
          </div>
          {step < 2 && <Button className="md:hidden" onClick={next}>Lanjut</Button>}
          <Button className={cx(step < 2 && 'hidden md:inline-flex')} onClick={save} disabled={busy || status === 'selesai' && !!orderId}>
            {busy ? <>Menyimpan…</> : <><Check size={18} aria-hidden />Simpan pesanan</>}
          </Button>
        </div>
      </div>
    </div>
  )
}

function BatchSelect({ batchId, onChange }: { batchId: string; onChange: (id: string) => void }) {
  const { batches } = useBatch()
  return (
    <Field label="Batch PO">
      <select value={batchId} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        {!batchId && <option value="">Pilih batch</option>}
        {batches.map((b) => <option key={b.id} value={b.id}>{b.nama}</option>)}
      </select>
    </Field>
  )
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
      let query = createClient().from('customers').select('*').order('created_at', { ascending: false }).limit(8)
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
      .insert({ nama: nama.trim(), no_wa: normalizeWa(wa) || null }).select('*').single()
    if (error) return setErr(errMsg(error))
    onChange(data as Customer)
    setAdding(false)
  }

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-accent bg-accent-soft p-4">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{value.nama}</div>
          <div className="text-sm text-muted">{value.no_wa || 'Tanpa nomor WA'}</div>
        </div>
        <Button variant="secondary" onClick={() => onChange(null)}>Ganti</Button>
      </div>
    )
  }

  if (adding) {
    return (
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        <div className="font-semibold">Pembeli baru</div>
        {err && <Alert tone="bad">{err}</Alert>}
        <Field label="Nama"><input autoFocus value={nama} onChange={(e) => setNama(e.target.value)} className={inputCls} /></Field>
        <Field label="Nomor WhatsApp" helper="Contoh: 0812 3456 7890">
          <input inputMode="tel" value={wa} onChange={(e) => setWa(e.target.value)} className={inputCls} />
        </Field>
        <div className="flex gap-2">
          <Button onClick={add}>Simpan pembeli</Button>
          <Button variant="ghost" onClick={() => setAdding(false)}>Batal</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <Field label="Cari pembeli" helper="Ketik nama atau nomor WA." error={error}>
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} className={cx(inputCls, 'pl-10')} />
        </div>
      </Field>
      <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
        {results.map((c) => (
          <button key={c.id} type="button" onClick={() => onChange(c)} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left hover:bg-surface-2">
            <span className="font-semibold">{c.nama}</span>
            <span className="text-sm text-muted">{c.no_wa}</span>
          </button>
        ))}
        <button type="button" onClick={() => {
          const digits = q.replace(/\D/g, '')
          if (digits.length >= 6 && digits.length === q.replace(/\s/g, '').length) { setWa(q); setNama('') } else { setNama(q); setWa('') }
          setAdding(true)
        }} className="flex min-h-12 w-full items-center gap-2 px-4 py-2 font-semibold text-accent hover:bg-surface-2">
          <UserPlus size={18} aria-hidden />Tambah pembeli baru{q.trim() ? `: “${q.trim()}”` : ''}
        </button>
      </div>
    </div>
  )
}

function normalizeWa(s: string) {
  return s.replace(/[^\d+]/g, '')
}
