import type { Metadata } from "next";
import { Archivo, Archivo_Black, Space_Mono } from "next/font/google";
import { InlineScript } from "@/components/theming/InlineScript";
import { ThemeProvider } from "@/components/theming/ThemeProvider";
import {
  DEFAULT_THEME,
  THEME_INIT_SCRIPT,
} from "@/components/theming/themeStorage";
import "./globals.css";

// Display — headings/hero numerals (design §8.4). Archivo Black only ships
// weight 400 on Google Fonts.
const archivoBlack = Archivo_Black({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
  fallback: ["Inter", "system-ui", "sans-serif"],
});

// Body/UI — primary UI font (design §8.4). Variable font; the design's
// observed weights (400/500/600/700) are requested explicitly.
const archivo = Archivo({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  fallback: ["Inter", "system-ui", "sans-serif"],
});

// Mono/eyebrow — small uppercase labels, timestamps (design §8.4).
const spaceMono = Space_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  fallback: ["ui-monospace", "SFMono-Regular", "monospace"],
});

export const metadata: Metadata = {
  title: "Utopia",
  description: "Multi-tenant SaaS management system for clothing store operations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // Server-rendered default. The inline script below replaces it with the
      // stored preference before the first paint, so this is only what a
      // first-time visitor (or a browser with localStorage blocked) gets.
      data-theme={DEFAULT_THEME}
      suppressHydrationWarning
      className={`${archivoBlack.variable} ${archivo.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <head>
        {/* Blocking, synchronous, and deliberately before <body>: this is the
            only place that can set the theme ahead of the first paint. See
            components/theming/themeStorage.ts and the Next.js guide
            "How to prevent flash before hydration". */}
        <InlineScript html={THEME_INIT_SCRIPT} />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
