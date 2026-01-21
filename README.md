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

