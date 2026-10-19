import Link from "next/link";
import { brand } from "@/config/brand";

export function Footer() {
  return (
    <footer className="border-t border-line/60 px-4 py-10 text-sm text-muted">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p>© {new Date().getFullYear()} {brand.name}. All characters are fictional AI personas.</p>
        <div className="flex flex-wrap gap-5">
          <Link href="/legal/terms" className="hover:text-white">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-white">Privacy</Link>
          <Link href="/legal/acceptable-use" className="hover:text-white">Acceptable use</Link>
          <a href={`mailto:${brand.supportEmail}`} className="hover:text-white">Contact</a>
        </div>
      </div>
    </footer>
  );
}
