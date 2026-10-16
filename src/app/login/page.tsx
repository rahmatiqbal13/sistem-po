'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Alert, Field, inputCls } from '@/components/ui'

export default function LoginPage() {
  const router = useRouter()
  const expiredParam = useSearchParams().get('expired') === '1'
  // Info sesi habis cukup sekali: ditampilkan sampai mulai mengetik, dan dihapus dari URL agar tidak muncul lagi saat dimuat ulang
  const [expired, setExpired] = useState(expiredParam)
  useEffect(() => { if (expiredParam) router.replace('/login', { scroll: false }) }, [expiredParam, router])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await createClient().auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) {
      setError('Email atau password salah.')
      return
    }
    router.replace('/pesanan')
    router.refresh()
  }

  return (
    <main className="relative isolate grid min-h-dvh place-items-center overflow-hidden px-4 py-6">
      <div aria-hidden="true" className="absolute -left-[160px] -top-[160px] -z-10 size-[420px] rounded-full bg-accent-300 opacity-55" />
      <div aria-hidden="true" className="absolute -bottom-[110px] -right-[90px] -z-10 size-[300px] rounded-full bg-sage-300 opacity-70" />
      <div aria-hidden="true" className="absolute right-[18%] top-[14%] -z-10 size-[90px] rounded-full bg-sage-400 opacity-50" />
      <form onSubmit={submit} className="relative flex w-full max-w-[420px] flex-col gap-4 rounded-card bg-surface p-8 shadow-md">
        <div className="flex items-center gap-2.5">
          <div aria-hidden="true" className="grid size-[40px] place-items-center rounded-full bg-accent font-heading font-extrabold text-card text-bg">P</div>
          <div className="font-heading text-section">PO Jajanan</div>
        </div>
        <div>
          <h1>Masuk</h1>
          <p className="mb-0 mt-1 text-neutral-800">Masuk untuk mencatat pesanan.</p>
        </div>
        {error ? <Alert>{error}</Alert>
          : expired && <Alert tone="warn">Sesi habis, silakan login kembali.</Alert>}
        <Field label="Email" htmlFor="lg-email">
          <input id="lg-email" type="email" required autoComplete="email" value={email}
            onChange={(e) => { setEmail(e.target.value); setError(''); setExpired(false) }} className={inputCls} />
        </Field>
        <Field label="Password" htmlFor="lg-pw">
          <div className="relative">
            <input id="lg-pw" type={show ? 'text' : 'password'} required autoComplete="current-password" value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); setExpired(false) }} className={`${inputCls} pr-[120px]`} />
            <button type="button" onClick={() => setShow(!show)} aria-pressed={show}
              className="absolute right-1 top-1/2 min-h-[44px] -translate-y-1/2 rounded-full px-3.5 text-sm font-bold text-accent-700 hover:bg-accent-200">
              {show ? 'Sembunyikan' : 'Lihat'}
            </button>
          </div>
        </Field>
        <button type="submit" disabled={busy} className="btn btn-primary btn-lg">{busy ? 'Masuk…' : 'Masuk'}</button>
      </form>
    </main>
  )
}
