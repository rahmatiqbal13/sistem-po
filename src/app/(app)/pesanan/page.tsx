'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Download, Search } from 'lucide-react'
import type { CaraTerima, OrderStatus, OrderSummary } from '@/lib/types'
import { CARA_TERIMA, ORDER_STATUS, STATUS_BAYAR } from '@/lib/types'
import { fetchBatchItems, fetchBatchOrders, rekapProduksi, ringkasan, type ItemWithOrder } from '@/lib/data'
import { exportOrders } from '@/lib/export'
import { errMsg, jam, rupiah, rupiahSingkat, tanggal } from '@/lib/format'
import { useBatch } from '@/components/batch-context'
import { BatchPicker } from '@/components/app-shell'
import {
  Alert, BayarBadge, Button, CARD, CARD_GRID, Chip, INACTIVE, Empty, ICON, LinkButton, Loading, OrderStatusBadge, OrderTags, PageHeader, Pager, cx, paginate,
} from '@/components/ui'

type BayarFilter = '' | 'belum' | 'dp' | 'lunas' | 'belum_lunas'
const BAYAR_LABEL: Record<Exclude<BayarFilter, ''>, string> = { ...STATUS_BAYAR, belum_lunas: 'Belum lunas' }
const PER_OPTIONS = [10, 20, 30, 40, 50]

type ListData = { batchId: string; orders: OrderSummary[]; items: ItemWithOrder[] }
// Data terakhir disimpan di memori agar daftar langsung tampil saat kembali dari detail
let cache: ListData | null = null

/** Simpan alamat daftar (dengan filter) + posisi gulir sebelum membuka detail */
function rememberList() {
  try { sessionStorage.setItem('pesanan.list', JSON.stringify({ search: window.location.search, y: window.scrollY })) } catch {}
}

/** Ubah filter di URL tanpa memuat ulang halaman; mengubah filter selalu kembali ke halaman 1 */
function setParams(patch: Record<string, string | number | null>) {
  const p = new URLSearchParams(window.location.search)
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === '' || (k === 'per' && v === 10) || (k === 'hal' && v === 1)) p.delete(k)
    else p.set(k, String(v))
  }
  if (!('hal' in patch)) p.delete('hal')
  const qs = p.toString()
  window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
}

function pick<T extends string>(v: string | null, allowed: readonly T[]): T | '' {
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : ''
}

