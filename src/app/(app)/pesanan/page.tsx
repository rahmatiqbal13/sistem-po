'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Download, Search, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { fotoUrl } from '@/lib/foto'
import type { Batch, CaraTerima, OrderStatus, OrderSummary, Product, Quota } from '@/lib/types'
import { CARA_TERIMA, ORDER_STATUS, STATUS_BAYAR } from '@/lib/types'
import { fetchBatchItems, fetchBatchOrders, rekapProduksi, ringkasan, type ItemWithOrder } from '@/lib/data'
import { exportOrders } from '@/lib/export'
import { errMsg, jam, rupiah, rupiahSingkat, tanggal, today } from '@/lib/format'
import { useBatch } from '@/components/batch-context'
import { BatchPicker } from '@/components/app-shell'
import {
  Alert, BayarBadge, Button, CARD, CARD_GRID, Chip, INACTIVE, Empty, ICON, LinkButton, Loading, OrderStatusBadge, OrderTags, PageHeader, Pager, cx, paginate,
} from '@/components/ui'

type BayarFilter = '' | 'belum' | 'dp' | 'lunas' | 'belum_lunas'
const BAYAR_LABEL: Record<Exclude<BayarFilter, ''>, string> = { ...STATUS_BAYAR, belum_lunas: 'Belum lunas' }
const PER_OPTIONS = [10, 20, 30, 40, 50]

type ListData = { batchId: string; orders: OrderSummary[]; items: ItemWithOrder[]; quotas: Quota[] }
type Foto = Pick<Product, 'id' | 'foto_path'>
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
      const [o, i, q] = await Promise.all([
        fetchBatchOrders(batchId), fetchBatchItems(batchId),
        createClient().from('batch_product_quotas').select('*').eq('batch_id', batchId).then(({ data }) => (data ?? []) as Quota[]),
      ])
      cache = { batchId, orders: o, items: i, quotas: q }
      setData(cache)
    } catch (e) { setError(errMsg(e)) }
  }, [batchId])

  useEffect(() => { load() }, [load])

  // Foto produk untuk kolase terlaris
  const [foto, setFoto] = useState<Foto[]>([])
  useEffect(() => {
    createClient().from('products').select('id, foto_path').then(({ data }) => setFoto((data ?? []) as Foto[]))
  }, [])

  // Panel ringkasan di samping (layar lebar); pilihan buka/tutup diingat di perangkat
  const [panel, setPanel] = useState(true)
  useEffect(() => { try { setPanel(localStorage.getItem('po-panel') !== '0') } catch {} }, [])
  const togglePanel = () => { const v = !panel; setPanel(v); try { localStorage.setItem('po-panel', v ? '1' : '0') } catch {} }

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

  const kolase = rekap.slice(0, 3).map((r) => ({ ...r, foto: fotoUrl(foto.find((p) => p.id === r.id)?.foto_path) }))
  // Dengan panel terbuka kartu lebih sempit: pakai angka ringkas

  const cards = [
    { label: 'Total pesanan', value: rupiah(sum.total), short: rupiahSingkat(sum.total), sub: `${sum.jumlah} pesanan aktif`, onClick: reset, active: !hasFilter, tone: '' },
    { label: 'Terbayar', value: rupiah(sum.terbayar), short: rupiahSingkat(sum.terbayar), sub: `${sum.lunas} lunas`, onClick: onlyBayar('lunas'), active: bayar === 'lunas', tone: 'text-sage-700' },
    { label: 'Belum terbayar', value: rupiah(sum.sisa), short: rupiahSingkat(sum.sisa), sub: `${sum.dp} DP · ${sum.belum} belum bayar`, onClick: onlyBayar('belum_lunas'), active: bayar === 'belum_lunas', tone: sum.sisa > 0 ? 'text-accent-700' : '' },
    { label: 'Belum bayar sama sekali', value: String(sum.belum), short: String(sum.belum), sub: `${sum.dp + sum.belum} pesanan belum lunas`, onClick: onlyBayar('belum'), active: bayar === 'belum', tone: sum.belum > 0 ? 'text-accent-700' : '' },
  ]

  return (
    <>
      <div className="flex flex-wrap items-start gap-6">
      <div className="flex min-w-0 flex-[1_1_540px] flex-col gap-6">
      <PageHeader title="Pesanan" kicker={batch.nama} subtitle={<>Ambil/produksi {tanggal(batch.tanggal_ambil)}</>}
        action={<>
          {kolase.length > 0 && <Terlaris list={kolase} />}
          <div className="flex flex-wrap items-center gap-2">
            <BatchPicker />
            {!panel && <Button variant="secondary" className="hidden lg:inline-flex" onClick={togglePanel}>Tampilkan panel</Button>}
          </div>
        </>} />

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
              <span className={panel ? 'md:hidden xl:inline' : 'md:hidden'}>{c.short}</span>
              <span className={cx('hidden', panel ? 'md:inline xl:hidden' : 'md:inline')}>{c.value}</span>
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
      </div>
      {panel && <Panel batch={batch} orders={orders ?? []} items={items} quotas={data?.batchId === batchId ? data.quotas : []}
        jumlah={sum.jumlah} onHide={togglePanel} />}
      </div>
    </>
  )
}

