import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bulanPesanan, rekapBulanan, type ItemBulanan, type PesananBulanan } from './rekap-bulanan.ts'

const o = (id: string, tgl: string | null, p: Partial<PesananBulanan> = {}): PesananBulanan =>
  ({ id, status: 'selesai', tanggal_ambil: tgl, created_at: '2026-09-28T10:00:00Z', subtotal: 50000, ongkir: 0, terbayar: 50000, sisa: 0, ...p })
const i = (order_id: string, nama: string, qty: number, hpp: number | null = 6000): ItemBulanan =>
  ({ order_id, product_id: nama, nama_produk_snapshot: nama, harga_snapshot: 10000, hpp_snapshot: hpp, qty })

test('bulan memakai tanggal ambil, lalu tanggal dicatat', () => {
  assert.equal(bulanPesanan({ tanggal_ambil: '2026-10-03', created_at: '2026-09-28T10:00:00Z' }), '2026-10')
  assert.equal(bulanPesanan({ tanggal_ambil: null, created_at: '2026-09-28T10:00:00Z' }), '2026-09')
})

test('dikelompokkan per bulan, terbaru dulu, pesanan dibatalkan tidak dihitung', () => {
  const r = rekapBulanan(
    [o('a', '2026-10-03', { ongkir: 5000, terbayar: 20000, sisa: 35000 }), o('b', '2026-10-20'), o('c', null), o('x', '2026-10-05', { status: 'dibatalkan' })],
    [i('a', 'Kebab', 3), i('a', 'Roti', 2), i('b', 'Roti', 5), i('c', 'Kebab', 1, null), i('x', 'Kebab', 9)],
  )
  assert.deepEqual(r.map((b) => b.bulan), ['2026-10', '2026-09'])
  const okt = r[0]
  assert.equal(okt.pesanan, 2)
  assert.equal(okt.penjualan, 100000)
  assert.equal(okt.ongkir, 5000)
  assert.equal(okt.sisa, 35000)
  assert.equal(okt.qty, 10)
  assert.equal(okt.laba, 10 * 4000)
  assert.deepEqual(okt.terlaris, { nama: 'Roti', qty: 7 })
  assert.equal(r[1].tanpaHpp, 1)
  assert.equal(r[1].laba, 0)
})
