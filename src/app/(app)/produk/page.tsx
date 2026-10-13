'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Product } from '@/lib/types'
import { errMsg, parseRupiah, rupiah } from '@/lib/format'
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
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!nama.trim()) return setError('Nama produk wajib diisi.')
    setBusy(true)
    const supabase = createClient()
    const row = { nama: nama.trim(), harga: parseRupiah(harga) }
    const { error } = product.id
      ? await supabase.from('products').update(row).eq('id', product.id)
      : await supabase.from('products').insert(row)
    setBusy(false)
    if (error) return setError(errMsg(error))
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
        <Button type="submit" disabled={busy} className="w-full">{busy ? 'Menyimpan…' : 'Simpan produk'}</Button>
      </form>
    </Modal>
  )
}
