'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { AuthCard } from '@/components/auth-card'
import { Alert, Field, inputCls } from '@/components/ui'

export default function LoginPage() {
  const router = useRouter()
  const sp = useSearchParams()
  const expiredParam = sp.get('expired')
  // Datang dari link reset password yang tidak valid/kedaluwarsa
  const [linkGagal, setLinkGagal] = useState(sp.get('error') === 'link')
  // Dikeluarkan karena akun tidak terdaftar sebagai admin toko
  const tanpaAkses = sp.get('error') === 'akses'
  // Info sesi habis cukup sekali: ditampilkan sampai mulai mengetik, dan dihapus dari URL agar tidak muncul lagi saat dimuat ulang
  const [expired, setExpired] = useState(expiredParam)
  useEffect(() => { if (expiredParam || linkGagal || tanpaAkses) router.replace('/login', { scroll: false }) }, [expiredParam, linkGagal, tanpaAkses, router])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setBusy(false)
      setError('Email atau password salah.')
      return
    }
    // Password benar tetapi akun tidak ada di daftar admin toko (error = fungsi belum ada: database belum dimigrasi)
    const { data: admin, error: eAdmin } = await supabase.rpc('is_admin')
    if (!eAdmin && admin === false) {
      await supabase.auth.signOut({ scope: 'local' })
      setBusy(false)
      setError('Akun ini tidak terdaftar sebagai admin toko. Minta pemilik toko mengundang Anda.')
      return
    }
    setBusy(false)
    router.replace('/pesanan')
    router.refresh()
  }

  return (
    <AuthCard title="Masuk" subtitle="Masuk untuk mencatat pesanan." tabTitle="Masuk" onSubmit={submit}>
      {error ? <Alert>{error}</Alert>
        : tanpaAkses ? <Alert tone="warn">Akun ini tidak terdaftar sebagai admin toko. Minta pemilik toko mengundang Anda.</Alert>
        : linkGagal ? <Alert tone="warn">Link reset password tidak valid atau sudah kedaluwarsa. Minta link baru lewat “Lupa password?”.</Alert>
        : expired && <Alert tone="warn">{expired === 'idle' ? 'Anda keluar otomatis karena tidak ada aktivitas selama 1 jam. Silakan login kembali.' : 'Sesi habis, silakan login kembali.'}</Alert>}
      <Field label="Email" htmlFor="lg-email">
        <input id="lg-email" type="email" required autoComplete="email" value={email}
          onChange={(e) => { setEmail(e.target.value); setError(''); setExpired(null); setLinkGagal(false) }} className={inputCls} />
      </Field>
      <Field label="Password" htmlFor="lg-pw">
        <div className="relative">
          <input id="lg-pw" type={show ? 'text' : 'password'} required autoComplete="current-password" value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); setExpired(null) }} className={`${inputCls} pr-[120px]`} />
          <button type="button" onClick={() => setShow(!show)} aria-pressed={show}
            className="absolute right-1 top-1/2 min-h-[44px] -translate-y-1/2 rounded-full px-3.5 text-sm font-bold text-accent-700 hover:bg-accent-200">
            {show ? 'Sembunyikan' : 'Lihat'}
          </button>
        </div>
      </Field>
      <button type="submit" disabled={busy} className="btn btn-primary btn-lg">{busy ? 'Masuk…' : 'Masuk'}</button>
      <Link href={email ? `/lupa-password?email=${encodeURIComponent(email)}` : '/lupa-password'} className="btn btn-ghost self-center">
        Lupa password?
      </Link>
    </AuthCard>
  )
}
