import type { Metadata, Viewport } from "next";
import { Manrope, Unbounded } from "next/font/google";
import Script from "next/script";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poker Tracker",
  icons: { icon: "/favicon.svg" },
  description: "Облік стеків у домашньому покері: кеш і турніри, таймер блайндів, графік і лідерборд.",
};

// Self-hosted at build time: no request to Google from Telegram's WebView, no render-blocking CSS.
const manrope = Manrope({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope", display: "swap" });
const unbounded = Unbounded({ subsets: ["latin", "cyrillic"], weight: ["500", "600", "700", "800"], variable: "--font-unbounded", display: "swap" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e6ecea" },
    { media: "(prefers-color-scheme: dark)", color: "#06120e" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk" className={`${manrope.variable} ${unbounded.variable}`}>
      <head>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body className="min-h-dvh antialiased">
        {/* Lens used by .glass-pill / .glass-lens where backdrop-filter:url() is supported (Chromium). */}
        <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
          <filter id="lg-refract" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="noise" />
            <feGaussianBlur in="noise" stdDeviation="2" result="soft" />
            <feDisplacementMap in="SourceGraphic" in2="soft" scale="38" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
