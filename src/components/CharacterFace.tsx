// Cartoon heads for each character: colored blob, googly eyes, a mouth and a prop.
// Pure SVG, so it scales anywhere and costs nothing to load.

type Props = { id: string; color: string; size?: number; talking?: boolean; className?: string };

const INK = "#17121a";

export function CharacterFace({ id, color, size = 64, talking = false, className }: Props) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden>
      {/* head */}
      <path d="M50 12c22 0 38 14 38 38 0 23-15 38-38 38S12 73 12 50c0-24 16-38 38-38z" fill={color} stroke={INK} strokeWidth="4" />
      {/* cheeks */}
      <circle cx="28" cy="62" r="6" fill="#ff8fb8" opacity=".55" />
      <circle cx="72" cy="62" r="6" fill="#ff8fb8" opacity=".55" />
      <Eyes id={id} />
      <Mouth id={id} talking={talking} />
      <Prop id={id} />
    </svg>
  );
}

function Eyes({ id }: { id: string }) {
  const big = id === "pip" || id === "chip" || id === "kenny";
  const r = big ? 11 : 9.5;
  const brows: Record<string, string> = {
    delores: "M26 30 l14 6 M74 30 l-14 6",        // upset
    rex: "M26 37 l15 -3 M74 37 l-15 -3",           // squint
    marcus: "M27 34 l13 0 M73 34 l-13 0",
    reginald: "M27 31 q7 -5 13 0 M60 31 q7 -5 13 0",
    brenda: "M28 33 q6 -4 12 2 M60 35 q6 -6 12 -2", // awkward
  };
  return (
    <g>
      {[35, 65].map((cx, i) => (
        <g key={cx}>
          <circle cx={cx} cy="45" r={r} fill="#fff" stroke={INK} strokeWidth="3" />
          <circle className="pupil" cx={cx + (i ? 2 : -1)} cy="46" r={r * 0.42} fill={INK} style={{ animationDelay: `${i * 0.4}s` }} />
          <circle cx={cx + (i ? 3.5 : 0.5)} cy="43" r="1.6" fill="#fff" />
        </g>
      ))}
      {brows[id] && <path d={brows[id]} stroke={INK} strokeWidth="4" strokeLinecap="round" fill="none" />}
      {id === "pip" && (
        <g>{/* sunglasses pushed up */}
          <rect x="22" y="22" width="22" height="9" rx="4" fill={INK} />
          <rect x="56" y="22" width="22" height="9" rx="4" fill={INK} />
          <path d="M44 26 h12" stroke={INK} strokeWidth="3" />
        </g>
      )}
      {id === "reginald" && <circle cx="65" cy="45" r="12" fill="none" stroke="#c99a1a" strokeWidth="2.5" />}
    </g>
  );
}

function Mouth({ id, talking }: { id: string; talking: boolean }) {
  if (talking) return <ellipse cx="50" cy="70" rx="9" ry="7" fill={INK} />;
  const m: Record<string, React.ReactElement> = {
    delores: <path d="M38 74 q12 -10 24 0" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />,
    pip: <path d="M34 66 q16 16 32 0 z" fill={INK} />,
    rex: <path d="M40 70 h20" stroke={INK} strokeWidth="4" strokeLinecap="round" />,
    brenda: <path d="M36 70 q5 -4 10 0 t10 0 t8 0" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />,
    chip: (
      <g>
        <path d="M30 64 q20 22 40 0 z" fill={INK} />
        <path d="M34 65 h32 v4 q-16 6 -32 0z" fill="#fff" />
      </g>
    ),
    marcus: <path d="M38 68 q12 7 24 -2" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />,
    kenny: <path d="M38 72 q6 -7 12 0 q6 -7 12 0" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />,
    reginald: <path d="M42 70 q8 3 16 0" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />,
  };
  return m[id] ?? <path d="M38 68 q12 10 24 0" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />;
}

function Prop({ id }: { id: string }) {
  switch (id) {
    case "rex": // detective fedora
      return (
        <g stroke={INK} strokeWidth="3.5" strokeLinejoin="round">
          <path d="M14 26 q36 -10 72 0 l-6 6 q-30 -7 -60 0z" fill="#8a6b4a" />
          <path d="M28 25 q2 -16 22 -16 q20 0 22 16z" fill="#a07d58" />
          <path d="M29 22 h42" stroke="#17121a" strokeWidth="5" />
        </g>
      );
    case "reginald": // top hat + moustache
      return (
        <g stroke={INK} strokeWidth="3.5" strokeLinejoin="round">
          <rect x="32" y="-2" width="36" height="24" rx="2" fill={INK} />
          <path d="M22 22 h56 v5 h-56z" fill={INK} />
          <path d="M36 62 q7 -6 14 0 q7 -6 14 0 q-7 4 -14 0 q-7 4 -14 0z" fill={INK} />
        </g>
      );
    case "chip": // bow tie + mic sparkle
      return (
        <g stroke={INK} strokeWidth="3" strokeLinejoin="round">
          <path d="M38 90 l12 -6 12 6 v-12 l-12 6 -12 -6z" fill="#ff4fa3" />
          <path d="M84 14 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" fill="#ffd60a" />
        </g>
      );
    case "kenny": // headset
      return (
        <g stroke={INK} strokeWidth="3.5" fill="none">
          <path d="M16 48 q0 -36 34 -36 q34 0 34 36" />
          <rect x="9" y="42" width="10" height="18" rx="4" fill="#3d7bff" />
          <rect x="81" y="42" width="10" height="18" rx="4" fill="#3d7bff" />
          <path d="M85 60 q0 14 -22 14" />
        </g>
      );
    case "brenda": // clipboard pencil behind ear + glasses
      return (
        <g stroke={INK} strokeWidth="3">
          <rect x="24" y="37" width="22" height="16" rx="6" fill="none" />
          <rect x="54" y="37" width="22" height="16" rx="6" fill="none" />
          <path d="M46 44 h8" />
          <path d="M84 20 l8 -8 4 4 -8 8z" fill="#ffd60a" />
        </g>
      );
    case "marcus": // slick hair + tie
      return (
        <g stroke={INK} strokeWidth="3.5" strokeLinejoin="round">
          <path d="M18 34 q8 -24 34 -24 q24 0 30 20 q-22 -10 -64 4z" fill={INK} />
          <path d="M46 86 l4 -6 4 6 -4 10z" fill="#ff4b3e" />
        </g>
      );
    case "delores": // pearl necklace + curl
      return (
        <g stroke={INK} strokeWidth="2.5">
          <path d="M40 12 q6 -10 14 -2 q-6 0 -6 6" fill="none" strokeWidth="3.5" />
          {[28, 36, 44, 52, 60, 68].map((x, i) => <circle key={x} cx={x + 2} cy={86 + (i === 0 || i === 5 ? -3 : 0)} r="3.2" fill="#fff" />)}
        </g>
      );
    case "pip": // camera strap
      return <path d="M20 70 q30 26 60 0" stroke={INK} strokeWidth="3.5" fill="none" strokeDasharray="5 4" />;
    default:
      return null;
  }
}
