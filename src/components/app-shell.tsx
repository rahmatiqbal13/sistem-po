'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { BarChart3, CalendarRange, ClipboardList, LogOut, Package, Plus, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { BATCH_STATUS } from '@/lib/types'
import { BatchProvider, useBatch } from './batch-context'
import { ICON, cx } from './ui'

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

function Logo({ size }: { size: 'sm' | 'md' }) {
  return (
    <div aria-hidden="true" className={cx('grid shrink-0 place-items-center rounded-full bg-accent font-heading text-ink',
      size === 'md' ? 'size-[38px] text-lg' : 'size-[34px] text-[17px]')}>P</div>
  )
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { email } = useBatch()
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const onForm = pathname.startsWith('/pesanan/baru') || pathname.endsWith('/edit')
  const onDetail = /^\/pesanan\/[^/]+$/.test(pathname) && !onForm

  async function logout() {
    await createClient().auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  const sideItem = (active: boolean) => cx(
    'flex min-h-[46px] items-center gap-3 rounded-full px-4 text-[15px] font-semibold no-underline transition-colors',
    active ? 'bg-accent-200 text-accent-800 hover:text-accent-800' : 'text-ink hover:bg-neutral-100 hover:text-ink',
  )

  return (
    <div className="min-h-dvh md:flex md:items-start">
      <a className="skip" href="#konten">Langsung ke konten</a>

      {/* Bar atas HP */}
      <div className="no-print sticky top-0 z-30 flex items-center gap-2.5 bg-bg [@media(max-height:500px)]:static px-4 pb-3 pt-[calc(13.2px+env(safe-area-inset-top))] shadow-sm md:hidden">
        <Logo size="sm" />
        <div className="flex-1 font-heading text-[19px]">PO Jajanan</div>
        <Link href="/pengaturan" aria-label="Pengaturan toko"
          className={cx('grid size-[44px] place-items-center rounded-full',
            isActive('/pengaturan') ? 'bg-accent-200 text-accent-800' : 'text-ink hover:bg-neutral-100')}>
          <Settings size={20} {...ICON} />
        </Link>
      </div>

      {/* Sidebar desktop */}
      <aside className="no-print sticky top-3 isolate m-3 mr-0 hidden h-[calc(100dvh-26.4px)] w-[248px] shrink-0 flex-col gap-4 overflow-hidden rounded-card bg-surface px-4 py-6 md:flex">
        <div aria-hidden="true" className="absolute -right-[70px] bottom-[90px] -z-10 size-[200px] rounded-full bg-sage-300 opacity-60" />
        <div aria-hidden="true" className="absolute -left-[30px] bottom-[230px] -z-10 size-[90px] rounded-full bg-accent-300 opacity-50" />
        <div className="flex items-center gap-2.5 px-1.5">
          <Logo size="md" />
          <div className="font-heading text-[21px] leading-tight">PO Jajanan</div>
        </div>
        <Link href="/pesanan/baru" className="btn btn-primary mt-2 min-h-[48px]">
          <Plus size={20} {...ICON} />Pesanan Baru
        </Link>
        <nav aria-label="Menu utama" className="flex flex-col gap-1">
          {NAV.map(({ href, label, Icon }) => (
            <Link key={href} href={href} className={sideItem(isActive(href))} aria-current={isActive(href) ? 'page' : undefined}>
              <Icon size={20} {...ICON} />{label}
            </Link>
          ))}
        </nav>
        <Link href="/pengaturan" className={cx(sideItem(isActive('/pengaturan')), 'mt-auto')}
          aria-current={isActive('/pengaturan') ? 'page' : undefined}>
          <Settings size={20} {...ICON} />Pengaturan toko
        </Link>
        <div className="flex flex-col gap-1 rounded-lg bg-neutral-100 px-4 py-3">
          <div className="truncate text-sm text-neutral-800" title={email ?? ''}>{email}</div>
          <button type="button" onClick={logout} className="btn btn-ghost min-h-[44px] justify-start px-0 text-[15px]">
            <LogOut size={16} {...ICON} />Keluar
          </button>
        </div>
      </aside>

      <main id="konten" tabIndex={-1}
        className={cx('min-w-0 flex-1 px-4 pt-4 md:px-6 md:pb-16 md:pt-8', onForm ? 'pb-6' : 'pb-44')}>
        <div className="flex max-w-[1120px] flex-col gap-6">{children}</div>
      </main>

      {/* Navigasi bawah HP + tombol utama */}
      {!onForm && (
        <div className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col items-end md:hidden">
          {!onDetail && (
            <Link href="/pesanan/baru" className="btn btn-primary pointer-events-auto mb-3 mr-4 min-h-[56px] px-[22px] shadow-lg">
              <Plus size={22} {...ICON} />Pesanan Baru
            </Link>
          )}
          <nav aria-label="Menu utama"
            className="pointer-events-auto grid w-full grid-cols-4 rounded-t-lg bg-surface px-1 pt-1 pb-[env(safe-area-inset-bottom)] shadow-md">
            {NAV.map(({ href, label, Icon }) => {
              const on = isActive(href)
              return (
                <Link key={href} href={href} aria-current={on ? 'page' : undefined}
                  className={cx('flex min-h-[64px] flex-col items-center justify-center gap-[3px] text-sm font-bold no-underline',
                    on ? 'text-accent-800 hover:text-accent-800' : 'text-neutral-800 hover:text-neutral-800')}>
                  <span className={cx('grid h-[30px] w-[52px] place-items-center rounded-full', on && 'bg-accent-200')}>
                    <Icon size={22} {...ICON} />
                  </span>
                  {label}
                </Link>
              )
            })}
          </nav>
        </div>
      )}
    </div>
  )
}

/** Pemilih batch aktif, dipakai di halaman Pesanan & Rekap. */
export function BatchPicker() {
  const { batches, batchId, setBatchId } = useBatch()
  if (batches.length === 0) return null
  return (
    <select value={batchId ?? ''} onChange={(e) => setBatchId(e.target.value)} aria-label="Pilih batch"
      className="input min-h-[44px] w-full max-w-full md:w-auto">
      {batches.map((b) => (
        <option key={b.id} value={b.id}>{b.nama} · {BATCH_STATUS[b.status]}</option>
      ))}
    </select>
  )
}
