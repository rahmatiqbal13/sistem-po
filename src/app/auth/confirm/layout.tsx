import { Suspense } from 'react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Konfirmasi', robots: { index: false } }

export default function Layout({ children }: { children: React.ReactNode }) {
  // Halaman membaca token dari URL (useSearchParams butuh Suspense)
  return <Suspense>{children}</Suspense>
}
