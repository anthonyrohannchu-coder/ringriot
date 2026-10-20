import { categories, pranks, type CategoryId } from "@/lib/pranks";
import { PrankLibrary } from "@/components/PrankLibrary";

export const metadata = { title: "Prank library", description: "Browse AI prank calls by situation: relationship drama, food orders, confrontations, mix-ups and totally ridiculous." };

export default async function PranksPage({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const { cat } = await searchParams;
  const initial = categories.some((c) => c.id === cat) ? (cat as CategoryId) : undefined;
  return (
    <>
      <section className="dots border-b-[3px] border-ink bg-volt px-4 pb-10 pt-8">
        <div className="mx-auto max-w-6xl">
          <p className="sticker-sm inline-block -rotate-2 rounded-full bg-hot px-3 py-1 label">{pranks.length} pranks</p>
          <h1 className="mt-4 text-4xl md:text-6xl">Pick the situation.</h1>
          <p className="mt-3 max-w-2xl text-lg font-semibold">
            Every prank is a live AI call that reacts to what your friend actually says. Tap Preview to hear how it opens.
          </p>
        </div>
      </section>
      <section className="px-4 py-10">
        <div className="mx-auto max-w-6xl">
          <PrankLibrary pranks={pranks} initialCategory={initial} />
        </div>
      </section>
    </>
  );
}
