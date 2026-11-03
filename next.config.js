/**
 * Security headers sent with every response. Deliberately conservative so nothing on the site
 * changes behaviour: no Content-Security-Policy script rules yet (Next.js inline bootstrap scripts
 * and the media/Web Audio features would need a nonce-based policy and careful testing), only the
 * framing rule from CSP.
 */
const securityHeaders = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
  // The site uses none of these. Autoplay and fullscreen are left alone (narration, event mode).
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Do not advertise the framework version.
  poweredByHeader: false,
  // Explicit: never publish browser source maps (this is also the Next.js default).
  productionBrowserSourceMaps: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // nosniff everywhere except Vercel's own /_vercel/* scripts (analytics), which exist only on
      // Vercel's edge: under `next start` that path is a 404 page, and nosniff would turn the
      // harmless miss into a console error.
      { source: "/:path((?!_vercel/).*)", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }] },
    ];
  },
};

module.exports = nextConfig;
