// Original flat "ragdoll game" style people: oval heads, beady eyes, flat colors, thin outlines,
// head-and-shoulders crop. Pure SVG.

type Props = { id: string; color: string; size?: number; talking?: boolean; className?: string };

const INK = "#1b1b1b";
const SW = 2.6;

type Look = {
  skin: string;
  shirt: string;
  hair?: string;
  brows: "angry" | "worried" | "flat" | "raised" | "sad";
  mouth: "smirk" | "frown" | "open" | "grimace" | "wobbly" | "grin" | "flat";
};

const LOOKS: Record<string, Look> = {
  tony: { skin: "#8d5a3b", shirt: "#ff7a1a", hair: "#1b1b1b", brows: "raised", mouth: "grin" },
  dez: { skin: "#f0c39c", shirt: "#2b2b33", brows: "worried", mouth: "grimace" },
  brenda: { skin: "#f6d2b5", shirt: "#e8508a", hair: "#e9c46a", brows: "angry", mouth: "open" },
  jordan: { skin: "#c68a5e", shirt: "#8a8f9c", hair: "#3b2a20", brows: "sad", mouth: "wobbly" },
  sal: { skin: "#e3ad80", shirt: "#1a9e8f", hair: "#3b2a20", brows: "worried", mouth: "frown" },
  gary: { skin: "#f0c39c", shirt: "#5a7d3a", hair: "#9a7b5b", brows: "raised", mouth: "open" },
  chad: { skin: "#a8714a", shirt: "#ffffff", hair: "#1b1b1b", brows: "flat", mouth: "smirk" },
  earl: { skin: "#f6d2b5", shirt: "#6b7a4f", hair: "#e8e8e8", brows: "raised", mouth: "grin" },
};

export function CharacterFace({ id, color, size = 64, talking = false, className }: Props) {
  const L = LOOKS[id] ?? { skin: "#f0c39c", shirt: color, brows: "flat", mouth: "flat" };
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden>
      {/* shoulders */}
      <path d="M10 100 Q12 78 36 74 L64 74 Q88 78 90 100z" fill={L.shirt} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <rect x="42" y="62" width="16" height="14" fill={L.skin} stroke={INK} strokeWidth={SW} />
      <Collar id={id} />
      {/* ears + head */}
      <ellipse cx="25" cy="44" rx="5" ry="7" fill={L.skin} stroke={INK} strokeWidth={SW} />
      <ellipse cx="75" cy="44" rx="5" ry="7" fill={L.skin} stroke={INK} strokeWidth={SW} />
      <ellipse cx="50" cy="42" rx="25" ry="28" fill={L.skin} stroke={INK} strokeWidth={SW} />
      {/* flat shading on one side */}
      <path d="M62 20 Q76 30 74 48 Q72 62 60 68 Q70 54 68 40 Q67 28 62 20z" fill="#000" opacity=".08" />
      <Hair id={id} color={L.hair} />
      <Face look={L} talking={talking} />
      <Props id={id} skin={L.skin} />
    </svg>
  );
}

