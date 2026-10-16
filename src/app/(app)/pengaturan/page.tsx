'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ImageIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Pengaturan, Product } from '@/lib/types'
import { errMsg, rupiah, tanggal } from '@/lib/format'
import { fotoUrl } from '@/lib/foto'
import { TOKO_EVENT, fetchToko } from '@/lib/toko'
import { NAMA_HARI, URUT_HARI, teksOperasional, type Operasional } from '@/lib/operasional'
import { LABEL_PESAN, VARIABEL_PESAN, buatPesan, type DataPesan, type JenisPesan, type TemplatePesan } from '@/lib/pesan-wa'
import { GAYA, GAYA_DEFAULT, TEMA, TEMA_DEFAULT, pasangTema } from '@/lib/tema'
import { useBatch } from '@/components/batch-context'
import { AturGambar } from '@/components/atur-gambar'
import { KelolaAdmin } from '@/components/kelola-admin'
import { Alert, Button, Field, ICON, Loading, PageHeader, ProductPhoto, cx, inputCls } from '@/components/ui'

const CARD = 'flex flex-col gap-4 rounded-card bg-surface p-6'

/** Simpan sebagian kolom pengaturan (baris tunggal id = 1) */
async function simpanKolom(patch: Partial<Pengaturan>): Promise<string | null> {
  const { error } = await createClient().from('pengaturan').upsert({ id: 1, ...patch })
  if (error) return errMsg(error)
  window.dispatchEvent(new Event(TOKO_EVENT))
  return null
}

export default function PengaturanPage() {
  const router = useRouter()
  const [toko, setToko] = useState<Pengaturan | null>(null)

  useEffect(() => { fetchToko().then(setToko) }, [])

  async function logout() {
    await createClient().auth.signOut()
    router.replace('/login')
  }

  if (!toko) return <Loading />
  const patch = (p: Partial<Pengaturan>) => setToko((t) => t && { ...t, ...p })

  return (
    <>
      <PageHeader title="Pengaturan toko" subtitle="Ditampilkan kepada pembeli di link pemesanan." />
      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[1_1_460px] flex-col gap-6">
          <InfoToko awal={toko} onSaved={patch} />
          <JamOperasional awal={toko} onChange={patch} />
          <TemplateWa toko={toko} onChange={(template_wa) => patch({ template_wa })} />
          <Tampilan tema={toko.tema} gaya={toko.gaya} onChange={(tema, gaya) => patch({ tema, gaya })} />
          <KelolaAdmin />
        </div>
        <Pratinjau toko={toko} onChange={patch} />
      </div>
      {/* Di HP tidak ada sidebar, jadi tombol keluar diletakkan di sini */}
      <div className="md:hidden"><Button variant="secondary" className="px-6" onClick={logout}>Keluar</Button></div>
    </>
  )
}

