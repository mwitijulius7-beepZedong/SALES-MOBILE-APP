import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'VendFlow',
    short_name: 'VendFlow',
    description: 'Field sales, inventory & expenses',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#12433a',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
