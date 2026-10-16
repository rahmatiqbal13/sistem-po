'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Product } from '@/lib/types'
import { errMsg, parseRupiah, rupiah } from '@/lib/format'
import { hargaDariMargin, hitungHpp, marginPersen, type RincianHpp } from '@/lib/calc'
import { fotoUrl, kompresFoto } from '@/lib/foto'
import { Alert, Button, Empty, Field, Loading, Modal, PageHeader, ProductPhoto, cx, inputCls } from '@/components/ui'

export default function ProdukPage() {
  const [products, setProducts] = useState<Product[] | null>(null)
  const [editing, setEditing] = useState<Partial<Product> | null>(null)

  const load = useCallback(async () => {
    const { data } = await createClient().from('products').select('*').order('aktif', { ascending: false }).order('nama')
    setProducts((data ?? []) as Product[])
  }, [])

  useEffect(() => { load() }, [load])

  async function toggle(p: Product) {
    await createClient().from('products').update({ aktif: !p.aktif }).eq('id', p.id)
    load()
  }

  const openNew = () => setEditing({ nama: '', harga: 0, aktif: true })

  return (
    <>
      <PageHeader title="Produk" subtitle="Harga dan HPP di pesanan lama tidak berubah saat produk diubah."
        action={<Button onClick={openNew}>+ Tambah produk</Button>} />

      {!products ? <Loading /> : products.length === 0 ? (
        <Empty title="Belum ada produk" action={<Button className="px-5" onClick={openNew}>+ Tambah produk</Button>}>
          Tambahkan produk pertama Anda beserta harganya.
        </Empty>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
          {products.map((p) => (
            <div key={p.id} className={cx('flex flex-col gap-3 rounded-card px-6 py-4', p.aktif ? 'bg-surface' : 'bg-neutral-200')}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <ProductPhoto url={fotoUrl(p.foto_path)} size={64} />
                  <div className="min-w-0">
                    <div className="text-[19px] font-bold leading-tight">{p.nama}</div>
                    <div className="mt-0.5 text-neutral-800">{rupiah(p.harga)}</div>
                    <LabaInfo harga={Number(p.harga)} hpp={p.hpp == null ? null : Number(p.hpp)} />
                  </div>
                </div>
                <span className={cx('tag', p.aktif ? 'bg-sage-200 text-sage-900' : 'bg-neutral-200 text-neutral-800')}>
                  {p.aktif ? 'Aktif' : 'Nonaktif'}
                </span>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => toggle(p)}>{p.aktif ? 'Nonaktifkan' : 'Aktifkan'}</Button>
                <Button variant="ghost" onClick={() => setEditing(p)}>Edit</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <ProductForm product={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </>
  )
}

function LabaInfo({ harga, hpp }: { harga: number; hpp: number | null }) {
  if (hpp == null) return <div className="text-sm text-neutral-800">HPP belum diisi</div>
  const laba = harga - hpp
  return (
    <div className={cx('text-sm', laba < 0 ? 'font-bold text-accent-800' : 'text-sage-800')}>
      HPP {rupiah(hpp)} · laba {rupiah(laba)} ({marginPersen(harga, hpp)}%)
    </div>
  )
}

const TARGET_MARGIN = [30, 40, 50]

function ProductForm({ product, onClose, onSaved }: { product: Partial<Product>; onClose: () => void; onSaved: () => void }) {
  const [nama, setNama] = useState(product.nama ?? '')
  const [harga, setHarga] = useState(product.harga ? String(product.harga) : '')
  const [foto, setFoto] = useState<Blob | null>(null)
  const [hapusFoto, setHapusFoto] = useState(false)
  const [preview, setPreview] = useState<string | null>(fotoUrl(product.foto_path))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [hpp, setHpp] = useState(product.hpp != null ? String(product.hpp) : '')
  const [rincian, setRincian] = useState<RincianHpp | null>(product.hpp_rincian ?? null)
  const hv = parseRupiah(harga)
  // Rincian biaya yang diisi menjadi sumber HPP; kalau tidak, HPP diketik langsung
  const hppDariRincian = rincian ? hitungHpp(rincian) : null
  const hppV = hppDariRincian ?? (hpp.trim() ? parseRupiah(hpp) : null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!nama.trim()) return setError('Nama produk wajib diisi.')
    const supabase = createClient()
    const rincianBersih = rincian && { hasil: rincian.hasil, biaya: rincian.biaya.filter((b) => b.nama.trim() || b.jumlah) }
    if (rincianBersih && (rincianBersih.hasil <= 0 || rincianBersih.biaya.length === 0))
      return setError('Rincian HPP: isi minimal 1 biaya dan jumlah hasil (pcs).')
    setBusy(true)
    const row: Partial<Product> = { nama: nama.trim(), harga: hv, hpp: hppV, hpp_rincian: rincianBersih || null }
    if (foto) {
      const path = `${crypto.randomUUID()}.webp`
      const up = await supabase.storage.from('produk').upload(path, foto, { contentType: 'image/webp' })
      if (up.error) { setBusy(false); return setError('Gagal mengunggah foto: ' + errMsg(up.error)) }
      row.foto_path = path
    } else if (hapusFoto) {
      row.foto_path = null
    }
    const { error } = product.id
      ? await supabase.from('products').update(row).eq('id', product.id)
      : await supabase.from('products').insert(row)
    setBusy(false)
    if (error) return setError(errMsg(error))
    // Foto lama tidak dipakai lagi: hapus agar penyimpanan tidak menumpuk
    if (product.foto_path && (foto || hapusFoto)) await supabase.storage.from('produk').remove([product.foto_path])
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={product.id ? 'Edit produk' : 'Tambah produk'}>
      <form onSubmit={save} className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Nama produk" htmlFor="pf-nama" helper="Contoh: Kebab Sapi Jumbo" required>
          <input id="pf-nama" autoFocus value={nama} onChange={(e) => setNama(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Harga (Rp)" htmlFor="pf-harga" helper={hv ? `Tampil sebagai ${rupiah(hv)}` : 'Contoh: 15000'}>
          <input id="pf-harga" inputMode="numeric" value={harga} onChange={(e) => setHarga(e.target.value)} className={cx(inputCls, 'font-bold')} />
        </Field>
        <HppFields hpp={hpp} setHpp={setHpp} rincian={rincian} setRincian={setRincian} hppDariRincian={hppDariRincian} />
        {hppV != null && hv > 0 && (
          <div aria-live="polite" className={cx('rounded-lg px-4 py-3', hv < hppV ? 'bg-accent-200 text-accent-900' : 'bg-sage-100 text-sage-900')}>
            <div>
              Laba kotor <b>{rupiah(hv - hppV)}</b> / pcs · margin <b>{marginPersen(hv, hppV)}%</b>
              {hv < hppV && ' — harga jual di bawah modal.'}
            </div>
            {hppV > 0 && (
              <div className="mt-1 text-sm">
                Saran harga: {TARGET_MARGIN.map((m) => `${rupiah(hargaDariMargin(hppV, m))} (margin ${m}%)`).join(' · ')}
              </div>
            )}
          </div>
        )}
        <div className="flex flex-col">
          <div className="mb-[5px] text-[15px] font-bold">Foto (opsional)</div>
          <div className="flex items-center gap-4">
            <ProductPhoto url={preview} size={96} alt="Pratinjau foto produk" />
            <div className="flex flex-col items-start gap-2">
              <label className="btn btn-secondary relative bg-bg">
                {preview ? 'Ganti foto' : 'Pilih foto'}
                <input type="file" accept="image/*" className="absolute inset-0 cursor-pointer opacity-0" onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  try {
                    const blob = await kompresFoto(f)
                    setFoto(blob)
                    setHapusFoto(false)
                    setPreview(URL.createObjectURL(blob))
                  } catch { setError('Foto tidak bisa dibaca. Coba foto lain.') }
                }} />
              </label>
              {preview && (
                <Button variant="ghost" className="min-h-[44px] text-accent-800 hover:text-accent-800"
                  onClick={() => { setFoto(null); setHapusFoto(true); setPreview(null) }}>
                  Hapus foto
                </Button>
              )}
            </div>
          </div>
          <div className="mt-1 text-sm text-neutral-800">Tampil di link pemesanan. Foto otomatis diperkecil sebelum diunggah.</div>
        </div>
        <Button type="submit" disabled={busy} className="min-h-[50px]">{busy ? 'Menyimpan…' : 'Simpan produk'}</Button>
      </form>
    </Modal>
  )
}

function HppFields({ hpp, setHpp, rincian, setRincian, hppDariRincian }: {
  hpp: string; setHpp: (v: string) => void
  rincian: RincianHpp | null; setRincian: (r: RincianHpp | null) => void
  hppDariRincian: number | null
}) {
  const setBiaya = (i: number, b: Partial<RincianHpp['biaya'][number]>) =>
    rincian && setRincian({ ...rincian, biaya: rincian.biaya.map((x, j) => (j === i ? { ...x, ...b } : x)) })
  const totalBiaya = rincian?.biaya.reduce((s, b) => s + (b.jumlah || 0), 0) ?? 0

  if (!rincian) return (
    <Field label="HPP / modal per pcs (Rp)" htmlFor="pf-hpp"
      helper={<>Biaya bahan + kemasan untuk 1 pcs. Kosongkan jika belum tahu.{' '}
        <button type="button" className="font-bold text-accent-800 underline"
          onClick={() => setRincian({ hasil: 0, biaya: [{ nama: '', jumlah: 0 }] })}>
          Hitung dari rincian biaya
        </button></>}>
      <input id="pf-hpp" inputMode="numeric" value={hpp} onChange={(e) => setHpp(e.target.value)} className={inputCls} />
    </Field>
  )

  return (
    <fieldset className="m-0 flex flex-col gap-3 rounded-card border border-divider p-4">
      <legend className="px-1 text-[15px] font-bold">Hitung HPP dari rincian biaya</legend>
      <p className="m-0 text-sm text-neutral-800">Isi semua biaya untuk satu kali produksi (bahan, kemasan, gas, dll), lalu berapa pcs yang dihasilkan.</p>
      {rincian.biaya.map((b, i) => (
        <div key={i} className="flex items-center gap-2">
          <input aria-label={`Nama biaya ${i + 1}`} placeholder="Contoh: Tepung 1 kg" value={b.nama}
            onChange={(e) => setBiaya(i, { nama: e.target.value })} className={cx(inputCls, 'min-w-0 flex-[2_1_0]')} />
          <input aria-label={`Jumlah biaya ${i + 1} (Rp)`} placeholder="Rp" inputMode="numeric" value={b.jumlah || ''}
            onChange={(e) => setBiaya(i, { jumlah: parseRupiah(e.target.value) })} className={cx(inputCls, 'min-w-0 flex-[1_1_0]')} />
          <Button variant="ghost" aria-label={`Hapus biaya ${i + 1}`} className="min-h-[44px] px-3"
            onClick={() => setRincian({ ...rincian, biaya: rincian.biaya.filter((_, j) => j !== i) })}>×</Button>
        </div>
      ))}
      <Button variant="secondary" className="self-start bg-bg"
        onClick={() => setRincian({ ...rincian, biaya: [...rincian.biaya, { nama: '', jumlah: 0 }] })}>
        + Tambah biaya
      </Button>
      <Field label="Jumlah hasil (pcs)" htmlFor="pf-hasil" helper={`Total biaya ${rupiah(totalBiaya)}`}>
        <input id="pf-hasil" inputMode="numeric" value={rincian.hasil || ''}
          onChange={(e) => setRincian({ ...rincian, hasil: parseRupiah(e.target.value) })} className={inputCls} />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>HPP per pcs: <b className="text-[19px]">{rupiah(hppDariRincian)}</b></span>
        <Button variant="ghost" className="min-h-[44px]"
          onClick={() => { if (hppDariRincian) setHpp(String(hppDariRincian)); setRincian(null) }}>
          Isi HPP manual
        </Button>
      </div>
    </fieldset>
  )
}