/** Peringatan browser saat meninggalkan halaman dengan perubahan yang belum disimpan */
function useBelumDisimpan(aktif: boolean) {
  useEffect(() => {
    if (!aktif) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [aktif])
}

type Status = 'tersimpan' | 'menunggu' | 'menyimpan' | 'gagal'

/** Simpan otomatis ±0,8 detik setelah berhenti mengetik; status ditampilkan agar jelas sudah tersimpan atau belum */
function useSimpanOtomatis<T>(nilai: T, simpan: (v: T) => Promise<string | null>) {
  const [status, setStatus] = useState<Status>('tersimpan')
  const [err, setErr] = useState('')
  const [coba, setCoba] = useState(0)
  const kunci = JSON.stringify(nilai)
  const terakhir = useRef(kunci)
  const simpanRef = useRef(simpan)
  useEffect(() => { simpanRef.current = simpan })

  useEffect(() => {
    if (kunci === terakhir.current) return
    setStatus('menunggu')
    let batal = false
    const t = setTimeout(async () => {
      setStatus('menyimpan')
      const e = await simpanRef.current(JSON.parse(kunci) as T)
      if (batal) return
      if (e) { setErr(e); setStatus('gagal') } else { terakhir.current = kunci; setErr(''); setStatus('tersimpan') }
    }, 800)
    return () => { batal = true; clearTimeout(t) }
  }, [kunci, coba])

  useBelumDisimpan(status !== 'tersimpan')
  return { status, err, ulang: () => setCoba((n) => n + 1) }
}

function StatusSimpan({ status, onUlang }: { status: Status | 'berubah'; onUlang?: () => void }) {
  const teks = {
    tersimpan: '✓ Tersimpan', berubah: '● Belum disimpan', menunggu: '● Belum disimpan', menyimpan: 'Menyimpan…', gagal: '✕ Gagal menyimpan',
  }[status]
  return (
    <span aria-live="polite" className={cx('inline-flex shrink-0 items-center gap-2 text-sm font-bold',
      status === 'tersimpan' ? 'text-sage-800' : status === 'gagal' ? 'text-accent-800' : 'text-neutral-800')}>
      {teks}
      {status === 'gagal' && onUlang && <button type="button" onClick={onUlang} className="btn btn-ghost min-h-0 px-2 py-1">Coba lagi</button>}
    </span>
  )
}

function JudulKartu({ id, judul, sub, status }: { id: string; judul: string; sub: string; status?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
      <div className="min-w-0 flex-[1_1_240px]">
        <h2 id={id} className="text-section">{judul}</h2>
        <div className="mt-0.5 text-sm text-neutral-800">{sub}</div>
      </div>
      {status}
    </div>
  )
}

/** Nama toko, WA admin, info pembayaran: disimpan dengan tombol */
function InfoToko({ awal, onSaved }: { awal: Pengaturan; onSaved: (p: Partial<Pengaturan>) => void }) {
  const ambil = (t: Pengaturan) => ({ nama_toko: t.nama_toko, wa_admin: t.wa_admin ?? '', info_pembayaran: t.info_pembayaran ?? '' })
  const [form, setForm] = useState(() => ambil(awal))
  const [tersimpan, setTersimpan] = useState(() => ambil(awal))
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const berubah = JSON.stringify(form) !== JSON.stringify(tersimpan)
  useBelumDisimpan(berubah)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nama_toko.trim()) return setMsg({ tone: 'bad', text: 'Nama toko wajib diisi.' })
    setBusy(true)
    const isi = { nama_toko: form.nama_toko.trim(), wa_admin: form.wa_admin.trim() || null, info_pembayaran: form.info_pembayaran.trim() || null }
    const error = await simpanKolom(isi)
    setBusy(false)
    if (error) return setMsg({ tone: 'bad', text: error })
    const baru = { nama_toko: isi.nama_toko, wa_admin: isi.wa_admin ?? '', info_pembayaran: isi.info_pembayaran ?? '' }
    setForm(baru)
    setTersimpan(baru)
    onSaved(isi)
    setMsg({ tone: 'ok', text: 'Pengaturan tersimpan.' })
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm({ ...form, [k]: e.target.value })
    setMsg(null)
  }

  return (
    <form onSubmit={save} className={CARD}>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <Field label="Nama toko" htmlFor="st-nama" helper="Judul di halaman pemesanan." required>
        <input id="st-nama" value={form.nama_toko} onChange={set('nama_toko')} className={inputCls} />
      </Field>
      <Field label="Nomor WhatsApp admin" htmlFor="st-wa"
        helper="Pembeli diarahkan ke nomor ini untuk konfirmasi & kirim bukti transfer. Contoh: 0812 3456 7890">
        <input id="st-wa" inputMode="tel" value={form.wa_admin} onChange={set('wa_admin')} className={inputCls} />
      </Field>
      <Field label="Info pembayaran" htmlFor="st-info" helper="Contoh: BCA 1234567890 a.n. Iqbal · DANA 0812…">
        <textarea id="st-info" rows={3} value={form.info_pembayaran} onChange={set('info_pembayaran')} className={inputCls} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy || !berubah} className="btn-lg">{busy ? 'Menyimpan…' : 'Simpan pengaturan'}</Button>
        <StatusSimpan status={busy ? 'menyimpan' : berubah ? 'berubah' : 'tersimpan'} />
      </div>
    </form>
  )
}

