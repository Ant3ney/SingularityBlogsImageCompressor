"use client";

import { useEffect, useMemo, useState } from "react";

type SizeInfo = {
  originalBytes: number;
  compressedBytes: number;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let value = bytes;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(idx === 0 ? 0 : 2)} ${units[idx]}`;
}

export default function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [targetWidth, setTargetWidth] = useState<string>("");
  const [targetHeight, setTargetHeight] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compressedUrl, setCompressedUrl] = useState<string | null>(null);
  const [sizeInfo, setSizeInfo] = useState<SizeInfo | null>(null);

  const originalUrl = useMemo(() => {
    if (!file) return null;
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
    };
  }, [originalUrl]);

  useEffect(() => {
    return () => {
      if (compressedUrl) URL.revokeObjectURL(compressedUrl);
    };
  }, [compressedUrl]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError(null);
    setSizeInfo(null);

    if (!file) {
      setError("Please choose an image file.");
      return;
    }

    setIsSubmitting(true);

    try {
      const form = new FormData();
      form.set("file", file);

      if (targetWidth.trim()) form.set("targetWidth", targetWidth.trim());
      if (targetHeight.trim()) form.set("targetHeight", targetHeight.trim());

      const res = await fetch("/api/compress", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed: ${res.status}`);
      }

      const originalBytes = file.size;
      const compressedBytesHeader = res.headers.get("x-compressed-bytes");
      const compressedBytes = compressedBytesHeader
        ? Number.parseInt(compressedBytesHeader, 10)
        : Number.NaN;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      setCompressedUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });

      setSizeInfo({
        originalBytes,
        compressedBytes: Number.isFinite(compressedBytes)
          ? compressedBytes
          : blob.size,
      });

      // Trigger download without additional user steps.
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name.replace(/\.[^.]+$/, "") + ".webp";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  const savings = useMemo(() => {
    if (!sizeInfo) return null;
    const { originalBytes, compressedBytes } = sizeInfo;
    if (originalBytes <= 0 || compressedBytes <= 0) return null;
    const ratio = 1 - compressedBytes / originalBytes;
    return `${(ratio * 100).toFixed(1)}%`;
  }, [sizeInfo]);

  return (
    <div className="row">
      <h1>Singularity Image Compressor (WebP)</h1>
      <p className="muted">
        Default behavior: if width &gt; 960px, it will be resized down to 960px
        wide (no upscaling). Optional width/height lets you override the
        dimensions.
      </p>

      <form onSubmit={onSubmit} className="card row">
        <label>
          Image
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const next = e.target.files?.item(0) ?? null;
              setFile(next);
              setCompressedUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
              });
              setSizeInfo(null);
              setError(null);
            }}
          />
        </label>

        <div className="grid">
          <label>
            targetWidth (optional)
            <input
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="e.g. 960"
              value={targetWidth}
              onChange={(e) => setTargetWidth(e.target.value)}
            />
          </label>
          <label>
            targetHeight (optional)
            <input
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="e.g. 540"
              value={targetHeight}
              onChange={(e) => setTargetHeight(e.target.value)}
            />
          </label>
        </div>

        <button type="submit" disabled={!file || isSubmitting}>
          {isSubmitting ? "Compressing…" : "Compress & Download"}
        </button>

        {error ? <div className="error">{error}</div> : null}

        {sizeInfo ? (
          <div className="muted">
            Original: {formatBytes(sizeInfo.originalBytes)} · Compressed:{" "}
            {formatBytes(sizeInfo.compressedBytes)} · Savings: {savings}
          </div>
        ) : null}
      </form>

      <div className="grid">
        <section className="card row">
          <h2>Original</h2>
          {originalUrl ? <img src={originalUrl} alt="Original preview" /> : null}
          {!originalUrl ? <div className="muted">No image selected.</div> : null}
        </section>

        <section className="card row">
          <h2>Compressed (WebP)</h2>
          {compressedUrl ? (
            <img src={compressedUrl} alt="Compressed preview" />
          ) : null}
          {!compressedUrl ? (
            <div className="muted">Upload an image to see the output.</div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

