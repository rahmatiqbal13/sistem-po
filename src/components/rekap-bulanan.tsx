'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { fetchSemua } from '@/lib/data'
import { downloadSheets } from '@/lib/export'
import { errMsg, rupiah, rupiahSingkat } from '@/lib/format'
import { namaBulan, rekapBulanan, type ItemBulanan, type PesananBulanan } from '@/lib/rekap-bulanan'
import { Alert, Button, Empty, ICON, Loading, cx } from './ui'

/** Rekap lintas batch per bulan: penjualan, laba kotor, tagihan, dan produk terlaris */
export function RekapBulanan() {
  const [data, setData] = useState<{ orders: PesananBulanan[]; items: ItemBulanan[] } | null>(null)
  const [error, setError] = useState('')
  const [tahun, setTahun] = useState(() => String(new Date().getFullYear()))

  useEffect(() => {
    Promise.all([fetchSemua<PesananBulanan>('order_summary', 'created_at'), fetchSemua<ItemBulanan>('order_items', 'order_id')])
      .then(([orders, items]) => setData({ orders, items }))
      .catch((e) => setError(errMsg(e)))
  }, [])

  const semua = useMemo(() => (data ? rekapBulanan(data.orders, data.items) : []), [data])
  const daftarTahun = useMemo(() => {
    const s = new Set(semua.map((b) => b.bulan.slice(0, 4)))
    s.add(String(new Date().getFullYear()))
    return [...s].sort().reverse()
  }, [semua])
  const bulan = semua.filter((b) => b.bulan.startsWith(tahun))

  if (error) return <Alert>{error}</Alert>
  if (!data) return <Loading />
  if (semua.length === 0) return <Empty title="Belum ada pesanan">Rekap bulanan muncul setelah ada pesanan tercatat.</Empty>

  const total = bulan.reduce((t, b) => ({
    pesanan: t.pesanan + b.pesanan, penjualan: t.penjualan + b.penjualan, laba: t.laba + b.laba,
    sisa: t.sisa + b.sisa, tanpaHpp: t.tanpaHpp + b.tanpaHpp,
  }), { pesanan: 0, penjualan: 0, laba: 0, sisa: 0, tanpaHpp: 0 })

  // 12 bulan penuh agar bulan tanpa pesanan tetap terlihat kosong di grafik
  const grafik = Array.from({ length: 12 }, (_, m) => {
    const k = `${tahun}-${String(m + 1).padStart(2, '0')}`
    return { bulan: k, penjualan: bulan.find((b) => b.bulan === k)?.penjualan ?? 0 }
  })
  const maks = Math.max(...grafik.map((g) => g.penjualan), 1)
  const puncak = grafik.reduce((a, b) => (b.penjualan > a.penjualan ? b : a))

  function ekspor() {
    downloadSheets([{
      nama: `Rekap ${tahun}`,
      rows: [...bulan].reverse().map((b) => ({
        'Bulan': namaBulan(b.bulan), 'Pesanan': b.pesanan, 'Qty': b.qty, 'Penjualan produk': b.penjualan, 'Ongkir': b.ongkir,
        'Terbayar': b.terbayar, 'Belum terbayar': b.sisa, 'Laba kotor': b.laba, 'Pcs tanpa HPP': b.tanpaHpp,
        'Terlaris': b.terlaris ? `${b.terlaris.nama} (${b.terlaris.qty})` : '',
      })),
    }], `rekap-bulanan-${tahun}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <select aria-label="Pilih tahun" value={tahun} onChange={(e) => setTahun(e.target.value)} className="input min-h-[44px] w-auto">
          {daftarTahun.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {bulan.length > 0 && <Button variant="secondary" className="min-h-[44px]" onClick={ekspor}><Download size={16} {...ICON} />Excel</Button>}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3 md:gap-4">
        {([
          ['Penjualan produk', rupiah(total.penjualan), rupiahSingkat(total.penjualan), ''],
          [`Laba kotor${total.tanpaHpp ? '*' : ''}`, rupiah(total.laba), rupiahSingkat(total.laba), total.laba < 0 ? 'text-accent-800' : ''],
          ['Pesanan', String(total.pesanan), String(total.pesanan), ''],
          ['Belum terbayar', rupiah(total.sisa), rupiahSingkat(total.sisa), total.sisa > 0 ? 'text-accent-700' : ''],
        ] as const).map(([l, v, s, tone]) => (
          <div key={l} className="flex flex-col gap-1 rounded-tile bg-surface p-5">
            <span className="text-sm font-semibold text-neutral-800">{l}</span>
            <span className={cx('whitespace-nowrap text-section font-bold md:text-stat', tone)} title={v}>
              <span className="md:hidden">{s}</span><span className="hidden md:inline">{v}</span>
            </span>
          </div>
        ))}
      </div>

      {bulan.length === 0 ? <Empty title={`Belum ada pesanan di ${tahun}`} /> : (
        <>
          <section aria-labelledby="ttl-grafik" className="flex flex-col gap-4 rounded-card bg-surface p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="ttl-grafik" className="text-section">Penjualan per bulan</h2>
              <span className="text-sm text-neutral-800">Tertinggi: <b className="text-ink">{namaBulan(puncak.bulan, { month: 'long' })}</b> {rupiah(puncak.penjualan)}</span>
            </div>
            <div role="img" aria-label={`Grafik penjualan per bulan ${tahun}. Rinciannya ada di tabel di bawah.`}
              className="grid h-[180px] grid-cols-12 items-end gap-[2px] border-b border-divider">
              {grafik.map((g) => (
                <div key={g.bulan} className="group relative flex h-full items-end justify-center">
                  {g.penjualan > 0 && (
                    <div className="w-full max-w-[36px] rounded-t-[4px] bg-accent-500 transition-colors group-hover:bg-accent-700"
                      style={{ height: `${Math.max((g.penjualan / maks) * 100, 2)}%` }} />
                  )}
                  {/* Tooltip saat disorot; area sorot = seluruh kolom, lebih besar dari batangnya */}
                  <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md bg-neutral-900 px-2.5 py-1.5 text-caption text-neutral-100 shadow-md group-hover:block">
                    <div className="font-bold">{namaBulan(g.bulan)}</div>
                    <div>{rupiah(g.penjualan)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div aria-hidden="true" className="-mt-2 grid grid-cols-12 gap-[2px] text-center text-caption text-neutral-800">
              {grafik.map((g) => <span key={g.bulan}>{namaBulan(g.bulan, { month: 'narrow' })}</span>)}
            </div>
          </section>

          <section aria-labelledby="ttl-tabel-bulan" className="flex flex-col gap-3 rounded-card bg-surface p-6">
            <h2 id="ttl-tabel-bulan" className="text-section">Rincian per bulan</h2>
            <div className="-mx-6 overflow-x-auto px-6">
              <table className="w-full min-w-[720px] border-collapse text-left tabular-nums">
                <thead>
                  <tr className="text-sm text-neutral-800">
                    <th className="py-2 pr-3 font-semibold">Bulan</th>
                    <th className="py-2 pr-3 text-right font-semibold">Pesanan</th>
                    <th className="py-2 pr-3 text-right font-semibold">Penjualan</th>
                    <th className="py-2 pr-3 text-right font-semibold">Ongkir</th>
                    <th className="py-2 pr-3 text-right font-semibold">Belum terbayar</th>
                    <th className="py-2 pr-3 text-right font-semibold">Laba kotor</th>
                    <th className="py-2 font-semibold">Terlaris</th>
                  </tr>
                </thead>
                <tbody>
                  {bulan.map((b) => (
                    <tr key={b.bulan} className="border-t border-divider">
                      <td className="whitespace-nowrap py-2 pr-3 font-semibold">{namaBulan(b.bulan)}</td>
                      <td className="py-2 pr-3 text-right">{b.pesanan}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right font-bold">{rupiah(b.penjualan)}</td>
                      <td className="whitespace-nowrap py-2 pr-3 text-right">{rupiah(b.ongkir)}</td>
                      <td className={cx('whitespace-nowrap py-2 pr-3 text-right', b.sisa > 0 && 'text-accent-700')}>{rupiah(b.sisa)}</td>
                      <td className={cx('whitespace-nowrap py-2 pr-3 text-right', b.laba < 0 && 'text-accent-800')}>{rupiah(b.laba)}{b.tanpaHpp > 0 && '*'}</td>
                      <td className="py-2">{b.terlaris ? <>{b.terlaris.nama} <span className="text-neutral-800">({b.terlaris.qty})</span></> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm text-neutral-800">
              <li>Bulan dihitung dari tanggal ambil pesanan. Pesanan Dibatalkan tidak dihitung.</li>
              <li>Penjualan = harga produk × qty, tanpa ongkir. Laba kotor = penjualan − HPP.</li>
              {total.tanpaHpp > 0 && <li>* {total.tanpaHpp} pcs belum punya HPP dan tidak dihitung dalam laba.</li>}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
