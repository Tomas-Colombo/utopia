import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import { InlineScript } from "@/components/theming/InlineScript";
import { ThemeProvider } from "@/components/theming/ThemeProvider";
import {
  DEFAULT_THEME,
  THEME_INIT_SCRIPT,
} from "@/components/theming/themeStorage";
import "./globals.css";

// One family for everything: Archivo is variable on weight AND width. Omitting
// `weight` loads the whole variable file; `axes: ["wdth"]` adds the width axis
// that `.font-display` / `.font-figure` drive through `font-stretch`
// (globals.css). Verified in node_modules/next/dist/docs (font.md, `axes`).
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  fallback: ["Inter", "system-ui", "sans-serif"],
});

// Mono/eyebrow — small uppercase labels, timestamps, amounts.
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
  fallback: ["ui-monospace", "SFMono-Regular", "monospace"],
});

export const metadata: Metadata = {
  title: "EvoralStock",
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
      className={`${archivo.variable} ${jetbrainsMono.variable} h-full antialiased`}
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