function Face({ look, talking }: { look: Look; talking: boolean }) {
  const brow = {
    angry: "M36 34 L46 38 M64 34 L54 38",
    worried: "M36 38 L46 34 M64 38 L54 34",
    flat: "M36 36 L46 36 M54 36 L64 36",
    raised: "M36 33 Q41 30 46 33 M54 33 Q59 30 64 33",
    sad: "M36 37 Q41 34 46 36 M54 36 Q59 34 64 37",
  }[look.brows];
  const m = {
    smirk: "M43 56 Q52 59 58 53",
    frown: "M43 58 Q50 53 57 58",
    flat: "M44 56 L56 56",
    wobbly: "M42 57 Q45 54 48 57 Q51 60 54 57 Q57 54 58 57",
    grin: "M40 53 Q50 63 60 53 Z",
    grimace: "M41 54 H59 V59 H41 Z",
    open: "M45 53 Q50 52 55 53 Q56 61 50 62 Q44 61 45 53 Z",
  }[look.mouth];
  const filled = ["grin", "grimace", "open"].includes(look.mouth);
  return (
    <g>
      <path d={brow} stroke={INK} strokeWidth="2.8" strokeLinecap="round" fill="none" />
      <circle cx="41" cy="42" r="2.6" fill={INK} />
      <circle cx="59" cy="42" r="2.6" fill={INK} />
      <path d="M50 44 L47 50 L51 50" stroke={INK} strokeWidth="2" fill="none" strokeLinejoin="round" />
      {talking ? (
        <ellipse cx="50" cy="57" rx="6" ry="5" fill="#5a1a1a" stroke={INK} strokeWidth="2" />
      ) : (
        <path d={m} stroke={INK} strokeWidth="2.4" fill={filled ? (look.mouth === "grimace" || look.mouth === "grin" ? "#fff" : "#5a1a1a") : "none"} strokeLinejoin="round" strokeLinecap="round" />
      )}
      {look.mouth === "grimace" && !talking && <path d="M47 54 V59 M53 54 V59" stroke={INK} strokeWidth="1.5" />}
    </g>
  );
}

function Hair({ id, color }: { id: string; color?: string }) {
  const c = color ?? INK;
  const st = { stroke: INK, strokeWidth: SW, strokeLinejoin: "round" as const };
  switch (id) {
    case "tony": return <path d="M27 34 Q28 14 50 13 Q72 14 73 34 Q66 22 50 22 Q34 22 27 34z" fill={c} {...st} />; // buzz cut
    case "brenda": return <path d="M22 50 Q16 18 50 12 Q84 18 78 50 Q76 30 66 26 Q54 32 38 24 Q26 30 22 50z" fill={c} {...st} />; // big bob
    case "jordan": return <path d="M25 36 Q24 12 50 12 Q76 12 75 34 L68 26 L62 32 L56 24 L48 30 L40 22 L34 30z" fill={c} {...st} />; // messy
    case "sal": return <path d="M25 40 Q24 30 28 28 M75 40 Q76 30 72 28" stroke={c} strokeWidth="6" strokeLinecap="round" fill="none" />; // sideburns (cap in props)
    case "gary": return <path d="M25 44 Q22 30 28 26 M75 44 Q78 30 72 26" stroke={c} strokeWidth="6" strokeLinecap="round" fill="none" />;
    case "chad": return <path d="M26 30 Q30 12 50 12 Q70 12 74 30 Q62 18 50 20 Q38 18 26 30z" fill={c} {...st} />;
    case "earl": return <path d="M25 40 Q22 28 30 26 M75 40 Q78 28 70 26" stroke={c} strokeWidth="7" strokeLinecap="round" fill="none" />;
    default: return null;
  }
}

function Collar({ id }: { id: string }) {
  if (id === "tony") // jumpsuit collar + ID tag
    return (
      <g stroke={INK} strokeWidth="2">
        <path d="M36 74 L50 86 L64 74" fill="none" strokeWidth="2.6" />
        <rect x="62" y="84" width="16" height="9" fill="#fff" />
        <path d="M65 88.5 h10" />
      </g>
    );
  if (id === "jordan") return <path d="M28 80 Q50 66 72 80" stroke={INK} strokeWidth="2.6" fill="#8a8f9c" />; // hoodie hood
  if (id === "chad") return <path d="M36 74 L38 100 M64 74 L62 100" stroke={INK} strokeWidth="2.6" />; // tank straps
  if (id === "sal") return <rect x="40" y="82" width="20" height="8" fill="#fff" stroke={INK} strokeWidth="2" />; // name badge
  if (id === "earl") return <g fill="#ffd60a" stroke={INK} strokeWidth="1.5"><circle cx="30" cy="88" r="3" /><circle cx="38" cy="88" r="3" /></g>; // medals
  return null;
}

