import { test } from 'node:test'
import assert from 'node:assert/strict'
import { teksLog, type LogPesanan } from './log.ts'

const log = (aksi: LogPesanan['aksi'], detail: LogPesanan['detail']): LogPesanan => ({ id: 1, aksi, detail, oleh: null, created_at: '' })

test('pesanan dibuat dari link dan dari admin', () => {
  assert.deepEqual(teksLog(log('dibuat', { sumber: 'link', item: 'Kebab x2' })), { judul: 'Pesanan masuk lewat link pemesanan', rincian: 'Kebab x2' })
  assert.equal(teksLog(log('dibuat', { sumber: 'admin', item: '' })).rincian, undefined)
})

test('perubahan status dan bagian pesanan', () => {
  assert.equal(teksLog(log('status', { dari: 'baru', ke: 'dikonfirmasi' })).judul, 'Status: Baru → Dikonfirmasi')
  const t = teksLog(log('diubah', { bagian: ['item', 'jadwal'], item: 'Kebab x3' }))
  assert.equal(t.judul, 'Diubah: item, jadwal ambil')
  assert.equal(t.rincian, 'Item sekarang: Kebab x3')
  assert.equal(teksLog(log('diubah', { bagian: ['ongkir'], item: 'Kebab x3' })).rincian, undefined)
})

test('pembayaran dicatat dan dihapus', () => {
  assert.equal(teksLog(log('bayar', { jumlah: 20000, metode: 'transfer' })).judul.replace(/\s/g, ' '), 'Pembayaran Rp20.000 (Transfer bank) dicatat')
  assert.match(teksLog(log('bayar_hapus', { jumlah: 5000, metode: 'tunai' })).judul, /dihapus$/)
})
