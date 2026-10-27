import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, ringkasAdmin, type Peran } from '@/lib/supabase/server'
import { alamatAplikasi } from '@/lib/alamat'
import { linkAktivasi } from './link'

/** Daftar admin toko */
export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof Response) return ctx
  const [{ data, error }, daftar] = await Promise.all([
    ctx.admin.auth.admin.listUsers({ perPage: 200 }),
    ctx.admin.from('admin_toko').select('user_id, peran'),
  ])
  if (error || daftar.error) return NextResponse.json({ error: (error ?? daftar.error)!.message }, { status: 500 })
  const peran = new Map(daftar.data.map((r) => [r.user_id as string, r.peran as Peran]))
  const list = data.users.map((u) => ringkasAdmin(u, peran.get(u.id) ?? null)).sort((a, b) => a.dibuat.localeCompare(b.dibuat))
  return NextResponse.json({ admins: list, saya: ctx.userId, peranSaya: ctx.peran })
}

/** Undang admin baru lewat email (khusus pemilik); juga mengembalikan link aktivasi untuk dibagikan lewat WA */
export async function POST(request: NextRequest) {
  const ctx = await requireAdmin({ pemilik: true })
  if (ctx instanceof Response) return ctx
  const { email: raw } = (await request.json().catch(() => ({}))) as { email?: string }
  const email = (raw ?? '').trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Email tidak valid.' }, { status: 400 })

  const origin = alamatAplikasi(request.nextUrl.origin)
  const { data: diundang, error } = await ctx.admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${origin}/reset-password` })
  let emailTerkirim = !error
  let userId = diundang?.user?.id
  if (error) {
    if (/already been registered|already registered|exists/i.test(error.message)) {
      return NextResponse.json({ error: 'Email ini sudah menjadi admin.' }, { status: 409 })
    }
    // Email gagal dikirim (mis. batas pengiriman Supabase): tetap buat akun agar link aktivasi bisa dibagikan manual
    const dibuat = await ctx.admin.auth.admin.createUser({ email, email_confirm: true })
    if (dibuat.error) return NextResponse.json({ error: dibuat.error.message }, { status: 500 })
    emailTerkirim = false
    userId = dibuat.data.user.id
  }
  // Masuk daftar admin sebagai admin biasa; tanpa baris ini akun tidak bisa membuka data toko
  const daftar = await ctx.admin.from('admin_toko').upsert({ user_id: userId, peran: 'admin' }, { onConflict: 'user_id', ignoreDuplicates: true })
  if (daftar.error) return NextResponse.json({ error: daftar.error.message }, { status: 500 })
  const link = await linkAktivasi(ctx.admin, email, origin)
  return NextResponse.json({ ok: true, emailTerkirim, link })
}
