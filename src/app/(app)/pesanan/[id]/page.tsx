'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ImageIcon, MessageCircle, Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Metode, OrderItem, OrderStatus, OrderSummary, Payment } from '@/lib/types'
import { CARA_TERIMA, METODE, ORDER_STATUS } from '@/lib/types'
import { kelebihanBayar } from '@/lib/calc'
import { setOrderStatus, terimaTunaiSelesai } from '@/lib/data'
import { errMsg, jam, parseRupiah, rupiah, tanggal, today } from '@/lib/format'
import { useBatch } from '@/components/batch-context'
import { Alert, BayarBadge, Button, Card, Field, Loading, Modal, OrderStatusBadge, OrderTags, cx, inputCls, kodePesanan } from '@/components/ui'
import { normWa } from '@/lib/foto'

const FLOW: OrderStatus[] = ['baru', 'dikonfirmasi', 'diproduksi', 'siap', 'selesai']

export default function PesananDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { batches } = useBatch()
  const [order, setOrder] = useState<OrderSummary | null>(null)
  const [items, setItems] = useState<OrderItem[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    const [o, i, p] = await Promise.all([
      supabase.from('order_summary').select('*').eq('id', id).maybeSingle(),
      supabase.from('order_items').select('*').eq('order_id', id),
      supabase.from('payments').select('*').eq('order_id', id).order('tanggal_bayar').order('created_at'),
    ])
    if (!o.data) { setNotFound(true); return }
    setOrder(o.data as OrderSummary)
    setItems((i.data ?? []) as OrderItem[])
    setPayments((p.data ?? []) as Payment[])
  }, [id])

  useEffect(() => { load() }, [load])

  async function changeStatus(s: OrderStatus) {
    if (!order) return
    if (s === 'dibatalkan' && !window.confirm('Batalkan pesanan ini? Pesanan tetap tersimpan tetapi tidak dihitung di rekap dan tagihan.')) return
    setError('')
    try { await setOrderStatus(order.id, s, order.updated_at) } catch (e) { setError(errMsg(e).replace('KONFLIK: ', '')) }
    load()
  }

  async function cod() {
    if (!order) return
    if (!window.confirm(`Catat tunai ${rupiah(order.sisa)} dan tandai pesanan Selesai?`)) return
    setError('')
    try { await terimaTunaiSelesai(order) } catch (e) { setError(errMsg(e).replace('KONFLIK: ', '')) }
    load()
  }

  async function deletePayment(p: Payment) {
    if (!window.confirm(`Hapus pembayaran ${rupiah(p.jumlah)}?`)) return
    const supabase = createClient()
    if (p.bukti_path) await supabase.storage.from('bukti').remove([p.bukti_path])
    await supabase.from('payments').delete().eq('id', p.id)
    load()
  }

  async function lihatBukti(path: string) {
    const { data } = await createClient().storage.from('bukti').createSignedUrl(path, 60)
    if (data) window.open(data.signedUrl, '_blank', 'noopener')
  }

  if (notFound) return <Alert tone="bad">Pesanan tidak ditemukan.</Alert>
  if (!order) return <Loading />

  const batal = order.status === 'dibatalkan'
  const selesai = order.status === 'selesai'
  const lebih = kelebihanBayar(Number(order.total), Number(order.terbayar))
  const batch = batches.find((b) => b.id === order.batch_id)
  const waLink = order.customer_wa ? `https://wa.me/${normWa(order.customer_wa)}` : null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => router.push('/pesanan')} className="-ml-3"><ArrowLeft size={18} aria-hidden />Pesanan</Button>
        {!selesai && (
          <Link href={`/pesanan/${order.id}/edit`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface px-4 font-semibold hover:bg-surface-2">
            <Pencil size={16} aria-hidden />Edit pesanan
          </Link>
        )}
      </div>

      <div>
        <h1 className="text-2xl font-bold md:text-3xl">{order.customer_nama}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
          {order.customer_wa && <span>{order.customer_wa}</span>}
          {waLink && <a href={waLink} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-accent"><MessageCircle size={16} aria-hidden />Buka chat</a>}
          {batch && <span>· {batch.nama}</span>}
          <span>· {kodePesanan(order.id)}</span>
        </div>
        <div className="mt-2"><OrderTags sumber={order.sumber} /></div>
      </div>

      {error && <Alert tone="bad">{error}</Alert>}
      {batal && <Alert>Pesanan dibatalkan. Tidak dihitung di rekap produksi maupun total tagihan.</Alert>}
      {lebih > 0 && !batal && <Alert tone="warn">Kelebihan bayar {rupiah(lebih)}. Periksa kembali atau kembalikan selisihnya.</Alert>}

      <div className="grid gap-4 md:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {/* Item */}
          <Card>
            <div className="border-b border-line px-4 py-3 font-bold">Item</div>
            <div className="divide-y divide-line">
              {items.map((i) => (
                <div key={i.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div>
                    <div className="font-semibold">{i.nama_produk_snapshot} <span className="num text-muted">×{i.qty}</span></div>
                    <div className="num text-sm text-muted">{rupiah(i.harga_snapshot)} / pcs</div>
                    {i.catatan && <div className="text-sm">Catatan: {i.catatan}</div>}
                  </div>
                  <div className="num font-semibold">{rupiah(Number(i.harga_snapshot) * i.qty)}</div>
                </div>
              ))}
            </div>
            <dl className="num space-y-1 border-t border-line px-4 py-3">
              <div className="flex justify-between"><dt className="text-muted">Subtotal</dt><dd>{rupiah(order.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Ongkir</dt><dd>{rupiah(order.ongkir)}</dd></div>
              <div className="flex justify-between text-lg font-bold"><dt>Total</dt><dd>{rupiah(order.total)}</dd></div>
            </dl>
          </Card>

          {/* Pengambilan */}
          <Card className="p-4">
            <div className="mb-2 font-bold">Pengambilan</div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-muted">Cara terima</dt><dd>{CARA_TERIMA[order.cara_terima]}</dd>
              <dt className="text-muted">Tanggal</dt><dd>{tanggal(order.tanggal_ambil)} {jam(order.jam_ambil)}</dd>
              {order.alamat && <><dt className="text-muted">Alamat</dt><dd className="whitespace-pre-line">{order.alamat}</dd></>}
              {order.catatan && <><dt className="text-muted">Catatan</dt><dd className="whitespace-pre-line">{order.catatan}</dd></>}
            </dl>
            <p className="mt-3 text-sm text-muted">
              Dicatat oleh {order.created_by ?? '—'} · diubah terakhir oleh {order.updated_by ?? '—'}, {new Date(order.updated_at).toLocaleString('id-ID')}
            </p>
          </Card>
        </div>

        <div className="space-y-4">
          {/* Pembayaran */}
          <Card className="p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="font-bold">Pembayaran</div>
              <BayarBadge status={order.status_bayar} dibatalkan={batal} />
            </div>
            <dl className="num mt-3 space-y-1">
              <div className="flex justify-between"><dt className="text-muted">Terbayar</dt><dd>{rupiah(order.terbayar)}</dd></div>
              <div className="flex justify-between text-lg font-bold"><dt>Sisa tagihan</dt>
                <dd className={cx(Number(order.sisa) > 0 && !batal && 'text-bad')}>{rupiah(batal ? 0 : order.sisa)}</dd></div>
            </dl>
            {payments.length > 0 && (
              <ul className="mt-3 divide-y divide-line border-t border-line">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="num font-semibold">{rupiah(p.jumlah)}</div>
                      <div className="text-sm text-muted">{METODE[p.metode]} · {tanggal(p.tanggal_bayar, { day: 'numeric', month: 'short' })}</div>
                    </div>
                    {p.bukti_path && (
                      <button type="button" onClick={() => lihatBukti(p.bukti_path!)} className="grid size-11 place-items-center rounded-xl hover:bg-surface-2" aria-label="Lihat bukti">
                        <ImageIcon size={18} />
                      </button>
                    )}
                    <button type="button" onClick={() => deletePayment(p)} className="grid size-11 place-items-center rounded-xl text-muted hover:bg-bad-soft hover:text-bad" aria-label="Hapus pembayaran">
                      <Trash2 size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!batal && <Button className="mt-3 w-full" onClick={() => setPaying(true)}>Catat pembayaran</Button>}
          </Card>

          {/* Status pesanan */}
          <Card className="p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="font-bold">Status pesanan</div>
              <OrderStatusBadge status={order.status} />
            </div>
            {!batal && (
              <div className="grid grid-cols-2 gap-2">
                {FLOW.map((s) => (
                  <button key={s} type="button" onClick={() => changeStatus(s)} disabled={order.status === s}
                    className={cx('min-h-11 rounded-xl border px-2 text-sm font-semibold',
                      order.status === s ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:bg-surface-2')}>
                    {ORDER_STATUS[s]}
                  </button>
                ))}
              </div>
            )}
            {!batal && !selesai && Number(order.sisa) > 0 && (
              <Button variant="secondary" className="mt-2 w-full" onClick={cod}>Terima tunai {rupiah(order.sisa)} & selesai</Button>
            )}
            {batal ? (
              <Button variant="secondary" className="w-full" onClick={() => changeStatus('baru')}>Aktifkan kembali</Button>
            ) : !selesai && (
              <Button variant="danger" className="mt-2 w-full" onClick={() => changeStatus('dibatalkan')}>Batalkan pesanan</Button>
            )}
          </Card>
        </div>
      </div>

      {paying && <PaymentForm order={order} onClose={() => setPaying(false)} onSaved={() => { setPaying(false); load() }} />}
    </div>
  )
}

function PaymentForm({ order, onClose, onSaved }: { order: OrderSummary; onClose: () => void; onSaved: () => void }) {
  const [jumlah, setJumlah] = useState(Number(order.sisa) > 0 ? String(order.sisa) : '')
  const [metode, setMetode] = useState<Metode>('transfer')
  const [tgl, setTgl] = useState(today())
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const nominal = parseRupiah(jumlah)
  const lebih = kelebihanBayar(Number(order.total), Number(order.terbayar) + nominal)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (nominal <= 0) return setError('Jumlah harus lebih dari 0.')
    if (lebih > 0 && !window.confirm(`Pembayaran ini membuat kelebihan bayar ${rupiah(lebih)}. Tetap simpan?`)) return
    setBusy(true)
    const supabase = createClient()
    let bukti_path: string | null = null
    if (file && metode !== 'tunai') {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      bukti_path = `${order.id}/${crypto.randomUUID()}.${ext}`
      const up = await supabase.storage.from('bukti').upload(bukti_path, file, { contentType: file.type })
      if (up.error) { setBusy(false); return setError('Gagal mengunggah bukti: ' + errMsg(up.error)) }
    }
    const { error } = await supabase.from('payments').insert({ order_id: order.id, jumlah: nominal, metode, tanggal_bayar: tgl, bukti_path })
    setBusy(false)
    if (error) return setError(errMsg(error))
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title="Catat pembayaran">
      <form onSubmit={save} className="space-y-4">
        {error && <Alert tone="bad">{error}</Alert>}
        <Field label="Jumlah (Rp)" helper={`Sisa tagihan ${rupiah(order.sisa)}`}>
          <input autoFocus inputMode="numeric" value={jumlah} onChange={(e) => setJumlah(e.target.value)} className={cx(inputCls, 'num text-lg font-bold')} />
        </Field>
        {lebih > 0 && <Alert>Kelebihan bayar {rupiah(lebih)}.</Alert>}
        <div className="grid grid-cols-2 gap-2">
          {[Number(order.sisa), Math.ceil(Number(order.total) / 2)].filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v, i) => (
            <button key={v} type="button" onClick={() => setJumlah(String(v))} className="min-h-11 rounded-xl border border-line text-sm font-semibold hover:bg-surface-2">
              {i === 0 ? 'Lunasi' : 'DP 50%'} {rupiah(v)}
            </button>
          ))}
        </div>
        <fieldset>
          <legend className="mb-1.5 text-sm font-semibold">Metode</legend>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(METODE) as Metode[]).map((m) => (
              <button key={m} type="button" aria-pressed={metode === m} onClick={() => setMetode(m)}
                className={cx('min-h-12 rounded-xl border px-2 text-sm font-semibold', metode === m ? 'border-accent bg-accent-soft text-accent' : 'border-line')}>
                {METODE[m]}
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="Tanggal bayar">
          <input type="date" value={tgl} onChange={(e) => setTgl(e.target.value)} className={inputCls} />
        </Field>
        {metode !== 'tunai' && (
          <Field label="Bukti transfer (opsional)" helper="Satu foto.">
            <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border-0 file:bg-surface-2 file:px-4 file:font-semibold" />
          </Field>
        )}
        <Button type="submit" disabled={busy} className="w-full">{busy ? 'Menyimpan…' : 'Simpan pembayaran'}</Button>
      </form>
    </Modal>
  )
}
