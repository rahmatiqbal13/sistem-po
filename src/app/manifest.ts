import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PO Jajanan',
    short_name: 'PO Jajanan',
    description: 'Pencatatan pre-order jajanan',
    start_url: '/pesanan',
    display: 'standalone',
    background_color: '#f7f6f3',
    theme_color: '#c2410c',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  }
}
