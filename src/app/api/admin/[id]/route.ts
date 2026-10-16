import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/supabase/server'

/** Hapus admin. Tidak bisa menghapus diri sendiri, dan toko selalu menyisakan minimal 1 admin. */
export async function DELETE(_request: NextRequest, ctx: RouteContext<'/api/admin/[id]'>) {
  const auth = await requireAdmin()
  if (auth instanceof Response) return auth
  const { id } = await ctx.params
  if (id === auth.userId) return NextResponse.json({ error: 'Tidak bisa menghapus akun Anda sendiri.' }, { status: 400 })

  const { data, error } = await auth.admin.auth.admin.listUsers({ perPage: 200 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data.users.some((u) => u.id === id)) return NextResponse.json({ error: 'Admin tidak ditemukan.' }, { status: 404 })
  if (data.users.length <= 1) return NextResponse.json({ error: 'Toko harus punya minimal 1 admin.' }, { status: 400 })

  // Riwayat pesanan & pembayaran menyimpan email sebagai teks, jadi tetap utuh setelah akun dihapus
  const del = await auth.admin.auth.admin.deleteUser(id)
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
