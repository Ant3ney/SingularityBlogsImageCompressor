"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { GA_MEASUREMENT_ID, initializeAnalytics } from "../../lib/analytics";

export default function GoogleAnalytics() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(initializeAnalytics());
  }, []);

  if (!enabled) return null;

  return (
    <Script
      id="google-analytics"
      src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
      strategy="afterInteractive"
    />
  );
}
