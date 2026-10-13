import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Rekap' }

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
