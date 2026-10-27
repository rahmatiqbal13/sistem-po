import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jalurAman, selCsvAman } from './keamanan.ts'

test('jalur tujuan hanya di situs sendiri', () => {
  assert.equal(jalurAman('/reset-password?undangan=1', '/x'), '/reset-password?undangan=1')
  assert.equal(jalurAman(null, '/x'), '/x')
  assert.equal(jalurAman('https://evil.com', '/x'), '/x')
  assert.equal(jalurAman('//evil.com', '/x'), '/x')
  assert.equal(jalurAman('/\\evil.com', '/x'), '/x')
  assert.equal(jalurAman('/\t/evil.com', '/x'), '/x')
})

test('sel CSV yang mirip formula dijadikan teks', () => {
  assert.equal(selCsvAman('=HYPERLINK("x")'), `'=HYPERLINK("x")`)
  assert.equal(selCsvAman('@SUM(A1)'), `'@SUM(A1)`)
  assert.equal(selCsvAman('Budi'), 'Budi')
  assert.equal(selCsvAman(-5000), -5000)
})
