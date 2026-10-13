'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Product } from '@/lib/types'
import { errMsg, parseRupiah, rupiah } from '@/lib/format'
import { fotoUrl, kompresFoto } from '@/lib/foto'
import { ImageIcon } from 'lucide-react'
import { Alert, Button, Card, Empty, Field, Loading, Modal, PageHeader, cx, inputCls } from '@/components/ui'

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

  return (
    <>
      <PageHeader title="Produk" subtitle="Harga di pesanan lama tidak berubah saat harga produk diubah."
        action={<Button onClick={() => setEditing({ nama: '', harga: 0, aktif: true })}>+ Tambah produk</Button>} />

      {!products ? <Loading /> : products.length === 0 ? <Empty>Belum ada produk. Tambahkan produk pertama Anda.</Empty> : (
        <Card className="divide-y divide-line">
          {products.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Thumb path={p.foto_path} />
              <div className="min-w-0 flex-1">
                <div className={cx('font-semibold', !p.aktif && 'text-muted')}>{p.nama}</div>
                <div className="num text-muted">{rupiah(p.harga)}</div>
              </div>
              <span className={cx('rounded-full px-2.5 py-1 text-sm font-semibold', p.aktif ? 'bg-ok-soft text-ok' : 'bg-surface-2 text-muted')}>
                {p.aktif ? 'Aktif' : 'Nonaktif'}
              </span>
              <Button variant="secondary" onClick={() => toggle(p)}>{p.aktif ? 'Nonaktifkan' : 'Aktifkan'}</Button>
              <Button variant="secondary" onClick={() => setEditing(p)}>Edit</Button>
            </div>
          ))}
        </Card>
      )}

      {editing && <ProductForm product={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </>
  )
}

function ProductForm({ product, onClose, onSaved }: { product: Partial<Product>; onClose: () => void; onSaved: () => void }) {
  const [nama, setNama] = useState(product.nama ?? '')
  const [harga, setHarga] = useState(product.harga ? String(product.harga) : '')
  const [foto, setFoto] = useState<Blob | null>(null)
  const [hapusFoto, setHapusFoto] = useState(false)
  const [preview, setPreview] = useState<string | null>(fotoUrl(product.foto_path))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!nama.trim()) return setError('Nama produk wajib diisi.')
    setBusy(true)
    const supabase = createClient()
    const row: Partial<Product> = { nama: nama.trim(), harga: parseRupiah(harga) }
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
      <form onSubmit={save} className="space-y-4">
        {error && <Alert tone="bad">{error}</Alert>}
        <Field label="Nama produk" helper="Contoh: Kebab Sapi Jumbo">
          <input autoFocus value={nama} onChange={(e) => setNama(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Harga (Rp)" helper="Contoh: 15000">
          <input inputMode="numeric" value={harga} onChange={(e) => setHarga(e.target.value)} className={cx(inputCls, 'num')} />
        </Field>
        <Field label="Foto (opsional)" helper="Tampil di link pemesanan. Foto otomatis diperkecil sebelum diunggah.">
          <div className="flex items-center gap-3">
            {preview
              ? <img src={preview} alt="" className="size-20 rounded-xl object-cover" />
              : <div className="grid size-20 place-items-center rounded-xl bg-surface-2 text-muted"><ImageIcon size={24} aria-hidden /></div>}
            <div className="flex flex-col gap-2">
              <input type="file" accept="image/*" onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                try {
                  const blob = await kompresFoto(f)
                  setFoto(blob)
                  setHapusFoto(false)
                  setPreview(URL.createObjectURL(blob))
                } catch { setError('Foto tidak bisa dibaca. Coba foto lain.') }
              }} className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-surface-2 file:px-4 file:font-semibold" />
              {preview && (
                <button type="button" onClick={() => { setFoto(null); setHapusFoto(true); setPreview(null) }} className="self-start text-sm font-semibold text-bad">
                  Hapus foto
                </button>
              )}
            </div>
          </div>
        </Field>
        <Button type="submit" disabled={busy} className="w-full">{busy ? 'Menyimpan…' : 'Simpan produk'}</Button>
      </form>
    </Modal>
  )
}

function Thumb({ path }: { path: string | null }) {
  const url = fotoUrl(path)
  if (!url) return <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted"><ImageIcon size={20} aria-hidden /></div>
  return <img src={url} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
}