/** Jam buka, hari buka, lokasi ambil, area antar: tersimpan otomatis */
function JamOperasional({ awal, onChange }: { awal: Pengaturan; onChange: (p: Partial<Pengaturan>) => void }) {
  const [o, setO] = useState<Operasional>(() => ({
    jam_buka: awal.jam_buka, jam_tutup: awal.jam_tutup, hari_buka: awal.hari_buka,
    lokasi_ambil: awal.lokasi_ambil, area_antar: awal.area_antar,
  }))
  const { status, err, ulang } = useSimpanOtomatis(o, (v) => simpanKolom({
    jam_buka: v.jam_buka || null, jam_tutup: v.jam_tutup || null, hari_buka: v.hari_buka?.length ? v.hari_buka : null,
    lokasi_ambil: v.lokasi_ambil?.trim() || null, area_antar: v.area_antar?.trim() || null,
  }))
  const ubah = (p: Partial<Operasional>) => { const baru = { ...o, ...p }; setO(baru); onChange(p) }
  const hari = o.hari_buka ?? []

  return (
    <section aria-labelledby="ttl-ops" className={CARD}>
      <JudulKartu id="ttl-ops" judul="Jam operasional & lokasi ambil" sub="Tampil di halaman pembeli dan template pesan."
        status={<StatusSimpan status={status} onUlang={ulang} />} />
      {status === 'gagal' && <Alert>Gagal menyimpan: {err}</Alert>}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
        <Field label="Jam buka" htmlFor="op-buka">
          <input id="op-buka" type="time" value={o.jam_buka ?? ''} onChange={(e) => ubah({ jam_buka: e.target.value || null })} className={inputCls} />
        </Field>
        <Field label="Jam tutup" htmlFor="op-tutup">
          <input id="op-tutup" type="time" value={o.jam_tutup ?? ''} onChange={(e) => ubah({ jam_tutup: e.target.value || null })} className={inputCls} />
        </Field>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="text-label font-bold">Hari buka</div>
        <div role="group" aria-label="Hari buka" className="flex flex-wrap gap-1.5">
          {URUT_HARI.map((d) => {
            const on = hari.includes(d)
            return (
              <button key={d} type="button" aria-pressed={on}
                onClick={() => ubah({ hari_buka: on ? hari.filter((x) => x !== d) : [...hari, d] })}
                className={cx('min-h-[44px] min-w-[52px] rounded-full border-2 border-[var(--line)] px-3 text-caption font-bold',
                  on ? 'bg-accent-200 text-accent-900' : 'bg-surface text-neutral-800 hover:bg-accent-100')}>
                {NAMA_HARI[d]}
              </button>
            )
          })}
        </div>
      </div>
      <Field label="Lokasi ambil" htmlFor="op-lokasi">
        <textarea id="op-lokasi" rows={2} value={o.lokasi_ambil ?? ''} onChange={(e) => ubah({ lokasi_ambil: e.target.value })}
          className={cx(inputCls, 'min-h-0')} placeholder="Contoh: Jl. Cendana 8, Bandung (teras depan)" />
      </Field>
      <Field label="Area pengantaran" htmlFor="op-area">
        <input id="op-area" value={o.area_antar ?? ''} onChange={(e) => ubah({ area_antar: e.target.value })}
          className={inputCls} placeholder="Contoh: Bandung utara" />
      </Field>
    </section>
  )
}

const JENIS: JenisPesan[] = ['diterima', 'tagihan', 'siap', 'lunas', 'selesai']
const LABEL_TAB: Record<JenisPesan, string> = { ...LABEL_PESAN, diterima: 'Konfirmasi' }

