import Link from "next/link";
import { brand } from "@/config/brand";

export function Footer() {
  return (
    <footer className="border-t-[3px] border-ink bg-ink px-4 py-10 text-sm text-paper">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p>
          <span className="display text-volt">{brand.name}</span> · Every character is fake. The chaos is real.
        </p>
        <div className="flex flex-wrap gap-5 font-semibold">
          <Link href="/legal/terms" className="hover:text-volt">Terms</Link>
          <Link href="/legal/privacy" className="hover:text-volt">Privacy</Link>
          <Link href="/legal/acceptable-use" className="hover:text-volt">Acceptable use</Link>
          <a href={`mailto:${brand.supportEmail}`} className="hover:text-volt">Contact</a>
        </div>
      </div>
    </footer>
  );
}
