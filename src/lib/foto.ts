import { createClient } from '@/lib/supabase/client'

/** Perkecil foto di browser sebelum diunggah: sisi terpanjang 800px, WebP ±80%. Hasil umumnya 40–120 KB. */
export async function kompresFoto(file: File, max = 800): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.8))
  if (!blob) throw new Error('Gagal memproses foto')
  return blob
}

export function fotoUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return createClient().storage.from('produk').getPublicUrl(path).data.publicUrl
}

export function normWa(s: string | null | undefined): string {
  const d = (s ?? '').replace(/\D/g, '')
  if (d.startsWith('0')) return '62' + d.slice(1)
  if (d.startsWith('8')) return '62' + d
  return d
}
