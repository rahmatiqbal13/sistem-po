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

export type AdminCtx = { admin: SupabaseClient; userId: string; email: string | null }

/**
 * Pastikan pemanggil adalah admin yang login (sesi < 24 jam), lalu beri klien service-role untuk Auth Admin API.
 * Mengembalikan Response error bila tidak boleh.
 */
export async function requireAdmin(): Promise<AdminCtx | Response> {
  const { data } = await (await createRouteClient()).auth.getClaims()
  const claims = data?.claims
  const sisa = sisaSesi(claims as Parameters<typeof sisaSesi>[0])
  if (!claims?.sub || (sisa != null && sisa <= 0)) return Response.json({ error: 'Sesi habis. Silakan masuk lagi.' }, { status: 401 })
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    return Response.json({ error: 'SUPABASE_SERVICE_ROLE_KEY belum diisi di pengaturan server, jadi admin belum bisa dikelola dari aplikasi.' }, { status: 500 })
  }
  const admin = createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return { admin, userId: claims.sub, email: (claims.email as string | undefined) ?? null }
}

/** Data admin yang aman dikirim ke browser */
export function ringkasAdmin(u: User) {
  return {
    id: u.id,
    email: u.email ?? '',
    dibuat: u.created_at,
    terakhirMasuk: u.last_sign_in_at ?? null,
    // Belum pernah masuk = undangan belum dipakai
    aktif: !!u.last_sign_in_at,
  }
}
