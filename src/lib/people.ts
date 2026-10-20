// Every prank gets its own person: a unique face (Look) and its own natural phone voice.
// Pure and client-safe (no prompts here). Assignment is deterministic and collision-free,
// so the same prank always shows the same person and no two pranks share a face.

export type Gender = "m" | "f";
export type Age = "young" | "adult" | "old";
export type Cast = {
  gender: Gender;
  age: Age;
  /** How this person sounds and feels in THIS call (fed to the AI; also picks speaking rate). */
  delivery: string;
  /** Optional own name/temperament; when set, the AI plays this person instead of the voice character. */
  name?: string;
  style?: string;
};

export type Look = {
  skin: string;
  shirt: string;
  hair: string;
  hairColor: string;
  brows: "angry" | "worried" | "flat" | "raised" | "sad";
  mouth: "smirk" | "frown" | "open" | "grimace" | "wobbly" | "grin" | "flat";
  accessory: "none" | "glasses" | "sunglasses" | "headset" | "earrings" | "cap" | "beanie" | "bandana" | "flower" | "bowtie" | "earbuds";
  facial: "none" | "stubble" | "mustache" | "beard" | "freckles" | "blush";
  headW: number;
  headH: number;
};

const SKIN = ["#f9dcc4", "#f1c27d", "#e0ac69", "#c68642", "#a8714a", "#8d5524", "#6b4226", "#f6d2b5", "#d9a066", "#4a2f1d"];
const SHIRT = ["#ff7a1a", "#3d7bff", "#22c55e", "#ff4fa3", "#9b8cff", "#ffd60a", "#1a9e8f", "#e63946", "#2b2b33", "#ffffff", "#7ad04f", "#f4a261", "#5e60ce", "#06d6a0"];
const HAIR_COLORS = { young: ["#1b1b1b", "#3b2a20", "#6b3e26", "#c98b3c", "#e9c46a", "#b5523b", "#ff4fa3", "#5e60ce"], adult: ["#1b1b1b", "#3b2a20", "#6b3e26", "#9a7b5b", "#e9c46a", "#b5523b"], old: ["#e8e8e8", "#c9c9c9", "#a9a9a9", "#f1f1f1"] };
const HAIR = {
  m: { young: ["messy", "curly", "afro", "mohawk", "fade", "buzz", "slick", "manbun"], adult: ["buzz", "slick", "curly", "afro", "fade", "sidepart", "bald", "messy"], old: ["combover", "baldsides", "shortgray", "bald"] },
  f: { young: ["long", "ponytail", "pigtails", "curlylong", "afro", "bun", "pixie", "braids"], adult: ["bob", "long", "bun", "curlylong", "afro", "pixie", "ponytail", "braids"], old: ["graybun", "shortcurl", "bob", "bun"] },
} as const;
// Weighted: most people wear nothing special, so accessories stay distinctive instead of repetitive.
const ACC_M: Look["accessory"][] = ["none", "none", "none", "glasses", "glasses", "sunglasses", "headset", "cap", "beanie", "bandana", "bowtie", "earbuds"];
const ACC_F: Look["accessory"][] = ["none", "none", "none", "glasses", "glasses", "earrings", "earrings", "sunglasses", "headset", "flower", "earbuds"];
const BROWS: Look["brows"][] = ["angry", "worried", "flat", "raised", "sad"];
const MOUTHS: Look["mouth"][] = ["smirk", "frown", "open", "grimace", "wobbly", "grin", "flat"];

function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length)];

/** Facial expression from the prank's tone, with a little variety so moods don't all look identical. */
function mood(delivery: string, r: () => number): Pick<Look, "brows" | "mouth"> | null {
  const d = delivery.toLowerCase();
  const one = (o: Pick<Look, "brows" | "mouth">[]) => o[Math.floor(r() * o.length)];
  if (/panic|nervous|anxious|scared|terrified|whisper/.test(d)) return one([{ brows: "worried", mouth: "grimace" }, { brows: "worried", mouth: "wobbly" }, { brows: "worried", mouth: "open" }]);
  if (/furious|angry|outraged|indignant|confront|uptight/.test(d)) return one([{ brows: "angry", mouth: "open" }, { brows: "angry", mouth: "frown" }, { brows: "angry", mouth: "flat" }]);
  if (/sad|hurt|wounded|teary/.test(d)) return one([{ brows: "sad", mouth: "wobbly" }, { brows: "sad", mouth: "frown" }]);
  if (/excited|thrilled|overjoyed|cheerful|bubbly|hyped|pumped/.test(d)) return one([{ brows: "raised", mouth: "grin" }, { brows: "raised", mouth: "open" }, { brows: "flat", mouth: "grin" }]);
  if (/deadpan|flat|bored|monotone/.test(d)) return { brows: "flat", mouth: "flat" };
  if (/smug|confident|cocky|suspicious|paranoid/.test(d)) return one([{ brows: "flat", mouth: "smirk" }, { brows: "angry", mouth: "smirk" }]);
  return null;
}

