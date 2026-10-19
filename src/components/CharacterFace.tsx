// Original cartoon heads for each character. Pure SVG: scales anywhere, costs nothing to load.

type Props = { id: string; color: string; size?: number; talking?: boolean; className?: string };

const INK = "#17121a";
const SW = 4;

export function CharacterFace({ id, color, size = 64, talking = false, className }: Props) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className} aria-hidden style={{ overflow: "visible" }}>
      <Back id={id} color={color} />
      <Head id={id} color={color} />
      <Front id={id} color={color} talking={talking} />
    </svg>
  );
}

/* ---------- layers behind the head ---------- */
function Back({ id, color }: { id: string; color: string }) {
  if (id === "blaze") // spiky hair
    return <path d="M14 46 L8 22 L26 30 L28 6 L42 24 L52 2 L60 24 L76 8 L76 30 L94 22 L86 46z" fill="#8f1a10" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />;
  if (id === "pickles") // cape
    return <path d="M24 44 Q8 80 18 98 L82 98 Q92 80 76 44z" fill="#ff4b3e" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />;
  if (id === "mochi" || id === "whiskers") // cat ears
    return (
      <g stroke={INK} strokeWidth={SW} strokeLinejoin="round">
        <path d="M18 40 L20 8 L44 24z" fill={color} />
        <path d="M82 40 L80 8 L56 24z" fill={color} />
        <path d="M24 30 L25 16 L36 24z" fill="#ff8fb8" strokeWidth="0" />
        <path d="M76 30 L75 16 L64 24z" fill="#ff8fb8" strokeWidth="0" />
      </g>
    );
  if (id === "glitch") // antenna
    return (
      <g stroke={INK} strokeWidth={SW}>
        <path d="M50 18 V4" />
        <circle cx="50" cy="4" r="5" fill="#ff4b3e" />
      </g>
    );
  if (id === "granny") // hair bun
    return <circle cx="50" cy="12" r="12" fill="#e6e1ea" stroke={INK} strokeWidth={SW} />;
  return null;
}

