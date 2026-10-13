import type { Metadata } from 'next'
import { Suspense } from 'react'

export const metadata: Metadata = {
  title: 'Pemesanan PO',
  description: 'Pesan jajanan pre-order',
  robots: { index: false },
}

export default function PoLayout({ children }: LayoutProps<'/po'>) {
  return <Suspense fallback={<div className="py-16 text-center text-muted">Memuat…</div>}>{children}</Suspense>
}
