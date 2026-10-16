import { Suspense } from 'react'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Lupa password' }

export default function Layout({ children }: { children: React.ReactNode }) {
  // Halaman membaca ?email dari URL (useSearchParams butuh Suspense)
  return <Suspense>{children}</Suspense>
}
