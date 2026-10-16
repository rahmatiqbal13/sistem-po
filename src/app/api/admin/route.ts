import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, ringkasAdmin } from '@/lib/supabase/server'
import { alamatAplikasi } from '@/lib/alamat'
import { linkAktivasi } from './link'

/** Daftar admin toko */
export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof Response) return ctx
  const { data, error } = await ctx.admin.auth.admin.listUsers({ perPage: 200 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const list = data.users.map(ringkasAdmin).sort((a, b) => a.dibuat.localeCompare(b.dibuat))
  return NextResponse.json({ admins: list, saya: ctx.userId })
}

/** Undang admin baru lewat email; juga mengembalikan link aktivasi untuk dibagikan lewat WA */
export async function POST(request: NextRequest) {
  const ctx = await requireAdmin()
  if (ctx instanceof Response) return ctx
  const { email: raw } = (await request.json().catch(() => ({}))) as { email?: string }
  const email = (raw ?? '').trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Email tidak valid.' }, { status: 400 })

  const origin = alamatAplikasi(request.nextUrl.origin)
  const { error } = await ctx.admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/reset-password` })
  let emailTerkirim = !error
  if (error) {
    if (/already been registered|already registered|exists/i.test(error.message)) {
      return NextResponse.json({ error: 'Email ini sudah menjadi admin.' }, { status: 409 })
    }
    // Email gagal dikirim (mis. batas pengiriman Supabase): tetap buat akun agar link aktivasi bisa dibagikan manual
    const dibuat = await ctx.admin.auth.admin.createUser({ email, email_confirm: true })
    if (dibuat.error) return NextResponse.json({ error: dibuat.error.message }, { status: 500 })
    emailTerkirim = false
  }
  const link = await linkAktivasi(ctx.admin, email, origin)
  return NextResponse.json({ ok: true, emailTerkirim, link })
}
