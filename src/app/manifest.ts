import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PO Jajanan',
    short_name: 'PO Jajanan',
    description: 'Pencatatan pre-order jajanan',
    start_url: '/pesanan',
    display: 'standalone',
    background_color: '#f6f8f6',
    theme_color: '#f6f8f6',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  }
}
