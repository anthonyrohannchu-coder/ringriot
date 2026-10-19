import Link from "next/link";
import { brand } from "@/config/brand";
import { getUser } from "@/lib/supabase/server";

export async function Nav() {
  const user = await getUser().catch(() => null);
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line/60 bg-ink/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-volt text-ink">☎</span>
            {brand.name}
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted md:flex">
            <Link href="/#characters" className="hover:text-white">Characters</Link>
            <Link href="/pricing" className="hover:text-white">Pricing</Link>
            <Link href={user ? "/dashboard" : "/login"} className="hover:text-white">{user ? "Dashboard" : "Log in"}</Link>
            <Link href="/demo" className="rounded-full bg-volt px-4 py-2 font-semibold text-ink hover:brightness-110">Try it free</Link>
          </nav>
          <Link href="/demo" className="rounded-full bg-volt px-4 py-1.5 text-sm font-semibold text-ink md:hidden">Try free</Link>
        </div>
      </header>

      {/* App-style bottom tab bar on phones */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {[
          ["/", "⌂", "Home"],
          ["/demo", "◉", "Demo"],
          ["/pricing", "✦", "Plans"],
          [user ? "/dashboard" : "/login", "☺", user ? "Me" : "Log in"],
        ].map(([href, icon, label]) => (
          <Link key={href + label} href={href} className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] text-muted active:text-volt">
            <span className="text-lg leading-none">{icon}</span>
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
