import type { Metadata } from "next";
import { Manrope, Space_Mono } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ variable: "--font-main", subsets: ["cyrillic", "latin"] });
const mono = Space_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "700"] });

function metadataBase() {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
  } catch {
    return new URL("http://localhost:3000");
  }
}

export const metadata: Metadata = {
  metadataBase: metadataBase(),
  title: "PatternDrop — sketches from paper to screen",
  description:
    "Photograph your clothing drawing, remove the background, and instantly transfer it to your computer.",
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "PatternDrop",
    description: "From paper to screen.",
    images: [
      { url: "/og.png", width: 1200, height: 630, alt: "PatternDrop: from paper to screen" },
    ],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}
