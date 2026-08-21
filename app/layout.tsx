import type { Metadata } from "next";
import { Manrope, Space_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const manrope = Manrope({ variable: "--font-main", subsets: ["cyrillic", "latin"] });
const mono = Space_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "700"] });

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "PatternDrop — эскиз с бумаги на экран",
    description: "Сфотографируйте рисунок одежды, удалите фон и мгновенно перенесите его на компьютер.",
    icons: { icon: "/favicon.svg" },
    openGraph: {
      title: "PatternDrop",
      description: "Из бумаги — на экран.",
      images: [{ url: image, width: 1200, height: 630, alt: "PatternDrop: из бумаги — на экран" }],
    },
    twitter: { card: "summary_large_image", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body className={`${manrope.variable} ${mono.variable}`}>{children}</body></html>;
}
