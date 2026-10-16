'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { errMsg } from '@/lib/format'
import { AuthCard } from '@/components/auth-card'
import { Alert, Field, inputCls } from '@/components/ui'

const MIN = 8

export default function ResetPasswordPage() {
  const router = useRouter()
  // Halaman ini hanya bisa dipakai setelah membuka link reset dari email (yang membuat sesi login)
  const [email, setEmail] = useState<string | null | undefined>(undefined)
  const [undangan, setUndangan] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      // Link undangan/reset dengan template email bawaan Supabase: token ada di #hash
      const h = new URLSearchParams(window.location.hash.slice(1))
      const access_token = h.get('access_token'), refresh_token = h.get('refresh_token')
      if (access_token && refresh_token) {
        await supabase.auth.setSession({ access_token, refresh_token })
        setUndangan(h.get('type') === 'invite')
        window.history.replaceState(null, '', window.location.pathname)
      }
      const { data } = await supabase.auth.getUser()
      setEmail(data.user?.email ?? null)
    })()
  }, [])

  const errPw = pw.length < MIN ? `Minimal ${MIN} karakter.` : ''
  const errPw2 = pw2 !== pw ? 'Password tidak sama.' : ''

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (errPw || errPw2) return
    setBusy(true)
    setError('')
    const { error } = await createClient().auth.updateUser({ password: pw })
    setBusy(false)
    if (error) {
      if (error.code === 'same_password') return setError('Password baru harus berbeda dari password lama.')
      if (error.code === 'weak_password') return setError('Password terlalu lemah. Gunakan kombinasi huruf dan angka.')
      return setError(errMsg(error))
    }
    router.replace('/pesanan')
    router.refresh()
  }

  if (email === null) {
    return (
      <AuthCard title="Link tidak berlaku" tabTitle="Buat password baru" onSubmit={(e) => e.preventDefault()}
        subtitle="Buka halaman ini lewat link reset password di email. Link hanya bisa dipakai sekali dan berlaku sekitar 1 jam.">
        <Link href="/lupa-password" className="btn btn-primary btn-lg">Minta link baru</Link>
        <Link href="/login" className="btn btn-ghost self-center">← Kembali ke halaman masuk</Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard title={undangan ? 'Selamat datang!' : 'Buat password baru'} tabTitle="Buat password baru" onSubmit={submit}
      subtitle={!email ? 'Memeriksa link…'
        : undangan ? <>Anda diundang menjadi admin toko. Buat password untuk akun <b>{email}</b>.</>
        : <>Untuk akun <b>{email}</b>.</>}>
      {error && <Alert>{error}</Alert>}
      {/* Kolom email tersembunyi membantu pengelola password menyimpan password baru ke akun yang benar */}
      <input type="email" autoComplete="username" value={email ?? ''} readOnly hidden />
      <Field label="Password baru" htmlFor="rp-pw" helper={`Minimal ${MIN} karakter.`} error={touched ? errPw : ''} required>
        <div className="relative">
          <input id="rp-pw" type={show ? 'text' : 'password'} autoComplete="new-password" value={pw}
            onChange={(e) => { setPw(e.target.value); setError('') }} className={`${inputCls} pr-[120px]`} />
          <button type="button" onClick={() => setShow(!show)} aria-pressed={show}
            className="absolute right-1 top-1/2 min-h-[44px] -translate-y-1/2 rounded-full px-3.5 text-sm font-bold text-accent-700 hover:bg-accent-200">
            {show ? 'Sembunyikan' : 'Lihat'}
          </button>
        </div>
      </Field>
      <Field label="Ulangi password baru" htmlFor="rp-pw2" error={touched ? errPw2 : ''} required>
        <input id="rp-pw2" type={show ? 'text' : 'password'} autoComplete="new-password" value={pw2}
          onChange={(e) => { setPw2(e.target.value); setError('') }} className={inputCls} />
      </Field>
      <button type="submit" disabled={busy || !email} className="btn btn-primary btn-lg">{busy ? 'Menyimpan…' : 'Simpan password baru'}</button>
    </AuthCard>
  )
}
