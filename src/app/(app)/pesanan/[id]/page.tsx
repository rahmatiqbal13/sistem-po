'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Download, ImageIcon, MessageCircle, Pencil, Send, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Metode, OrderItem, OrderStatus, OrderSummary, Payment } from '@/lib/types'
import { CARA_TERIMA, METODE, ORDER_STATUS } from '@/lib/types'
import { kelebihanBayar } from '@/lib/calc'
import { setOrderStatus, terimaTunaiSelesai } from '@/lib/data'
import { errMsg, jam, parseRupiah, rupiah, tanggal, today } from '@/lib/format'
import { normWa } from '@/lib/foto'
import { fetchToko, useToko } from '@/lib/toko'
import { LABEL_PESAN, buatPesan, pesanBawaan, pilihanPesan, type DataPesan, type JenisPesan } from '@/lib/pesan-wa'
import { buatStrukPdf, unduh } from '@/lib/struk'
import { useBatch } from '@/components/batch-context'
import { Alert, BayarBadge, Button, Field, ICON, Loading, Modal, OrderStatusBadge, OrderTags, Toast, cx, inputCls, kodePesanan, useConfirm } from '@/components/ui'

const FLOW: OrderStatus[] = ['baru', 'dikonfirmasi', 'diproduksi', 'siap', 'selesai']
const PANEL = 'rounded-card bg-surface p-6'
const SIDE = 'flex flex-col gap-3 rounded-card bg-neutral-100 p-6 shadow-sm'

