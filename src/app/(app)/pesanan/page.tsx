'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react'
import type { CaraTerima, OrderStatus, OrderSummary } from '@/lib/types'
import { CARA_TERIMA, ORDER_STATUS, STATUS_BAYAR } from '@/lib/types'
import { fetchBatchItems, fetchBatchOrders, rekapProduksi, ringkasan, type ItemWithOrder } from '@/lib/data'
import { exportOrders } from '@/lib/export'
import { errMsg, jam, rupiah, tanggal } from '@/lib/format'
import { useBatch } from '@/components/batch-context'
import { BatchPicker } from '@/components/app-shell'
import { Alert, BayarBadge, Button, Card, Chip, Empty, LinkButton, Loading, OrderStatusBadge, PageHeader, cx, inputCls } from '@/components/ui'

type BayarFilter = '' | 'belum' | 'dp' | 'lunas' | 'belum_lunas'
const BAYAR_LABEL: Record<Exclude<BayarFilter, ''>, string> = { ...STATUS_BAYAR, belum_lunas: 'Belum lunas' }
const PER_PAGE = 20

export default function PesananPage() {
  const router = useRouter()
  const { batch, batchId, loading: batchLoading } = useBatch()
  const [data, setData] = useState<{ batchId: string; orders: OrderSummary[]; items: ItemWithOrder[] } | null>(null)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [bayar, setBayar] = useState<BayarFilter>('')
  const [status, setStatus] = useState<OrderStatus | ''>('')
  const [cara, setCara] = useState<CaraTerima | ''>('')
  const [pageState, setPageState] = useState({ key: '', n: 1 })

  const load = useCallback(async () => {
    if (!batchId) return
    try {
      const [o, i] = await Promise.all([fetchBatchOrders(batchId), fetchBatchItems(batchId)])
      setData({ batchId, orders: o, items: i })
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
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  // Halaman kembali ke 1 setiap kali filter atau batch berubah
  const filterKey = [batchId, q, bayar, status, cara].join('|')
  const page = pageState.key === filterKey ? Math.min(pageState.n, pages) : 1
  const setPage = (n: number) => setPageState({ key: filterKey, n })
  const shown = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const hasFilter = q || bayar || status || cara
  const reset = () => { setQ(''); setBayar(''); setStatus(''); setCara('') }

  if (batchLoading) return <Loading />
  if (!batch) {
    return (
      <>
        <PageHeader title="Pesanan" />
        <Empty>
          Belum ada batch PO.<br />
          <LinkButton href="/batch" className="mt-4">Buat batch pertama</LinkButton>
        </Empty>
      </>
    )
  }

  const cards = [
    { label: 'Total pesanan', value: rupiah(sum.total), sub: `${sum.jumlah} pesanan aktif`, onClick: reset, active: !hasFilter },
    { label: 'Terbayar', value: rupiah(sum.terbayar), sub: `${sum.lunas} lunas`, onClick: () => { reset(); setBayar('lunas') }, active: bayar === 'lunas' },
    { label: 'Belum terbayar', value: rupiah(sum.sisa), sub: `${sum.dp} DP · ${sum.belum} belum bayar`, onClick: () => { reset(); setBayar('belum_lunas') }, active: bayar === 'belum_lunas', tone: sum.sisa > 0 ? 'text-bad' : '' },
    { label: 'Pesanan belum lunas', value: String(sum.dp + sum.belum), sub: 'DP + belum bayar', onClick: () => { reset(); setBayar('belum_lunas') }, active: bayar === 'belum_lunas' },
  ]

  return (
    <>
      <PageHeader title="Pesanan" subtitle={<>Ambil/produksi {tanggal(batch.tanggal_ambil)}</>}
        action={<div className="w-full md:w-auto"><BatchPicker /></div>} />

      {error && <div className="mb-4"><Alert tone="bad">{error}</Alert></div>}

      {/* 1. Kartu ringkasan */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <button key={c.label} type="button" onClick={c.onClick}
            className={cx('rounded-2xl border bg-surface p-4 text-left transition-colors hover:border-accent',
              c.active ? 'border-accent' : 'border-line')}>
            <div className="text-sm font-medium text-muted">{c.label}</div>
            <div className={cx('num mt-1 text-xl font-bold md:text-[28px] md:leading-9', c.tone)}>{c.value}</div>
            <div className="mt-0.5 text-sm text-muted">{c.sub}</div>
          </button>
        ))}
      </div>

      {/* 2. Rekap produksi singkat */}
      <Card className="mb-5 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-bold">Rekap produksi</h2>
          <Link href="/rekap" className="text-sm font-semibold text-accent">Lihat rekap lengkap →</Link>
        </div>
        {rekap.length === 0 ? <p className="text-muted">Belum ada item.</p> : (
          <div className="flex flex-wrap gap-2">
            {rekap.map((r) => (
              <span key={r.nama} className="rounded-xl bg-surface-2 px-3 py-1.5">
                {r.nama} <b className="num">×{r.qty}</b>
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* 3. Filter */}
      <div className="mb-3 grid gap-2 md:grid-cols-[1fr_auto_auto_auto]">
        <label className="relative block">
          <span className="sr-only">Cari nama atau nomor WA</span>
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau nomor WA" className={cx(inputCls, 'pl-10')} />
        </label>
        <div className="grid grid-cols-3 gap-2 md:contents">
          <select aria-label="Status bayar" value={bayar} onChange={(e) => setBayar(e.target.value as BayarFilter)} className={inputCls}>
            <option value="">Status bayar</option>
            {Object.entries(BAYAR_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select aria-label="Status pesanan" value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)} className={inputCls}>
            <option value="">Status pesanan</option>
            {Object.entries(ORDER_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select aria-label="Cara terima" value={cara} onChange={(e) => setCara(e.target.value as CaraTerima)} className={inputCls}>
            <option value="">Cara terima</option>
            {Object.entries(CARA_TERIMA).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      {hasFilter && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {q && <Chip onRemove={() => setQ('')}>“{q}”</Chip>}
          {bayar && <Chip onRemove={() => setBayar('')}>{BAYAR_LABEL[bayar]}</Chip>}
          {status && <Chip onRemove={() => setStatus('')}>{ORDER_STATUS[status]}</Chip>}
          {cara && <Chip onRemove={() => setCara('')}>{CARA_TERIMA[cara]}</Chip>}
          <button type="button" onClick={reset} className="min-h-9 px-2 text-sm font-semibold text-accent">Reset filter</button>
        </div>
      )}

      {/* 4. Daftar */}
      {!orders ? <Loading /> : filtered.length === 0 ? (
        <Empty>{orders.length === 0 ? 'Belum ada pesanan di batch ini.' : 'Tidak ada pesanan yang cocok dengan filter.'}</Empty>
      ) : (
        <>
          {/* HP: kartu */}
          <div className="space-y-2 md:hidden">
            {shown.map((o) => (
              <Link key={o.id} href={`/pesanan/${o.id}`} className={cx('block rounded-2xl border border-line bg-surface p-4', o.status === 'dibatalkan' && 'opacity-60')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold">{o.customer_nama}</div>
                    <div className="text-sm text-muted">
                      {CARA_TERIMA[o.cara_terima]} · {tanggal(o.tanggal_ambil, { day: 'numeric', month: 'short' })}{o.jam_ambil ? ` ${jam(o.jam_ambil)}` : ''}
                    </div>
                  </div>
                  <BayarBadge status={o.status_bayar} dibatalkan={o.status === 'dibatalkan'} />
                </div>
                <div className="mt-3 flex items-end justify-between gap-3">
                  <OrderStatusBadge status={o.status} />
                  <div className="text-right">
                    <div className="num font-bold">{rupiah(o.total)}</div>
                    {Number(o.sisa) > 0 && o.status !== 'dibatalkan' && <div className="num text-sm text-bad">sisa {rupiah(o.sisa)}</div>}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop: tabel */}
          <Card className="hidden overflow-x-auto md:block">
            <table className="w-full text-left">
              <thead className="border-b border-line text-sm text-muted">
                <tr>
                  <th className="sticky left-0 bg-surface px-4 py-3 font-semibold">Pembeli</th>
                  <th className="px-4 py-3 font-semibold">Ambil</th>
                  <th className="px-4 py-3 font-semibold">Cara terima</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Total</th>
                  <th className="px-4 py-3 text-right font-semibold">Sisa</th>
                  <th className="px-4 py-3 font-semibold">Bayar</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((o) => (
                  <tr key={o.id} onClick={() => router.push(`/pesanan/${o.id}`)}
                    className={cx('cursor-pointer border-b border-line last:border-0 even:bg-surface-2/50 hover:bg-accent-soft', o.status === 'dibatalkan' && 'text-muted')}>
                    <td className="sticky left-0 bg-inherit px-4 py-3">
                      <Link href={`/pesanan/${o.id}`} className="font-semibold hover:underline" onClick={(e) => e.stopPropagation()}>{o.customer_nama}</Link>
                      <div className="text-sm text-muted">{o.customer_wa}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{tanggal(o.tanggal_ambil, { day: 'numeric', month: 'short' })} {jam(o.jam_ambil)}</td>
                    <td className="whitespace-nowrap px-4 py-3">{CARA_TERIMA[o.cara_terima]}</td>
                    <td className="px-4 py-3"><OrderStatusBadge status={o.status} /></td>
                    <td className="num whitespace-nowrap px-4 py-3 text-right font-semibold">{rupiah(o.total)}</td>
                    <td className={cx('num whitespace-nowrap px-4 py-3 text-right', Number(o.sisa) > 0 && o.status !== 'dibatalkan' && 'text-bad')}>
                      {o.status === 'dibatalkan' ? '—' : rupiah(o.sisa)}
                    </td>
                    <td className="px-4 py-3"><BayarBadge status={o.status_bayar} dibatalkan={o.status === 'dibatalkan'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted">
              {filtered.length} pesanan{pages > 1 && ` · menampilkan ${(page - 1) * PER_PAGE + 1}–${Math.min(page * PER_PAGE, filtered.length)}`}
            </div>
            {pages > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)} aria-label="Halaman sebelumnya"><ChevronLeft size={18} /></Button>
                <span className="num px-2 text-sm">{page} / {pages}</span>
                <Button variant="secondary" disabled={page === pages} onClick={() => setPage(page + 1)} aria-label="Halaman berikutnya"><ChevronRight size={18} /></Button>
              </div>
            )}
          </div>
        </>
      )}

      {orders && orders.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => exportOrders(filtered, items, `pesanan-${batch.nama}`, 'xlsx')}>
            <Download size={18} aria-hidden />Ekspor Excel ({filtered.length})
          </Button>
          <Button variant="ghost" onClick={() => exportOrders(filtered, items, `pesanan-${batch.nama}`, 'csv')}>Ekspor CSV</Button>
        </div>
      )}
    </>
  )
}
