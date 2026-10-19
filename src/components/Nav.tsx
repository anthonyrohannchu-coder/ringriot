import Link from "next/link";
import { brand } from "@/config/brand";
import { getUser } from "@/lib/supabase/server";

export async function Nav() {
  const user = await getUser().catch(() => null);
  return (
    <>
      <header className="sticky top-0 z-40 border-b-[3px] border-ink bg-volt">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 text-xl">
            <span className="sticker-sm grid h-9 w-9 -rotate-6 place-items-center rounded-xl bg-hot text-lg">☎</span>
            <span className="display">{brand.name}</span>
          </Link>
          <nav className="hidden items-center gap-6 font-bold md:flex">
            <Link href="/#cast" className="hover:underline decoration-[3px] underline-offset-4">The cast</Link>
            <Link href="/pricing" className="hover:underline decoration-[3px] underline-offset-4">Pricing</Link>
            <Link href={user ? "/dashboard" : "/login"} className="hover:underline decoration-[3px] underline-offset-4">{user ? "My stuff" : "Log in"}</Link>
            <Link href="/#demo" className="sticker-sm press rounded-full bg-panel px-5 py-2">Try it free</Link>
          </nav>
          <Link href="/#demo" className="sticker-sm rounded-full bg-panel px-4 py-1.5 text-sm font-bold md:hidden">Try free</Link>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t-[3px] border-ink bg-panel pb-[env(safe-area-inset-bottom)] md:hidden">
        {[
          ["/", "⌂", "Home"],
          ["/#demo", "☎", "Call"],
          ["/pricing", "★", "Plans"],
          [user ? "/dashboard" : "/login", "☺", user ? "Me" : "Log in"],
        ].map(([href, icon, label]) => (
          <Link key={href + label} href={href} className="flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-bold active:bg-volt">
            <span className="text-lg leading-none">{icon}</span>
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}