export default function PesananPage() {
  const router = useRouter()
  const { batch, batchId, loading: batchLoading } = useBatch()
  const [data, setData] = useState<ListData | null>(() => cache)
  const [error, setError] = useState('')

  // Filter & halaman tersimpan di URL: tetap sama saat kembali dari detail, dan bisa dibagikan
  const sp = useSearchParams()
  const q = sp.get('q') ?? ''
  const bayar = pick(sp.get('bayar'), ['belum', 'dp', 'lunas', 'belum_lunas'] as const) as BayarFilter
  const status = pick(sp.get('status'), Object.keys(ORDER_STATUS) as OrderStatus[])
  const cara = pick(sp.get('cara'), Object.keys(CARA_TERIMA) as CaraTerima[])
  const perRaw = Number(sp.get('per'))
  const per = PER_OPTIONS.includes(perRaw) ? perRaw : 10
  const hal = Math.max(1, parseInt(sp.get('hal') ?? '1', 10) || 1)
  // Kotak cari memakai state lokal agar mengetik tetap lancar; URL ikut diperbarui
  const [qInput, setQInput] = useState(q)
  const setQ = (v: string) => { setQInput(v); setParams({ q: v }) }
  const setBayar = (v: BayarFilter) => setParams({ bayar: v })
  const setStatus = (v: OrderStatus | '') => setParams({ status: v })
  const setCara = (v: CaraTerima | '') => setParams({ cara: v })
  const setPer = (n: number) => setParams({ per: n })
  const setPage = (n: number) => { setParams({ hal: n }); window.scrollTo({ top: 0 }) }

  const load = useCallback(async () => {
    if (!batchId) return
    try {
      const [o, i] = await Promise.all([fetchBatchOrders(batchId), fetchBatchItems(batchId)])
      cache = { batchId, orders: o, items: i }
      setData(cache)
    } catch (e) { setError(errMsg(e)) }
  }, [batchId])

  useEffect(() => { load() }, [load])

  // Data batch lain yang masih tersimpan tidak ditampilkan saat ganti batch
  const orders = data?.batchId === batchId ? data.orders : null
  const items = useMemo(() => (data?.batchId === batchId ? data.items : []), [data, batchId])

  const filtered = useMemo(() => {
    if (!orders) return []
    const needle = q.trim().toLowerCase()
    const digits = needle.replace(/\D/g, '')
    return orders.filter((o) => {
      if (needle && !o.customer_nama.toLowerCase().includes(needle) &&
        !(digits && (o.customer_wa ?? '').replace(/\D/g, '').includes(digits))) return false
      if (bayar) {
        if (o.status === 'dibatalkan') return false
        if (bayar === 'belum_lunas' ? o.status_bayar === 'lunas' : o.status_bayar !== bayar) return false
      }
      if (status && o.status !== status) return false
      if (cara && o.cara_terima !== cara) return false
      return true
    })
  }, [orders, q, bayar, status, cara])

  const sum = useMemo(() => ringkasan(orders ?? []), [orders])
  const rekap = useMemo(() => rekapProduksi(items), [items])
  // Pembeli dengan >1 pesanan aktif di batch: mungkin pesan lewat link dan chat sekaligus
  const ganda = useMemo(() => {
    const count = new Map<string, number>()
    for (const o of orders ?? []) if (o.status !== 'dibatalkan') count.set(o.customer_id, (count.get(o.customer_id) ?? 0) + 1)
    return new Set([...count].filter(([, n]) => n > 1).map(([id]) => id))
  }, [orders])
  const linkBaru = (orders ?? []).filter((o) => o.sumber === 'link' && o.status === 'baru').length

  const pg = paginate(filtered, hal, per)

  // Kembali dari detail: pulihkan posisi gulir setelah daftar tampil
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current || !orders) return
    restored.current = true
    try {
      const saved = JSON.parse(sessionStorage.getItem('pesanan.list') ?? 'null') as { search: string; y: number } | null
      if (saved && saved.search === window.location.search && saved.y > 0) {
        requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: saved.y })))
      }
    } catch {}
  }, [orders])

  const hasFilter = !!(q || bayar || status || cara)
  const reset = () => { setQInput(''); setParams({ q: null, bayar: null, status: null, cara: null }) }
  const onlyBayar = (v: BayarFilter) => () => { setQInput(''); setParams({ q: null, bayar: v, status: null, cara: null }) }

  if (batchLoading) return <Loading />
  if (!batch) {
    return (
      <>
        <PageHeader title="Pesanan" />
        <Empty title="Belum ada batch PO" action={<LinkButton href="/batch" className="px-5">Buat batch pertama</LinkButton>}>
          Buat batch dulu, lalu pesanan bisa dicatat ke batch itu.
        </Empty>
      </>
    )
  }

  const cards = [
    { label: 'Total pesanan', value: rupiah(sum.total), short: rupiahSingkat(sum.total), sub: `${sum.jumlah} pesanan aktif`, onClick: reset, active: !hasFilter, tone: '' },
    { label: 'Terbayar', value: rupiah(sum.terbayar), short: rupiahSingkat(sum.terbayar), sub: `${sum.lunas} lunas`, onClick: onlyBayar('lunas'), active: bayar === 'lunas', tone: 'text-sage-700' },
    { label: 'Belum terbayar', value: rupiah(sum.sisa), short: rupiahSingkat(sum.sisa), sub: `${sum.dp} DP · ${sum.belum} belum bayar`, onClick: onlyBayar('belum_lunas'), active: bayar === 'belum_lunas', tone: sum.sisa > 0 ? 'text-accent-700' : '' },
    { label: 'Belum bayar sama sekali', value: String(sum.belum), short: String(sum.belum), sub: `${sum.dp + sum.belum} pesanan belum lunas`, onClick: onlyBayar('belum'), active: bayar === 'belum', tone: sum.belum > 0 ? 'text-accent-700' : '' },
  ]

  return (
    <>
      <PageHeader title="Pesanan" kicker={batch.nama} subtitle={<>Ambil/produksi {tanggal(batch.tanggal_ambil)}</>}
        action={<BatchPicker />} />

      {error && <Alert>{error}</Alert>}

      {/* Kartu ringkasan: klik untuk memfilter daftar */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 md:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] md:gap-4">
        {cards.map((c) => (
          <button key={c.label} type="button" onClick={c.onClick} aria-pressed={c.active}
            className={cx('flex flex-col gap-1 border-2 text-left', CARD.list,
              c.active ? 'border-accent bg-accent-100' : 'border-transparent bg-surface hover:bg-accent-100')}>
            <span className="text-sm font-semibold text-neutral-800">{c.label}</span>
            {/* HP: angka ringkas agar tetap besar di kartu 2 kolom; nilai lengkap di desktop */}
            <span className={cx('whitespace-nowrap text-section font-bold md:text-stat', c.tone)} title={c.value}>
              <span className="md:hidden">{c.short}</span><span className="hidden md:inline">{c.value}</span>
            </span>
            <span className="text-sm text-neutral-800">{c.sub}</span>
          </button>
        ))}
      </div>

      {linkBaru > 0 && status !== 'baru' && (
        <button type="button" onClick={() => { setQInput(''); setParams({ q: null, bayar: null, status: 'baru', cara: null }) }}
          className="flex items-center gap-3 rounded-full bg-accent-200 py-3 pl-3 pr-6 text-left text-base font-bold text-accent-900 hover:bg-accent-300">
          <span className="grid size-[40px] shrink-0 place-items-center rounded-full bg-accent-700 text-card text-accent-100">{linkBaru}</span>
          <span className="flex-1">pesanan baru dari link menunggu dikonfirmasi</span>
          <span aria-hidden="true">→</span>
        </button>
      )}

      {/* Rekap produksi singkat */}
      {rekap.length > 0 && (
        <section className={cx('flex flex-col gap-3 bg-sage-200', CARD.panel)}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-section text-sage-900">Rekap produksi</h2>
            <Link href="/rekap" className="btn btn-ghost text-sage-800 hover:text-sage-800">Lihat rekap lengkap →</Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {rekap.map((r) => (
              <span key={r.nama} className="inline-flex items-center gap-2 rounded-full bg-sage-100 py-1 pl-3.5 pr-1.5 text-sm text-sage-900">
                {r.nama}
                <b className="inline-grid h-[28px] min-w-[28px] place-items-center rounded-full bg-sage-700 px-1.5 text-sm text-sage-100">{r.qty}</b>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Filter */}
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
          <label className="relative col-span-full block">
            <span className="sr-only">Cari nama atau nomor WA</span>
            <Search size={18} {...ICON} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-800" />
            <input value={qInput} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau nomor WA" className="input min-h-[44px] pl-[42px]" />
          </label>
          <select aria-label="Status bayar" value={bayar} onChange={(e) => setBayar(e.target.value as BayarFilter)} className="input min-h-[44px]">
            <option value="">Status bayar</option>
            {Object.entries(BAYAR_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select aria-label="Status pesanan" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)} className="input min-h-[44px]">
            <option value="">Status pesanan</option>
            {Object.entries(ORDER_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select aria-label="Cara terima" value={cara} onChange={(e) => setCara(e.target.value as CaraTerima)} className="input min-h-[44px]">
            <option value="">Cara terima</option>
            {Object.entries(CARA_TERIMA).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        {hasFilter && (
          <div className="flex flex-wrap items-center gap-2">
            {q && <Chip label={`“${q}”`} onRemove={() => setQ('')}>“{q}”</Chip>}
            {bayar && <Chip label={BAYAR_LABEL[bayar]} onRemove={() => setBayar('')}>{BAYAR_LABEL[bayar]}</Chip>}
            {status && <Chip label={ORDER_STATUS[status]} onRemove={() => setStatus('')}>{ORDER_STATUS[status]}</Chip>}
            {cara && <Chip label={CARA_TERIMA[cara]} onRemove={() => setCara('')}>{CARA_TERIMA[cara]}</Chip>}
            <button type="button" onClick={reset} className="btn btn-ghost">Reset filter</button>
          </div>
        )}
      </div>

      {/* Daftar */}
      {!orders ? <Loading /> : filtered.length === 0 ? (
        orders.length === 0
          ? <Empty title="Belum ada pesanan di batch ini" action={<LinkButton href="/pesanan/baru" className="px-5">+ Pesanan baru</LinkButton>}>
              Catat pesanan dari chat, atau bagikan link pemesanan batch ini ke pembeli.
            </Empty>
          : <Empty title="Tidak ada pesanan yang cocok" action={<Button onClick={reset} className="px-5">Reset filter</Button>}>
              Coba kata kunci lain, atau hapus sebagian filter di atas.
            </Empty>
      ) : (
        <>
          {/* HP: kartu */}
          <div className={cx(CARD_GRID, 'md:hidden')}>
            {pg.shown.map((o) => {
              const batal = o.status === 'dibatalkan'
              return (
                <Link key={o.id} href={`/pesanan/${o.id}`} onClick={rememberList}
                  className={cx('flex flex-col gap-3 bg-surface text-ink no-underline transition-[background-color,scale] hover:bg-accent-100 hover:text-ink active:scale-[0.98] active:bg-accent-100', CARD.list, batal && INACTIVE)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-card font-bold leading-tight">{o.customer_nama}</div>
                      <div className="my-1"><OrderTags sumber={o.sumber} ganda={ganda.has(o.customer_id)} /></div>
                      <div className="text-sm text-neutral-800">
                        {CARA_TERIMA[o.cara_terima]} · {tanggal(o.tanggal_ambil, { day: 'numeric', month: 'short' })} {jam(o.jam_ambil)}
                      </div>
                    </div>
                    <BayarBadge status={o.status_bayar} dibatalkan={batal} />
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <OrderStatusBadge status={o.status} className="bg-neutral-200" />
                    <div className="text-right">
                      <div className="font-bold">{rupiah(o.total)}</div>
                      {!batal && Number(o.sisa) > 0 && <div className="text-sm text-accent-700">sisa {rupiah(o.sisa)}</div>}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>

          {/* Desktop: tabel */}
          <div className="hidden overflow-x-auto rounded-card bg-surface px-3 py-2 md:block">
            <table className="table">
              <thead>
                <tr>
                  <th className="min-w-[190px]">Pembeli</th>
                  <th>Ambil</th>
                  <th>Cara terima</th>
                  <th>Status</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Sisa</th>
                  <th>Bayar</th>
                </tr>
              </thead>
              <tbody>
                {pg.shown.map((o) => {
                  const batal = o.status === 'dibatalkan'
                  const open = () => { rememberList(); router.push(`/pesanan/${o.id}`) }
                  return (
                    <tr key={o.id} tabIndex={0} aria-label={`Buka pesanan ${o.customer_nama}`} onClick={open}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }}
                      className={cx('cursor-pointer', batal && 'bg-neutral-200')}>
                      <td>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold">{o.customer_nama}</span>
                          <OrderTags sumber={o.sumber} ganda={ganda.has(o.customer_id)} />
                        </div>
                        <div className="whitespace-nowrap text-sm text-neutral-800">{o.customer_wa}</div>
                      </td>
                      <td className="whitespace-nowrap">{tanggal(o.tanggal_ambil, { day: 'numeric', month: 'short' })} {jam(o.jam_ambil)}</td>
                      <td className="whitespace-nowrap">{CARA_TERIMA[o.cara_terima]}</td>
                      <td><OrderStatusBadge status={o.status} /></td>
                      <td className="whitespace-nowrap text-right font-bold">{rupiah(o.total)}</td>
                      <td className={cx('whitespace-nowrap text-right', !batal && Number(o.sisa) > 0 ? 'text-accent-700' : 'text-neutral-800')}>
                        {batal ? '—' : rupiah(o.sisa)}
                      </td>
                      <td><BayarBadge status={o.status_bayar} dibatalkan={batal} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <Pager page={pg.page} pages={pg.pages} per={per} onPage={setPage} onPer={setPer} />
        </>
      )}

      {orders && orders.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-label text-neutral-800">{filtered.length ? `${pg.info} pesanan` : '0 pesanan'}</div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" className="min-h-[44px]" onClick={() => exportOrders(filtered, items, `pesanan-${batch.nama}`, 'xlsx')}>
              <Download size={18} {...ICON} />Ekspor Excel ({filtered.length})
            </Button>
            <Button variant="ghost" className="min-h-[44px] px-3.5" onClick={() => exportOrders(filtered, items, `pesanan-${batch.nama}`, 'csv')}>Ekspor CSV</Button>
          </div>
        </div>
      )}
    </>
  )
}
