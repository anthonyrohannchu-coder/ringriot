export function Waveform({ active, color }: { active: boolean; color?: string }) {
  return (
    <span className={`wave ${active ? "on" : ""}`} style={{ color }} aria-hidden>
      {Array.from({ length: 7 }).map((_, i) => <i key={i} />)}
    </span>
  );
}
