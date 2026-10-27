import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Uji coba dari HP/laptop lain di Wi-Fi yang sama (http://<IP-komputer>:3000); hanya berlaku saat `next dev`
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*', '172.*.*.*'],
  partialPrefetching: true,
  poweredByHeader: false,
  // Header keamanan untuk semua halaman: tidak bisa dimuat dalam iframe situs lain (clickjacking),
  // tipe file tidak ditebak browser, dan alamat halaman tidak bocor penuh ke situs lain
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      ],
    }]
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
