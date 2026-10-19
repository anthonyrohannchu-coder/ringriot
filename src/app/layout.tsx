import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { brand } from "@/config/brand";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-jb", display: "swap" });

export const metadata: Metadata = {
  title: `${brand.name} — AI prank characters`,
  description: "Pick an unhinged AI character, hear them in your browser, and turn it into a clip.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, title: brand.name, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = { themeColor: "#08080c", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body className="grain antialiased">
        <Nav />
        <main className="pb-24 md:pb-0">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
