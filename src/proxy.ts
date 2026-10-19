import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { sisaSesi } from '@/lib/session'

export async function proxy(request: NextRequest) {
  // Halaman pemesanan untuk pembeli: publik, tanpa login
  if (request.nextUrl.pathname.startsWith('/po/')) return NextResponse.next()

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    }
  )

  // getClaims memverifikasi token (dan memperbaruinya bila perlu); klaimnya tepercaya
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  const user = claims?.sub ? claims : null
  const { pathname } = request.nextUrl

  // Login lebih dari 24 jam: keluarkan dan minta masuk ulang
  const sisa = sisaSesi(claims as Parameters<typeof sisaSesi>[0])
  if (user && sisa != null && sisa <= 0) {
    await supabase.auth.signOut({ scope: 'local' })
    const login = new URL('/login', request.url)
    login.searchParams.set('expired', '1')
    const redirect = NextResponse.redirect(login)
    // Bawa penghapusan cookie sesi dari signOut ke respons redirect
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c))
    return redirect
  }

  // Halaman yang bisa dibuka tanpa login: masuk, lupa password, dan tujuan link dari email
  // /reset-password memeriksa sesinya sendiri (link undangan bawaan Supabase membawa token di #hash yang tak terlihat server)
  const publik = ['/login', '/lupa-password', '/reset-password'].includes(pathname) || pathname.startsWith('/auth/')
  // API memeriksa login sendiri dan membalas JSON, bukan dialihkan ke halaman login
  if (pathname.startsWith('/api/')) return response
  if (!user && !publik) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (user && (pathname === '/login' || pathname === '/')) {
    return NextResponse.redirect(new URL('/pesanan', request.url))
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
