'use client'

import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, CircleDashed, Clock, X, XCircle } from 'lucide-react'
import type { OrderStatus, StatusBayar } from '@/lib/types'
import { ORDER_STATUS, STATUS_BAYAR } from '@/lib/types'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2',
  ghost: 'text-ink hover:bg-surface-2',
  danger: 'bg-surface text-bad border border-line hover:bg-bad-soft',
}
const BTN = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none'

export function Button({ variant = 'primary', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" {...p} className={cx(BTN, VARIANTS[variant], className)} />
}

export function LinkButton({ href, variant = 'primary', className, children }: { href: string; variant?: Variant; className?: string; children: ReactNode }) {
  return <Link href={href} className={cx(BTN, VARIANTS[variant], className)}>{children}</Link>
}

export function Field({ label, helper, error, children, className }: { label: string; helper?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-sm text-bad">{error}</span>
        : helper ? <span className="mt-1 block text-sm text-muted">{helper}</span> : null}
    </label>
  )
}

export const inputCls = 'w-full min-h-11 rounded-xl border border-line bg-surface px-3 py-2 text-ink placeholder:text-muted/70 focus:outline-2 focus:outline-accent focus:border-transparent'

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-2xl border border-line bg-surface', className)}>{children}</div>
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
        {subtitle && <div className="mt-1 text-muted">{subtitle}</div>}
      </div>
      {action}
    </div>
  )
}

const BAYAR_STYLE: Record<StatusBayar, { cls: string; Icon: typeof CheckCircle2 }> = {
  lunas: { cls: 'bg-ok-soft text-ok', Icon: CheckCircle2 },
  dp: { cls: 'bg-warn-soft text-warn', Icon: Clock },
  belum: { cls: 'bg-bad-soft text-bad', Icon: XCircle },
}

export function BayarBadge({ status, dibatalkan }: { status: StatusBayar; dibatalkan?: boolean }) {
  if (dibatalkan) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-sm font-semibold text-muted"><CircleDashed size={15} aria-hidden />Tidak ditagih</span>
  }
  const { cls, Icon } = BAYAR_STYLE[status]
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-semibold', cls)}>
      <Icon size={15} aria-hidden />{STATUS_BAYAR[status]}
    </span>
  )
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const muted = status === 'dibatalkan'
  return (
    <span className={cx('inline-flex items-center whitespace-nowrap rounded-md border px-2 py-0.5 text-sm',
      muted ? 'border-line text-muted line-through' : status === 'selesai' ? 'border-ink/30 text-ink' : 'border-line text-ink')}>
      {ORDER_STATUS[status]}
    </span>
  )
}

export function Alert({ tone = 'warn', children }: { tone?: 'warn' | 'bad' | 'ok'; children: ReactNode }) {
  const cls = { warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad', ok: 'bg-ok-soft text-ok' }[tone]
  return (
    <div role="alert" className={cx('flex gap-2 rounded-xl px-3 py-2.5 text-sm font-medium', cls)}>
      <AlertTriangle size={18} className="mt-px shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-muted">{children}</div>
}

export function Loading() {
  return <div className="py-10 text-center text-muted">Memuat…</div>
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 md:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-surface p-5 md:max-w-lg md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-xl hover:bg-surface-2" aria-label="Tutup">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Chip({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex min-h-9 items-center gap-1 rounded-full bg-accent-soft pl-3 pr-1 text-sm font-semibold text-accent">
      {children}
      <button type="button" onClick={onRemove} className="grid size-7 place-items-center rounded-full hover:bg-accent/15" aria-label="Hapus filter">
        <X size={14} />
      </button>
    </span>
  )
}

/** Label kecil: asal pesanan & kemungkinan pesanan ganda */
export function OrderTags({ sumber, ganda }: { sumber: 'admin' | 'link'; ganda?: boolean }) {
  if (sumber !== 'link' && !ganda) return null
  return (
    <span className="inline-flex flex-wrap gap-1">
      {sumber === 'link' && <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-xs font-semibold text-accent">Dari link</span>}
      {ganda && <span className="rounded-md bg-warn-soft px-1.5 py-0.5 text-xs font-semibold text-warn" title="Pembeli ini punya lebih dari 1 pesanan aktif di batch ini">Cek ganda</span>}
    </span>
  )
}

export function kodePesanan(id: string) {
  return '#' + id.slice(0, 6).toUpperCase()
}
