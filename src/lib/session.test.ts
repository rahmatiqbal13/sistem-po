import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IDLE_MAX_MS, SESSION_MAX_MS, sisaIdle, sisaSesi, waktuLogin } from './session.ts'

test('waktu login diambil dari amr paling awal', () => {
  assert.equal(waktuLogin({ amr: [{ method: 'password', timestamp: 1000 }, { method: 'otp', timestamp: 2000 }] }), 1_000_000)
  assert.equal(waktuLogin({ amr: ['password'] }), null)
  assert.equal(waktuLogin(null), null)
})

test('sesi habis setelah 24 jam', () => {
  const login = 1_700_000_000
  const claims = { amr: [{ method: 'password', timestamp: login }] }
  assert.equal(sisaSesi(claims, login * 1000 + SESSION_MAX_MS - 1), 1)
  assert.ok(sisaSesi(claims, login * 1000 + SESSION_MAX_MS)! <= 0)
  assert.equal(sisaSesi({}), null)
})

test('keluar setelah tidak aktif', () => {
  const now = 10_000_000_000
  assert.equal(sisaIdle(now - 1000, now - 5000, now), IDLE_MAX_MS - 1000)
  assert.ok(sisaIdle(now - IDLE_MAX_MS, null, now) <= 0)
  // Aktivitas dari sesi lama tidak membuat login baru langsung keluar
  assert.equal(sisaIdle(now - 2 * IDLE_MAX_MS, now - 1000, now), IDLE_MAX_MS - 1000)
  assert.equal(sisaIdle(null, null, now), IDLE_MAX_MS)
})
