import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SESSION_MAX_MS, sisaSesi, waktuLogin } from './session.ts'

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
