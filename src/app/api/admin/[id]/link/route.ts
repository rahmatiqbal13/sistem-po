import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/supabase/server'
import { alamatAplikasi } from '@/lib/alamat'
import { linkAktivasi } from '../../link'

/** Buat ulang link aktivasi untuk admin yang belum pernah masuk, untuk dibagikan lewat WA */
export async function POST(request: NextRequest, ctx: RouteContext<'/api/admin/[id]/link'>) {
  const auth = await requireAdmin()
  if (auth instanceof Response) return auth
  const { id } = await ctx.params
  const { data, error } = await auth.admin.auth.admin.getUserById(id)
  if (error || !data.user?.email) return NextResponse.json({ error: 'Admin tidak ditemukan.' }, { status: 404 })
  // Admin yang sudah aktif mengganti password sendiri lewat "Lupa password?", agar akunnya tidak bisa diambil alih admin lain
  if (data.user.last_sign_in_at) {
    return NextResponse.json({ error: 'Admin ini sudah aktif. Minta ia memakai “Lupa password?” di halaman masuk.' }, { status: 400 })
  }
  const link = await linkAktivasi(auth.admin, data.user.email, alamatAplikasi(request.nextUrl.origin))
  if (!link) return NextResponse.json({ error: 'Link gagal dibuat. Coba lagi.' }, { status: 500 })
  return NextResponse.json({ link })
}
