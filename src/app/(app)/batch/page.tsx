'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Copy, ExternalLink, Settings, Share2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Batch, BatchStatus, Product, Quota } from '@/lib/types'
import { BATCH_STATUS } from '@/lib/types'
import { errMsg, tanggal } from '@/lib/format'
import { useBatch } from '@/components/batch-context'
import { Alert, Button, Card, Empty, Field, Loading, Modal, PageHeader, cx, inputCls } from '@/components/ui'

const NEXT_STATUS: Partial<Record<BatchStatus, { to: BatchStatus; label: string }>> = {
  draft: { to: 'buka', label: 'Buka batch' },
  buka: { to: 'tutup', label: 'Tutup batch' },
  tutup: { to: 'selesai', label: 'Tandai selesai' },
}

function linkPemesanan(slug: string) {
  return `${window.location.origin}/po/${slug}`
}

function buatSlug(nama: string) {
  const base = nama.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return `${base || 'po'}-${Math.random().toString(36).slice(2, 6)}`
}

export default function BatchPage() {
  const router = useRouter()
  const { batches, batchId, setBatchId, reload, loading } = useBatch()
  const [editing, setEditing] = useState<Partial<Batch> | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

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

  async function copy(b: Batch) {
    try {
      await navigator.clipboard.writeText(linkPemesanan(b.slug))
      setCopied(b.id)
      setTimeout(() => setCopied(null), 2000)
    } catch { window.prompt('Salin link ini:', linkPemesanan(b.slug)) }
  }

  function shareWa(b: Batch) {
    const text = `Open PO ${b.nama}!${b.tanggal_tutup ? `\nDitutup ${tanggal(b.tanggal_tutup, { weekday: 'long', day: 'numeric', month: 'long' })}.` : ''}\nPesan di sini: ${linkPemesanan(b.slug)}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  }

  return (
    <>
      <PageHeader title="Batch PO" subtitle="Setiap pesanan masuk ke tepat satu batch."
        action={
          <div className="flex gap-2">
            <Link href="/pengaturan" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 font-semibold hover:bg-surface-2 md:hidden">
              <Settings size={18} aria-hidden />Pengaturan
            </Link>
            <Button onClick={() => setEditing({ status: 'buka' })}>+ Buat batch</Button>
          </div>
        } />

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

                {b.status === 'buka' && (
                  <div className="mt-3 rounded-xl bg-surface-2 p-3">
                    <div className="text-sm font-semibold">Link pemesanan</div>
                    <div className="mt-0.5 break-all text-sm text-muted">/po/{b.slug}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => copy(b)}><Copy size={16} aria-hidden />{copied === b.id ? 'Tersalin' : 'Salin link'}</Button>
                      <Button variant="secondary" onClick={() => shareWa(b)}><Share2 size={16} aria-hidden />Bagikan ke WA</Button>
                      <a href={`/po/${b.slug}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-semibold text-accent hover:bg-surface">
                        <ExternalLink size={16} aria-hidden />Lihat
                      </a>
                    </div>
                  </div>
                )}

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

interface MenuRow { dijual: boolean; kuota: string }

