import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pengingatTagih, selisihHari } from './pengingat.ts'

const base = { status: 'dikonfirmasi', sisa: 20000, tanggalAmbil: '2026-10-20' }

test('selisih hari antar tanggal', () => {
  assert.equal(selisihHari('2026-10-20', '2026-10-19'), 1)
  assert.equal(selisihHari('2026-11-01', '2026-10-31'), 1)
  assert.equal(selisihHari('2026-10-18', '2026-10-19'), -1)
})

test('diingatkan H-1, hari H, dan setelah lewat', () => {
  assert.equal(pengingatTagih(base, '2026-10-19'), 'Belum lunas · ambil besok')
  assert.equal(pengingatTagih(base, '2026-10-20'), 'Belum lunas · ambil hari ini')
  assert.equal(pengingatTagih(base, '2026-10-22'), 'Belum lunas · jadwal sudah lewat')
  assert.equal(pengingatTagih(base, '2026-10-18'), null)
})

test('tidak diingatkan bila lunas, selesai, atau dibatalkan', () => {
  assert.equal(pengingatTagih({ ...base, sisa: 0 }, '2026-10-20'), null)
  assert.equal(pengingatTagih({ ...base, status: 'selesai' }, '2026-10-20'), null)
  assert.equal(pengingatTagih({ ...base, status: 'dibatalkan' }, '2026-10-20'), null)
})

test('memakai tanggal batch bila pesanan tanpa tanggal', () => {
  assert.equal(pengingatTagih({ ...base, tanggalAmbil: null }, '2026-10-20', '2026-10-20'), 'Belum lunas · ambil hari ini')
  assert.equal(pengingatTagih({ ...base, tanggalAmbil: null }, '2026-10-20'), null)
})