/* ---------- head shape ---------- */
function Head({ id, color }: { id: string; color: string }) {
  const common = { fill: color, stroke: INK, strokeWidth: SW, strokeLinejoin: "round" as const };
  if (id === "pickles")
    return (
      <g>
        <rect x="26" y="8" width="48" height="88" rx="24" {...common} />
        {[[34, 24], [64, 34], [36, 80], [66, 78], [30, 56]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.6" fill="#3f8a22" />)}
      </g>
    );
  if (id === "glitch") return <rect x="16" y="18" width="68" height="68" rx="12" {...common} />;
  if (id === "sprinkles")
    return (
      <g>
        <path d="M22 58 L30 94 H70 L78 58z" fill="#f2c27b" stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
        <path d="M30 60 L34 92 M42 60 L44 92 M58 60 L56 92 M70 60 L66 92" stroke={INK} strokeWidth="2.5" />
        <path d="M14 60 Q12 40 30 34 Q34 14 52 16 Q70 14 72 32 Q90 38 86 60 Q50 70 14 60z" {...common} />
        {[[30, 40, "#ff4b3e"], [44, 26, "#3d7bff"], [60, 30, "#ffd60a"], [72, 46, "#22c55e"], [38, 52, "#ffd60a"], [64, 52, "#ff4b3e"]].map(([x, y, c]) => (
          <rect key={`${x}${y}`} x={x as number} y={y as number} width="7" height="3" rx="1.5" fill={c as string} transform={`rotate(${(x as number) % 50} ${x} ${y})`} />
        ))}
      </g>
    );
  if (id === "mochi") return <ellipse cx="50" cy="56" rx="40" ry="36" {...common} />;
  return <path d="M50 12c22 0 38 14 38 38 0 23-15 38-38 38S12 73 12 50c0-24 16-38 38-38z" {...common} />;
}

/* ---------- face + props in front ---------- */
function Front({ id, color, talking }: { id: string; color: string; talking: boolean }) {
  const isCupcake = id === "sprinkles";
  const isRobot = id === "glitch";
  const eyeY = isCupcake ? 46 : id === "pickles" ? 40 : id === "mochi" ? 52 : 46;
  const mouthY = isCupcake ? 58 : id === "pickles" ? 60 : id === "mochi" ? 70 : 70;

  return (
    <g>
      {!isRobot && !isCupcake && (
        <>
          <circle cx={id === "pickles" ? 36 : 28} cy={mouthY - 6} r="5.5" fill="#ff8fb8" opacity=".55" />
          <circle cx={id === "pickles" ? 64 : 72} cy={mouthY - 6} r="5.5" fill="#ff8fb8" opacity=".55" />
        </>
      )}

      {id === "pickles" && ( // hero mask, drawn under the eyes
        <path d="M20 32 Q50 24 80 32 L78 50 Q64 50 56 46 L50 48 L44 46 Q36 50 22 50z" fill="#ff4b3e" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      )}
      {isRobot ? <RobotFace talking={talking} /> : <Eyes id={id} y={eyeY} />}
      {!isRobot && <Mouth id={id} y={mouthY} talking={talking} />}

      {id === "blaze" && ( // headband-free: cheek bandage + fierce brows
        <g stroke={INK} strokeWidth={SW} strokeLinecap="round">
          <path d="M24 32 L42 38 M76 32 L58 38" />
          <rect x="66" y="60" width="14" height="7" rx="2" fill="#fff" strokeWidth="2.5" transform="rotate(-20 73 63)" />
        </g>
      )}
      {id === "granny" && ( // round glasses + racing goggles on forehead
        <g stroke={INK} strokeWidth="3" fill="none">
          <circle cx="35" cy="46" r="13" />
          <circle cx="65" cy="46" r="13" />
          <path d="M48 46 h4" />
          <rect x="22" y="20" width="56" height="10" rx="5" fill="#3d7bff" />
          <circle cx="36" cy="25" r="6" fill="#bfe3ff" />
          <circle cx="64" cy="25" r="6" fill="#bfe3ff" />
        </g>
      )}
      {id === "whiskers" && ( // whiskers + fedora
        <g stroke={INK} strokeWidth="2.5" strokeLinecap="round">
          <path d="M6 58 L28 62 M6 68 L28 66 M94 58 L72 62 M94 68 L72 66" />
          <path d="M12 26 q38 -12 76 0 l-6 6 q-32 -8 -64 0z" fill="#6d5640" strokeWidth={SW} strokeLinejoin="round" />
          <path d="M28 25 q2 -18 22 -18 q20 0 22 18z" fill="#8a6b4a" strokeWidth={SW} strokeLinejoin="round" />
          <path d="M29 21 h42" strokeWidth="5" />
        </g>
      )}
      {id === "coach" && ( // cap + whistle
        <g stroke={INK} strokeWidth={SW} strokeLinejoin="round">
          <path d="M14 36 Q16 8 50 8 Q84 8 86 36z" fill="#ff4b3e" />
          <path d="M60 34 Q86 28 98 38 L84 42z" fill="#ff4b3e" />
          <path d="M50 84 L50 92" strokeWidth="2.5" />
          <rect x="40" y="90" width="20" height="10" rx="4" fill="#c9ccd6" strokeWidth="3" />
        </g>
      )}
      {id === "sprinkles" && ( // tiny crown + monocle
        <g stroke={INK} strokeWidth="3" strokeLinejoin="round">
          <path d="M40 16 L40 4 L46 10 L50 2 L54 10 L60 4 L60 16z" fill="#ffd60a" />
          <circle cx="62" cy="46" r="10" fill="none" stroke="#c99a1a" />
        </g>
      )}
      {id === "mochi" && ( // sparkles
        <g fill="#ffd60a" stroke={INK} strokeWidth="2">
          <path d="M88 16 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" />
          <path d="M10 70 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
        </g>
      )}
    </g>
  );
}

function Eyes({ id, y }: { id: string; y: number }) {
  const sparkly = id === "mochi";
  const r = sparkly ? 10 : id === "pickles" ? 8 : 9.5;
  const xs = id === "pickles" ? [40, 60] : [35, 65];
  return (
    <g>
      {xs.map((cx, i) => (
        <g key={cx}>
          <circle cx={cx} cy={y} r={r} fill="#fff" stroke={INK} strokeWidth="3" />
          <circle className="pupil" cx={cx + (i ? 1.5 : -1)} cy={y + 1} r={sparkly ? r * 0.62 : r * 0.42} fill={INK} style={{ animationDelay: `${i * 0.4}s` }} />
          <circle cx={cx + (i ? 3 : 0.5)} cy={y - 2.5} r={sparkly ? 2.8 : 1.6} fill="#fff" />
          {sparkly && <circle cx={cx - 2} cy={y + 3} r="1.4" fill="#fff" />}
        </g>
      ))}
      {id === "whiskers" && <path d="M26 40 l16 3 M74 40 l-16 3" stroke={INK} strokeWidth="4" strokeLinecap="round" />}
      {id === "sprinkles" && <path d="M26 36 l16 5 M74 36 l-16 5" stroke={INK} strokeWidth="4" strokeLinecap="round" />}
      {id === "coach" && <path d="M26 38 l16 -2 M74 38 l-16 -2" stroke={INK} strokeWidth="4" strokeLinecap="round" />}
    </g>
  );
}

function Mouth({ id, y, talking }: { id: string; y: number; talking: boolean }) {
  if (talking) return <ellipse cx="50" cy={y} rx="9" ry="7" fill={INK} />;
  const s = { stroke: INK, strokeWidth: 4, fill: "none", strokeLinecap: "round" as const };
  switch (id) {
    case "blaze": return <path d={`M36 ${y - 4} q14 12 28 0 z`} fill={INK} />; // big shout-grin
    case "granny": return <path d={`M38 ${y} q12 10 24 0`} {...s} />;
    case "pickles": return <path d={`M42 ${y} q8 6 16 0`} {...s} />;
    case "mochi": return <path d={`M44 ${y - 2} q3 4 6 0 q3 4 6 0`} {...s} strokeWidth={3} />;
    case "whiskers": return <path d={`M44 ${y - 4} q6 4 6 0 q0 4 6 0`} {...s} strokeWidth={3} />;
    case "coach": return <path d={`M32 ${y - 6} q18 22 36 0 z`} fill={INK} />;
    case "sprinkles": return <path d={`M40 ${y} q10 -6 20 0`} {...s} />;
    default: return <path d={`M38 ${y} q12 10 24 0`} {...s} />;
  }
}

function RobotFace({ talking }: { talking: boolean }) {
  return (
    <g>
      <rect x="26" y="34" width="20" height="14" rx="3" fill="#17121a" />
      <rect x="54" y="34" width="20" height="14" rx="3" fill="#17121a" />
      <rect className="pupil" x="31" y="38" width="6" height="6" fill="#4fe0c2" />
      <rect className="pupil" x="59" y="38" width="6" height="6" fill="#4fe0c2" />
      <rect x="30" y="62" width="40" height="12" rx="3" fill="#17121a" />
      {(talking ? [34, 42, 50, 58] : [34, 46, 58]).map((x) => <rect key={x} x={x} y={talking ? 64 : 66} width="6" height={talking ? 8 : 4} fill="#4fe0c2" />)}
      <circle cx="20" cy="70" r="4" fill="#c9ccd6" stroke={INK} strokeWidth="2.5" />
      <circle cx="80" cy="70" r="4" fill="#c9ccd6" stroke={INK} strokeWidth="2.5" />
    </g>
  );
}