function Props({ id, skin }: { id: string; skin: string }) {
  const st = { stroke: INK, strokeWidth: SW, strokeLinejoin: "round" as const };
  switch (id) {
    case "tony": // stubble
      return <g fill={INK} opacity=".35">{[[42, 60], [46, 62], [50, 63], [54, 62], [58, 60], [44, 58], [56, 58]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r=".9" />)}</g>;
    case "dez": // beanie + eye mask
      return (
        <g {...st}>
          <path d="M24 32 Q24 10 50 10 Q76 10 76 32z" fill="#2b2b33" />
          <rect x="22" y="28" width="56" height="7" rx="2" fill="#3c3c46" />
          <path d="M26 38 Q50 34 74 38 L72 47 Q60 49 52 45 L48 45 Q40 49 28 47z" fill="#1b1b1b" />
          <circle cx="41" cy="42" r="3.2" fill={skin} stroke="none" />
          <circle cx="59" cy="42" r="3.2" fill={skin} stroke="none" />
          <circle cx="41" cy="42" r="1.8" fill={INK} stroke="none" />
          <circle cx="59" cy="42" r="1.8" fill={INK} stroke="none" />
        </g>
      );
    case "brenda": // hoop earrings
      return <g fill="none" stroke="#e0a500" strokeWidth="2.4"><circle cx="24" cy="54" r="4" /><circle cx="76" cy="54" r="4" /></g>;
    case "jordan": // tear + phone
      return (
        <g>
          <path d="M60 46 Q62 51 60 53 Q57 51 60 46z" fill="#7cc7ff" stroke={INK} strokeWidth="1.5" />
          <rect x="74" y="44" width="10" height="18" rx="2" fill="#1b1b1b" stroke={INK} strokeWidth="2" transform="rotate(12 79 53)" />
        </g>
      );
    case "sal": // delivery cap
      return (
        <g {...st}>
          <path d="M25 30 Q26 10 50 10 Q74 10 75 30z" fill="#1a9e8f" />
          <path d="M25 30 Q12 30 8 36 L28 34z" fill="#1a9e8f" />
          <path d="M45 16 L55 16 L50 25z" fill="#ffc23d" strokeWidth="1.5" />
        </g>
      );
    case "gary": // tinfoil hat + glasses
      return (
        <g {...st}>
          <path d="M28 28 L50 2 L72 28z" fill="#c9ccd6" />
          <path d="M38 18 L44 22 M56 14 L60 20 M48 10 L52 12" stroke="#fff" strokeWidth="1.5" />
          <rect x="33" y="37" width="15" height="11" rx="2" fill="none" strokeWidth="2.2" />
          <rect x="52" y="37" width="15" height="11" rx="2" fill="none" strokeWidth="2.2" />
          <path d="M48 42 h4" strokeWidth="2" />
        </g>
      );
    case "chad": // sweatband + jaw line
      return (
        <g>
          <rect x="25" y="25" width="50" height="7" rx="2" fill="#ff3d6e" stroke={INK} strokeWidth="2" />
          <path d="M30 56 Q36 70 50 70 Q64 70 70 56" stroke={INK} strokeWidth="2" fill="none" opacity=".5" />
        </g>
      );
    case "earl": // big glasses + army cap
      return (
        <g {...st}>
          <circle cx="41" cy="42" r="7" fill="#fff" fillOpacity=".25" strokeWidth="2.2" />
          <circle cx="59" cy="42" r="7" fill="#fff" fillOpacity=".25" strokeWidth="2.2" />
          <path d="M48 42 h4" strokeWidth="2" />
          <path d="M30 24 Q34 10 50 10 Q66 10 70 24 Q50 30 30 24z" fill="#6b7a4f" />
          <path d="M40 66 Q50 70 60 66" stroke={INK} strokeWidth="1.5" fill="none" opacity=".4" />
        </g>
      );
    default:
      return null;
  }
}
