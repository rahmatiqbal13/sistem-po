'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { errMsg } from '@/lib/format'
import { alamatAplikasi } from '@/lib/alamat'
import { AuthCard } from '@/components/auth-card'
import { Alert, Field, inputCls } from '@/components/ui'

export default function LupaPasswordPage() {
  const [email, setEmail] = useState(useSearchParams().get('email') ?? '')
  const [busy, setBusy] = useState(false)
  const [terkirim, setTerkirim] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${alamatAplikasi(window.location.origin)}/auth/confirm?next=/reset-password`,
    })
    setBusy(false)
    // Terlalu sering meminta: Supabase membatasi jumlah email per jam
    if (error && error.status === 429) return setError('Terlalu sering meminta link. Tunggu beberapa menit lalu coba lagi.')
    if (error && error.status !== 400 && error.status !== 422) return setError(errMsg(error))
    // Pesan yang sama untuk email terdaftar maupun tidak, agar daftar akun admin tidak bisa ditebak
    setTerkirim(true)
  }

  return (
    <AuthCard title="Lupa password" tabTitle="Lupa password" onSubmit={submit}
      subtitle="Masukkan email akun admin. Kami kirimkan link untuk membuat password baru.">
      {terkirim ? (
        <>
          <Alert tone="ok">Jika email terdaftar, link reset sudah dikirim ke {email.trim()}.</Alert>
          <p className="m-0 text-sm text-neutral-800">
            Buka email itu (cek juga folder Spam) dan klik linknya. Link berlaku sekitar 1 jam dan hanya bisa dipakai sekali.
            Link boleh dibuka di HP maupun laptop.
          </p>
          <button type="button" className="btn btn-secondary" onClick={() => setTerkirim(false)}>Kirim ulang</button>
        </>
      ) : (
        <>
          {error && <Alert>{error}</Alert>}
          <Field label="Email" htmlFor="lp-email">
            <input id="lp-email" type="email" required autoComplete="email" value={email}
              onChange={(e) => { setEmail(e.target.value); setError('') }} className={inputCls} />
          </Field>
          <button type="submit" disabled={busy} className="btn btn-primary btn-lg">{busy ? 'Mengirim…' : 'Kirim link reset'}</button>
        </>
      )}
      <Link href="/login" className="btn btn-ghost self-center">← Kembali ke halaman masuk</Link>
    </AuthCard>
  )
}
