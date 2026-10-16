import { test } from 'node:test'
import assert from 'node:assert/strict'
import { teksHari, teksOperasional } from './operasional.ts'

test('hari buka ditulis urut Sen–Min', () => {
  assert.equal(teksHari([0, 1, 2]), 'Sen, Sel, Min')
  assert.equal(teksHari([0, 1, 2, 3, 4, 5, 6]), 'setiap hari')
  assert.equal(teksHari(null), '')
})

test('ringkasan operasional melewati bagian kosong', () => {
  assert.equal(
    teksOperasional({ lokasi_ambil: 'Jl. Cendana 8', jam_buka: '09:00:00', jam_tutup: '17:00', hari_buka: [1, 2], area_antar: 'Bandung utara' }),
    'Ambil di Jl. Cendana 8, 09:00–17:00 (Sen, Sel). Antar: Bandung utara.',
  )
  assert.equal(teksOperasional({ area_antar: 'Bandung' }), 'Antar: Bandung.')
  assert.equal(teksOperasional({}), '')
})
