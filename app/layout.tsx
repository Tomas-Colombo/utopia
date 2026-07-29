import type { Metadata } from "next";
import { Archivo, Archivo_Black, Space_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theming/ThemeProvider";
import { ThemeToggle } from "@/components/theming/ThemeToggle";
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
      suppressHydrationWarning
      className={`${archivoBlack.variable} ${archivo.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <ThemeToggle />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
