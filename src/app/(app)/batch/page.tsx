'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, ExternalLink, Share2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Batch, BatchStatus, Product, Quota } from '@/lib/types'
import { BATCH_STATUS } from '@/lib/types'
import { errMsg, tanggal } from '@/lib/format'
import { useBatch } from '@/components/batch-context'
import { Alert, Button, Empty, Field, ICON, Loading, Modal, PageHeader, cx, inputCls } from '@/components/ui'

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

interface KuotaRow { nama: string; kuota: number; terpakai: number }

export default function BatchPage() {
  const router = useRouter()
  const { batches, batchId, setBatchId, reload, loading } = useBatch()
  const [editing, setEditing] = useState<Partial<Batch> | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [kuota, setKuota] = useState<Record<string, KuotaRow[]>>({})

  // Pemakaian kuota per batch (pesanan Dibatalkan tidak dihitung)
  const loadKuota = useCallback(async () => {
    const supabase = createClient()
    const { data: q } = await supabase.from('batch_product_quotas').select('batch_id, product_id, kuota, products(nama)').not('kuota', 'is', null)
    const rows = (q ?? []) as unknown as (Quota & { products: { nama: string } | null })[]
    if (rows.length === 0) return setKuota({})
    const batchIds = [...new Set(rows.map((r) => r.batch_id))]
    const { data: items } = await supabase.from('order_items').select('product_id, qty, orders!inner(batch_id, status)')
      .in('orders.batch_id', batchIds).neq('orders.status', 'dibatalkan')
    const used = new Map<string, number>()
    for (const i of (items ?? []) as unknown as { product_id: string | null; qty: number; orders: { batch_id: string } }[]) {
      const k = `${i.orders.batch_id}|${i.product_id}`
      used.set(k, (used.get(k) ?? 0) + i.qty)
    }
    const out: Record<string, KuotaRow[]> = {}
    for (const r of rows) {
      (out[r.batch_id] ??= []).push({ nama: r.products?.nama ?? 'Produk', kuota: r.kuota!, terpakai: used.get(`${r.batch_id}|${r.product_id}`) ?? 0 })
    }
    setKuota(out)
  }, [])

  useEffect(() => { loadKuota() }, [loadKuota])

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
      setTimeout(() => setCopied(null), 1800)
    } catch { window.prompt('Salin link ini:', linkPemesanan(b.slug)) }
  }

  function shareWa(b: Batch) {
    const text = `Open PO ${b.nama}!${b.tanggal_tutup ? `\nDitutup ${tanggal(b.tanggal_tutup, { weekday: 'long', day: 'numeric', month: 'long' })}.` : ''}\nPesan di sini: ${linkPemesanan(b.slug)}`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener')
  }

  return (
    <>
      <PageHeader title="Batch PO" subtitle="Setiap pesanan masuk ke tepat satu batch."
        action={<Button onClick={() => setEditing({ status: 'buka' })}>+ Buat batch</Button>} />

      {loading ? <Loading /> : batches.length === 0 ? (
        <Empty title="Belum ada batch" action={<Button className="px-5" onClick={() => setEditing({ status: 'buka' })}>+ Buat batch</Button>}>
          Buat batch PO pertama, lalu bagikan link pemesanannya ke pembeli.
        </Empty>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-4">
          {batches.map((b) => {
            const next = NEXT_STATUS[b.status]
            const rows = kuota[b.id] ?? []
            return (
              <div key={b.id} className={cx('flex flex-col gap-3 rounded-card bg-surface px-6 py-4 outline-2 -outline-offset-2',
                b.id === batchId ? 'outline-accent' : 'outline-transparent')}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[21px] font-bold leading-tight">{b.nama}</div>
                    <div className="mt-1 text-sm text-neutral-800">
                      Buka {tanggal(b.tanggal_buka, { day: 'numeric', month: 'short' })} · Tutup {tanggal(b.tanggal_tutup, { day: 'numeric', month: 'short' })}
                    </div>
                    <div className="text-sm text-neutral-800">Ambil/produksi {tanggal(b.tanggal_ambil)}</div>
                  </div>
                  <span className={cx('tag', b.status === 'buka' ? 'bg-sage-200 text-sage-900' : 'bg-neutral-200 text-neutral-800')}>
                    {BATCH_STATUS[b.status]}
                  </span>
                </div>

                {rows.length > 0 && (
                  <div className="flex flex-col gap-2 py-3">
                    {rows.map((k) => {
                      const ratio = k.kuota ? k.terpakai / k.kuota : 1
                      const over = k.terpakai > k.kuota
                      return (
                        <div key={k.nama} className="flex flex-col gap-1">
                          <div className="flex justify-between text-sm">
                            <span>{k.nama}</span>
                            <span className={cx('font-bold', over ? 'text-accent-700' : 'text-ink')}>{k.terpakai} / {k.kuota}</span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-neutral-300">
                            <div className={cx('h-full rounded-full', over || ratio > 0.85 ? 'bg-accent' : 'bg-sage-500')}
                              style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="flex flex-col gap-2 rounded-lg bg-sage-200 px-4 py-3 text-sage-900">
                  <div className="text-sm font-bold">Link pemesanan</div>
                  <div className="break-all text-[15px]">/po/{b.slug}</div>
                  {b.status !== 'buka' && <div className="text-sm">Link menerima pesanan hanya saat status Buka.</div>}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" className="min-h-[40px] border-sage-500" onClick={() => copy(b)}>
                      <Copy size={16} {...ICON} />{copied === b.id ? 'Tersalin' : 'Salin link'}
                    </Button>
                    <Button variant="secondary" className="min-h-[40px] border-sage-500" onClick={() => shareWa(b)}>
                      <Share2 size={16} {...ICON} />Bagikan ke WA
                    </Button>
                    <a href={`/po/${b.slug}`} target="_blank" rel="noopener" className="btn btn-ghost min-h-[40px] text-sage-800 hover:text-sage-800">
                      <ExternalLink size={16} {...ICON} />Buka
                    </a>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" className="min-h-[40px]" onClick={() => { setBatchId(b.id); router.push('/pesanan') }}>Lihat pesanan</Button>
                  <Button variant="secondary" className="min-h-[40px]" onClick={() => setEditing(b)}>Edit</Button>
                  {next && <Button variant="ghost" className="min-h-[40px]" onClick={() => advance(b)}>{next.label}</Button>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editing && (
        <BatchForm batch={editing} onClose={() => setEditing(null)}
          onSaved={async (id) => { setEditing(null); await reload(); setBatchId(id); loadKuota() }} />
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
    <Modal open onClose={onClose} title={batch.id ? 'Edit batch' : 'Buat batch'} width={580}>
      <form onSubmit={save} className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Nama batch" htmlFor="bf-nama" helper="Contoh: PO Kebab Minggu ke-2 Oktober">
          <input id="bf-nama" autoFocus value={form.nama} onChange={set('nama')} className={inputCls} />
        </Field>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          <Field label="Tanggal buka" htmlFor="bf-buka">
            <input id="bf-buka" type="date" value={form.tanggal_buka} onChange={set('tanggal_buka')} className={inputCls} />
          </Field>
          <Field label="Tanggal tutup" htmlFor="bf-tutup" helper="Link otomatis tutup setelah tanggal ini.">
            <input id="bf-tutup" type="date" value={form.tanggal_tutup} onChange={set('tanggal_tutup')} className={inputCls} />
          </Field>
        </div>
        <Field label="Tanggal produksi / ambil" htmlFor="bf-ambil" helper="Dipakai sebagai tanggal ambil bawaan pesanan.">
          <input id="bf-ambil" type="date" value={form.tanggal_ambil} onChange={set('tanggal_ambil')} className={inputCls} />
        </Field>
        <Field label="Status" htmlFor="bf-status" helper="Link pemesanan hanya menerima pesanan saat status Buka.">
          <select id="bf-status" value={form.status} onChange={set('status')} className={inputCls}>
            {Object.entries(BATCH_STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 p-0 text-[15px] font-bold">Produk yang dijual</legend>
          <p className="m-0 text-sm text-neutral-800">Hanya produk yang dicentang tampil di link pemesanan. Kuota boleh dikosongkan (tanpa batas).</p>
          {products.length === 0 ? <Alert tone="warn">Belum ada produk aktif. Tambahkan di menu Produk.</Alert> : (
            <div className="flex flex-col rounded-lg bg-bg px-4 py-1">
              {products.map((p) => {
                const r = menu[p.id] ?? { dijual: false, kuota: '' }
                return (
                  <div key={p.id} className="flex items-center gap-3 border-b border-divider py-1 last:border-0">
                    <label className="flex min-h-[48px] min-w-0 flex-1 cursor-pointer items-center gap-3">
                      <input type="checkbox" checked={r.dijual} onChange={(e) => setRow(p.id, { dijual: e.target.checked })}
                        className="size-[22px] shrink-0 accent-accent" />
                      <span className={cx('font-semibold', !r.dijual && 'text-neutral-700')}>{p.nama}</span>
                    </label>
                    <input inputMode="numeric" placeholder="Kuota" value={r.kuota} disabled={!r.dijual} aria-label={`Kuota ${p.nama}`}
                      onChange={(e) => setRow(p.id, { kuota: e.target.value.replace(/\D/g, '') })}
                      className="input min-h-[44px] w-[104px] bg-neutral-100 text-right font-bold" />
                  </div>
                )
              })}
            </div>
          )}
        </fieldset>

        <Field label="Info untuk pembeli (opsional)" htmlFor="bf-info" helper="Tampil di link. Contoh: Ambil di rumah jam 15–18, Jl. Melati 5.">
          <textarea id="bf-info" rows={2} value={form.info_pembeli} onChange={set('info_pembeli')} className={inputCls} />
        </Field>
        {!batch.id && <div className="text-sm font-semibold text-sage-800">Link pemesanan dibuat otomatis setelah batch disimpan.</div>}

        <Button type="submit" disabled={busy} className="min-h-[50px]">{busy ? 'Menyimpan…' : 'Simpan batch'}</Button>
      </form>
    </Modal>
  )
}