function BatchForm({ batch, onClose, onSaved }: { batch: Partial<Batch>; onClose: () => void; onSaved: (id: string) => void }) {
  const [form, setForm] = useState({
    nama: batch.nama ?? '',
    tanggal_buka: batch.tanggal_buka ?? '',
    tanggal_tutup: batch.tanggal_tutup ?? '',
    tanggal_ambil: batch.tanggal_ambil ?? '',
    status: batch.status ?? 'buka',
    info_pembeli: batch.info_pembeli ?? '',
  })
  const [products, setProducts] = useState<Product[]>([])
  const [menu, setMenu] = useState<Record<string, MenuRow>>({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    ;(async () => {
      const { data: prods } = await supabase.from('products').select('*').eq('aktif', true).order('nama')
      const list = (prods ?? []) as Product[]
      setProducts(list)
      if (batch.id) {
        const { data } = await supabase.from('batch_product_quotas').select('*').eq('batch_id', batch.id)
        const rows = (data ?? []) as Quota[]
        setMenu(Object.fromEntries(list.map((p) => {
          const q = rows.find((r) => r.product_id === p.id)
          return [p.id, { dijual: !!q, kuota: q?.kuota != null ? String(q.kuota) : '' }]
        })))
      } else {
        // Batch baru: semua produk aktif dijual
        setMenu(Object.fromEntries(list.map((p) => [p.id, { dijual: true, kuota: '' }])))
      }
    })()
  }, [batch.id])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))
  const setRow = (id: string, patch: Partial<MenuRow>) => setMenu((m) => ({ ...m, [id]: { ...m[id], ...patch } }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nama.trim()) return setError('Nama batch wajib diisi.')
    const rows = Object.entries(menu).filter(([, r]) => r.dijual)
    if (rows.length === 0) return setError('Pilih minimal 1 produk yang dijual.')
    setBusy(true)
    const supabase = createClient()
    const row = {
      nama: form.nama.trim(),
      status: form.status,
      tanggal_buka: form.tanggal_buka || null,
      tanggal_tutup: form.tanggal_tutup || null,
      tanggal_ambil: form.tanggal_ambil || null,
      info_pembeli: form.info_pembeli.trim() || null,
    }
    const res = batch.id
      ? await supabase.from('po_batches').update(row).eq('id', batch.id).select('id').single()
      : await supabase.from('po_batches').insert({ ...row, slug: buatSlug(row.nama) }).select('id').single()
    if (res.error) { setBusy(false); return setError(errMsg(res.error)) }
    const id = res.data.id as string

    await supabase.from('batch_product_quotas').delete().eq('batch_id', id)
    const { error } = await supabase.from('batch_product_quotas').insert(rows.map(([product_id, r]) => ({
      batch_id: id, product_id, kuota: r.kuota.trim() === '' ? null : Math.max(0, parseInt(r.kuota, 10) || 0),
    })))
    setBusy(false)
    if (error) return setError(errMsg(error))
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
          <Field label="Tanggal tutup" helper="Link otomatis tutup setelah tanggal ini.">
            <input type="date" value={form.tanggal_tutup} onChange={set('tanggal_tutup')} className={inputCls} />
          </Field>
        </div>
        <Field label="Tanggal produksi / ambil" helper="Dipakai sebagai tanggal ambil bawaan pesanan.">
          <input type="date" value={form.tanggal_ambil} onChange={set('tanggal_ambil')} className={inputCls} />
        </Field>
        <Field label="Status" helper="Link pemesanan hanya menerima pesanan saat status Buka.">
          <select value={form.status} onChange={set('status')} className={inputCls}>
            {Object.entries(BATCH_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">Produk yang dijual</legend>
          <p className="mb-2 text-sm text-muted">Hanya produk yang dicentang tampil di link pemesanan. Kuota boleh dikosongkan (tanpa batas).</p>
          {products.length === 0 ? <Alert>Belum ada produk aktif. Tambahkan di menu Produk.</Alert> : (
            <div className="divide-y divide-line rounded-xl border border-line">
              {products.map((p) => {
                const r = menu[p.id] ?? { dijual: false, kuota: '' }
                return (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-1.5">
                    <label className="flex min-h-11 flex-1 items-center gap-3">
                      <input type="checkbox" checked={r.dijual} onChange={(e) => setRow(p.id, { dijual: e.target.checked })}
                        className="size-5 accent-[var(--accent)]" />
                      <span className={cx(!r.dijual && 'text-muted')}>{p.nama}</span>
                    </label>
                    <input inputMode="numeric" placeholder="Kuota" value={r.kuota} disabled={!r.dijual}
                      onChange={(e) => setRow(p.id, { kuota: e.target.value.replace(/\D/g, '') })}
                      className={cx(inputCls, 'num w-24 text-right disabled:opacity-40')} aria-label={`Kuota ${p.nama}`} />
                  </div>
                )
              })}
            </div>
          )}
        </fieldset>

        <Field label="Info untuk pembeli (opsional)" helper="Tampil di link. Contoh: Ambil di rumah jam 15–18, Jl. Melati 5.">
          <textarea rows={2} value={form.info_pembeli} onChange={set('info_pembeli')} className={inputCls} />
        </Field>

        <Button type="submit" disabled={busy} className="w-full">{busy ? 'Menyimpan…' : 'Simpan batch'}</Button>
      </form>
    </Modal>
  )
}
