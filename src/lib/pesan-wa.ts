// Template pesan WhatsApp untuk pembeli. Fungsi murni (tanpa React/Supabase) agar mudah diuji.
import { jam, rupiah, tanggal } from './format.ts'

export type JenisPesan = 'diterima' | 'tagihan' | 'lunas' | 'siap' | 'selesai'

export const LABEL_PESAN: Record<JenisPesan, string> = {
  diterima: 'Pesanan diterima',
  tagihan: 'Pengingat bayar',
  lunas: 'Sudah lunas',
  siap: 'Pesanan siap',
  selesai: 'Pesanan selesai',
}

export interface DataPesan {
  nama: string
  kode: string
  toko: string
  infoPembayaran: string | null
  /** Lokasi ambil toko (Pengaturan) */
  lokasi?: string | null
  status: string
  caraTerima: 'pickup' | 'antar' | 'kurir'
  tanggalAmbil: string | null
  jamAmbil: string | null
  items: { nama: string; qty: number; harga: number }[]
  ongkir: number
  total: number
  terbayar: number
  sisa: number
}

const lunas = (d: DataPesan) => d.total > 0 && d.sisa <= 0

/** Template yang masuk akal untuk kondisi pesanan saat ini */
export function pilihanPesan(d: DataPesan): JenisPesan[] {
  if (d.status === 'dibatalkan') return []
  const out: JenisPesan[] = ['diterima']
  if (!lunas(d)) out.push('tagihan')
  if (lunas(d)) out.push('lunas')
  out.push('siap', 'selesai')
  return out
}

/** Template bawaan sesuai status pesanan */
export function pesanBawaan(d: DataPesan): JenisPesan {
  if (d.status === 'selesai') return 'selesai'
  if (d.status === 'siap') return 'siap'
  if (d.status === 'diproduksi') return lunas(d) ? 'lunas' : 'tagihan'
  return 'diterima'
}

function jadwal(d: DataPesan): string {
  const waktu = [d.tanggalAmbil && tanggal(d.tanggalAmbil, { weekday: 'long', day: 'numeric', month: 'long' }), jam(d.jamAmbil)]
    .filter(Boolean).join(' pukul ')
  if (!waktu) return ''
  return `${d.caraTerima === 'pickup' ? 'Jadwal ambil' : 'Jadwal antar'}: ${waktu}`
}

function caraBayar(d: DataPesan): string {
  return d.infoPembayaran ? `Pembayaran bisa ke:\n${d.infoPembayaran}\nLalu kirim bukti transfer di chat ini ya.` : ''
}

function statusBayar(d: DataPesan): string {
  if (lunas(d)) return 'Pembayaran sudah *lunas*. Terima kasih!'
  if (d.terbayar > 0) return `Sudah dibayar ${rupiah(d.terbayar)}, sisa *${rupiah(d.sisa)}*.\n${caraBayar(d)}`
  return caraBayar(d)
}

/** Template buatan toko per jenis pesan; kosong/tidak ada = pesan otomatis bawaan */
export type TemplatePesan = Partial<Record<JenisPesan, string>>

/** Kode yang bisa disisipkan di template, diganti data pesanan saat dikirim */
export const VARIABEL_PESAN: { kode: string; arti: string }[] = [
  { kode: 'nama', arti: 'Nama pembeli' },
  { kode: 'kode', arti: 'Kode pesanan' },
  { kode: 'total', arti: 'Total tagihan' },
  { kode: 'sisa', arti: 'Sisa tagihan' },
  { kode: 'tanggal', arti: 'Tanggal ambil/antar' },
  { kode: 'toko', arti: 'Nama toko' },
  { kode: 'lokasi', arti: 'Lokasi ambil' },
  { kode: 'rincian', arti: 'Daftar item + total' },
  { kode: 'terbayar', arti: 'Sudah dibayar' },
  { kode: 'jadwal', arti: 'Jadwal ambil/antar lengkap' },
  { kode: 'pembayaran', arti: 'Info rekening' },
]

function rincianPesan(d: DataPesan): string {
  return [
    ...d.items.map((i) => `- ${i.nama} x${i.qty} = ${rupiah(i.harga * i.qty)}`),
    ...(d.ongkir > 0 ? [`Ongkir: ${rupiah(d.ongkir)}`] : []),
    `*Total: ${rupiah(d.total)}*`,
  ].join('\n')
}

/** Ganti {kode} di template dengan data pesanan; kode yang tidak dikenal dibiarkan apa adanya */
export function isiTemplate(tpl: string, d: DataPesan): string {
  const nilai: Record<string, string> = {
    nama: d.nama, kode: d.kode, toko: d.toko, rincian: rincianPesan(d), total: rupiah(d.total),
    terbayar: rupiah(d.terbayar), sisa: rupiah(d.sisa), jadwal: jadwal(d), pembayaran: d.infoPembayaran ?? '',
    tanggal: d.tanggalAmbil ? tanggal(d.tanggalAmbil, { weekday: 'short', day: 'numeric', month: 'short' }) : '', lokasi: d.lokasi ?? '',
  }
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => nilai[k] ?? m).replace(/\n{3,}/g, '\n\n').trim()
}

export function buatPesan(jenis: JenisPesan, d: DataPesan, template?: TemplatePesan | null): string {
  const tpl = template?.[jenis]?.trim()
  if (tpl) return isiTemplate(tpl, d)

  const salam = `Halo ${d.nama},`
  const rincian = rincianPesan(d)

  const bagian: string[] = (() => {
    switch (jenis) {
      case 'diterima':
        return [`${salam} terima kasih sudah pesan di ${d.toko}!`, `Pesanan *${d.kode}* sudah kami terima:\n${rincian}`, statusBayar(d), jadwal(d)]
      case 'tagihan':
        return [`${salam} mengingatkan untuk pesanan *${d.kode}* (total ${rupiah(d.total)}).`,
          `Masih ada sisa pembayaran *${rupiah(d.sisa)}*.`, caraBayar(d), 'Terima kasih!']
      case 'lunas':
        return [`${salam} pembayaran pesanan *${d.kode}* sebesar ${rupiah(d.total)} sudah *lunas*. Terima kasih!`,
          'Berikut struk pembayarannya.', jadwal(d)]
      case 'siap':
        return [`${salam} pesanan *${d.kode}* sudah siap ${d.caraTerima === 'pickup' ? 'diambil' : 'diantar'}.`, jadwal(d),
          lunas(d) ? 'Pembayaran sudah lunas.' : `Sisa pembayaran *${rupiah(d.sisa)}*${d.caraTerima === 'pickup' ? ', bisa dibayar saat pengambilan atau transfer.' : '.'}`]
      case 'selesai':
        return [`${salam} pesanan *${d.kode}* sudah *selesai*${lunas(d) ? ' dan *lunas*' : ''}.`,
          lunas(d) ? 'Struk pembayaran terlampir.' : `Masih ada sisa pembayaran *${rupiah(d.sisa)}*.`,
          `Terima kasih sudah berbelanja di ${d.toko}, ditunggu pesanan berikutnya!`]
    }
  })()
  return bagian.filter(Boolean).join('\n\n')
}
