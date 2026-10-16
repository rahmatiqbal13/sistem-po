import { test } from 'node:test'
import assert from 'node:assert/strict'
import { subtotal, totalPesanan, statusBayar, sisaTagihan, kelebihanBayar, hitungHpp, marginPersen, hargaDariMargin, hitungLaba } from './calc.ts'

test('total = jumlah harga × qty + ongkir', () => {
  const items = [{ harga: 15000, qty: 3 }, { harga: 12500, qty: 2 }, { harga: 8000, qty: 1 }]
  assert.equal(subtotal(items), 78000)
  assert.equal(totalPesanan(items, 10000), 88000)
  assert.equal(totalPesanan([], 0), 0)
})

test('status bayar: belum → DP → lunas', () => {
  assert.equal(statusBayar(50000, 0), 'belum')
  assert.equal(statusBayar(50000, 1), 'dp')
  assert.equal(statusBayar(50000, 49999), 'dp')
  assert.equal(statusBayar(50000, 50000), 'lunas')
  assert.equal(statusBayar(50000, 60000), 'lunas')
})

test('sisa tagihan dan kelebihan bayar', () => {
  assert.equal(sisaTagihan(50000, 20000), 30000)
  assert.equal(sisaTagihan(50000, 60000), 0)
  assert.equal(kelebihanBayar(50000, 60000), 10000)
  assert.equal(kelebihanBayar(50000, 50000), 0)
})

test('HPP per pcs dari rincian biaya, dibulatkan ke atas', () => {
  assert.equal(hitungHpp({ hasil: 20, biaya: [{ nama: 'Tepung', jumlah: 50000 }, { nama: 'Daging', jumlah: 120000 }, { nama: 'Kemasan', jumlah: 10000 }] }), 9000)
  assert.equal(hitungHpp({ hasil: 3, biaya: [{ nama: 'Bahan', jumlah: 10000 }] }), 3334)
  assert.equal(hitungHpp({ hasil: 0, biaya: [{ nama: 'Bahan', jumlah: 10000 }] }), 0)
})

test('margin dan harga dari target margin', () => {
  assert.equal(marginPersen(15000, 9000), 40)
  assert.equal(marginPersen(10000, 12000), -20)
  assert.equal(marginPersen(0, 5000), 0)
  assert.equal(hargaDariMargin(9000, 40), 15000)
  assert.equal(hargaDariMargin(9000, 35), 14000) // 13.846 → 14.000
  assert.equal(hargaDariMargin(9000, 100), 0)
})

test('laba kotor: item tanpa HPP dipisahkan', () => {
  const r = hitungLaba([{ harga: 15000, hpp: 9000, qty: 10 }, { harga: 12000, hpp: 7000, qty: 5 }, { harga: 8000, hpp: null, qty: 4 }])
  assert.equal(r.pendapatan, 210000)
  assert.equal(r.hpp, 125000)
  assert.equal(r.laba, 85000)
  assert.equal(r.margin, 40.5)
  assert.equal(r.pendapatanTanpaHpp, 32000)
  assert.equal(r.tanpaHpp, 4)
})
