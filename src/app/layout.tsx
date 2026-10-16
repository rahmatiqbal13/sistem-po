import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { SKRIP_TEMA, TEMA, TEMA_DEFAULT } from "@/lib/tema";
import "./globals.css";

const archivo = Archivo({ variable: "--font-archivo", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "PO Jajanan", template: "%s · PO Jajanan" },
  description: "Pencatatan pre-order jajanan",
  appleWebApp: { capable: true, title: "PO Jajanan", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: TEMA[TEMA_DEFAULT].bg,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Skrip tema mengubah style <html> sebelum hidrasi
    <html lang="id" className={`${archivo.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SKRIP_TEMA }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
