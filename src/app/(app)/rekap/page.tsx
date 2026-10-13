'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Copy, Download, Printer } from 'lucide-react'
import type { CaraTerima, OrderSummary } from '@/lib/types'
import { CARA_TERIMA } from '@/lib/types'
import { fetchBatchItems, fetchBatchOrders, rekapProduksi, ringkasan, setOrderStatus, terimaTunaiSelesai, type ItemWithOrder } from '@/lib/data'
import { exportRekap } from '@/lib/export'
import { errMsg, jam, rupiah, tanggal } from '@/lib/format'
import { useBatch } from '@/components/batch-context'
import { BatchPicker } from '@/components/app-shell'
import { Alert, BayarBadge, Button, Card, Empty, Loading, OrderStatusBadge, PageHeader, cx } from '@/components/ui'

export default function RekapPage() {
  const { batch, batchId, loading } = useBatch()
  const [data, setData] = useState<{ batchId: string; orders: OrderSummary[]; items: ItemWithOrder[] } | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [hideDone, setHideDone] = useState(false)

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

  const rekap = useMemo(() => rekapProduksi(items), [items])
  const sum = useMemo(() => ringkasan(orders ?? []), [orders])
  const totalQty = rekap.reduce((s, r) => s + r.qty, 0)

  const itemsByOrder = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of items) m.set(i.order_id, [m.get(i.order_id), `${i.nama_produk_snapshot} ×${i.qty}${i.catatan ? ` (${i.catatan})` : ''}`].filter(Boolean).join(', '))
    return m
  }, [items])

  // Daftar pengambilan: per tanggal → per cara terima
  const groups = useMemo(() => {
    const aktif = (orders ?? []).filter((o) => o.status !== 'dibatalkan' && !(hideDone && o.status === 'selesai'))
    const byDate = new Map<string, Map<CaraTerima, OrderSummary[]>>()
    for (const o of aktif) {
      const d = o.tanggal_ambil ?? ''
      if (!byDate.has(d)) byDate.set(d, new Map())
      const byCara = byDate.get(d)!
      byCara.set(o.cara_terima, [...(byCara.get(o.cara_terima) ?? []), o])
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => (a || '9999').localeCompare(b || '9999'))
      .map(([d, m]) => ({
        tanggal: d,
        cara: (['pickup', 'antar', 'kurir'] as CaraTerima[]).filter((c) => m.has(c)).map((c) => ({
          cara: c,
          orders: m.get(c)!.sort((a, b) => (a.jam_ambil ?? '99').localeCompare(b.jam_ambil ?? '99')),
        })),
      }))
  }, [orders, hideDone])

  async function copyRekap() {
    const text = `Rekap produksi — ${batch?.nama}\n` + rekap.map((r) => `${r.nama}: ${r.qty}`).join('\n') + `\nTotal: ${totalQty}`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { setError('Gagal menyalin ke clipboard.') }
  }

  async function act(fn: () => Promise<unknown>) {
    setError('')
    try { await fn() } catch (e) { setError(errMsg(e).replace('KONFLIK: ', '')) }
    load()
  }

  if (loading) return <Loading />
  if (!batch) return <><PageHeader title="Rekap" /><Empty>Belum ada batch PO.</Empty></>

  return (
    <>
      <PageHeader title="Rekap" subtitle={<>Ambil/produksi {tanggal(batch.tanggal_ambil)}</>}
        action={<div className="no-print w-full md:w-auto"><BatchPicker /></div>} />
      {error && <div className="mb-4"><Alert tone="bad">{error}</Alert></div>}

      {!orders ? <Loading /> : (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Rekap produksi */}
            <Card className="p-4">
              <h2 className="mb-3 text-xl font-bold">Rekap produksi</h2>
              {rekap.length === 0 ? <p className="text-muted">Belum ada item.</p> : (
                <table className="w-full">
                  <thead className="text-sm text-muted">
                    <tr className="border-b border-line"><th className="py-2 text-left font-semibold">Produk</th><th className="py-2 text-right font-semibold">Qty</th></tr>
                  </thead>
                  <tbody>
                    {rekap.map((r) => (
                      <tr key={r.nama} className="border-b border-line">
                        <td className="py-2.5">{r.nama}</td>
                        <td className="num py-2.5 text-right text-lg font-bold">{r.qty}</td>
                      </tr>
                    ))}
                    <tr><td className="py-2.5 font-bold">Total</td><td className="num py-2.5 text-right text-lg font-bold">{totalQty}</td></tr>
                  </tbody>
                </table>
              )}
              <p className="mt-2 text-sm text-muted">Pesanan Dibatalkan tidak dihitung.</p>
              {rekap.length > 0 && (
                <div className="no-print mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={copyRekap}><Copy size={16} aria-hidden />{copied ? 'Tersalin' : 'Salin'}</Button>
                  <Button variant="secondary" onClick={() => window.print()}><Printer size={16} aria-hidden />Cetak</Button>
                  <Button variant="secondary" onClick={() => exportRekap(rekap, `rekap-${batch.nama}`, 'xlsx')}><Download size={16} aria-hidden />Excel</Button>
                  <Button variant="ghost" onClick={() => exportRekap(rekap, `rekap-${batch.nama}`, 'csv')}>CSV</Button>
                </div>
              )}
            </Card>

            {/* Ringkasan keuangan */}
            <Card className="p-4">
              <h2 className="mb-3 text-xl font-bold">Ringkasan keuangan</h2>
              <dl className="num space-y-2">
                <div className="flex justify-between"><dt className="text-muted">Total pesanan ({sum.jumlah})</dt><dd className="text-lg font-bold">{rupiah(sum.total)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Total terbayar</dt><dd className="text-lg font-bold text-ok">{rupiah(sum.terbayar)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted">Belum terbayar</dt><dd className={cx('text-lg font-bold', sum.sisa > 0 && 'text-bad')}>{rupiah(sum.sisa)}</dd></div>
              </dl>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {([['lunas', sum.lunas], ['dp', sum.dp], ['belum', sum.belum]] as const).map(([s, n]) => (
                  <div key={s} className="rounded-xl bg-surface-2 p-2">
                    <div className="num text-2xl font-bold">{n}</div>
                    <BayarBadge status={s} />
                  </div>
                ))}
              </div>
              {sum.dibatalkan > 0 && <p className="mt-3 text-sm text-muted">{sum.dibatalkan} pesanan dibatalkan (tidak dihitung).</p>}
            </Card>
          </div>

          {/* Daftar pengambilan/pengantaran */}
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-bold md:text-2xl">Daftar pengambilan & pengantaran</h2>
              <label className="no-print flex min-h-11 items-center gap-2">
                <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} className="size-5 accent-[var(--accent)]" />
                Sembunyikan yang selesai
              </label>
            </div>
            {groups.length === 0 ? <Empty>Tidak ada pesanan.</Empty> : groups.map((g) => (
              <div key={g.tanggal} className="mb-6">
                <h3 className="mb-2 text-lg font-bold">{g.tanggal ? tanggal(g.tanggal, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Tanpa tanggal'}</h3>
                <div className="space-y-4">
                  {g.cara.map((c) => (
                    <Card key={c.cara}>
                      <div className="border-b border-line px-4 py-2.5 font-semibold">{CARA_TERIMA[c.cara]} <span className="text-muted">({c.orders.length})</span></div>
                      <ul className="divide-y divide-line">
                        {c.orders.map((o) => (
                          <li key={o.id} className={cx('flex flex-wrap items-start gap-3 px-4 py-3', o.status === 'selesai' && 'opacity-60')}>
                            <div className="min-w-0 flex-1 basis-60">
                              <div className="flex flex-wrap items-center gap-2">
                                {o.jam_ambil && <span className="num font-bold">{jam(o.jam_ambil)}</span>}
                                <Link href={`/pesanan/${o.id}`} className="font-semibold hover:underline">{o.customer_nama}</Link>
                                <OrderStatusBadge status={o.status} />
                              </div>
                              <div className="text-sm">{itemsByOrder.get(o.id)}</div>
                              {o.alamat && <div className="text-sm text-muted">{o.alamat}</div>}
                              {o.customer_wa && <div className="text-sm text-muted">{o.customer_wa}</div>}
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <BayarBadge status={o.status_bayar} />
                              {Number(o.sisa) > 0 && <span className="num text-sm font-semibold text-bad">tagih {rupiah(o.sisa)}</span>}
                            </div>
                            {o.status !== 'selesai' && (
                              <div className="no-print flex w-full flex-wrap justify-end gap-2">
                                {Number(o.sisa) > 0 && (
                                  <Button variant="secondary" onClick={() => window.confirm(`Catat tunai ${rupiah(o.sisa)} dan tandai Selesai?`) && act(() => terimaTunaiSelesai(o))}>
                                    Terima tunai & selesai
                                  </Button>
                                )}
                                <Button variant={Number(o.sisa) > 0 ? 'ghost' : 'primary'} onClick={() => act(() => setOrderStatus(o.id, 'selesai', o.updated_at))}>
                                  Tandai selesai
                                </Button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </section>
        </div>
      )}
    </>
  )
}
