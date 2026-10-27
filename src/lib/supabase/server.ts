import { createServerClient } from '@supabase/ssr'
import { createClient as createAdmin, type SupabaseClient, type User } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { sisaSesi } from '@/lib/session'

/** Klien Supabase untuk Route Handler, memakai sesi login dari cookie */
export async function createRouteClient() {
  const cookieStore = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(list) { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
    },
  })
}

export type Peran = 'pemilik' | 'admin'
export type AdminCtx = { admin: SupabaseClient; userId: string; email: string | null; peran: Peran }

/**
 * Pastikan pemanggil login (sesi < 24 jam) dan terdaftar di admin_toko, lalu beri klien service-role untuk Auth Admin API.
 * `pemilik: true` = hanya pemilik toko yang boleh. Mengembalikan Response error bila tidak boleh.
 */
export async function requireAdmin({ pemilik = false } = {}): Promise<AdminCtx | Response> {
  const { data } = await (await createRouteClient()).auth.getClaims()
  const claims = data?.claims
  const sisa = sisaSesi(claims as Parameters<typeof sisaSesi>[0])
  if (!claims?.sub || (sisa != null && sisa <= 0)) return Response.json({ error: 'Sesi habis. Silakan masuk lagi.' }, { status: 401 })
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    return Response.json({ error: 'SUPABASE_SERVICE_ROLE_KEY belum diisi di pengaturan server, jadi admin belum bisa dikelola dari aplikasi.' }, { status: 500 })
  }
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: row, error } = await admin.from('admin_toko').select('peran').eq('user_id', claims.sub).maybeSingle()
  if (error) return Response.json({ error: 'Daftar admin belum siap. Jalankan migrasi keamanan di Supabase.' }, { status: 500 })
  if (!row) return Response.json({ error: 'Akun ini tidak terdaftar sebagai admin toko.' }, { status: 403 })
  if (pemilik && row.peran !== 'pemilik') return Response.json({ error: 'Hanya pemilik toko yang bisa mengelola admin.' }, { status: 403 })
  return { admin, userId: claims.sub, email: (claims.email as string | undefined) ?? null, peran: row.peran as Peran }
}

/** Data admin yang aman dikirim ke browser. peran null = akun ada di Auth tetapi tidak punya akses toko */
export function ringkasAdmin(u: User, peran: Peran | null) {
  return {
    id: u.id,
    peran,
    email: u.email ?? '',
    dibuat: u.created_at,
    terakhirMasuk: u.last_sign_in_at ?? null,
    // Belum pernah masuk = undangan belum dipakai
    aktif: !!u.last_sign_in_at,
  }
}