/** Tiga produk terlaris sebagai kolase foto miring (layar lebar) */
function Terlaris({ list }: { list: { nama: string; qty: number; foto: string | null }[] }) {
  return (
    <div role="group" aria-label="Produk terlaris" className="hidden items-center gap-3 md:flex">
      <div className="flex px-1 py-1.5">
        {list.map((k, i) => (
          <div key={k.nama} title={`${k.nama} · ${k.qty}`}
            className={cx('relative grid size-[76px] shrink-0 place-items-center overflow-hidden rounded-[20px] border-[3px] border-surface shadow-[var(--pop)]',
              i % 2 ? 'bg-sage-200' : 'bg-accent-200', i > 0 && '-ml-[18px]')}
            style={{ rotate: ['-6deg', '4deg', '-2deg'][i], zIndex: 3 - i }}>
            {k.foto
              ? <img src={k.foto} alt="" className="size-full object-cover" />
              : <span aria-hidden="true" className="text-[28px] font-extrabold text-accent-900">{k.nama.charAt(0)}</span>}
            <span aria-hidden="true" className="absolute bottom-1 right-1 grid h-5 min-w-5 place-items-center rounded-full bg-surface px-1 text-[11px] font-extrabold text-accent-900">{i + 1}</span>
          </div>
        ))}
      </div>
      <div className="max-w-[130px] text-caption leading-tight">
        <div className="font-extrabold">Terlaris</div>
        <div className="text-neutral-800">{list[0].nama}</div>
      </div>
    </div>
  )
}

const TONE_HARI_INI: Partial<Record<OrderStatus, string>> = { baru: 'bg-sage-200 text-sage-900', siap: 'bg-accent-300 text-accent-900' }

