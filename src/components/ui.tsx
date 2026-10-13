'use client'

import { useCallback, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type RefObject } from 'react'
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

export function Field({ label, helper, error, children, className, htmlFor, required }: {
  label: string; helper?: ReactNode; error?: string; children: ReactNode; className?: string; htmlFor?: string; required?: boolean
}) {
  const uid = useId()
  const helpId = `${uid}-help`
  const errId = `${uid}-err`
  // Sambungkan teks bantuan & pesan error ke kolomnya agar dibacakan pembaca layar
  useEffect(() => {
    const el = htmlFor ? document.getElementById(htmlFor) : null
    if (!el) return
    const ids = [error && errId, helper && helpId].filter(Boolean).join(' ')
    if (ids) el.setAttribute('aria-describedby', ids)
    else el.removeAttribute('aria-describedby')
    if (error) el.setAttribute('aria-invalid', 'true')
    else if (el.getAttribute('aria-invalid') === 'true' && !el.hasAttribute('data-invalid-own')) el.removeAttribute('aria-invalid')
  }, [htmlFor, error, helper, errId, helpId])
  return (
    <div className={cx('flex flex-col', className)}>
      <label htmlFor={htmlFor} className="mb-[5px] text-[15px] font-bold">
        {label}{required && <span className="text-accent-700" aria-hidden="true"> *</span>}
        {required && <span className="sr-only"> (wajib)</span>}
      </label>
      {children}
      {helper && <div id={helpId} className="mt-1 text-sm text-neutral-800">{helper}</div>}
      {error && <div id={errId} role="alert" className="mt-1 text-[15px] font-bold text-accent-800">{error}</div>}
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

/** Kerangka tampilan saat memuat: menahan ruang agar tata letak tidak melompat saat data tiba */
export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Memuat" className="flex flex-col gap-3">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        {[0, 1].map((i) => <div key={i} className="h-[104px] rounded-card bg-surface motion-safe:animate-pulse" />)}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-[76px] rounded-card bg-surface motion-safe:animate-pulse" style={{ opacity: 1 - i * 0.2 }} />
      ))}
      <span className="sr-only">Memuat…</span>
    </div>
  )
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Dialog modal: fokus masuk ke dialog, Tab berputar di dalamnya, dan kembali ke pemicunya saat ditutup */
export function useDialogFocus(ref: RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const frame = requestAnimationFrame(() => {
      const node = ref.current
      if (node && !node.contains(document.activeElement)) node.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    })
    const onKey = (e: KeyboardEvent) => {
      const node = ref.current
      if (e.key !== 'Tab' || !node) return
      const els = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null)
      if (!els.length) return
      const first = els[0], last = els[els.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey)
      if (prev && document.contains(prev)) prev.focus()
    }
  }, [open, ref])
}

export function Modal({ open, onClose, title, children, width = 480 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useDialogFocus(ref, open)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="dialog-backdrop place-items-[start_center] sm:place-items-center" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="dialog my-6" style={{ width: `min(${width}px, 100%)` }}
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
    <span className="inline-flex min-h-[44px] items-center gap-0.5 rounded-full bg-accent-200 pl-3.5 text-sm font-semibold text-accent-800">
      {children}
      <button type="button" onClick={onRemove} aria-label={`Hapus filter ${label}`}
        className="grid size-[44px] place-items-center rounded-full hover:bg-accent-300">
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
          <select className="input w-auto min-h-[44px] bg-bg font-bold" value={per} aria-label="Jumlah data per halaman"
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
                  n === page ? 'border-accent bg-accent text-ink' : 'border-divider text-ink hover:bg-accent-200')}>
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

interface ConfirmOpts { title: string; body?: ReactNode; confirmLabel: string; cancelLabel?: string; danger?: boolean }

/** Pengganti window.confirm bergaya Organic: `const [confirm, dialog] = useConfirm()` lalu render `{dialog}` */
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (ok: boolean) => void }) | null>(null)
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), [])
  const close = (ok: boolean) => { state?.resolve(ok); setState(null) }
  const dialog = state ? (
    <Modal open title={state.title} onClose={() => close(false)} width={440}>
      {state.body && <div className="text-neutral-800">{state.body}</div>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" className="bg-bg" onClick={() => close(false)}>{state.cancelLabel ?? 'Batal'}</Button>
        <Button className={cx('px-5', state.danger && 'bg-accent-700 text-accent-100 hover:bg-accent-800 hover:text-accent-100')}
          onClick={() => close(true)}>{state.confirmLabel}</Button>
      </div>
    </Modal>
  ) : null
  return [confirm, dialog] as const
}

/** Notifikasi singkat di bawah layar, opsional dengan tombol aksi (mis. Urungkan) */
export function Toast({ message, actionLabel, onAction, onDone, duration = 6000 }: {
  message: string; actionLabel?: string; onAction?: () => void; onDone: () => void; duration?: number
}) {
  const done = useRef(onDone)
  useEffect(() => { done.current = onDone })
  useEffect(() => {
    const t = setTimeout(() => done.current(), duration)
    return () => clearTimeout(t)
  }, [duration])
  return (
    <div role="status" aria-live="polite"
      className="no-print fixed inset-x-4 bottom-[calc(150px+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-[480px] items-center gap-3 rounded-full bg-neutral-900 py-2 pl-5 pr-2 text-neutral-100 shadow-lg md:bottom-6">
      <span className="flex-1 font-semibold">{message}</span>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="min-h-[44px] rounded-full px-4 font-bold text-accent-300 hover:bg-neutral-800">{actionLabel}</button>
      )}
    </div>
  )
}
