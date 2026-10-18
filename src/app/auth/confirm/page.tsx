'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { AuthCard } from '@/components/auth-card'
import { Alert } from '@/components/ui'

/**
 * Tujuan link dari email/WhatsApp (undangan admin, reset password).
 * Token sekali pakai baru ditukar menjadi sesi saat tombol ditekan: WhatsApp, Gmail, dan antivirus
 * membuka link lebih dulu untuk membuat pratinjau, dan bila token dipakai saat halaman dibuka,
 * link sudah hangus sebelum diklik orangnya.
 *  - ?token_hash=…&type=recovery|invite → berfungsi di perangkat/browser mana pun
 *  - ?code=…                            → alur bawaan Supabase; hanya di browser yang meminta link
 */
export default function KonfirmasiPage() {
  const router = useRouter()
  const sp = useSearchParams()
  const tokenHash = sp.get('token_hash')
  const type = sp.get('type') as EmailOtpType | null
  const code = sp.get('code')
  const nextParam = sp.get('next') ?? '/reset-password'
  // Hanya jalur di situs ini, bukan URL luar
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/reset-password'
  const undangan = type === 'invite' || sp.get('undangan') === '1'
  const adaToken = !!(tokenHash && type) || !!code

  const [busy, setBusy] = useState(false)
  const [gagal, setGagal] = useState(false)
  // Template email bawaan Supabase: token sudah ditukar di server Supabase, hasilnya dikirim lewat #hash
  // (#access_token=… bila berhasil, #error_code=… bila gagal, mis. link sudah dibuka pemindai email)
  const [hashErr, setHashErr] = useState('')
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1))
    const access_token = h.get('access_token'), refresh_token = h.get('refresh_token')
    if (access_token && refresh_token) {
      createClient().auth.setSession({ access_token, refresh_token }).then(({ error }) => {
        if (error) return setGagal(true)
        const ke = h.get('type') === 'invite' ? `${next}${next.includes('?') ? '&' : '?'}undangan=1` : next
        window.location.replace(ke)
      })
    } else if (h.get('error_code') || h.get('error')) {
      setHashErr(h.get('error_code') ?? h.get('error') ?? '')
    }
  }, [next])

  async function lanjut(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const supabase = createClient()
    const { error } = tokenHash && type
      ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
      : await supabase.auth.exchangeCodeForSession(code!)
    if (error) { setBusy(false); setGagal(true); return }
    router.replace(undangan ? `${next}${next.includes('?') ? '&' : '?'}undangan=1` : next)
    router.refresh()
  }

  if (!adaToken || gagal) {
    const kedaluwarsa = hashErr === 'otp_expired'
    return (
      <AuthCard title="Link tidak berlaku" tabTitle="Konfirmasi" onSubmit={(e) => e.preventDefault()}
        subtitle={kedaluwarsa
          ? 'Link ini sudah dibuka sebelumnya (bisa oleh pemindai keamanan aplikasi email), kedaluwarsa, atau sudah diganti dengan link yang lebih baru.'
          : 'Link ini sudah dipakai, kedaluwarsa (lebih dari ±1 jam), atau sudah diganti dengan link yang lebih baru.'}>
        <Alert tone="warn">
          Admin baru: minta admin toko membuat <b>link aktivasi baru</b> di Pengaturan → Admin toko.
          Lupa password: minta link baru di bawah.
        </Alert>
        {hashErr && <div className="text-xs text-neutral-800">Kode dari server: {hashErr}</div>}
        <Link href="/lupa-password" className="btn btn-primary btn-lg">Minta link reset password</Link>
        <Link href="/login" className="btn btn-ghost self-center">← Ke halaman masuk</Link>
      </AuthCard>
    )
  }

  return (
    <AuthCard title={undangan ? 'Undangan admin' : 'Buat password baru'} tabTitle="Konfirmasi" onSubmit={lanjut}
      subtitle={undangan
        ? 'Anda diundang menjadi admin toko. Tekan tombol di bawah untuk membuat password.'
        : 'Tekan tombol di bawah untuk melanjutkan membuat password baru.'}>
      <button type="submit" disabled={busy} className="btn btn-primary btn-lg">{busy ? 'Memeriksa link…' : 'Lanjutkan'}</button>
    </AuthCard>
  )
}
