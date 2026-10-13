import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Halaman memuat data lewat fungsi load() async yang juga dipanggil ulang setelah
    // mutasi; setState di dalamnya terjadi setelah await, bukan sinkron di effect.
    // Foto produk sudah dikompres di browser sebelum diunggah, jadi <img> biasa cukup
    // (tanpa biaya optimasi gambar Vercel).
    rules: { "react-hooks/set-state-in-effect": "off", "@next/next/no-img-element": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
