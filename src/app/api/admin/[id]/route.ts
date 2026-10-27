import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/supabase/server'

/** Hapus admin (khusus pemilik). Tidak bisa menghapus diri sendiri maupun pemilik lain. */
export async function DELETE(_request: NextRequest, ctx: RouteContext<'/api/admin/[id]'>) {
  const auth = await requireAdmin({ pemilik: true })
  if (auth instanceof Response) return auth
  const { id } = await ctx.params
  if (id === auth.userId) return NextResponse.json({ error: 'Tidak bisa menghapus akun Anda sendiri.' }, { status: 400 })

  const { data, error } = await auth.admin.auth.admin.listUsers({ perPage: 200 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data.users.some((u) => u.id === id)) return NextResponse.json({ error: 'Admin tidak ditemukan.' }, { status: 404 })
  if (data.users.length <= 1) return NextResponse.json({ error: 'Toko harus punya minimal 1 admin.' }, { status: 400 })
  const { data: target } = await auth.admin.from('admin_toko').select('peran').eq('user_id', id).maybeSingle()
  if (target?.peran === 'pemilik') return NextResponse.json({ error: 'Pemilik toko tidak bisa dihapus dari aplikasi.' }, { status: 400 })

  // Riwayat pesanan & pembayaran menyimpan email sebagai teks, jadi tetap utuh setelah akun dihapus
  const del = await auth.admin.auth.admin.deleteUser(id)
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
