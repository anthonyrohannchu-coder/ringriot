import type { Metadata, Viewport } from "next";
import { Bowlby_One, Rubik } from "next/font/google";
import "./globals.css";
import { brand } from "@/config/brand";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Analytics } from "@/components/Analytics";

const display = Bowlby_One({ subsets: ["latin"], weight: "400", variable: "--font-bowlby", display: "swap" });
const body = Rubik({ subsets: ["latin"], variable: "--font-rubik", display: "swap" });

export const metadata: Metadata = {
  title: `${brand.name} — AI characters with zero chill`,
  description: "Pick an unhinged AI character, hit call, and talk back. They never break character.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, title: brand.name, statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#ffd60a", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="antialiased">
        <Nav />
        <main className="pb-24 md:pb-0">{children}</main>
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
