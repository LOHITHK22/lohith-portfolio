# Self-hosted fonts

The site's four typefaces are bundled here and loaded with `next/font/local` (see `app/layout.tsx`),
so a production build never downloads fonts from Google.

**Why they're bundled:** `next/font/google` in Next.js 14.2.35 picks each font file's extension
with `/\.(woff|woff2|eot|ttf|otf)$/.exec(url)[1]`. When Google Fonts answers with a font URL that
has no file extension, the regex returns `null` and the build fails with
`TypeError: Cannot read properties of null (reading '1')`. Bundling the files removes that network
dependency from the build.

## Files

These are byte-for-byte the same files the site already served through `next/font/google`. Each
SHA-256 matches the copy that build self-hosted under `/_next/static/media/` on production.

| File | Family | Weights (variable axis) | Subset | Google Fonts source | SHA-256 |
|---|---|---|---|---|---|
| `inter-latin-wght.woff2` | Inter v20 | 100–900 | latin | `fonts.gstatic.com/s/inter/v20/UcC73FwrK3iLTeHuS_nVMrMxCp50SjIa1ZL7W0Q5nw.woff2` | `c940764593d0fe5d596be327ca7558855e018039fb78509aa21921fd3644c3e4` |
| `space-grotesk-latin-wght.woff2` | Space Grotesk v22 | 300–700 | latin | `fonts.gstatic.com/s/spacegrotesk/v22/V8mDoQDjQSkFtoMM3T6r8E7mPbF4C_k3HqU.woff2` | `a0d054c4af557de20afd6ca59f47ab353bcaec49c63ff04b6c9d39d0f8910557` |
| `montserrat-latin-wght.woff2` | Montserrat v31 | 800–900 | latin | `fonts.gstatic.com/s/montserrat/v31/JTUSjIg1_i6t8kCHKm459WlhyyTh89Y.woff2` | `6438d7b8ea9c7c3992d5e2fd2afdb1ff948570a3ef0bedae76247b51632960ba` |
| `jetbrains-mono-latin-wght.woff2` | JetBrains Mono v24 | 100–800 | latin | `fonts.gstatic.com/s/jetbrainsmono/v24/tDbV2o-flEEny0FZhsfKu5WU4xD7OwGtT0rU.woff2` | `1e06740a02a443fb7f3eeda8fcaa685a0f6c620e3f01e6666e847295469ce3ad` |
| `jetbrains-mono-greek-wght.woff2` | JetBrains Mono v24 | 100–800 | greek | `fonts.gstatic.com/s/jetbrainsmono/v24/tDbV2o-flEEny0FZhsfKu5WU4xD4OwGtT0rU3BE.woff2` | `3edf363dbf9d5fa0cdc784ae2b431a8a4152f4055a8a8858028c0bd668808273` |

**Subsets:**
- **`latin`** covers every character in the site's own text, apart from symbols (such as `→`, `✓`) that none of Google's subsets contain. Those were already drawn by the fallback font, and still are.
- **`greek`** for JetBrains Mono is only there for the `κ` in the AI Lab's Cohen's-kappa card. It loads only when a Greek character is on screen.

Each face keeps Google's `unicode-range`, so characters are matched exactly as before.

## Licence

All four families are licensed under the SIL Open Font License 1.1. That licence allows bundling
and redistribution with software, provided the licence travels with the fonts. The licence texts,
taken from the `google/fonts` repository, are in `licenses/`.