/** Panel samping: jadwal ambil/kirim hari ini + progres batch & kuota */
function Panel({ batch, orders, items, quotas, jumlah, onHide }: {
  batch: Batch; orders: OrderSummary[]; items: ItemWithOrder[]; quotas: Quota[]; jumlah: number; onHide: () => void
}) {
  const hariIni = today()
  const list = orders.filter((o) => o.tanggal_ambil === hariIni && o.status !== 'selesai' && o.status !== 'dibatalkan')
    .sort((a, b) => (a.jam_ambil ?? '99').localeCompare(b.jam_ambil ?? '99'))
  const itemTeks = (id: string) => {
    const its = items.filter((i) => i.order_id === id)
    return its.length ? its[0].nama_produk_snapshot + (its.length > 1 ? ` +${its.length - 1}` : '') : ''
  }
  const hari = batch.tanggal_tutup
    ? Math.round((new Date(batch.tanggal_tutup + 'T00:00:00').getTime() - new Date(hariIni + 'T00:00:00').getTime()) / 864e5) : null
  const terpakai = new Map<string, number>()
  for (const i of items) if (i.orders.status !== 'dibatalkan' && i.product_id) terpakai.set(i.product_id, (terpakai.get(i.product_id) ?? 0) + i.qty)
  const nama = new Map(items.map((i) => [i.product_id, i.nama_produk_snapshot]))
  const kuota = quotas.filter((q) => q.kuota != null).slice(0, 4).map((q) => {
    const used = terpakai.get(q.product_id) ?? 0, k = q.kuota!
    return { id: q.product_id, nama: nama.get(q.product_id) ?? 'Produk', used, k, over: used > k, pct: Math.min(100, (used / k) * 100) }
  })

  return (
    <aside aria-label="Ringkasan hari ini" className="no-print sticky top-6 hidden min-w-[260px] flex-[0_1_300px] flex-col gap-4 lg:flex">
      <section className="flex flex-col gap-3 rounded-card bg-surface p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base">Hari ini</h2>
            <div className="text-caption text-neutral-800">
              {tanggal(hariIni, { weekday: 'short', day: 'numeric', month: 'short' })} · {list.length} jadwal ambil & kirim
            </div>
          </div>
          <button type="button" onClick={onHide} aria-label="Sembunyikan panel" title="Sembunyikan panel"
            className="btn btn-icon size-9 min-h-0 shrink-0 hover:bg-accent-100"><X size={16} {...ICON} /></button>
        </div>
        {list.length === 0
          ? <p className="m-0 text-sm text-neutral-800">Tidak ada jadwal ambil atau kirim hari ini.</p>
          : (
            <ol className="m-0 flex list-none flex-col gap-0.5 p-0">
              {list.slice(0, 6).map((o) => (
                <li key={o.id}>
                  <Link href={`/pesanan/${o.id}`} onClick={rememberList}
                    className="grid grid-cols-[46px_minmax(0,1fr)_auto] items-center gap-2 rounded-md p-2 text-ink no-underline hover:bg-accent-100 hover:text-ink">
                    <span className="text-sm font-extrabold">{jam(o.jam_ambil) || '—'}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold leading-snug">{o.customer_nama}</span>
                      <span className="block truncate text-xs leading-snug text-neutral-800">{CARA_TERIMA[o.cara_terima]} · {itemTeks(o.id)}</span>
                    </span>
                    <span className={cx('tag text-xs', TONE_HARI_INI[o.status] ?? 'bg-neutral-200 text-neutral-800')}>{ORDER_STATUS[o.status]}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        {list.length > 6 && <Link href="/rekap" className="btn btn-ghost self-start">{list.length - 6} jadwal lainnya di Rekap →</Link>}
      </section>

      <section className="flex flex-col gap-3 rounded-card bg-surface p-4">
        <div>
          <h2 className="text-base">Progres batch</h2>
          <div className="text-caption text-neutral-800">{batch.nama}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-accent-100 px-3 py-2.5">
            <div className="text-xs font-bold text-accent-800">{hari == null || hari >= 0 ? 'Tutup dalam' : 'Sudah ditutup'}</div>
            <div className="text-section font-extrabold text-accent-900">
              {hari == null ? '—' : hari > 0 ? `${hari} hari` : hari === 0 ? 'Hari ini' : tanggal(batch.tanggal_tutup, { day: 'numeric', month: 'short' })}
            </div>
          </div>
          <div className="rounded-lg bg-sage-100 px-3 py-2.5">
            <div className="text-xs font-bold text-sage-800">Pesanan masuk</div>
            <div className="text-section font-extrabold text-sage-900">{jumlah}</div>
          </div>
        </div>
        {kuota.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <div className="text-caption font-bold">Kuota terisi</div>
            {kuota.map((q) => (
              <div key={q.id} className="flex flex-col gap-1">
                <div className="flex justify-between gap-2 text-caption">
                  <span className="min-w-0 truncate font-semibold">{q.nama}</span>
                  <span className={cx('whitespace-nowrap font-bold', q.over && 'text-accent-700')}>{q.used} / {q.k}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-accent-100" role="presentation">
                  <div className={cx('h-full rounded-full', q.over || q.used / q.k > 0.85 ? 'bg-accent' : 'bg-sage-500')} style={{ width: `${q.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
        <LinkButton href="/batch" variant="secondary" className="self-start">Kelola batch</LinkButton>
      </section>
    </aside>
  )
}
