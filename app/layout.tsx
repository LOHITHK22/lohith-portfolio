import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/react";
import { profile } from "@/data/profile";
import "./globals.css";

// Self-hosted copies of the Google Fonts files the site already used, so builds never download
// fonts (see app/fonts/README.md for sources, checksums and licences). Each face keeps Google's
// unicode-range for its subset (next/font needs these values written inline as literals). The
// metric-matched fallbacks are defined in app/globals.css with the values next/font/google used.
const inter = localFont({
  src: "./fonts/inter-latin-wght.woff2",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Inter Fallback"],
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});

const spaceGrotesk = localFont({
  src: "./fonts/space-grotesk-latin-wght.woff2",
  weight: "300 700",
  variable: "--font-display",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Space Grotesk Fallback"],
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});

// Heavy display face for the cinematic hero name.
const montserrat = localFont({
  src: "./fonts/montserrat-latin-wght.woff2",
  weight: "800 900",
  variable: "--font-hero",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Montserrat Fallback"],
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});

const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght.woff2",
  weight: "100 800",
  variable: "--font-jetbrains-mono",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["JetBrains Mono Fallback"],
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD" }],
});

// Greek glyphs for monospace text (the AI Lab's κ). Downloaded only when a Greek character is shown.
const jetbrainsMonoGreek = localFont({
  src: "./fonts/jetbrains-mono-greek-wght.woff2",
  weight: "100 800",
  variable: "--font-jetbrains-mono-greek",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF" }],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${profile.name} | ${profile.headline}`,
    template: `%s | ${profile.name}`,
  },
  description: profile.subIdentity + ". " + profile.heroParagraph,
  keywords: [
    "Lohith Kovuri",
    "Data Analyst",
    "Data Engineer",
    "Analytics Engineer",
    "SQL",
    "Python",
    "Snowflake",
    "PySpark",
    "Airflow",
    "AWS",
    "LLM Evaluation",
  ],
  authors: [{ name: profile.name }],
  creator: profile.name,
  openGraph: {
    type: "website",
    url: siteUrl,
    title: `${profile.name} | ${profile.headline}`,
    description: profile.subIdentity,
    siteName: `${profile.name} | Portfolio`,
  },
  twitter: {
    card: "summary_large_image",
    title: `${profile.name} | ${profile.headline}`,
    description: profile.subIdentity,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#05060a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable} ${jetbrainsMonoGreek.variable} ${spaceGrotesk.variable} ${montserrat.variable}`}>
      <body className="min-h-screen bg-base-950 font-sans">
        <a
          href="#main-content"
          className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-full bg-white px-4 py-2 text-sm font-semibold text-base-950 transition-transform focus:translate-y-0"
        >
          Skip to content
        </a>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
