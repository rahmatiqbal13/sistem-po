import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PO Jajanan',
    short_name: 'PO Jajanan',
    description: 'Pencatatan pre-order jajanan',
    start_url: '/pesanan',
    display: 'standalone',
    background_color: '#f5ead8',
    theme_color: '#f5ead8',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  }
}
