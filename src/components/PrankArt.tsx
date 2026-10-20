// Original cover art for a prank card: a category-colored sticker panel with a doodle pattern,
// the prank's icon in a big sticker badge, and the voice's face peeking from the corner.
import type { CategoryId, Prank } from "@/lib/prankCategories";
import { categoryOf } from "@/lib/prankCategories";
import { PersonFace } from "./PersonFace";

const INK = "#17121a";

function Doodles({ category }: { category: CategoryId }) {
  const common = { fill: "none", stroke: INK, strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, opacity: 0.22 };
  const spots: [number, number, number][] = [[18, 22, -12], [86, 16, 10], [150, 30, -6], [30, 92, 14], [168, 96, -10], [112, 110, 6], [60, 52, 0]];
  const shape = (k: number) => {
    switch (category) {
      case "relationship": // hearts
        return <path d="M0 4 C-6 -4 -14 2 0 12 C14 2 6 -4 0 4z" {...common} />;
      case "orders": // receipt zigzag
        return <path d="M-8 -8 h16 v16 l-4 -3 -4 3 -4 -3 -4 3z M-4 -3 h8 M-4 1 h6" {...common} />;
      case "confront": // lightning
        return <path d="M2 -10 L-6 2 H0 L-3 11 L7 -2 H1z" {...common} />;
      case "mixup": // question mark
        return <path d={k % 2 ? "M-5 -6 Q-5 -12 1 -12 Q7 -12 6 -6 Q5 -2 0 0 V4 M0 9 v.5" : "M-6 -2 h12 M3 -6 l4 4 -4 4 M6 4 h-12 M-3 0 l-4 4 4 4"} {...common} />;
      default: // swirls and stars
        return <path d={k % 2 ? "M0 -9 L2.5 -2.5 L9 0 L2.5 2.5 L0 9 L-2.5 2.5 L-9 0 L-2.5 -2.5z" : "M0 0 m-7 0 a7 7 0 1 0 14 0 a5 5 0 1 0 -10 0 a3 3 0 1 0 6 0"} {...common} />;
    }
  };
  return (
    <svg viewBox="0 0 200 125" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
      {spots.map(([x, y, r], k) => (
        <g key={k} transform={`translate(${x} ${y}) rotate(${r}) scale(1.4)`}>{shape(k)}</g>
      ))}
    </svg>
  );
}

export function PrankArt({ prank, size = "md", face: showFace = true }: { prank: Pick<Prank, "category" | "icon" | "look">; size?: "sm" | "md" | "lg"; face?: boolean }) {
  const cat = categoryOf(prank.category);
  const h = size === "lg" ? "h-56" : size === "sm" ? "h-24" : "h-36";
  const badge = size === "lg" ? "h-28 w-28 text-6xl" : size === "sm" ? "h-14 w-14 text-3xl" : "h-20 w-20 text-5xl";
  const face = size === "lg" ? 96 : size === "sm" ? 44 : 64;
  return (
    <div className={`relative ${h} overflow-hidden border-b-[3px] border-ink`} style={{ background: cat.color }}>
      <Doodles category={prank.category} />
      <div className={`sticker-sm absolute left-1/2 top-1/2 grid ${badge} -translate-x-1/2 -translate-y-1/2 -rotate-6 place-items-center rounded-full bg-panel`}>
        <span aria-hidden>{prank.icon}</span>
      </div>
      {showFace && (
        <div className="absolute -bottom-2 right-2 rotate-6" aria-hidden>
          <PersonFace look={prank.look} size={face} />
        </div>
      )}
    </div>
  );
}