/** Template pesan WhatsApp per jenis; kosong = pesan otomatis. Tersimpan otomatis. */
function TemplateWa({ toko, onChange }: { toko: Pengaturan; onChange: (t: TemplatePesan | null) => void }) {
  const [draft, setDraft] = useState<TemplatePesan>(toko.template_wa ?? {})
  const [jenis, setJenis] = useState<JenisPesan>('diterima')
  const ref = useRef<HTMLTextAreaElement>(null)
  const bersih = (t: TemplatePesan) => {
    const isi = Object.fromEntries(JENIS.filter((j) => t[j]?.trim()).map((j) => [j, t[j]!.trim()])) as TemplatePesan
    return Object.keys(isi).length ? isi : null
  }
  const { status, err, ulang } = useSimpanOtomatis(bersih(draft), (v) => simpanKolom({ template_wa: v }))

  const teks = draft[jenis] ?? ''
  const ubah = (v: string) => { const baru = { ...draft, [jenis]: v }; setDraft(baru); onChange(bersih(baru)) }

  // Sisipkan {kode} di posisi kursor
  function sisip(kode: string) {
    const el = ref.current
    const tag = `{${kode}}`
    const a = el?.selectionStart ?? teks.length, b = el?.selectionEnd ?? teks.length
    ubah(teks.slice(0, a) + tag + teks.slice(b))
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + tag.length, a + tag.length) })
  }

  const contoh: DataPesan = {
    nama: 'Bu Ratna', kode: '#K7F2A1', toko: toko.nama_toko || 'Nama toko', infoPembayaran: toko.info_pembayaran, lokasi: toko.lokasi_ambil,
    status: 'dikonfirmasi', caraTerima: 'pickup', tanggalAmbil: new Date().toISOString().slice(0, 10), jamAmbil: '10:00',
    items: [{ nama: 'Kebab Sapi', qty: 4, harga: 25000 }, { nama: 'Risoles Mayo', qty: 10, harga: 6000 }],
    ongkir: 0, total: 160000, terbayar: 100000, sisa: 60000,
  }
  const otomatis = !teks.trim()

  return (
    <section aria-labelledby="ttl-wa" className={CARD}>
      <JudulKartu id="ttl-wa" judul="Template pesan WhatsApp"
        sub="Disalin otomatis saat menghubungi pembeli. Klik kode untuk menyisipkan data."
        status={<StatusSimpan status={status} onUlang={ulang} />} />
      {status === 'gagal' && <Alert>Gagal menyimpan: {err}</Alert>}
      <div role="group" aria-label="Jenis pesan" className="flex flex-wrap gap-1.5">
        {JENIS.map((j) => {
          const on = j === jenis
          return (
            <button key={j} type="button" aria-pressed={on} onClick={() => setJenis(j)}
              className={cx('min-h-[44px] rounded-full border-2 border-[var(--line)] px-4 text-caption font-bold',
                on ? 'bg-accent-200 text-accent-900' : 'bg-surface text-ink hover:bg-accent-100')}>
              {LABEL_TAB[j]}
            </button>
          )
        })}
      </div>
      <label htmlFor="wa-teks" className="sr-only">Isi template {LABEL_TAB[jenis]}</label>
      <textarea id="wa-teks" ref={ref} rows={5} value={teks} onChange={(e) => ubah(e.target.value)} className={cx(inputCls, 'text-sm')}
        placeholder="Kosong: memakai pesan otomatis (lihat contoh di bawah). Ketik di sini untuk membuat template sendiri." />
      <div className="flex flex-wrap gap-1.5">
        {VARIABEL_PESAN.map((v) => (
          <button key={v.kode} type="button" onClick={() => sisip(v.kode)} title={v.arti} aria-label={`Sisipkan ${v.arti}`}
            className="min-h-[36px] rounded-full bg-accent-100 px-2.5 text-caption font-bold text-accent-900 hover:bg-accent-200">
            {`{${v.kode}}`}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption font-bold text-neutral-800">{otomatis ? 'Contoh hasil (pesan otomatis)' : 'Contoh hasil'}</span>
          {!otomatis && <button type="button" onClick={() => ubah('')} className="btn btn-ghost min-h-0 px-2 py-1 text-caption">Pakai pesan otomatis</button>}
        </div>
        <div className="max-w-[90%] self-start whitespace-pre-wrap rounded-[16px_16px_16px_4px] bg-sage-100 px-3.5 py-2.5 text-sm text-sage-900">
          {buatPesan(jenis, contoh, draft)}
        </div>
      </div>
    </section>
  )
}

/** Tema warna & gaya kartu: langsung dipasang dan disimpan, berlaku juga di halaman pemesanan pembeli */
function Tampilan({ tema, gaya, onChange }: { tema: string | null; gaya: string | null; onChange: (tema: string, gaya: string) => void }) {
  const [err, setErr] = useState('')
  const aktifTema = tema && TEMA[tema] ? tema : TEMA_DEFAULT
  const aktifGaya = gaya === 'Tegas' ? 'Tegas' : GAYA_DEFAULT

  async function pilih(t: string, g: string) {
    const lama = [aktifTema, aktifGaya] as const
    onChange(t, g)
    pasangTema(t, g)
    setErr('')
    const error = await simpanKolom({ tema: t, gaya: g })
    if (error) {
      onChange(...lama)
      pasangTema(...lama)
      setErr('Tampilan gagal disimpan: ' + error)
    }
  }

  const grup = (g: 'pastel' | 'makanan', label: string) => (
    <>
      <div className="text-caption font-semibold text-neutral-800">{label}</div>
      <div role="radiogroup" aria-label={`Warna tema ${label.toLowerCase()}`} className="flex flex-wrap gap-2">
        {Object.entries(TEMA).filter(([, p]) => p.grup === g).map(([nama, p]) => {
          const on = nama === aktifTema
          return (
            <button key={nama} type="button" role="radio" aria-checked={on} onClick={() => pilih(nama, aktifGaya)}
              className="flex min-h-[44px] items-center gap-2 rounded-full border-2 py-1 pl-1.5 pr-3.5 text-sm font-bold text-ink"
              style={{ borderColor: on ? p.a[6] : 'var(--line)', background: on ? p.a[0] : 'var(--color-surface)' }}>
              <span aria-hidden="true" className="flex">
                {[p.a[2], p.a[5], p.b[3]].map((c, i) => (
                  <span key={i} className={cx('size-[22px] rounded-full border-2 border-white', i > 0 && '-ml-2')} style={{ background: c }} />
                ))}
              </span>
              {nama}
            </button>
          )
        })}
      </div>
    </>
  )

  return (
    <section aria-labelledby="ttl-tampilan" className={CARD}>
      <JudulKartu id="ttl-tampilan" judul="Pengaturan tampilan" sub="Berlaku juga untuk halaman pemesanan pembeli. Tersimpan otomatis." />
      {err && <Alert>{err}</Alert>}
      <div className="flex flex-col gap-2">
        <div className="text-sm font-bold">Warna tema</div>
        {grup('pastel', 'Pastel')}
        {grup('makanan', 'Makanan')}
      </div>
      <div className="flex flex-col gap-2">
        <div className="text-sm font-bold">Gaya kartu</div>
        <div role="radiogroup" aria-label="Gaya kartu" className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2">
          {GAYA.map((g) => {
            const on = g.nama === aktifGaya
            return (
              <button key={g.nama} type="button" role="radio" aria-checked={on} onClick={() => pilih(aktifTema, g.nama)}
                className={cx('flex flex-col items-start gap-0.5 rounded-lg border-2 border-[var(--line)] px-3.5 py-2.5 text-left',
                  on ? 'bg-accent-200 text-accent-900' : 'bg-surface text-ink hover:bg-accent-100')}>
                <span className="text-sm font-extrabold">{g.nama}</span>
                <span className="text-caption">{g.desc}</span>
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/** Unggah gambar toko (logo/sampul, sudah dipotong di AturGambar) ke bucket publik, simpan path-nya, lalu hapus file lama */
function useGambarToko(kolom: 'logo_path' | 'sampul_path', folder: string, lama: string | null,
  onDone: (path: string | null) => void, onErr: (m: string) => void) {
  const [busy, setBusy] = useState(false)
  async function ganti(blob: Blob | null) {
    setBusy(true)
    try {
      const supabase = createClient()
      let path: string | null = null
      if (blob) {
        path = `${folder}/${crypto.randomUUID()}.webp`
        const up = await supabase.storage.from('produk').upload(path, blob, { contentType: 'image/webp' })
        if (up.error) throw new Error('Gagal mengunggah: ' + errMsg(up.error))
      }
      const e = await simpanKolom({ [kolom]: path })
      if (e) throw new Error(e)
      if (lama) await supabase.storage.from('produk').remove([lama])
      onDone(path)
    } catch (e) { onErr((e as Error).message) }
    setBusy(false)
  }
  return { busy, ganti }
}

/** Pratinjau halaman pembeli. Klik sampul/logo untuk mengganti gambar. */
function Pratinjau({ toko, onChange }: { toko: Pengaturan; onChange: (p: Partial<Pengaturan>) => void }) {
  const { batch } = useBatch()
  const [produk, setProduk] = useState<Product[]>([])
  const [err, setErr] = useState('')
  useEffect(() => {
    createClient().from('products').select('*').eq('aktif', true).order('nama').limit(3)
      .then(({ data }) => setProduk((data ?? []) as Product[]))
  }, [])
  const sampul = useGambarToko('sampul_path', 'sampul', toko.sampul_path, (p) => { onChange({ sampul_path: p }); setErr('') }, setErr)
  const logo = useGambarToko('logo_path', 'logo', toko.logo_path, (p) => { onChange({ logo_path: p }); setErr('') }, setErr)
  // Gambar yang sedang diatur ukuran & posisinya sebelum disimpan
  const [atur, setAtur] = useState<{ jenis: 'logo' | 'sampul'; src: string; lokal: boolean } | null>(null)
  const tutupAtur = () => { if (atur?.lokal) URL.revokeObjectURL(atur.src); setAtur(null) }
  const opt: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }
  const info = teksOperasional(toko)
  const sampulUrl = fotoUrl(toko.sampul_path), logoUrl = fotoUrl(toko.logo_path)

  const pilihFile = (jenis: 'logo' | 'sampul') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) setAtur({ jenis, src: URL.createObjectURL(f), lokal: true })
  }

  return (
    <aside aria-label="Pratinjau halaman pembeli" className="flex w-full min-w-[280px] flex-col gap-2 md:sticky md:top-6 md:w-auto md:flex-[0_1_340px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-extrabold">Pratinjau halaman pembeli</span>
        <span className="tag border-2 border-[var(--line)] bg-accent-100 text-accent-900">Langsung</span>
      </div>
      {err && <Alert>{err}</Alert>}
      <div className="overflow-hidden rounded-[28px] border-2 border-[var(--line)] bg-bg shadow-[var(--pop)]">
        <label className={cx('group relative block aspect-[3/1] cursor-pointer overflow-hidden bg-accent-200 focus-within:outline-2 focus-within:outline-accent-700',
          !sampulUrl && 'border-b-2 border-dashed border-accent-400')}>
          <span className="sr-only">{sampulUrl ? 'Ganti foto sampul' : 'Pilih foto sampul'}</span>
          {sampulUrl
            ? <img src={sampulUrl} alt="" className="size-full object-cover" />
            : (
              <span aria-hidden="true" className="grid size-full place-items-center content-center gap-1 text-sm text-accent-900">
                <ImageIcon size={28} {...ICON} className="mx-auto" />Foto sampul
              </span>
            )}
          {sampul.busy && <span className="absolute inset-0 grid place-items-center bg-bg/70 text-sm font-bold">Mengunggah…</span>}
          <input type="file" accept="image/*" className="absolute inset-0 cursor-pointer opacity-0" disabled={sampul.busy}
            onChange={pilihFile('sampul')} />
        </label>
        <div className="flex flex-col gap-2.5 px-4 pb-4">
          <label className="relative -mt-8 grid size-16 cursor-pointer place-items-center overflow-hidden rounded-full border-[3px] border-bg bg-accent-300 text-section font-extrabold text-accent-900 shadow-[var(--pop-sm)] focus-within:outline-2 focus-within:outline-accent-700">
            <span className="sr-only">{logoUrl ? 'Ganti logo' : 'Pilih logo'}</span>
            {logoUrl ? <img src={logoUrl} alt="" className="size-full object-cover" />
              : <span aria-hidden="true" className="text-caption">Logo</span>}
            {logo.busy && <span className="absolute inset-0 grid place-items-center bg-bg/70 text-xs font-bold">…</span>}
            <input type="file" accept="image/*" className="absolute inset-0 cursor-pointer opacity-0" disabled={logo.busy}
              onChange={pilihFile('logo')} />
          </label>
          <div>
            <div className="text-xs font-bold text-accent-700">{toko.nama_toko || 'Nama toko'}</div>
            <div className="text-card font-extrabold">{batch?.nama ?? 'Nama batch PO'}</div>
            {batch && (
              <div className="mt-0.5 text-xs text-neutral-800">
                Tutup {tanggal(batch.tanggal_tutup, opt)} · Siap {tanggal(batch.tanggal_ambil, opt)}
              </div>
            )}
          </div>
          {info && <div className="rounded-md bg-sage-100 px-2.5 py-2 text-xs leading-snug text-sage-900">{info}</div>}
          {produk.map((p) => (
            <div key={p.id} className="flex items-center gap-2.5 rounded-[14px] border-[1.5px] border-[var(--line)] bg-surface p-2">
              <ProductPhoto url={fotoUrl(p.foto_path)} size={36} washed={false} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-caption font-bold">{p.nama}</span>
                <span className="block text-xs text-neutral-800">{rupiah(p.harga)}</span>
              </span>
              <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-300 font-extrabold text-accent-900">+</span>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-full border-2 border-[var(--line)] bg-accent-300 px-3.5 py-2.5 text-caption font-extrabold text-accent-900 shadow-[var(--pop-sm)]">
            <span>Lihat keranjang</span><span>2 item</span>
          </div>
        </div>
      </div>
      <div className="text-caption text-neutral-800">Klik sampul atau logo di pratinjau untuk mengganti gambar, lalu atur ukuran & posisinya. Logo juga dipakai di struk. Warna mengikuti tema yang dipilih.</div>
      {(sampulUrl || logoUrl) && (
        <div className="flex flex-wrap gap-1">
          {sampulUrl && <>
            <Button variant="ghost" className="min-h-[36px] px-2 text-caption" disabled={sampul.busy}
              onClick={() => setAtur({ jenis: 'sampul', src: sampulUrl, lokal: false })}>Atur sampul</Button>
            <Button variant="ghost" className="min-h-[36px] px-2 text-caption" disabled={sampul.busy} onClick={() => sampul.ganti(null)}>Hapus sampul</Button>
          </>}
          {logoUrl && <>
            <Button variant="ghost" className="min-h-[36px] px-2 text-caption" disabled={logo.busy}
              onClick={() => setAtur({ jenis: 'logo', src: logoUrl, lokal: false })}>Atur logo</Button>
            <Button variant="ghost" className="min-h-[36px] px-2 text-caption" disabled={logo.busy} onClick={() => logo.ganti(null)}>Hapus logo</Button>
          </>}
        </div>
      )}
      {atur && (
        <AturGambar src={atur.src} onBatal={tutupAtur}
          {...(atur.jenis === 'logo'
            ? { judul: 'Atur logo', rasio: 1, bulat: true, lebarHasil: 480 }
            : { judul: 'Atur foto sampul', rasio: 3, lebarHasil: 1500 })}
          onSimpan={async (blob) => { await (atur.jenis === 'logo' ? logo : sampul).ganti(blob); tutupAtur() }} />
      )}
    </aside>
  )
}
