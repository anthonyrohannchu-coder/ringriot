// Draws one prank's unique person from a Look (same flat sticker style as CharacterFace).
import type { Look } from "@/lib/people";

const INK = "#1b1b1b";
const SW = 2.6;
const st = { stroke: INK, strokeWidth: SW, strokeLinejoin: "round" as const };

export function PersonFace({ look: L, size = 64, talking = false, className }: { look: Look; size?: number; talking?: boolean; className?: string }) {
  const cx = 50, cy = 42, rx = L.headW, ry = L.headH;
  const top = cy - ry;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden>
      <HairBack L={L} top={top} rx={rx} />
      <path d="M10 100 Q12 78 36 74 L64 74 Q88 78 90 100z" fill={L.shirt} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
      <rect x="42" y="62" width="16" height="14" fill={L.skin} stroke={INK} strokeWidth={SW} />
      {L.accessory === "bowtie" && <path d="M40 80 L50 85 L60 80 L60 90 L50 85 L40 90z" fill="#e63946" {...st} strokeWidth={2} />}
      <ellipse cx={cx - rx} cy="45" rx="5" ry="7" fill={L.skin} stroke={INK} strokeWidth={SW} />
      <ellipse cx={cx + rx} cy="45" rx="5" ry="7" fill={L.skin} stroke={INK} strokeWidth={SW} />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={L.skin} stroke={INK} strokeWidth={SW} />
      <path d={`M${cx + 12} ${top + 6} Q${cx + rx + 1} ${cy - 8} ${cx + rx - 1} ${cy + 6} Q${cx + rx - 3} ${cy + 20} ${cx + 10} ${cy + ry - 2} Q${cx + 20} ${cy + 12} ${cx + 18} ${cy - 2}z`} fill="#000" opacity=".08" />
      <Facial L={L} />
      <Face L={L} talking={talking} />
      <HairFront L={L} top={top} rx={rx} />
      <Accessory L={L} top={top} rx={rx} />
    </svg>
  );
}

function Face({ L, talking }: { L: Look; talking: boolean }) {
  const brow = {
    angry: "M36 34 L46 38 M64 34 L54 38",
    worried: "M36 38 L46 34 M64 38 L54 34",
    flat: "M36 36 L46 36 M54 36 L64 36",
    raised: "M36 33 Q41 30 46 33 M54 33 Q59 30 64 33",
    sad: "M36 37 Q41 34 46 36 M54 36 Q59 34 64 37",
  }[L.brows];
  const m = {
    smirk: "M43 57 Q52 60 58 54",
    frown: "M43 59 Q50 54 57 59",
    flat: "M44 57 L56 57",
    wobbly: "M42 58 Q45 55 48 58 Q51 61 54 58 Q57 55 58 58",
    grin: "M40 54 Q50 64 60 54 Z",
    grimace: "M41 55 H59 V60 H41 Z",
    open: "M45 54 Q50 53 55 54 Q56 62 50 63 Q44 62 45 54 Z",
  }[L.mouth];
  const filled = ["grin", "grimace", "open"].includes(L.mouth);
  return (
    <g>
      <path d={brow} stroke={INK} strokeWidth="2.8" strokeLinecap="round" fill="none" />
      {L.accessory !== "sunglasses" && (
        <g fill={INK}>
          <circle className="pupil" cx="41" cy="43" r="2.6" />
          <circle className="pupil" cx="59" cy="43" r="2.6" />
        </g>
      )}
      <path d="M50 45 L47 51 L51 51" stroke={INK} strokeWidth="2" fill="none" strokeLinejoin="round" />
      {talking ? (
        <ellipse cx="50" cy="58" rx="6" ry="5" fill="#5a1a1a" stroke={INK} strokeWidth="2" />
      ) : (
        <path d={m} stroke={INK} strokeWidth="2.4" fill={filled ? (L.mouth === "open" ? "#5a1a1a" : "#fff") : "none"} strokeLinejoin="round" strokeLinecap="round" />
      )}
    </g>
  );
}

function Facial({ L }: { L: Look }) {
  switch (L.facial) {
    case "stubble":
      return <g fill={INK} opacity=".35">{[[42, 62], [46, 64], [50, 65], [54, 64], [58, 62], [44, 60], [56, 60]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r=".9" />)}</g>;
    case "mustache":
      return <path d="M41 53 Q46 49 50 52 Q54 49 59 53 Q54 55 50 54 Q46 55 41 53z" fill={L.hairColor} stroke={INK} strokeWidth="1.6" />;
    case "beard":
      return <path d="M30 50 Q32 70 50 72 Q68 70 70 50 Q64 62 50 63 Q36 62 30 50z" fill={L.hairColor} stroke={INK} strokeWidth="2" />;
    case "freckles":
      return <g fill="#b5523b" opacity=".55">{[[36, 49], [39, 51], [42, 49], [58, 49], [61, 51], [64, 49]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="1" />)}</g>;
    case "blush":
      return <g fill="#ff6fae" opacity=".35"><ellipse cx="36" cy="51" rx="5" ry="3" /><ellipse cx="64" cy="51" rx="5" ry="3" /></g>;
    default:
      return null;
  }
}

