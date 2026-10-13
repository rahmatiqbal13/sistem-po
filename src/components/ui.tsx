'use client'

import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, ImageIcon, X } from 'lucide-react'
import type { OrderStatus, StatusBayar } from '@/lib/types'
import { ORDER_STATUS } from '@/lib/types'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

/** Ikon Lucide dengan stroke tebal sesuai design system Organic */
export const ICON = { strokeWidth: 2.75, 'aria-hidden': true } as const

type Variant = 'primary' | 'secondary' | 'ghost'

export function Button({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" {...p} className={cx('btn', `btn-${variant}`, className)} />
}

export function LinkButton({ href, variant = 'primary', className, children }: { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return <Link href={href} className={cx('btn', `btn-${variant}`, className)}>{children}</Link>
}

export function Field({ label, helper, error, children, className, htmlFor }: {
  label: string; helper?: ReactNode; error?: string; children: ReactNode; className?: string; htmlFor?: string
}) {
  return (
    <div className={cx('flex flex-col', className)}>
      <label htmlFor={htmlFor} className="mb-[5px] text-[15px] font-bold">{label}</label>
      {children}
      {helper && <div className="mt-1 text-sm text-neutral-800">{helper}</div>}
      {error && <div role="alert" className="mt-1 text-[15px] font-bold text-accent-800">{error}</div>}
    </div>
  )
}

/** Input di dalam kartu memakai latar krem agar kontras dengan permukaan pasir */
export const inputCls = 'input bg-bg'

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cx('rounded-card bg-surface px-6 py-4', className)}>{children}</section>
}

/** Label kecil di atas judul: titik terakota + nama batch */
export function Kicker({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[15px] font-bold leading-snug text-accent-700">
      <span className="size-[10px] shrink-0 rounded-full bg-accent" />{children}
    </div>
  )
}

export function PageHeader({ title, kicker, subtitle, action }: { title: string; kicker?: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 flex-[1_1_320px]">
        {kicker && <Kicker>{kicker}</Kicker>}
        <h1 className={kicker ? 'mt-1.5' : ''}>{title}</h1>
        {subtitle && <div className="mt-1 text-neutral-800">{subtitle}</div>}
      </div>
      {action}
    </header>
  )
}

const BAYAR_STYLE: Record<StatusBayar | 'batal', { label: string; cls: string }> = {
  lunas: { label: 'Lunas', cls: 'bg-sage-200 text-sage-900' },
  dp: { label: 'DP', cls: 'bg-accent-200 text-accent-800' },
  belum: { label: 'Belum bayar', cls: 'bg-accent-700 text-accent-100' },
  batal: { label: 'Tidak ditagih', cls: 'bg-neutral-200 text-neutral-800' },
}

export function BayarBadge({ status, dibatalkan }: { status: StatusBayar; dibatalkan?: boolean }) {
  const s = BAYAR_STYLE[dibatalkan ? 'batal' : status]
  return <span className={cx('tag', s.cls)}>{s.label}</span>
}

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <span className={cx('tag bg-neutral-100 font-normal text-neutral-800', status === 'dibatalkan' && 'line-through', className)}>
      {ORDER_STATUS[status]}
    </span>
  )
}

/** Label asal pesanan & kemungkinan pesanan ganda */
export function OrderTags({ sumber, ganda }: { sumber: 'admin' | 'link'; ganda?: boolean }) {
  if (sumber !== 'link' && !ganda) return null
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {sumber === 'link' && <span className="tag bg-accent-200 text-[13px] font-bold text-accent-800">Dari link</span>}
      {ganda && <span className="tag bg-accent-700 text-[13px] font-bold text-accent-100" title="Pembeli ini punya lebih dari 1 pesanan aktif di batch ini">Cek ganda</span>}
    </span>
  )
}

export function kodePesanan(id: string) {
  return '#' + id.slice(0, 6).toUpperCase()
}

export function Alert({ tone = 'bad', children }: { tone?: 'bad' | 'warn' | 'ok' | 'muted'; children: ReactNode }) {
  const cls = {
    bad: 'rounded-lg bg-accent-700 text-accent-100',
    warn: 'rounded-lg bg-accent-200 text-accent-900',
    ok: 'rounded-full bg-sage-200 text-sage-900',
    muted: 'rounded-lg bg-neutral-200 text-[14px] font-semibold text-neutral-800',
  }[tone]
  return <div role="alert" className={cx('px-4 py-3 font-bold', cls)}>{children}</div>
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-card bg-surface px-6 py-8">
      <div className="text-xl font-bold">{title}</div>
      {children && <p className="m-0 max-w-[52ch] text-neutral-800">{children}</p>}
      {action}
    </div>
  )
}

