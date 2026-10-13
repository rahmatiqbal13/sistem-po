'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { BarChart3, CalendarRange, ClipboardList, LogOut, Package, Plus, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BATCH_STATUS } from '@/lib/types'
import { BatchProvider, useBatch } from './batch-context'
import { cx } from './ui'

const NAV = [
  { href: '/pesanan', label: 'Pesanan', Icon: ClipboardList },
  { href: '/batch', label: 'Batch', Icon: CalendarRange },
  { href: '/rekap', label: 'Rekap', Icon: BarChart3 },
  { href: '/produk', label: 'Produk', Icon: Package },
]

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <BatchProvider>
      <Shell>{children}</Shell>
    </BatchProvider>
  )
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { email } = useBatch()
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const onForm = pathname.startsWith('/pesanan/baru') || pathname.endsWith('/edit')

  async function logout() {
    await createClient().auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <div className="min-h-dvh md:flex">
      {/* Sidebar desktop */}
      <aside className="no-print sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-surface p-4 md:flex">
        <div className="mb-6 px-2 text-lg font-bold">PO Jajanan</div>
        <Link href="/pesanan/baru"
          className="mb-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-on-accent hover:bg-accent-hover">
          <Plus size={20} aria-hidden />Pesanan Baru
        </Link>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ href, label, Icon }) => (
            <Link key={href} href={href}
              className={cx('flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium',
                isActive(href) ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-surface-2')}
              aria-current={isActive(href) ? 'page' : undefined}>
              <Icon size={20} aria-hidden />{label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-line pt-3">
          <Link href="/pengaturan"
            className={cx('flex min-h-11 items-center gap-3 rounded-xl px-3 font-medium',
              isActive('/pengaturan') ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2')}>
            <Settings size={18} aria-hidden />Pengaturan toko
          </Link>
          <div className="truncate px-2 pt-2 text-sm text-muted" title={email ?? ''}>{email}</div>
          <button type="button" onClick={logout} className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-muted hover:bg-surface-2">
            <LogOut size={18} aria-hidden />Keluar
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      {/* Tombol utama HP */}
      {!onForm && (
        <Link href="/pesanan/baru"
          className="no-print fixed bottom-[84px] right-4 z-30 inline-flex min-h-14 items-center gap-2 rounded-full bg-accent px-5 font-bold text-on-accent shadow-lg md:hidden">
          <Plus size={22} aria-hidden />Pesanan Baru
        </Link>
      )}

      {/* Bottom nav HP */}
      {!onForm && (
        <nav className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
          {NAV.map(({ href, label, Icon }) => (
            <Link key={href} href={href}
              className={cx('flex min-h-16 flex-col items-center justify-center gap-0.5 text-sm font-medium',
                isActive(href) ? 'text-accent' : 'text-muted')}
              aria-current={isActive(href) ? 'page' : undefined}>
              <Icon size={22} aria-hidden />{label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}

/** Pemilih batch aktif, dipakai di halaman Pesanan & Rekap. */
export function BatchPicker() {
  const { batches, batchId, setBatchId } = useBatch()
  if (batches.length === 0) return null
  return (
    <label className="block">
      <span className="sr-only">Pilih batch</span>
      <select value={batchId ?? ''} onChange={(e) => setBatchId(e.target.value)}
        className="min-h-11 w-full rounded-xl border border-line bg-surface px-3 font-semibold md:w-auto">
        {batches.map((b) => (
          <option key={b.id} value={b.id}>{b.nama} · {BATCH_STATUS[b.status]}</option>
        ))}
      </select>
    </label>
  )
}