function HairBack({ L, top, rx }: { L: Look; top: number; rx: number }) {
  const c = L.hairColor;
  switch (L.hair) {
    case "long":
    case "curlylong":
      return <path d={`M${50 - rx - 4} ${top + 18} Q${50 - rx - 8} 80 ${50 - rx + 2} 86 L${50 + rx - 2} 86 Q${50 + rx + 8} 80 ${50 + rx + 4} ${top + 18}z`} fill={c} {...st} />;
    case "braids":
      return <g fill={c} {...st}><rect x={50 - rx - 6} y={top + 20} width="8" height="50" rx="4" /><rect x={50 + rx - 2} y={top + 20} width="8" height="50" rx="4" /></g>;
    case "ponytail":
      return <path d={`M${50 + rx - 4} ${top + 10} Q${50 + rx + 16} ${top + 20} ${50 + rx + 8} ${top + 48} Q${50 + rx + 2} ${top + 30} ${50 + rx - 6} ${top + 22}z`} fill={c} {...st} />;
    case "pigtails":
      return <g fill={c} {...st}><circle cx={50 - rx - 6} cy={top + 22} r="7" /><circle cx={50 + rx + 6} cy={top + 22} r="7" /></g>;
    case "afro":
      return <circle cx="50" cy={top + 16} r={rx + 12} fill={c} {...st} />;
    default:
      return null;
  }
}

function HairFront({ L, top, rx }: { L: Look; top: number; rx: number }) {
  const c = L.hairColor;
  const l = 50 - rx, r = 50 + rx;
  if (L.accessory === "cap" || L.accessory === "beanie") return null; // covered by the hat
  switch (L.hair) {
    case "buzz":
    case "fade":
      return <path d={`M${l + 1} ${top + 18} Q${l + 2} ${top - 1} 50 ${top - 1} Q${r - 2} ${top - 1} ${r - 1} ${top + 18} Q${r - 8} ${top + 8} 50 ${top + 8} Q${l + 8} ${top + 8} ${l + 1} ${top + 18}z`} fill={c} {...st} opacity={L.hair === "fade" ? 0.85 : 1} />;
    case "slick":
    case "sidepart":
      return <path d={`M${l} ${top + 20} Q${l} ${top - 2} 50 ${top - 2} Q${r} ${top - 2} ${r} ${top + 20} Q${r - 6} ${top + 6} ${L.hair === "sidepart" ? 40 : 50} ${top + 6} Q${l + 6} ${top + 8} ${l} ${top + 20}z`} fill={c} {...st} />;
    case "messy":
      return <path d={`M${l} ${top + 22} Q${l - 1} ${top - 2} 50 ${top - 2} Q${r + 1} ${top - 2} ${r} ${top + 20} L${r - 7} ${top + 12} L${r - 13} ${top + 18} L${56} ${top + 10} L48 ${top + 16} L40 ${top + 8} L${l + 6} ${top + 16}z`} fill={c} {...st} />;
    case "curly":
    case "curlylong":
    case "shortcurl":
      return <g fill={c} {...st}>{[-18, -9, 0, 9, 18].map((d) => <circle key={d} cx={50 + d} cy={top + 3 + Math.abs(d) / 3} r="7" />)}</g>;
    case "mohawk":
      return <path d={`M44 ${top + 6} L46 ${top - 14} L50 ${top - 4} L54 ${top - 14} L56 ${top + 6}z`} fill={c} {...st} />;
    case "manbun":
      return <g fill={c} {...st}><circle cx="50" cy={top - 5} r="6" /><path d={`M${l + 1} ${top + 16} Q50 ${top - 4} ${r - 1} ${top + 16} Q50 ${top + 6} ${l + 1} ${top + 16}z`} /></g>;
    case "bob":
      return <path d={`M${l - 4} ${top + 38} Q${l - 8} ${top - 4} 50 ${top - 4} Q${r + 8} ${top - 4} ${r + 4} ${top + 38} Q${r - 2} ${top + 18} ${r - 10} ${top + 12} Q50 ${top + 18} ${l + 10} ${top + 10} Q${l + 2} ${top + 18} ${l - 4} ${top + 38}z`} fill={c} {...st} />;
    case "long":
    case "ponytail":
    case "pigtails":
    case "braids":
      return <path d={`M${l - 1} ${top + 26} Q${l - 3} ${top - 3} 50 ${top - 3} Q${r + 3} ${top - 3} ${r + 1} ${top + 26} Q${r - 4} ${top + 10} 50 ${top + 9} Q${l + 4} ${top + 10} ${l - 1} ${top + 26}z`} fill={c} {...st} />;
    case "bun":
    case "graybun":
      return <g fill={c} {...st}><circle cx="50" cy={top - 6} r="8" /><path d={`M${l} ${top + 18} Q50 ${top - 6} ${r} ${top + 18} Q50 ${top + 6} ${l} ${top + 18}z`} /></g>;
    case "pixie":
      return <path d={`M${l} ${top + 22} Q${l} ${top - 3} 50 ${top - 3} Q${r} ${top - 3} ${r} ${top + 16} Q${r - 10} ${top + 4} ${l + 8} ${top + 14}z`} fill={c} {...st} />;
    case "afro":
      return null;
    case "combover":
      return <path d={`M${l + 2} ${top + 14} Q${l + 10} ${top + 2} ${r - 4} ${top + 6} Q50 ${top + 8} ${l + 2} ${top + 14}z`} fill={c} {...st} strokeWidth={1.8} />;
    case "baldsides":
    case "shortgray":
      return <path d={`M${l + 1} ${top + 26} Q${l - 1} ${top + 14} ${l + 4} ${top + 10} M${r - 1} ${top + 26} Q${r + 1} ${top + 14} ${r - 4} ${top + 10}`} stroke={c} strokeWidth="6" strokeLinecap="round" fill="none" />;
    default:
      return null;
  }
}