/** Deterministic look for one prank; `used` guarantees no two pranks share a face. */
export function lookFor(slug: string, cast: Cast, used: Set<string>): Look {
  for (let n = 0; ; n++) {
    const r = rng(`${slug}#${n}`);
    const m = mood(cast.delivery, r);
    const hairColor = pick(r, HAIR_COLORS[cast.age]);
    const look: Look = {
      skin: pick(r, SKIN),
      shirt: pick(r, SHIRT),
      hair: pick(r, HAIR[cast.gender][cast.age]),
      hairColor,
      brows: m?.brows ?? pick(r, BROWS),
      mouth: m?.mouth ?? pick(r, MOUTHS),
      accessory: pick(r, cast.gender === "m" ? ACC_M : ACC_F),
      facial: pick(r, cast.gender === "m" && cast.age !== "young" ? ["none", "stubble", "mustache", "beard", "freckles"] as const : ["none", "freckles", "blush", "none"] as const),
      headW: 22 + Math.floor(r() * 6),
      headH: 26 + Math.floor(r() * 5),
    };
    const key = `${look.skin}|${look.hair}|${look.hairColor}|${look.accessory}|${look.shirt}`;
    if (!used.has(key)) {
      used.add(key);
      return look;
    }
  }
}

// ---------- voices ----------

/** Google Chirp3-HD voices, played by Twilio <Say> as `Google.en-US-Chirp3-HD-<Name>`. */
export const PHONE_VOICES = {
  m: { young: ["Puck", "Fenrir", "Achird", "Zubenelgenubi"], adult: ["Orus", "Enceladus", "Algieba", "Sadachbia", "Alnilam", "Umbriel", "Algenib", "Schedar"], old: ["Charon", "Iapetus", "Rasalgethi", "Sadaltager"] },
  f: { young: ["Zephyr", "Leda", "Laomedeia", "Achernar"], adult: ["Kore", "Aoede", "Autonoe", "Callirrhoe", "Despina", "Erinome", "Pulcherrima", "Vindemiatrix"], old: ["Gacrux", "Sulafat"] },
} as const;
export const ALL_PHONE_VOICES = new Set(Object.values(PHONE_VOICES).flatMap((g) => Object.values(g).flat()));
export const phoneVoiceName = (name: string) => `Google.en-US-Chirp3-HD-${name}`;

/** Round-robin through the right pool so voices repeat as rarely as possible. */
export function voiceAssigner() {
  const next = new Map<string, number>();
  return (cast: Cast) => {
    const pool = PHONE_VOICES[cast.gender][cast.age];
    const k = `${cast.gender}${cast.age}`;
    const i = next.get(k) ?? 0;
    next.set(k, i + 1);
    return pool[i % pool.length];
  };
}

/** Browser (demo) voice tuning so each prank also sounds different in the free demo. */
export function browserVoiceFor(slug: string, cast: Cast) {
  const r = rng(`${slug}/voice`);
  const d = cast.delivery.toLowerCase();
  const base = cast.gender === "f" ? 1.15 : 0.85;
  const agePitch = cast.age === "young" ? 0.12 : cast.age === "old" ? -0.12 : 0;
  const rate = /fast|panic|rapid|breathless|excited|frantic/.test(d) ? 1.18 : /slow|drawl|sleepy|creaky|old/.test(d) || cast.age === "old" ? 0.86 : 1.0;
  return {
    pitch: Math.round((base + agePitch + (r() - 0.5) * 0.16) * 100) / 100,
    rate: Math.round((rate + (r() - 0.5) * 0.08) * 100) / 100,
    prefer: cast.gender === "f" ? ("female" as const) : ("male" as const),
  };
}
