import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buatPesan, isiTemplate, pesanBawaan, pilihanPesan, type DataPesan } from './pesan-wa.ts'

const base: DataPesan = {
  nama: 'Siti', kode: '#A1B2C3', toko: 'Dapur Bunda', infoPembayaran: 'BCA 123 a.n. Bunda', status: 'baru',
  caraTerima: 'pickup', tanggalAmbil: null, jamAmbil: null,
  items: [{ nama: 'Kebab', qty: 2, harga: 36000 }], ongkir: 0, total: 72000, terbayar: 0, sisa: 72000,
}

test('pesan diterima memuat rincian dan info pembayaran', () => {
  const t = buatPesan('diterima', base)
  assert.match(t, /Pesanan \*#A1B2C3\* sudah kami terima/)
  assert.match(t, /- Kebab x2 = Rp72\.000/)
  assert.match(t, /BCA 123/)
})

test('pesan selesai menyebut lunas dan struk bila sudah lunas', () => {
  const t = buatPesan('selesai', { ...base, status: 'selesai', terbayar: 72000, sisa: 0 })
  assert.match(t, /sudah \*selesai\* dan \*lunas\*/)
  assert.match(t, /Struk pembayaran terlampir/)
  assert.doesNotMatch(buatPesan('selesai', { ...base, status: 'selesai' }), /lunas/)
})

test('template bawaan & pilihan mengikuti status', () => {
  assert.equal(pesanBawaan(base), 'diterima')
  assert.equal(pesanBawaan({ ...base, status: 'selesai' }), 'selesai')
  assert.deepEqual(pilihanPesan(base), ['diterima', 'tagihan', 'siap', 'selesai'])
  assert.deepEqual(pilihanPesan({ ...base, terbayar: 72000, sisa: 0 }), ['diterima', 'lunas', 'siap', 'selesai'])
  assert.deepEqual(pilihanPesan({ ...base, status: 'dibatalkan' }), [])
})

test('template toko mengganti pesan bawaan dan mengisi kode', () => {
  const t = buatPesan('tagihan', { ...base, terbayar: 30000, sisa: 42000 }, { tagihan: 'Hai {nama}, sisa {sisa} untuk {kode}. {asing}' })
  assert.equal(t, 'Hai Siti, sisa Rp42.000 untuk #A1B2C3. {asing}')
  assert.match(isiTemplate('{rincian}', base), /- Kebab x2 = Rp72\.000\n\*Total: Rp72\.000\*/)
})

test('template kosong memakai pesan otomatis', () => {
  assert.equal(buatPesan('diterima', base, { diterima: '   ' }), buatPesan('diterima', base))
})

test('kode tanggal & lokasi', () => {
  assert.equal(isiTemplate('Siap {tanggal} di {lokasi}', { ...base, tanggalAmbil: '2026-10-17', lokasi: 'Jl. Cendana 8' }), 'Siap Sab, 17 Okt di Jl. Cendana 8')
})