function Accessory({ L, top, rx }: { L: Look; top: number; rx: number }) {
  const l = 50 - rx, r = 50 + rx;
  switch (L.accessory) {
    case "glasses":
      return <g {...st} fill="none" strokeWidth={2.2}><circle cx="41" cy="43" r="6.5" /><circle cx="59" cy="43" r="6.5" /><path d="M47.5 43 h5" /></g>;
    case "sunglasses":
      return <g {...st} strokeWidth={2}><rect x="32" y="38" width="16" height="10" rx="4" fill={INK} /><rect x="52" y="38" width="16" height="10" rx="4" fill={INK} /><path d="M48 42 h4" /></g>;
    case "headset":
      return <g {...st} fill="none"><path d={`M${l - 2} 44 Q${l} ${top - 4} 50 ${top - 4} Q${r} ${top - 4} ${r + 2} 44`} strokeWidth={3} /><rect x={l - 7} y="38" width="7" height="13" rx="3" fill="#2b2b33" /><path d={`M${l - 3} 50 Q${l + 4} 62 42 60`} strokeWidth={2} /></g>;
    case "earbuds":
      return <g fill="#fff" stroke={INK} strokeWidth={1.6}><circle cx={l} cy="46" r="2.6" /><circle cx={r} cy="46" r="2.6" /></g>;
    case "earrings":
      return <g fill="none" stroke="#e0a500" strokeWidth={2.4}><circle cx={l} cy="55" r="3.5" /><circle cx={r} cy="55" r="3.5" /></g>;
    case "cap":
      return <g {...st}><path d={`M${l} ${top + 14} Q${l + 1} ${top - 6} 50 ${top - 6} Q${r - 1} ${top - 6} ${r} ${top + 14}z`} fill={L.shirt === "#ffffff" ? "#3d7bff" : L.shirt} /><path d={`M${l} ${top + 14} Q${l - 14} ${top + 14} ${l - 18} ${top + 20} L${l + 4} ${top + 18}z`} fill={L.shirt === "#ffffff" ? "#3d7bff" : L.shirt} /></g>;
    case "beanie":
      return <g {...st}><path d={`M${l - 1} ${top + 16} Q${l} ${top - 8} 50 ${top - 8} Q${r} ${top - 8} ${r + 1} ${top + 16}z`} fill={L.shirt === "#ffffff" ? "#2b2b33" : L.shirt} /><rect x={l - 3} y={top + 12} width={rx * 2 + 6} height="7" rx="2" fill="#fff" fillOpacity=".55" /><circle cx="50" cy={top - 9} r="4" fill="#ffd60a" /></g>;
    case "bandana":
      return <g {...st}><path d={`M${l} ${top + 14} Q50 ${top - 2} ${r} ${top + 14} L${r} ${top + 18} Q50 ${top + 6} ${l} ${top + 18}z`} fill="#e63946" /><path d={`M${r} ${top + 16} l8 -4 l-2 8z`} fill="#e63946" /></g>;
    case "flower":
      return <g stroke={INK} strokeWidth={1.5}>{[0, 72, 144, 216, 288].map((a) => <circle key={a} cx={r - 6 + 4 * Math.cos((a * Math.PI) / 180)} cy={top + 8 + 4 * Math.sin((a * Math.PI) / 180)} r="3.2" fill="#ff4fa3" />)}<circle cx={r - 6} cy={top + 8} r="2.4" fill="#ffd60a" /></g>;
    default:
      return null;
  }
}
