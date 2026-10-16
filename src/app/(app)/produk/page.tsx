'use client'

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { LayoutGrid, List } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Product } from '@/lib/types'
import { errMsg, parseRupiah, rupiah } from '@/lib/format'
import { hargaDariMargin, hitungHpp, marginPersen, type RincianHpp } from '@/lib/calc'
import { fotoUrl, kompresFoto } from '@/lib/foto'
import { Alert, Button, Empty, Field, ICON, Loading, Modal, PageHeader, ProductPhoto, cx, inputCls } from '@/components/ui'

export default function ProdukPage() {
  const [products, setProducts] = useState<Product[] | null>(null)
  const [editing, setEditing] = useState<Partial<Product> | null>(null)
  const [view, setView] = useView()

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
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-neutral-800">
              {products.length} produk · {products.filter((p) => p.aktif).length} aktif
            </span>
            <ViewToggle view={view} onChange={setView} />
          </div>
          {view === 'card' ? (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4">
              {products.map((p) => <ProductCard key={p.id} p={p} onToggle={() => toggle(p)} onEdit={() => setEditing(p)} />)}
            </div>
          ) : (
            <ProductTable products={products} onToggle={toggle} onEdit={setEditing} />
          )}
        </>
      )}

      {editing && <ProductForm product={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </>
  )
}

// Pilihan tampilan disimpan per perangkat
type View = 'card' | 'table'
const VIEW_KEY = 'po.produkView'
const viewSubs = new Set<() => void>()

function useView(): [View, (v: View) => void] {
  const view = useSyncExternalStore<View>(
    (cb) => { viewSubs.add(cb); return () => viewSubs.delete(cb) },
    () => { try { return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'card' } catch { return 'card' } },
    () => 'card',
  )
  const set = useCallback((v: View) => {
    try { localStorage.setItem(VIEW_KEY, v) } catch {}
    viewSubs.forEach((cb) => cb())
  }, [])
  return [view, set]
}

