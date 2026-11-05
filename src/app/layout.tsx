import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Impulso 365 · CRM",
  description: "CRM interno de Impulso 365",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0a0e13" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
