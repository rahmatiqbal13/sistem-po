import { Suspense } from 'react'
import { AppShell } from '@/components/app-shell'

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <Suspense fallback={<div className="py-10 text-center text-neutral-800">Memuat…</div>}>
      <AppShell>{children}</AppShell>
    </Suspense>
  )
}
