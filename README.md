# Image Compressor (Next.js + sharp)

A minimal Next.js (App Router) app that accepts an uploaded image, applies resizing rules, and returns a **lossy WebP** for download.

## Rules implemented

- **Default resize behavior**
  - If original width is **> 960px**: resize to **960px wide**, proportional height.
  - If width is **<= 960px**: do **not upscale**.

- **Custom resize option**
  - Optional `targetWidth`, `targetHeight` inputs.
  - If **both** are provided: resize **exactly** to those dimensions (aspect ratio is not preserved).
  - If **one** is provided: preserve aspect ratio.
  - **Never upscale unless explicitly requested** (providing a custom dimension is treated as explicit).

- **Output format**
  - Always outputs **WebP** with **lossy compression** (`quality: 80`, `effort: 4`).

## Local development (Arch Linux)

1. Install Node.js 20+.
2. Install dependencies:

```bash
npm install
```

3. Run dev server:

```bash
npm run dev
```

Open http://localhost:3000

## Deploy to Vercel

- Push the repo to GitHub.
- Import into Vercel.
- No special config required.

Notes:
- The image processing is handled in a **Node.js route handler** (`app/api/compress/route.ts`) with `export const runtime = "nodejs";`.
- No system binaries are used. `sharp` is the only image library.
- No filesystem writes are performed.

## How it works

- Frontend posts `multipart/form-data` to `/api/compress`.
- Backend validates file type/size, applies resizing rules, converts to WebP, and returns the WebP bytes.
- UI shows original + compressed previews and a size comparison.

## Google Analytics

Tracking is configured for the production homepage at
`https://singularity-blogs-image-compressor.vercel.app/`:

- Account: **Singularity**, `381403980`
- GA4 property: **Singularity Image Compressor**, `558449112`
- Web stream: **Singularity Image Compressor Web**, `16109104552`
- Public measurement ID: `G-YWNFK3ZL9J` (stored in `lib/analytics.ts`)
- Reporting time zone: `America/Los_Angeles`, matching Singularity Blogs

No Analytics credential or API secret is needed in the app or Vercel environment.
The browser loads Google's tag after hydration and queues one explicit `page_view`
per page load. Development, preview hosts and unknown routes do not load the tag
or send events. Set `NEXT_PUBLIC_GA_DISABLED=true` at build time to disable tracking.

| Event | Parameters |
| --- | --- |
| `page_view` | Constant homepage URL/title; empty referrer |
| `compression_success` | `input_format`, `input_size`, `resize_mode`, `output_format`, `size_reduction` |
| `compression_failure` | `input_format`, `input_size`, `resize_mode`, `failure_reason` |

Input size and size reduction use ranges. Resize mode is `default`, `width`,
`height`, or `exact`; actual dimensions are excluded. Failure reasons are fixed
categories for missing/invalid files, upload size, unsupported format, server
errors, or request errors. Events never include filenames, image bytes, previews,
download URLs, raw error messages, query strings or fragments. Tag failures are
isolated from compression and download handling.

The new stream has Enhanced Measurement disabled, including history page views,
form interactions, site search, outbound clicks and file downloads. Keep these
disabled to avoid duplicate page views or automatic collection of file/form
metadata. Google signals and advertising personalization signals are disabled
in the tag configuration. The usage categories are registered as event-scoped
custom dimensions for GA4 reports and Explorations.

### Validation and release

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Tests exercise privacy filtering, production gating, duplicate initialization,
blocked tags and the actual UI submission handler's success/failure paths. Local
tracking stays disabled so tests do not create real Analytics traffic.

`vercel.json` disables automatic deployment for the review branch
`codex/ga4-image-compressor`. The draft PR requires release approval before merge
or deployment. After an approved production release, visit the homepage and
compress a synthetic image, then verify `page_view` and `compression_success` in
the [property's Realtime report](https://analytics.google.com/analytics/web/#/p558449112/reports/realtime).
Confirm the collected event parameters exclude the filename and URL query/hash.
Live collection cannot be verified until the change is released.

