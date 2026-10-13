'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Alert, Button, Field, inputCls } from '@/components/ui'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
    <main className="grid min-h-dvh place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6">
        <div>
          <h1 className="text-2xl font-bold">PO Jajanan</h1>
          <p className="mt-1 text-muted">Masuk untuk mencatat pesanan.</p>
        </div>
        {error && <Alert tone="bad">{error}</Alert>}
        <Field label="Email">
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Password">
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
        </Field>
        <Button type="submit" disabled={busy} className="w-full">{busy ? 'Masuk…' : 'Masuk'}</Button>
      </form>
    </main>
  )
}
