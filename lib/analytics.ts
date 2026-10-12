// Public GA4 web-stream ID; this is not an authentication credential.
export const GA_MEASUREMENT_ID = "G-YWNFK3ZL9J";
export const ANALYTICS_HOST = "singularity-blogs-image-compressor.vercel.app";
const PAGE_LOCATION = `https://${ANALYTICS_HOST}/`;

type EventParameters = Record<string, string | number | boolean>;
type ResizeMode = "default" | "width" | "height" | "exact";
type CompressionUsage = {
  mimeType: string;
  inputBytes: number;
  resizeMode: ResizeMode;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

let initialized = false;

export function isAnalyticsEnabled(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    process.env.NEXT_PUBLIC_GA_DISABLED !== "true" &&
    typeof window !== "undefined" &&
    window.location.hostname === ANALYTICS_HOST &&
    window.location.pathname === "/"
  );
}

function sendEvent(name: string, parameters: EventParameters): void {
  if (!isAnalyticsEnabled() || !initialized) return;
  try {
    window.gtag?.("event", name, {
      ...parameters,
      send_to: GA_MEASUREMENT_ID,
      page_location: PAGE_LOCATION,
      page_title: "Image Compressor",
      page_referrer: "",
    });
  } catch {
    // Analytics must never prevent compression or a download.
  }
}

export function initializeAnalytics(): boolean {
  if (!isAnalyticsEnabled()) return false;
  if (initialized) return true;

  try {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () {
      window.dataLayer?.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", GA_MEASUREMENT_ID, {
      send_page_view: false,
      page_location: PAGE_LOCATION,
      page_title: "Image Compressor",
      page_referrer: "",
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    initialized = true;
    // This app has one page. Keep its URL constant so query/hash values stay private.
    sendEvent("page_view", {});
    return true;
  } catch {
    return false;
  }
}

export function getResizeMode(width: string, height: string): ResizeMode {
  if (width.trim() && height.trim()) return "exact";
  if (width.trim()) return "width";
  if (height.trim()) return "height";
  return "default";
}

function usageParameters(usage: CompressionUsage): EventParameters {
  const formats: Record<string, string> = {
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "image/tiff": "tiff",
    "image/gif": "gif",
  };
  const megabytes = usage.inputBytes / (1024 * 1024);
  return {
    input_format: Object.hasOwn(formats, usage.mimeType) ? formats[usage.mimeType] : "other",
    input_size: megabytes <= 0 ? "empty" : megabytes < 1 ? "under_1_mb"
      : megabytes <= 5 ? "1_to_5_mb" : megabytes <= 25 ? "5_to_25_mb" : "over_25_mb",
    resize_mode: usage.resizeMode,
  };
}

export function trackCompressionSuccess(usage: CompressionUsage, outputBytes: number): void {
  const reduction = usage.inputBytes > 0 ? 1 - outputBytes / usage.inputBytes : 0;
  sendEvent("compression_success", {
    ...usageParameters(usage),
    output_format: "webp",
    size_reduction: reduction < 0 ? "increased" : reduction < 0.25 ? "0_to_25_percent"
      : reduction < 0.5 ? "25_to_50_percent" : reduction < 0.75 ? "50_to_75_percent" : "75_to_100_percent",
  });
}

export function trackCompressionFailure(
  usage: CompressionUsage,
  status: number | "missing_file" | null,
): void {
  sendEvent("compression_failure", {
    ...usageParameters(usage),
    failure_reason: status === "missing_file" ? "missing_file" : status === 400 ? "invalid_file"
      : status === 413 ? "upload_too_large" : status === 415 ? "unsupported_type"
      : typeof status === "number" && status >= 500 ? "server_error" : "request_error",
  });
}
