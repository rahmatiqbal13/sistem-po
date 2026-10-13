import type { Metadata, Viewport } from "next";
import { Caprasimo, Figtree } from "next/font/google";
import "./globals.css";

const caprasimo = Caprasimo({ variable: "--font-caprasimo", weight: "400", subsets: ["latin"] });
const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PO Jajanan",
  description: "Pencatatan pre-order jajanan",
  appleWebApp: { capable: true, title: "PO Jajanan", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f5ead8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${caprasimo.variable} ${figtree.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