export default function PesananDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { batches } = useBatch()
  const [order, setOrder] = useState<OrderSummary | null>(null)
  const [items, setItems] = useState<OrderItem[]>([])
  const [payments, setPayments] = useState<Payment[]>([])
  const [ganda, setGanda] = useState(false)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState('')
  const [paying, setPaying] = useState(false)
  const [confirm, confirmDialog] = useConfirm()
  // Pembayaran yang baru dihapus: bisa diurungkan selama notifikasi tampil
  const [removed, setRemoved] = useState<Payment | null>(null)
  const pendingFile = useRef<string | null>(null)
  const [strukBusy, setStrukBusy] = useState<'unduh' | null>(null)
  // Dialog chat pembeli: template awal + struk PDF yang disiapkan lebih dulu (dibutuhkan menu Bagikan)
  const [chat, setChat] = useState<JenisPesan | 'auto' | null>(null)
  const [strukFile, setStrukFile] = useState<File | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const [o, i, p] = await Promise.all([
      supabase.from('order_summary').select('*').eq('id', id).maybeSingle(),
      supabase.from('order_items').select('*').eq('order_id', id),
      supabase.from('payments').select('*').eq('order_id', id).order('tanggal_bayar').order('created_at'),
    ])
    if (!o.data) { setNotFound(true); return }
    const ord = o.data as OrderSummary
    setOrder(ord)
    setItems((i.data ?? []) as OrderItem[])
    setPayments((p.data ?? []) as Payment[])
    // Pembeli yang sama punya pesanan aktif lain di batch ini?
    const { count } = await supabase.from('orders').select('id', { count: 'exact', head: true })
      .eq('batch_id', ord.batch_id).eq('customer_id', ord.customer_id).neq('status', 'dibatalkan').neq('id', ord.id)
    setGanda(ord.status !== 'dibatalkan' && (count ?? 0) > 0)
  }, [id])

  useEffect(() => { load() }, [load])
  useEffect(() => { if (order) document.title = `${order.customer_nama} · PO Jajanan` }, [order])

  async function changeStatus(s: OrderStatus) {
    if (!order || s === order.status) return
    if (s === 'dibatalkan' && !(await confirm({
      title: 'Batalkan pesanan ini?', danger: true, confirmLabel: 'Batalkan pesanan', cancelLabel: 'Kembali',
      body: 'Pesanan tetap tersimpan, tetapi tidak dihitung di rekap produksi maupun tagihan. Bisa diaktifkan kembali nanti.',
    }))) return
    setError('')
    try { await setOrderStatus(order.id, s, order.updated_at) } catch (e) { setError(errMsg(e).replace('KONFLIK: ', '')) }
    load()
  }

  async function cod() {
    if (!order) return
    if (!(await confirm({
      title: `Terima tunai ${rupiah(order.sisa)}?`, confirmLabel: 'Catat & selesai',
      body: 'Pembayaran tunai sebesar sisa tagihan dicatat, lalu pesanan ditandai Selesai.',
    }))) return
    setError('')
    try { await terimaTunaiSelesai(order) } catch (e) { setError(errMsg(e).replace('KONFLIK: ', '')) }
    load()
  }

  // Hapus langsung, bisa diurungkan; foto bukti baru dihapus setelah notifikasi hilang
  async function deletePayment(p: Payment) {
    await flushRemovedFile()
    const { error } = await createClient().from('payments').delete().eq('id', p.id)
    if (error) return setError(errMsg(error))
    pendingFile.current = p.bukti_path
    setRemoved(p)
    load()
  }

  async function undoDelete() {
    const p = removed
    if (!p) return
    pendingFile.current = null
    setRemoved(null)
    const { error } = await createClient().from('payments').insert({
      id: p.id, order_id: p.order_id, jumlah: p.jumlah, metode: p.metode, tanggal_bayar: p.tanggal_bayar,
      bukti_path: p.bukti_path, dicatat_oleh: p.dicatat_oleh, created_at: p.created_at,
    })
    if (error) setError('Gagal mengurungkan: ' + errMsg(error))
    load()
  }

  async function flushRemovedFile() {
    const path = pendingFile.current
    pendingFile.current = null
    if (path) await createClient().storage.from('bukti').remove([path])
  }

  // Keluar dari halaman sebelum notifikasi hilang: hapus foto bukti yang tertunda
  useEffect(() => () => { flushRemovedFile() }, [])

  async function siapkanStruk() {
    if (!order) return null
    try {
      return await buatStrukPdf({
        toko: await fetchToko(), kode: kodePesanan(order.id),
        batchNama: batches.find((b) => b.id === order.batch_id)?.nama, order, items, payments,
      })
    } catch (e) { setError('Gagal membuat struk: ' + errMsg(e)); return null }
  }

  async function unduhStruk() {
    setStrukBusy('unduh')
    const file = await siapkanStruk()
    setStrukBusy(null)
    if (file) unduh(file)
  }

  function bukaChat(awal: JenisPesan | 'auto' = 'auto') {
    if (!order) return
    setError('')
    setStrukFile(null)
    setChat(awal)
    if (order.status_bayar === 'lunas' && order.status !== 'dibatalkan') siapkanStruk().then(setStrukFile)
  }

  // Kembali ke daftar dengan filter & halaman terakhir
  function backToList() {
    let search = ''
    try { search = (JSON.parse(sessionStorage.getItem('pesanan.list') ?? 'null') as { search: string } | null)?.search ?? '' } catch {}
    router.push('/pesanan' + search)
  }

  async function lihatBukti(path: string) {
    const { data } = await createClient().storage.from('bukti').createSignedUrl(path, 60)
    if (data) window.open(data.signedUrl, '_blank', 'noopener')
  }

  if (notFound) return <Alert>Pesanan tidak ditemukan.</Alert>
  if (!order) return <Loading />

  const batal = order.status === 'dibatalkan'
  const selesai = order.status === 'selesai'
  const lebih = kelebihanBayar(Number(order.total), Number(order.terbayar))
  const batch = batches.find((b) => b.id === order.batch_id)
  const waLink = order.customer_wa ? `https://wa.me/${normWa(order.customer_wa)}` : null
  const curIdx = FLOW.indexOf(order.status)
  const sisaAktif = !batal && Number(order.sisa) > 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={backToList} className="-ml-2.5 px-2.5 text-label">
          <ArrowLeft size={18} {...ICON} />Pesanan
        </Button>
        {!selesai && (
          <Link href={`/pesanan/${order.id}/edit`} className="btn btn-secondary min-h-[44px]">
            <Pencil size={16} {...ICON} />Edit pesanan
          </Link>
        )}
      </div>

      <div>
        <h1>{order.customer_nama}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-neutral-800">
          {order.customer_wa && <span>{order.customer_wa}</span>}
          {waLink && !batal && (
            <button type="button" onClick={() => bukaChat()} className="inline-flex min-h-[44px] items-center gap-1.5 font-bold text-accent-700 hover:text-accent-800">
              <MessageCircle size={16} {...ICON} />Chat pembeli
            </button>
          )}
          {waLink && batal && (
            <a href={waLink} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 font-bold no-underline">
              <MessageCircle size={16} {...ICON} />Buka chat
            </a>
          )}
          {batch && <span>· {batch.nama}</span>}
          <span>· {kodePesanan(order.id)}</span>
        </div>
        {(order.sumber === 'link' || ganda) && <div className="mt-2"><OrderTags sumber={order.sumber} ganda={ganda} /></div>}
      </div>

      {error && <Alert>{error}</Alert>}
      {batal && <Alert tone="muted">Pesanan dibatalkan. Tidak dihitung di rekap produksi maupun total tagihan.</Alert>}
      {lebih > 0 && !batal && <Alert tone="warn">Kelebihan bayar {rupiah(lebih)}. Periksa kembali atau kembalikan selisihnya.</Alert>}

      {order.sumber === 'link' && order.status === 'baru' && (
        <section aria-label="Pesanan dari link" className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card bg-accent-200 p-6 text-accent-900">
          <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-0.5">
            <div className="text-card font-bold">Pesanan masuk dari link pemesanan</div>
            <div className="text-label">Pembeli mengisi sendiri. Cek item dan nomor WA, lalu konfirmasi.</div>
            {ganda && <div className="mt-1 text-label font-bold">Nomor ini punya pesanan aktif lain di batch ini. Pastikan bukan pesanan ganda.</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button className="px-5" onClick={() => changeStatus('dikonfirmasi')}>Konfirmasi pesanan</Button>
            <Button variant="secondary" className="border-accent-500" onClick={() => changeStatus('dibatalkan')}>Tolak</Button>
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-4">
          <section className={PANEL}>
            <h2 className="mb-2 text-section">Item</h2>
            {items.map((i) => (
              <div key={i.id} className="flex justify-between gap-3 border-b border-divider py-3">
                <div>
                  <div className="font-bold">{i.nama_produk_snapshot} <span className="font-semibold text-neutral-800">×{i.qty}</span></div>
                  <div className="text-sm text-neutral-800">{rupiah(i.harga_snapshot)} / pcs</div>
                  {i.catatan && <div className="text-sm">Catatan: {i.catatan}</div>}
                </div>
                <div className="font-bold">{rupiah(Number(i.harga_snapshot) * i.qty)}</div>
              </div>
            ))}
            <dl className="mt-3 flex flex-col gap-1">
              <div className="flex justify-between"><dt className="text-neutral-800">Subtotal</dt><dd className="m-0">{rupiah(order.subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-neutral-800">Ongkir</dt><dd className="m-0">{rupiah(order.ongkir)}</dd></div>
              <div className="mt-1 flex items-baseline justify-between"><dt className="text-section font-bold">Total</dt><dd className="m-0 text-stat font-bold">{rupiah(order.total)}</dd></div>
            </dl>
          </section>

          <section className={PANEL}>
            <h2 className="mb-3 text-section">Pengambilan</h2>
            <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5">
              <dt className="text-neutral-800">Cara terima</dt><dd className="m-0">{CARA_TERIMA[order.cara_terima]}</dd>
              <dt className="text-neutral-800">Tanggal</dt><dd className="m-0">{tanggal(order.tanggal_ambil)} {jam(order.jam_ambil)}</dd>
              <dt className="text-neutral-800">Alamat</dt><dd className="m-0 whitespace-pre-line">{order.alamat || '—'}</dd>
              <dt className="text-neutral-800">Catatan</dt><dd className="m-0 whitespace-pre-line">{order.catatan || '—'}</dd>
            </dl>
            <p className="mb-0 mt-3 text-sm text-neutral-800">
              Dicatat oleh {order.created_by ?? '—'} · diubah terakhir oleh {order.updated_by ?? '—'}, {new Date(order.updated_at).toLocaleString('id-ID')}
            </p>
          </section>
        </div>

        <div className="flex min-w-0 max-w-[400px] flex-[1_1_320px] flex-col gap-4">
          <section className={SIDE}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-section">Pembayaran</h2>
              <BayarBadge status={order.status_bayar} dibatalkan={batal} />
            </div>
            <dl className="m-0 flex flex-col gap-1">
              <div className="flex justify-between"><dt className="text-neutral-800">Terbayar</dt><dd className="m-0">{rupiah(order.terbayar)}</dd></div>
              <div className="flex items-baseline justify-between">
                <dt className="font-bold">Sisa tagihan</dt>
                <dd className={cx('m-0 text-stat font-bold', sisaAktif ? 'text-accent-700' : 'text-sage-700')}>{rupiah(batal ? 0 : order.sisa)}</dd>
              </div>
            </dl>
            {payments.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-full bg-bg py-2 pl-4 pr-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-bold">{rupiah(p.jumlah)}</div>
                      <div className="text-sm text-neutral-800">{METODE[p.metode]} · {tanggal(p.tanggal_bayar, { day: 'numeric', month: 'short' })}</div>
                    </div>
                    {p.bukti_path && (
                      <button type="button" onClick={() => lihatBukti(p.bukti_path!)} aria-label={`Lihat bukti ${rupiah(p.jumlah)}`}
                        className="btn btn-icon text-neutral-800 hover:bg-sage-200 hover:text-sage-900">
                        <ImageIcon size={16} {...ICON} />
                      </button>
                    )}
                    <button type="button" onClick={() => deletePayment(p)} aria-label={`Hapus pembayaran ${rupiah(p.jumlah)}`}
                      className="btn btn-icon text-neutral-800 hover:bg-accent-200 hover:text-accent-800">
                      <Trash2 size={16} {...ICON} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!batal && order.status_bayar !== 'lunas' && (
              <Button variant={order.sumber === 'link' && order.status === 'baru' ? 'secondary' : 'primary'} onClick={() => setPaying(true)}>Catat pembayaran</Button>
            )}
            {!batal && order.status_bayar === 'lunas' && (
              <div className="flex flex-col gap-2 border-t border-divider pt-3">
                <div className="text-sm text-neutral-800">Sudah lunas. Kirim struk PDF ke pembeli.</div>
                <Button onClick={() => bukaChat(selesai ? 'selesai' : 'lunas')} disabled={!!strukBusy || !order.customer_wa}>
                  <Send size={16} {...ICON} />Kirim struk ke WA
                </Button>
                {!order.customer_wa && <div className="text-sm text-neutral-800">Pembeli tidak punya nomor WA. Unduh PDF lalu kirim manual.</div>}
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" className="flex-1" onClick={unduhStruk} disabled={!!strukBusy}>
                    <Download size={16} {...ICON} />{strukBusy === 'unduh' ? 'Membuat…' : 'Unduh PDF'}
                  </Button>
                  <Button variant="ghost" onClick={() => setPaying(true)}>Catat pembayaran</Button>
                </div>
              </div>
            )}
          </section>

          <section className={SIDE}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-section">Status pesanan</h2>
              <OrderStatusBadge status={order.status} />
            </div>
            {!batal && (
              <div className="flex flex-col">
                {FLOW.map((f, i) => (
                  <button key={f} type="button" onClick={() => changeStatus(f)} aria-current={i === curIdx ? 'step' : undefined}
                    className="-ml-1.5 flex min-h-[44px] items-center gap-3 rounded-full py-1.5 pl-1.5 pr-3 text-left hover:bg-accent-100">
                    <span className={cx('grid size-[30px] shrink-0 place-items-center rounded-full text-sm font-bold',
                      i < curIdx ? 'bg-sage-700 text-bg' : i === curIdx ? 'bg-accent text-bg' : 'bg-neutral-300 text-neutral-800')}>
                      {i + 1}
                    </span>
                    <span className={i === curIdx ? 'font-bold' : ''}>{ORDER_STATUS[f]}</span>
                  </button>
                ))}
              </div>
            )}
            {!batal && !selesai && sisaAktif && (
              <Button variant="secondary" onClick={cod}>Terima tunai {rupiah(order.sisa)} &amp; selesai</Button>
            )}
            {!batal && !selesai && (
              <Button variant="ghost" className="min-h-[44px] text-accent-800 hover:text-accent-800" onClick={() => changeStatus('dibatalkan')}>Batalkan pesanan</Button>
            )}
            {batal && <Button variant="secondary" onClick={() => changeStatus('baru')}>Aktifkan kembali</Button>}
          </section>
        </div>
      </div>

      {chat && order.customer_wa && (
        <ChatModal order={order} items={items} awal={chat} struk={strukFile}
          onClose={() => setChat(null)} onError={setError} />
      )}
      {paying && <PaymentForm order={order} onClose={() => setPaying(false)} onSaved={() => { setPaying(false); load() }} />}
      {confirmDialog}
      {removed && (
        <Toast key={removed.id} message={`Pembayaran ${rupiah(removed.jumlah)} dihapus`} actionLabel="Urungkan" onAction={undoDelete}
          onDone={() => { setRemoved(null); flushRemovedFile() }} />
      )}
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
  // Kelebihan bayar: klik pertama hanya memunculkan peringatan, klik kedua menyimpan
  const [okLebih, setOkLebih] = useState(false)
  const half = Math.ceil(Number(order.total) / 2)
  const quick = [{ v: Number(order.sisa), l: 'Lunasi' }, { v: half, l: 'DP 50%' }]
    .filter((x, i, a) => x.v > 0 && a.findIndex((y) => y.v === x.v) === i)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (nominal <= 0) return setError('Jumlah harus lebih dari 0.')
    if (lebih > 0 && !okLebih) return setOkLebih(true)
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
    <Modal open onClose={onClose} title="Catat pembayaran" width={460}>
      <form onSubmit={save} className="flex flex-col gap-4">
        {error && <Alert>{error}</Alert>}
        <Field label="Jumlah (Rp)" htmlFor="pay-jumlah" helper={`Sisa tagihan ${rupiah(order.sisa)}`}>
          <input id="pay-jumlah" autoFocus inputMode="numeric" value={jumlah} onChange={(e) => { setJumlah(e.target.value); setOkLebih(false) }}
            className={cx(inputCls, 'min-h-[52px] text-section font-bold')} />
        </Field>
        {lebih > 0 && <Alert tone="warn">Kelebihan bayar {rupiah(lebih)}.{okLebih && ' Tekan tombol simpan sekali lagi bila memang benar.'}</Alert>}
        {quick.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {quick.map((x) => (
              <Button key={x.l} variant="secondary" className="min-h-[44px] whitespace-normal" onClick={() => { setJumlah(String(x.v)); setOkLebih(false) }}>
                {x.l} {rupiah(x.v)}
              </Button>
            ))}
          </div>
        )}
        <fieldset className="m-0 border-0 p-0">
          <legend className="mb-[5px] p-0 text-label font-bold">Metode</legend>
          <div className="grid grid-cols-3 gap-1.5">
            {(Object.keys(METODE) as Metode[]).map((m) => (
              <button key={m} type="button" aria-pressed={metode === m} onClick={() => setMetode(m)}
                className={cx('min-h-[44px] rounded-full border px-1 text-sm font-semibold leading-tight',
                  metode === m ? 'border-accent bg-accent text-bg' : 'border-divider text-ink hover:bg-neutral-200')}>
                {METODE[m]}
              </button>
            ))}
          </div>
        </fieldset>
        <Field label="Tanggal bayar" htmlFor="pay-tgl">
          <input id="pay-tgl" type="date" value={tgl} onChange={(e) => setTgl(e.target.value)} className={inputCls} />
        </Field>
        {metode !== 'tunai' && (
          <div className="flex flex-col">
            <div className="mb-[5px] text-label font-bold">Bukti transfer (opsional)</div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="btn btn-secondary relative bg-bg">
                {file ? 'Ganti foto' : 'Pilih foto'}
                <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="absolute inset-0 cursor-pointer opacity-0" />
              </label>
              {file && <span className="min-w-0 truncate text-sm text-neutral-800">{file.name}</span>}
            </div>
          </div>
        )}
        <Button type="submit" disabled={busy} className="btn-lg">
          {busy ? 'Menyimpan…' : okLebih && lebih > 0 ? `Tetap simpan (lebih ${rupiah(lebih)})` : 'Simpan pembayaran'}
        </Button>
      </form>
    </Modal>
  )
}

/** Pilih template pesan WhatsApp, edit bila perlu, lalu kirim (opsional dengan struk PDF) */
function ChatModal({ order, items, awal, struk, onClose, onError }: {
  order: OrderSummary; items: OrderItem[]; awal: JenisPesan | 'auto'; struk: File | null
  onClose: () => void; onError: (msg: string) => void
}) {
  const toko = useToko()
  const wa = normWa(order.customer_wa)
  const data: DataPesan = {
    nama: order.customer_nama, kode: kodePesanan(order.id), toko: toko.nama_toko, infoPembayaran: toko.info_pembayaran, lokasi: toko.lokasi_ambil,
    status: order.status, caraTerima: order.cara_terima, tanggalAmbil: order.tanggal_ambil, jamAmbil: order.jam_ambil,
    items: items.map((i) => ({ nama: i.nama_produk_snapshot, qty: i.qty, harga: Number(i.harga_snapshot) })),
    ongkir: Number(order.ongkir), total: Number(order.total), terbayar: Number(order.terbayar), sisa: Number(order.sisa),
  }
  const pilihan = pilihanPesan(data)
  const [jenis, setJenis] = useState<JenisPesan>(awal === 'auto' ? pesanBawaan(data) : awal)
  // null = belum diedit, teks mengikuti template (dan ikut terisi saat data toko selesai dimuat)
  const [edit, setEdit] = useState<string | null>(null)
  const teks = edit ?? buatPesan(jenis, data, toko.template_wa)
  const lunas = order.status_bayar === 'lunas'
  const pakaiStruk = lunas && (jenis === 'selesai' || jenis === 'lunas')
  const bisaShare = !!struk && typeof navigator.canShare === 'function' && navigator.canShare({ files: [struk] })

  const bukaWa = () => window.open(`https://wa.me/${wa}?text=${encodeURIComponent(teks)}`, '_blank', 'noopener')

  async function kirimDenganStruk() {
    if (!struk) return
    if (bisaShare) {
      try {
        await navigator.share({ files: [struk], title: struk.name, text: teks })
        onClose()
      } catch (e) {
        if ((e as Error).name !== 'AbortError') { unduh(struk); bukaWa(); onError('Menu Bagikan gagal dibuka. Struk diunduh; lampirkan ke chat WhatsApp.') ; onClose() }
      }
      return
    }
    // Laptop: file tidak bisa dilampirkan otomatis, jadi unduh lalu buka chat pembeli
    unduh(struk)
    bukaWa()
    onClose()
  }

  return (
    <Modal open onClose={onClose} title="Chat pembeli" width={520}>
      <div className="flex items-center gap-3 rounded-lg bg-bg px-4 py-3">
        <MessageCircle size={20} {...ICON} className="shrink-0 text-sage-700" />
        <div className="min-w-0">
          <div className="font-bold">{order.customer_nama}</div>
          <div className="text-sm text-neutral-800">{order.customer_wa}</div>
        </div>
      </div>

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-[5px] p-0 text-label font-bold">Template pesan</legend>
        <div className="flex flex-wrap gap-1.5">
          {pilihan.map((j) => (
            <button key={j} type="button" aria-pressed={jenis === j} onClick={() => { setJenis(j); setEdit(null) }}
              className={cx('min-h-[44px] rounded-full border px-4 text-sm font-semibold',
                jenis === j ? 'border-accent bg-accent text-bg' : 'border-divider bg-bg text-ink hover:bg-accent-100')}>
              {LABEL_PESAN[j]}
            </button>
          ))}
        </div>
      </fieldset>

      <Field label="Isi pesan" htmlFor="chat-teks" helper="Perubahan di sini hanya untuk pesan ini. Ubah template tetap di Pengaturan toko. *teks* tampil tebal di WhatsApp.">
        <textarea id="chat-teks" rows={9} value={teks} onChange={(e) => setEdit(e.target.value)} className={cx(inputCls, 'text-label')} />
      </Field>

      {pakaiStruk ? (
        <div className="flex flex-col gap-2">
          <Button className="btn-lg" onClick={kirimDenganStruk} disabled={!struk}>
            <Send size={16} {...ICON} />{struk ? 'Kirim pesan + struk PDF' : 'Menyiapkan struk…'}
          </Button>
          <p className="m-0 text-sm text-neutral-800">
            {bisaShare
              ? 'Menu Bagikan akan terbuka. Pilih WhatsApp, lalu pilih kontak di atas.'
              : `Struk (${struk?.name ?? 'PDF'}) akan terunduh dan chat pembeli terbuka. Lampirkan file itu ke chat.`}
          </p>
          <Button variant="ghost" onClick={() => { bukaWa(); onClose() }}>Kirim teks saja</Button>
        </div>
      ) : (
        <Button className="btn-lg" onClick={() => { bukaWa(); onClose() }}>
          <Send size={16} {...ICON} />Buka WhatsApp
        </Button>
      )}
    </Modal>
  )
}
