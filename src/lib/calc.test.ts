import { test } from 'node:test'
import assert from 'node:assert/strict'
import { subtotal, totalPesanan, statusBayar, sisaTagihan, kelebihanBayar } from './calc.ts'

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
