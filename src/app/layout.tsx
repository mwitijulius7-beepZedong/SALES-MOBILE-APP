import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { ToastProvider } from "@/components/toast";
import RegisterSW from './RegisterSW'

export const metadata: Metadata = {
  title: "VendFlow \u2014 field sales, inventory & expenses",
  description:
    "Mobile-first operations suite for sales teams: inventory, invoicing, expenses, requisitions and stock reporting in one place.",
  applicationName: "VendFlow",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "VendFlow" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  other: { "mobile-web-app-capable": "yes" },
};

export const viewport: Viewport = {
  themeColor: "#12433a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Manrope:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-paper text-ink antialiased">
        <RegisterSW />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
