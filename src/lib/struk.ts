import type { jsPDF } from 'jspdf'
import type { OrderItem, OrderSummary, Payment, Pengaturan } from '@/lib/types'
import { CARA_TERIMA, METODE } from '@/lib/types'
import { jam, rupiah, tanggal } from '@/lib/format'
import { fotoUrl } from '@/lib/foto'

export interface StrukData {
  toko: Pengaturan
  kode: string
  batchNama?: string
  order: OrderSummary
  items: OrderItem[]
  payments: Payment[]
}

// Struk kasir: lebar 80mm, tinggi mengikuti isi
const W = 80
const M = 6
const INK: [number, number, number] = [32, 30, 29]
const MUTED: [number, number, number] = [100, 92, 80]
const SAGE: [number, number, number] = [86, 99, 63]

/** Font bawaan PDF hanya mendukung huruf Latin; karakter lain (emoji dll) dibuang agar tidak jadi simbol aneh */
const latin = (s: string | null | undefined) => (s ?? '').replace(/[^\x20-\x7E\xA0-\xFF]/g, '').trim()

/** Logo → PNG bulat (data URL) agar bisa disisipkan ke PDF */
async function logoPng(path: string | null): Promise<string | null> {
  const url = fotoUrl(path)
  if (!url) return null
  try {
    const bitmap = await createImageBitmap(await (await fetch(url)).blob())
    const size = 240
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.clip()
    const s = Math.max(size / bitmap.width, size / bitmap.height)
    ctx.drawImage(bitmap, (size - bitmap.width * s) / 2, (size - bitmap.height * s) / 2, bitmap.width * s, bitmap.height * s)
    bitmap.close()
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

function render(doc: jsPDF, d: StrukData, logo: string | null): number {
  let y = M
  const lh = (pt: number) => pt * 0.3528 * 1.4
  const font = (pt: number, style: 'normal' | 'bold' = 'normal', color = INK) => {
    doc.setFont('helvetica', style)
    doc.setFontSize(pt)
    doc.setTextColor(...color)
  }
  const center = (text: string, pt: number, style: 'normal' | 'bold' = 'normal', color = INK) => {
    font(pt, style, color)
    for (const line of doc.splitTextToSize(latin(text), W - M * 2) as string[]) {
      y += lh(pt)
      doc.text(line, W / 2, y, { align: 'center' })
    }
  }
  /** Teks kiri (boleh terlipat) + nominal rata kanan di baris pertama */
  const row = (left: string, right: string, pt = 9, style: 'normal' | 'bold' = 'normal', color = INK) => {
    font(pt, style, color)
    right = latin(right)
    // Nilai kanan terlalu panjang (mis. nama batch): pindah ke baris sendiri, rata kanan & boleh terlipat
    if (right && doc.getTextWidth(right) > (W - M * 2) * 0.6) {
      y += lh(pt)
      doc.text(latin(left), M, y)
      for (const line of doc.splitTextToSize(right, W - M * 2 - 8) as string[]) {
        y += lh(pt)
        doc.text(line, W - M, y, { align: 'right' })
      }
      return
    }
    const rightW = right ? doc.getTextWidth(right) + 3 : 0
    const lines = doc.splitTextToSize(latin(left), W - M * 2 - rightW) as string[]
    lines.forEach((line, i) => {
      y += lh(pt)
      doc.text(line, M, y)
      if (i === 0 && right) doc.text(right, W - M, y, { align: 'right' })
    })
  }
  const divider = () => {
    y += 2.5
    doc.setDrawColor(...MUTED)
    doc.setLineWidth(0.2)
    doc.setLineDashPattern([0.8, 0.8], 0)
    doc.line(M, y, W - M, y)
    doc.setLineDashPattern([], 0)
    y += 1
  }

  // Kepala: logo, nama toko, kontak
  if (logo) {
    doc.addImage(logo, 'PNG', W / 2 - 8, y, 16, 16)
    y += 17
  }
  center(d.toko.nama_toko, 13, 'bold')
  if (d.toko.wa_admin) center(`WA ${d.toko.wa_admin}`, 8, 'normal', MUTED)
  y += 1.5
  center('STRUK PEMBAYARAN', 9, 'bold', MUTED)
  divider()

  row('Kode pesanan', d.kode, 9, 'bold')
  if (d.batchNama) row('Batch', d.batchNama)
  row('Pembeli', d.order.customer_nama)
  if (d.order.customer_wa) row('WhatsApp', d.order.customer_wa)
  divider()

  for (const i of d.items) {
    row(i.nama_produk_snapshot, rupiah(Number(i.harga_snapshot) * i.qty), 9, 'bold')
    row(`${i.qty} x ${rupiah(i.harga_snapshot)}`, '', 8, 'normal', MUTED)
    if (i.catatan) row(`Catatan: ${i.catatan}`, '', 8, 'normal', MUTED)
    y += 0.8
  }
  divider()
  row('Subtotal', rupiah(d.order.subtotal))
  if (Number(d.order.ongkir) > 0) row('Ongkir', rupiah(d.order.ongkir))
  y += 0.5
  row('TOTAL', rupiah(d.order.total), 11, 'bold')
  divider()

  font(8, 'bold', MUTED)
  y += lh(8)
  doc.text('PEMBAYARAN', M, y)
  for (const p of d.payments) {
    row(`${tanggal(p.tanggal_bayar, { day: 'numeric', month: 'short', year: 'numeric' })} - ${METODE[p.metode]}`, rupiah(p.jumlah), 8.5)
  }
  row('Total dibayar', rupiah(d.order.terbayar), 9, 'bold')

  // Cap LUNAS
  y += 4
  doc.setDrawColor(...SAGE)
  doc.setLineWidth(0.6)
  doc.roundedRect(W / 2 - 18, y, 36, 10, 2, 2, 'S')
  font(14, 'bold', SAGE)
  doc.text('LUNAS', W / 2, y + 7.2, { align: 'center' })
  y += 11

  divider()
  const ambil = [d.order.tanggal_ambil && tanggal(d.order.tanggal_ambil), jam(d.order.jam_ambil)].filter(Boolean).join(' ')
  row('Cara terima', CARA_TERIMA[d.order.cara_terima], 8.5)
  if (ambil) row('Jadwal', ambil, 8.5)
  if (d.order.alamat) row(`Alamat: ${d.order.alamat}`, '', 8.5)
  divider()

  y += 1
  center('Terima kasih telah berbelanja!', 9, 'bold')
  const now = new Date()
  center(`Dicetak ${now.toLocaleDateString('id-ID')} ${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`, 7, 'normal', MUTED)
  center('Cocokkan kode pesanan dengan penjual bila ragu.', 7, 'normal', MUTED)
  return y + M
}

/** Struk PDF dibuat sepenuhnya di perangkat, tanpa diunggah ke server */
export async function buatStrukPdf(d: StrukData): Promise<File> {
  const [{ jsPDF }, logo] = await Promise.all([import('jspdf'), logoPng(d.toko.logo_path)])
  // Ukur tinggi dulu di halaman panjang, lalu gambar ulang di halaman setinggi isinya
  const tinggi = render(new jsPDF({ unit: 'mm', format: [W, 1000] }), d, logo)
  const doc = new jsPDF({ unit: 'mm', format: [W, Math.max(tinggi, 100)] })
  doc.setProperties({ title: `Struk ${d.kode} - ${latin(d.toko.nama_toko)}` })
  render(doc, d, logo)
  const nama = `struk-${d.kode.replace('#', '')}.pdf`
  return new File([doc.output('blob')], nama, { type: 'application/pdf' })
}

export function unduh(file: File) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(file)
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
