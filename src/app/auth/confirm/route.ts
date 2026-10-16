import { createServerClient } from '@supabase/ssr'
import type { EmailOtpType } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Tujuan link di email Supabase (reset password, undangan, dll). Menukar token dari link menjadi sesi login,
 * lalu meneruskan ke `next` (mis. /reset-password).
 *  - ?token_hash=…&type=recovery  → berfungsi walau link dibuka di perangkat/browser lain (template email disesuaikan)
 *  - ?code=…                      → alur bawaan Supabase; hanya berhasil di browser yang meminta link
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null
  const code = url.searchParams.get('code')
  const nextParam = url.searchParams.get('next') ?? '/reset-password'
  // Hanya jalur di situs ini, bukan URL luar
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/reset-password'

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(list) { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    },
  )

  let ok = false
  if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error
  else if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error

  return NextResponse.redirect(new URL(ok ? next : '/login?error=link', request.url))
}