export function Loading() {
  return <div className="py-10 text-neutral-800">Memuat…</div>
}

export function Modal({ open, onClose, title, children, width = 480 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="dialog-backdrop place-items-[start_center] sm:place-items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="dialog my-6" style={{ width: `min(${width}px, 100%)` }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="min-w-0 flex-1 text-[22px]">{title}</h2>
          <button type="button" onClick={onClose} className="btn btn-icon hover:bg-neutral-300" aria-label="Tutup">
            <X size={18} {...ICON} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Chip({ children, onRemove, label }: { children: ReactNode; onRemove: () => void; label: string }) {
  return (
    <span className="inline-flex min-h-[34px] items-center gap-1 rounded-full bg-accent-200 pl-3.5 pr-1 text-sm font-semibold text-accent-800">
      {children}
      <button type="button" onClick={onRemove} aria-label={`Hapus filter ${label}`}
        className="grid size-[34px] place-items-center rounded-full hover:bg-accent-300">
        <X size={14} {...ICON} />
      </button>
    </span>
  )
}

/** Foto produk bulat; tanpa foto tampil ikon gambar */
export function ProductPhoto({ url, size, alt = '' }: { url: string | null; size: number; alt?: string }) {
  return (
    <div className="grid shrink-0 place-items-center overflow-hidden rounded-full bg-neutral-300 text-neutral-700" style={{ width: size, height: size }}>
      {url
        ? <img src={url} alt={alt} loading="lazy" className="washed size-full object-cover" />
        : <ImageIcon size={Math.round(size * 0.32)} {...ICON} />}
    </div>
  )
}

/** Tombol nomor halaman: 1 … 4 5 6 … 12 */
function pageButtons(page: number, pages: number) {
  const out: (number | '…')[] = []
  for (let n = 1; n <= pages; n++) {
    if (n === 1 || n === pages || Math.abs(n - page) <= 1) out.push(n)
    else if (out[out.length - 1] !== '…') out.push('…')
  }
  return out
}

export function Pager({ page, pages, per, onPage, onPer, info, label = 'Halaman' }: {
  page: number; pages: number; per: number; onPage: (n: number) => void; onPer: (n: number) => void; info?: string; label?: string
}) {
  const round = 'grid size-[44px] place-items-center rounded-full border border-divider text-ink hover:bg-accent-200'
  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-[28px] bg-surface py-2 pl-4 pr-2 sm:rounded-full">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2.5 text-[15px] font-semibold">
          Tampilkan
          <select className="input w-auto min-h-[42px] bg-bg font-bold" value={per} aria-label="Jumlah data per halaman"
            onChange={(e) => onPer(+e.target.value)}>
            {[10, 20, 30, 40, 50].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          per halaman
        </label>
        {info && <span className="text-[15px] text-neutral-800">{info}</span>}
      </div>
      {pages > 1 && (
        <nav aria-label={label} className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={round} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Halaman sebelumnya">
            <ChevronLeft size={18} {...ICON} />
          </button>
          {pageButtons(page, pages).map((n, i) => n === '…'
            ? <span key={`d${i}`} aria-hidden="true" className="min-w-6 text-center font-bold text-neutral-800">…</span>
            : (
              <button key={n} type="button" onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined}
                className={cx('h-[44px] min-w-[44px] rounded-full border px-2 text-base font-bold',
                  n === page ? 'border-accent bg-accent text-bg' : 'border-divider text-ink hover:bg-accent-200')}>
                {n}
              </button>
            ))}
          <button type="button" className={round} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Halaman berikutnya">
            <ChevronRight size={18} {...ICON} />
          </button>
        </nav>
      )}
    </div>
  )
}

/** Pagination sisi klien: halaman kembali ke 1 setiap kali `key` (filter) berubah */
export function paginate<T>(rows: T[], page: number, per: number) {
  const pages = Math.max(1, Math.ceil(rows.length / per))
  const p = Math.min(Math.max(1, page), pages)
  const from = (p - 1) * per
  const to = Math.min(rows.length, from + per)
  return {
    page: p, pages, shown: rows.slice(from, to),
    info: rows.length ? `Menampilkan ${from + 1}–${to} dari ${rows.length}` : '0',
  }
}
