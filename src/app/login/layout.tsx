import { Suspense } from 'react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Masuk' }

export default function Layout({ children }: { children: React.ReactNode }) {
  // Halaman login membaca ?expired dari URL (useSearchParams butuh Suspense)
  return <Suspense>{children}</Suspense>
}
