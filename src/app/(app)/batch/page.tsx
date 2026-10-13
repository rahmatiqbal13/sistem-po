'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Batch, BatchStatus, Product } from '@/lib/types'
import { BATCH_STATUS } from '@/lib/types'
import { errMsg, tanggal } from '@/lib/format'
import { useBatch } from '@/components/batch-context'
import { Alert, Button, Card, Empty, Field, Loading, Modal, PageHeader, cx, inputCls } from '@/components/ui'

const NEXT_STATUS: Partial<Record<BatchStatus, { to: BatchStatus; label: string }>> = {
  draft: { to: 'buka', label: 'Buka batch' },
  buka: { to: 'tutup', label: 'Tutup batch' },
  tutup: { to: 'selesai', label: 'Tandai selesai' },
}

export default function BatchPage() {
  const router = useRouter()
  const { batches, batchId, setBatchId, reload, loading } = useBatch()
  const [editing, setEditing] = useState<Partial<Batch> | null>(null)

  async function advance(b: Batch) {
    const next = NEXT_STATUS[b.status]
    if (!next) return
    await createClient().from('po_batches').update({ status: next.to }).eq('id', b.id)
    await reload()
    if (next.to === 'tutup') {
      setBatchId(b.id)
      router.push('/rekap')
    }
  }

  return (
    <>
      <PageHeader title="Batch PO" subtitle="Setiap pesanan masuk ke tepat satu batch."
        action={<Button onClick={() => setEditing({ status: 'buka' })}>+ Buat batch</Button>} />

      {loading ? <Loading /> : batches.length === 0 ? <Empty>Belum ada batch. Buat batch PO pertama Anda.</Empty> : (
        <div className="grid gap-3 md:grid-cols-2">
          {batches.map((b) => {
            const next = NEXT_STATUS[b.status]
            return (
              <Card key={b.id} className={cx('p-4', b.id === batchId && 'ring-2 ring-accent')}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-bold">{b.nama}</div>
                    <div className="mt-1 text-sm text-muted">
                      Buka {tanggal(b.tanggal_buka)} · Tutup {tanggal(b.tanggal_tutup)}
                    </div>
                    <div className="text-sm text-muted">Ambil/produksi {tanggal(b.tanggal_ambil)}</div>
                  </div>
                  <span className={cx('rounded-full px-2.5 py-1 text-sm font-semibold',
                    b.status === 'buka' ? 'bg-accent-soft text-accent' : 'bg-surface-2 text-muted')}>
                    {BATCH_STATUS[b.status]}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => { setBatchId(b.id); router.push('/pesanan') }}>Lihat pesanan</Button>
                  <Button variant="secondary" onClick={() => setEditing(b)}>Edit</Button>
                  {next && <Button variant="ghost" onClick={() => advance(b)}>{next.label}</Button>}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {editing && (
        <BatchForm batch={editing} onClose={() => setEditing(null)}
          onSaved={async (id) => { setEditing(null); await reload(); setBatchId(id) }} />
      )}
    </>
  )
}

function BatchForm({ batch, onClose, onSaved }: { batch: Partial<Batch>; onClose: () => void; onSaved: (id: string) => void }) {
  const [form, setForm] = useState({
    nama: batch.nama ?? '',
    tanggal_buka: batch.tanggal_buka ?? '',
    tanggal_tutup: batch.tanggal_tutup ?? '',
    tanggal_ambil: batch.tanggal_ambil ?? '',
    status: batch.status ?? 'buka',
  })
  const [products, setProducts] = useState<Product[]>([])
  const [kuota, setKuota] = useState<Record<string, string>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('products').select('*').eq('aktif', true).order('nama').then(({ data }) => setProducts((data ?? []) as Product[]))
    if (batch.id) {
      supabase.from('batch_product_quotas').select('*').eq('batch_id', batch.id).then(({ data }) => {
        setKuota(Object.fromEntries((data ?? []).map((q) => [q.product_id, String(q.kuota)])))
      })
    }
  }, [batch.id])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nama.trim()) return setError('Nama batch wajib diisi.')
    setBusy(true)
    const supabase = createClient()
    const row = {
      nama: form.nama.trim(),
      status: form.status,
      tanggal_buka: form.tanggal_buka || null,
      tanggal_tutup: form.tanggal_tutup || null,
      tanggal_ambil: form.tanggal_ambil || null,
    }
    const res = batch.id
      ? await supabase.from('po_batches').update(row).eq('id', batch.id).select('id').single()
      : await supabase.from('po_batches').insert(row).select('id').single()
    if (res.error) { setBusy(false); return setError(errMsg(res.error)) }
    const id = res.data.id as string

    await supabase.from('batch_product_quotas').delete().eq('batch_id', id)
    const rows = Object.entries(kuota)
      .filter(([, v]) => v.trim() !== '')
      .map(([product_id, v]) => ({ batch_id: id, product_id, kuota: Math.max(0, parseInt(v, 10) || 0) }))
    if (rows.length) {
      const { error } = await supabase.from('batch_product_quotas').insert(rows)
      if (error) { setBusy(false); return setError(errMsg(error)) }
    }
    setBusy(false)
    onSaved(id)
  }

  return (
    <Modal open onClose={onClose} title={batch.id ? 'Edit batch' : 'Buat batch'}>
      <form onSubmit={save} className="space-y-4">
        {error && <Alert tone="bad">{error}</Alert>}
        <Field label="Nama batch" helper="Contoh: PO Kebab Minggu ke-2 Oktober">
          <input autoFocus value={form.nama} onChange={set('nama')} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tanggal buka"><input type="date" value={form.tanggal_buka} onChange={set('tanggal_buka')} className={inputCls} /></Field>
          <Field label="Tanggal tutup"><input type="date" value={form.tanggal_tutup} onChange={set('tanggal_tutup')} className={inputCls} /></Field>
        </div>
        <Field label="Tanggal produksi / ambil" helper="Dipakai sebagai tanggal ambil bawaan pesanan.">
          <input type="date" value={form.tanggal_ambil} onChange={set('tanggal_ambil')} className={inputCls} />
        </Field>
        <Field label="Status">
          <select value={form.status} onChange={set('status')} className={inputCls}>
            {Object.entries(BATCH_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>

        {products.length > 0 && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold">Kuota per produk (opsional)</legend>
            <p className="mb-2 text-sm text-muted">Kosongkan jika tidak dibatasi. Sistem memberi peringatan saat kuota terlampaui.</p>
            <div className="divide-y divide-line rounded-xl border border-line">
              {products.map((p) => (
                <label key={p.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex-1">{p.nama}</span>
                  <input inputMode="numeric" placeholder="—" value={kuota[p.id] ?? ''}
                    onChange={(e) => setKuota((k) => ({ ...k, [p.id]: e.target.value.replace(/\D/g, '') }))}
                    className={cx(inputCls, 'num w-24 text-right')} aria-label={`Kuota ${p.nama}`} />
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <Button type="submit" disabled={busy} className="w-full">{busy ? 'Menyimpan…' : 'Simpan batch'}</Button>
      </form>
    </Modal>
  )
}
