'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Copy, Download, Printer } from 'lucide-react'
import type { CaraTerima, OrderSummary } from '@/lib/types'
import { CARA_TERIMA } from '@/lib/types'
import { fetchBatchItems, fetchBatchOrders, rekapLaba, rekapProduksi, ringkasan, setOrderStatus, terimaTunaiSelesai, type ItemWithOrder } from '@/lib/data'
import { exportLaba, exportRekap } from '@/lib/export'
import { errMsg, jam, rupiah, tanggal } from '@/lib/format'
import { useBatch } from '@/components/batch-context'
import { BatchPicker } from '@/components/app-shell'
import { Alert, BayarBadge, Button, Empty, ICON, Loading, OrderStatusBadge, PageHeader, Pager, cx, paginate, useConfirm } from '@/components/ui'

const CARA_URUT: Record<CaraTerima, number> = { pickup: 0, antar: 1, kurir: 2 }

export default function RekapPage() {
  const { batch, batchId, loading } = useBatch()
  const [data, setData] = useState<{ batchId: string; orders: OrderSummary[]; items: ItemWithOrder[] } | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [hideDone, setHideDone] = useState(false)
  const [per, setPer] = useState(10)
  const [pageState, setPageState] = useState({ key: '', n: 1 })
  const [confirm, confirmDialog] = useConfirm()

  const load = useCallback(async () => {
    if (!batchId) return
    try {
      const [o, i] = await Promise.all([fetchBatchOrders(batchId), fetchBatchItems(batchId)])
      setData({ batchId, orders: o, items: i })
    } catch (e) { setError(errMsg(e)) }
  }, [batchId])

  useEffect(() => { load() }, [load])

  const orders = data?.batchId === batchId ? data.orders : null
  const items = useMemo(() => (data?.batchId === batchId ? data.items : []), [data, batchId])

  const rekap = useMemo(() => rekapProduksi(items), [items])
  const sum = useMemo(() => ringkasan(orders ?? []), [orders])
  const laba = useMemo(() => rekapLaba(items), [items])
  const totalQty = rekap.reduce((s, r) => s + r.qty, 0)

  const itemsByOrder = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of items) m.set(i.order_id, [m.get(i.order_id), `${i.nama_produk_snapshot} ×${i.qty}${i.catatan ? ` (${i.catatan})` : ''}`].filter(Boolean).join(', '))
    return m
  }, [items])

  // Daftar pengambilan: urut tanggal → cara terima → jam, lalu dipotong per halaman dan dikelompokkan
  const list = useMemo(() => (orders ?? [])
    .filter((o) => o.status !== 'dibatalkan' && !(hideDone && o.status === 'selesai'))
    .sort((a, b) => (a.tanggal_ambil ?? '9999').localeCompare(b.tanggal_ambil ?? '9999')
      || CARA_URUT[a.cara_terima] - CARA_URUT[b.cara_terima]
      || (a.jam_ambil ?? '99').localeCompare(b.jam_ambil ?? '99')), [orders, hideDone])

  const filterKey = [batchId, hideDone, per].join('|')
  const pg = paginate(list, pageState.key === filterKey ? pageState.n : 1, per)
  const setPage = (n: number) => setPageState({ key: filterKey, n })

  const groups = useMemo(() => {
    const byDate = new Map<string, Map<CaraTerima, OrderSummary[]>>()
    for (const o of pg.shown) {
      const d = o.tanggal_ambil ?? ''
      if (!byDate.has(d)) byDate.set(d, new Map())
      const m = byDate.get(d)!
      m.set(o.cara_terima, [...(m.get(o.cara_terima) ?? []), o])
    }
    return [...byDate.entries()].map(([d, m]) => ({
      tanggal: d,
      cara: (['pickup', 'antar', 'kurir'] as CaraTerima[]).filter((c) => m.has(c)).map((c) => ({ cara: c, orders: m.get(c)! })),
    }))
  }, [pg.shown])

  async function copyRekap() {
    const text = `Rekap produksi — ${batch?.nama}\n` + rekap.map((r) => `${r.nama}: ${r.qty}`).join('\n') + `\nTotal: ${totalQty}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { setError('Gagal menyalin ke clipboard.') }
  }

  async function act(fn: () => Promise<unknown>) {
    setError('')
    try { await fn() } catch (e) { setError(errMsg(e).replace('KONFLIK: ', '')) }
    load()
  }

  if (loading) return <Loading />
  if (!batch) return <><PageHeader title="Rekap" /><Empty title="Belum ada batch PO" /></>

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Rekap" kicker={batch.nama} subtitle={<>Ambil/produksi {tanggal(batch.tanggal_ambil)}</>}
        action={<div className="no-print w-full md:w-auto"><BatchPicker /></div>} />
      {error && <Alert>{error}</Alert>}

      {!orders ? <Loading /> : (
        <>
          <div className="flex flex-wrap items-stretch gap-4">
            {/* Rekap produksi */}
            <section className="flex min-w-0 flex-[3_1_420px] flex-col gap-4 rounded-card bg-surface p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-section">Rekap produksi</h2>
                <span className="text-sm text-neutral-800">Total <b className="text-section text-ink">{totalQty}</b> pcs</span>
              </div>
              {rekap.length === 0 ? <p className="m-0 text-neutral-800">Belum ada item.</p> : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-3 gap-y-4">
                  {rekap.map((r, i) => (
                    <div key={r.nama} className="flex items-center gap-3">
                      <span className={cx('grid size-[62px] shrink-0 place-items-center rounded-full text-section font-bold',
                        i % 2 ? 'bg-sage-300 text-sage-900' : 'bg-accent-300 text-accent-900')}>{r.qty}</span>
                      <span className="font-semibold leading-snug">{r.nama}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="m-0 text-sm text-neutral-800">Pesanan Dibatalkan tidak dihitung.</p>
              {rekap.length > 0 && (
                <div className="no-print flex flex-wrap gap-2">
                  <Button variant="secondary" className="min-h-[44px]" onClick={copyRekap}><Copy size={16} {...ICON} />{copied ? 'Tersalin' : 'Salin'}</Button>
                  <Button variant="secondary" className="min-h-[44px]" onClick={() => window.print()}><Printer size={16} {...ICON} />Cetak</Button>
                  <Button variant="secondary" className="min-h-[44px]" onClick={() => exportRekap(rekap, `rekap-${batch.nama}`, 'xlsx')}><Download size={16} {...ICON} />Excel</Button>
                  <Button variant="ghost" className="min-h-[44px]" onClick={() => exportRekap(rekap, `rekap-${batch.nama}`, 'csv')}>CSV</Button>
                </div>
              )}
            </section>

            {/* Ringkasan keuangan */}
            <section className="flex min-w-0 flex-[2_1_300px] flex-col gap-4 rounded-card bg-sage-700 p-6 text-sage-100">
              <h2 className="text-section">Ringkasan keuangan</h2>
              <dl className="m-0 flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2"><dt>Total pesanan ({sum.jumlah})</dt><dd className="m-0 text-section font-bold">{rupiah(sum.total)}</dd></div>
                <div className="flex items-baseline justify-between gap-2"><dt>Total terbayar</dt><dd className="m-0 text-section font-bold">{rupiah(sum.terbayar)}</dd></div>
                <div className="flex items-baseline justify-between gap-2"><dt>Belum terbayar</dt><dd className="m-0 text-section font-bold text-accent-300">{rupiah(sum.sisa)}</dd></div>
                <div className="flex items-baseline justify-between gap-2 border-t border-sage-600 pt-2"><dt>Laba kotor{laba.total.tanpaHpp > 0 && '*'}</dt><dd className="m-0 text-section font-bold">{rupiah(laba.total.laba)}</dd></div>
              </dl>
              <div className="mt-auto grid grid-cols-3 gap-2">
                {([['Lunas', sum.lunas], ['DP', sum.dp], ['Belum bayar', sum.belum]] as const).map(([l, n]) => (
                  <div key={l} className="rounded-lg bg-sage-800 p-3 text-center">
                    <div className="text-stat font-bold leading-tight">{n}</div>
                    <div className="text-sm">{l}</div>
                  </div>
                ))}
              </div>
              {sum.dibatalkan > 0 && <div className="text-sm">{sum.dibatalkan} pesanan dibatalkan (tidak dihitung).</div>}
            </section>
          </div>

          {laba.produk.length > 0 && (
            <LabaSection laba={laba} onExport={(f) => exportLaba(laba, `laba-${batch.nama}`, f)} />
          )}

          {/* Daftar pengambilan/pengantaran */}
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2>Daftar pengambilan &amp; pengantaran</h2>
              <label className="no-print flex min-h-[44px] cursor-pointer items-center gap-2.5">
                <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="size-5 accent-accent" />
                Sembunyikan yang selesai
              </label>
            </div>
            {list.length === 0 ? <Empty title="Tidak ada pesanan" /> : groups.map((g) => (
              <div key={g.tanggal} className="flex flex-col gap-3">
                <h3 className="mt-2">{g.tanggal ? tanggal(g.tanggal, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Tanpa tanggal'}</h3>
                {g.cara.map((c) => (
                  <div key={c.cara} className="rounded-tile bg-surface px-5 pb-2 pt-3">
                    <div className="flex items-center gap-2 pb-2 pt-1 font-bold">
                      {CARA_TERIMA[c.cara]} <span className="tag bg-sage-100 text-caption font-normal text-sage-800">{c.orders.length}</span>
                    </div>
                    {c.orders.map((o) => {
                      const done = o.status === 'selesai'
                      const sisa = Number(o.sisa)
                      return (
                        <div key={o.id} className={cx('flex flex-wrap items-start gap-3 border-t border-divider py-3', done && 'text-neutral-800')}>
                          <div className="min-w-0 flex-[1_1_260px]">
                            <div className="flex flex-wrap items-center gap-2">
                              {o.jam_ambil && <span className="font-bold text-accent-700">{jam(o.jam_ambil)}</span>}
                              <Link href={`/pesanan/${o.id}`} className="font-bold text-ink no-underline hover:underline">{o.customer_nama}</Link>
                              <OrderStatusBadge status={o.status} className="bg-neutral-200 text-caption" />
                            </div>
                            <div className="text-sm">{itemsByOrder.get(o.id)}</div>
                            <div className="text-sm text-neutral-800">{[o.alamat, o.customer_wa].filter(Boolean).join(' · ')}</div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <BayarBadge status={o.status_bayar} />
                            {sisa > 0 && <span className="text-sm font-bold text-accent-800">tagih {rupiah(sisa)}</span>}
                          </div>
                          {!done && (
                            <div className="no-print flex w-full flex-wrap justify-end gap-2">
                              {sisa > 0 && (
                                <Button variant="secondary" className="min-h-[44px]"
                                  onClick={async () => (await confirm({ title: `Terima tunai ${rupiah(sisa)}?`, confirmLabel: 'Catat & selesai', body: `Pembayaran tunai untuk ${o.customer_nama} dicatat, lalu pesanan ditandai Selesai.` })) && act(() => terimaTunaiSelesai(o))}>
                                  Terima tunai &amp; selesai
                                </Button>
                              )}
                              <Button variant={sisa > 0 ? 'ghost' : 'primary'} className="min-h-[44px]"
                                onClick={() => act(() => setOrderStatus(o.id, 'selesai', o.updated_at))}>
                                Tandai selesai
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            ))}
            {list.length > 0 && (
              <Pager page={pg.page} pages={pg.pages} per={per} onPage={setPage} onPer={setPer}
                info={`${pg.info} pesanan`} label="Halaman daftar pengambilan" />
            )}
          </section>
        </>
      )}
      {confirmDialog}
    </div>
  )
}

function LabaSection({ laba, onExport }: { laba: ReturnType<typeof rekapLaba>; onExport: (f: 'xlsx' | 'csv') => void }) {
  const t = laba.total
  const terbaik = laba.produk.filter((p) => p.qty > p.tanpaHpp)
  const marginTertinggi = [...terbaik].sort((a, b) => b.margin - a.margin)[0]
  const rugi = terbaik.filter((p) => p.laba < 0)
  const tanpaHpp = laba.produk.filter((p) => p.tanpaHpp > 0)

  return (
    <section className="flex flex-col gap-4 rounded-card bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-section">Laba kotor</h2>
        <span className="text-sm text-neutral-800">
          <b className="text-section text-ink">{rupiah(t.laba)}</b> · margin {t.margin}%
        </span>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2">
        {([['Pendapatan produk', t.pendapatan], ['Total HPP', t.hpp], ['Laba kotor', t.laba]] as const).map(([l, n]) => (
          <div key={l} className="rounded-lg bg-bg p-3">
            <div className="text-sm text-neutral-800">{l}</div>
            <div className={cx('text-section font-bold', n < 0 && 'text-accent-800')}>{rupiah(n)}</div>
          </div>
        ))}
      </div>

      <div className="-mx-6 overflow-x-auto px-6">
        <table className="w-full min-w-[520px] border-collapse text-left tabular-nums">
          <thead>
            <tr className="text-sm text-neutral-800">
              <th className="py-2 pr-3 font-semibold">Produk</th>
              <th className="py-2 pr-3 text-right font-semibold">Qty</th>
              <th className="py-2 pr-3 text-right font-semibold">Pendapatan</th>
              <th className="py-2 pr-3 text-right font-semibold">HPP</th>
              <th className="py-2 pr-3 text-right font-semibold">Laba</th>
              <th className="py-2 text-right font-semibold">Margin</th>
            </tr>
          </thead>
          <tbody>
            {laba.produk.map((p) => {
              const kosong = p.tanpaHpp === p.qty
              return (
                <tr key={p.nama} className="border-t border-divider">
                  <td className="py-2 pr-3 font-semibold">{p.nama}</td>
                  <td className="py-2 pr-3 text-right">{p.qty}</td>
                  <td className="py-2 pr-3 text-right">{rupiah(p.pendapatan + p.pendapatanTanpaHpp)}</td>
                  <td className="py-2 pr-3 text-right">{kosong ? '—' : rupiah(p.hpp)}{p.tanpaHpp > 0 && !kosong && '*'}</td>
                  <td className={cx('py-2 pr-3 text-right font-bold', p.laba < 0 && 'text-accent-800')}>{kosong ? '—' : rupiah(p.laba)}</td>
                  <td className="py-2 text-right">{kosong ? '—' : `${p.margin}%`}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
        {marginTertinggi && <li>Margin tertinggi: <b>{marginTertinggi.nama}</b> ({marginTertinggi.margin}%).</li>}
        {rugi.length > 0 && <li className="font-bold text-accent-800">Dijual di bawah modal: {rugi.map((p) => p.nama).join(', ')}. Pertimbangkan menaikkan harga.</li>}
        {tanpaHpp.length > 0 && (
          <li className="text-neutral-800">
            * {t.tanpaHpp} pcs ({rupiah(t.pendapatanTanpaHpp)}) belum punya HPP dan tidak dihitung dalam laba: {tanpaHpp.map((p) => p.nama).join(', ')}.{' '}
            <Link href="/produk" className="font-bold text-ink">Isi HPP di Produk</Link>
          </li>
        )}
        <li className="text-neutral-800">Laba kotor = pendapatan produk − HPP. Belum termasuk ongkir dan biaya tetap (sewa, gaji, listrik). Pesanan Dibatalkan tidak dihitung.</li>
      </ul>

      <div className="no-print flex flex-wrap gap-2">
        <Button variant="secondary" className="min-h-[44px]" onClick={() => onExport('xlsx')}><Download size={16} {...ICON} />Excel</Button>
        <Button variant="ghost" className="min-h-[44px]" onClick={() => onExport('csv')}>CSV</Button>
      </div>
    </section>
  )
}