function ViewToggle({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const opts = [['card', 'Kartu', LayoutGrid], ['table', 'Tabel', List]] as const
  return (
    <div role="group" aria-label="Tampilan" className="flex rounded-full bg-surface p-1">
      {opts.map(([v, label, Icon]) => (
        <button key={v} type="button" aria-pressed={view === v} onClick={() => onChange(v)}
          className={cx('flex min-h-[40px] items-center gap-2 rounded-full px-4 text-[15px] font-semibold',
            view === v ? 'bg-accent text-ink' : 'text-neutral-800 hover:text-ink')}>
          <Icon size={16} {...ICON} />{label}
        </button>
      ))}
    </div>
  )
}

function StatusTag({ aktif }: { aktif: boolean }) {
  return (
    <span className={cx('tag shrink-0 text-[13px]', aktif ? 'bg-sage-200 text-sage-900' : 'bg-neutral-300 text-neutral-800')}>
      {aktif ? 'Aktif' : 'Nonaktif'}
    </span>
  )
}

function labaOf(p: Product) {
  const harga = Number(p.harga)
  const hpp = p.hpp == null ? null : Number(p.hpp)
  return { harga, hpp, laba: hpp == null ? null : harga - hpp, margin: hpp == null ? null : marginPersen(harga, hpp) }
}

function ProductCard({ p, onToggle, onEdit }: { p: Product; onToggle: () => void; onEdit: () => void }) {
  const { harga, hpp, laba, margin } = labaOf(p)
  return (
    <article className={cx('flex flex-col gap-4 rounded-card p-5', p.aktif ? 'bg-surface' : 'bg-neutral-200 text-neutral-800')}>
      <div className="flex items-start gap-4">
        <ProductPhoto url={fotoUrl(p.foto_path)} size={72} />
        <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
          <StatusTag aktif={p.aktif} />
          <div className="line-clamp-2 text-[17px] font-bold leading-snug text-ink" title={p.nama}>{p.nama}</div>
        </div>
      </div>

      <dl className="m-0 grid grid-cols-3 divide-x divide-divider rounded-2xl bg-bg py-3 tabular-nums">
        <div className="px-3">
          <dt className="text-[12px] font-semibold uppercase tracking-wide text-neutral-800">Harga</dt>
          <dd className="m-0 mt-0.5 text-[15px] font-bold text-ink">{rupiah(harga)}</dd>
        </div>
        <div className="px-3">
          <dt className="text-[12px] font-semibold uppercase tracking-wide text-neutral-800">HPP</dt>
          <dd className="m-0 mt-0.5 text-[15px] font-bold text-ink">{hpp == null ? '—' : rupiah(hpp)}</dd>
        </div>
        <div className="px-3">
          <dt className="text-[12px] font-semibold uppercase tracking-wide text-neutral-800">Laba</dt>
          <dd className={cx('m-0 mt-0.5 text-[15px] font-bold', laba != null && laba < 0 ? 'text-accent-800' : 'text-sage-800')}>
            {laba == null ? '—' : rupiah(laba)}
          </dd>
          {margin != null && <dd className="m-0 text-[12px] text-neutral-800">{margin}%</dd>}
        </div>
      </dl>
      {hpp == null && <p className="-mt-2 m-0 text-[13px] text-neutral-800">Isi HPP lewat Edit untuk melihat laba.</p>}

      <div className="mt-auto flex gap-2">
        <Button variant="secondary" className="min-h-[44px] flex-1" onClick={onToggle}>{p.aktif ? 'Nonaktifkan' : 'Aktifkan'}</Button>
        <Button variant="ghost" className="min-h-[44px] px-5" onClick={onEdit}>Edit</Button>
      </div>
    </article>
  )
}

function ProductTable({ products, onToggle, onEdit }: { products: Product[]; onToggle: (p: Product) => void; onEdit: (p: Product) => void }) {
  return (
    <div className="overflow-x-auto rounded-card bg-surface px-3 py-2">
      <table className="table min-w-[720px] tabular-nums">
        <thead>
          <tr>
            <th>Produk</th>
            <th className="text-right!">Harga</th>
            <th className="text-right!">HPP</th>
            <th className="text-right!">Laba / pcs</th>
            <th className="text-right!">Margin</th>
            <th>Status</th>
            <th><span className="sr-only">Aksi</span></th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const { harga, hpp, laba, margin } = labaOf(p)
            return (
              <tr key={p.id} className={cx(!p.aktif && 'text-neutral-800')}>
                <td>
                  <div className="flex items-center gap-3">
                    <ProductPhoto url={fotoUrl(p.foto_path)} size={44} />
                    <span className="font-semibold text-ink">{p.nama}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap text-right font-semibold">{rupiah(harga)}</td>
                <td className="whitespace-nowrap text-right">{hpp == null ? <span className="text-neutral-800">—</span> : rupiah(hpp)}</td>
                <td className={cx('whitespace-nowrap text-right font-bold', laba != null && laba < 0 ? 'text-accent-800' : 'text-sage-800')}>
                  {laba == null ? '—' : rupiah(laba)}
                </td>
                <td className="whitespace-nowrap text-right">{margin == null ? '—' : `${margin}%`}</td>
                <td><StatusTag aktif={p.aktif} /></td>
                <td>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" className="min-h-[40px] px-3" onClick={() => onEdit(p)}>Edit</Button>
                    <Button variant="ghost" className="min-h-[40px] px-3 text-neutral-800" onClick={() => onToggle(p)}>
                      {p.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                    </Button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
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
  // HPP opsional: rincian yang belum lengkap atau kolom kosong = HPP belum diisi (null)
  const rincianBersih = rincian && { hasil: rincian.hasil, biaya: rincian.biaya.filter((b) => b.nama.trim() || b.jumlah) }
  const rincianKosong = !!rincianBersih && !rincianBersih.hasil && rincianBersih.biaya.length === 0
  const hppDariRincian = rincianBersih && rincianBersih.hasil > 0 && rincianBersih.biaya.length > 0 ? hitungHpp(rincianBersih) : null
  const hppV = rincian ? hppDariRincian : hpp.trim() ? parseRupiah(hpp) : null

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!nama.trim()) return setError('Nama produk wajib diisi.')
    const supabase = createClient()
    // Rincian yang diisi sebagian kemungkinan lupa; yang kosong sama sekali berarti HPP dilewati
    if (rincianBersih && !rincianKosong && hppDariRincian == null)
      return setError('Rincian HPP belum lengkap: isi biaya dan jumlah hasil (pcs), atau kosongkan semuanya.')
    setBusy(true)
    const row: Partial<Product> = { nama: nama.trim(), harga: hv, hpp: hppV, hpp_rincian: rincianKosong ? null : rincianBersih || null }
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
    <Field label="HPP / modal per pcs (Rp, opsional)" htmlFor="pf-hpp"
      helper={<>Biaya bahan + kemasan untuk 1 pcs. Boleh dikosongkan; laba produk ini tidak dihitung sampai HPP diisi.{' '}
        <button type="button" className="font-bold text-accent-800 underline"
          onClick={() => setRincian({ hasil: 0, biaya: [{ nama: '', jumlah: 0 }] })}>
          Hitung dari rincian biaya
        </button></>}>
      <input id="pf-hpp" inputMode="numeric" value={hpp} onChange={(e) => setHpp(e.target.value)} className={inputCls} />
    </Field>
  )

  return (
    <fieldset className="m-0 flex flex-col gap-3 rounded-card border border-divider p-4">
      <legend className="px-1 text-[15px] font-bold">Hitung HPP dari rincian biaya (opsional)</legend>
      <p className="m-0 text-sm text-neutral-800">Isi semua biaya untuk satu kali produksi (bahan, kemasan, gas, dll), lalu berapa pcs yang dihasilkan. Biarkan kosong untuk melewati.</p>
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
        <span>HPP per pcs: <b className="text-[19px]">{hppDariRincian == null ? '—' : rupiah(hppDariRincian)}</b></span>
        <Button variant="ghost" className="min-h-[44px]"
          onClick={() => { if (hppDariRincian) setHpp(String(hppDariRincian)); setRincian(null) }}>
          Isi HPP manual
        </Button>
      </div>
    </fieldset>
  )
}
