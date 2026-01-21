import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Image Compressor",
  description: "Upload an image and download a compressed WebP version.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}

