import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Link sekali pakai bagi admin baru untuk membuat password. Token baru dipakai saat tombol di /auth/confirm ditekan,
 * jadi aman dikirim lewat WhatsApp (pratinjau link tidak menghanguskannya). Membuat link baru membatalkan link sebelumnya.
 * Mengarah ke /auth/confirm milik aplikasi, jadi tidak bergantung pada template email Supabase
 * dan bisa dibuka di perangkat mana pun. Berlaku sesuai "Email OTP expiration" di Supabase (bawaan 1 jam).
 */
export async function linkAktivasi(admin: SupabaseClient, email: string, origin: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email })
  const hash = data?.properties?.hashed_token
  if (error || !hash) return null
  return `${origin}/auth/confirm?token_hash=${encodeURIComponent(hash)}&type=recovery&undangan=1&next=/reset-password`
}
