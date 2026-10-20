// Situation-first prank library. Every prank is one character scenario: the character is the
// VOICE the AI uses (temperament + phone voice), the prank is what users browse and pick.
// The call API still receives characterId + scenarioId, so billing and the call engine are unchanged.
// A prank's access tier is its voice's tier (Chad and Earl stay Pro-only).
import { characters, type Character, type Scenario } from "./characters";
import type { CategoryId, Prank } from "./prankCategories";
export * from "./prankCategories";

type Meta = { title: string; blurb: string; category: CategoryId; icon: string; isNew?: boolean; pick?: number };

/** Card copy per `${characterId}/${scenarioId}`. Every scenario must have an entry (tested). */
export const prankMeta: Record<string, Meta> = {
  "tony/one-call": { title: "Used His One Phone Call on You", blurb: "A stranger in county jail picked your friend for his one call. He needs talent-show advice.", category: "absurd", icon: "🎤", pick: 6 },
  "tony/cellmate": { title: "Pudding Cup Betrayal", blurb: "His cellmate ate his pudding. Your friend has to help him confront it like an adult.", category: "absurd", icon: "🍮" },
  "tony/borrowed-chair": { title: "The Borrowed Lawn Chair", blurb: "It's been in his garage three weeks. Is that still borrowing? He needs a ruling.", category: "mixup", icon: "🪑" },
  "tony/taxi-order": { title: "Order a Taxi", blurb: "Pickup is by the tree that looks like it's waving. Destination: wherever the vibes are good.", category: "orders", icon: "🚕", isNew: true },
  "tony/new-neighbor": { title: "Overly Friendly New Neighbor", blurb: "Can he borrow a cup of sugar? Gravy? A trampoline, just for the weekend?", category: "mixup", icon: "🏡", isNew: true },
  "dez/wrong-number": { title: "Wrong Number Getaway Driver", blurb: "A very bad 'robber' inside a teddy-bear shop is sure your friend is his driver, Marcus.", category: "mixup", icon: "🧸" },
  "dez/stuck": { title: "Stuck in the Ball Pit", blurb: "Mid-'heist', stuck in a kids' ball pit, alarm going off. He needs emotional support.", category: "absurd", icon: "🎈" },
  "dez/wrong-order": { title: "400 Tiny Spoons", blurb: "Did your friend order four hundred tiny spoons? Because they're multiplying.", category: "orders", icon: "🥄" },
  "dez/call-my-girlfriend": { title: "Why Did You Call My Girlfriend?", blurb: "Whispering from inside a closet, he needs to know why your friend called Tasha.", category: "relationship", icon: "🚪", pick: 7 },
  "dez/high-school-hell": { title: "You Made My Life Hell in High School", blurb: "2009. Hall monitor. He's rehearsed this call for fifteen years and he's very nervous.", category: "confront", icon: "🎒", isNew: true, pick: 4 },
  "brenda/ketchup": { title: "The Missing Ketchup Packet", blurb: "She wants the manager. Then the manager's manager. Over one ketchup.", category: "orders", icon: "🥫" },
  "brenda/fry-audit": { title: "One Fry Is Missing", blurb: "The box says large. Emotionally, it feels like medium.", category: "orders", icon: "🍟" },
  "brenda/mystery-sauce": { title: "Mystery Sauce Investigation", blurb: "An unlabeled sauce packet. Is it ketchup, barbecue, or something with a backstory?", category: "orders", icon: "🫙" },
  "brenda/calling-my-boyfriend": { title: "Why Are You Calling My Boyfriend?", blurb: "Your friend's number is in Kevin's phone. Kevin collects spoons. She wants answers.", category: "relationship", icon: "📱", pick: 2 },
  "brenda/mexican-food-order": { title: "Mexican Food Order", blurb: "Burrito folded clockwise, guac on the side of the side, exactly seven chips.", category: "orders", icon: "🌯" },
  "brenda/kid-suspended": { title: "Your Kid Got Suspended", blurb: "Their 'kid' taught the class hamster to drive. Top speed: four miles per hour.", category: "mixup", icon: "🐹", isNew: true },
  "jordan/accident": { title: "The 2 A.M. 'Accident'", blurb: "'Total pocket dial.' An ex who is so over it keeps bringing up the gray hoodie.", category: "relationship", icon: "🌙" },
  "jordan/secret-crush": { title: "Secret Crush", blurb: "Practicing a confession to Sam on the wrong person, and asking for honest feedback.", category: "relationship", icon: "💌" },
  "jordan/name-our-baby": { title: "Help Us Name Our Baby", blurb: "Your friend gets the deciding vote. The options are Sir Fluffington, Toaster and Wi-Fi.", category: "absurd", icon: "🍼", isNew: true },
  "sal/lost": { title: "Delivery Driver Can't Find You", blurb: "A pizza your friend never ordered, a driver lost for three hours, and a request to do a little dance.", category: "orders", icon: "🍕" },
  "sal/blocked-car": { title: "Tiny Car in the Driveway", blurb: "A toy-sized car is blocking the driveway. He respects the driver, but he needs answers.", category: "confront", icon: "🚙" },
  "sal/hit-my-car": { title: "You Hit My Car!", blurb: "Bernadette has a scratch you can only see with a flashlight. At an angle.", category: "confront", icon: "💥", pick: 1 },
  "sal/stay-away-from-my-girl": { title: "Stay Away From My Girl", blurb: "A dead-serious warning about Gina. Gina is a slice of pepperoni pizza.", category: "relationship", icon: "❤️" },
  "sal/potato-lottery": { title: "Fake Lottery Winner", blurb: "Your friend just won the Regional Potato Lottery: four thousand potatoes. Some have names.", category: "absurd", icon: "🥔", isNew: true, pick: 3 },
  "gary/pigeons": { title: "The Pigeons Are Watching", blurb: "Is this line secure? He needs your friend to look out the window. Is there a pigeon?", category: "absurd", icon: "🐦" },
  "gary/dog-review": { title: "Your Dog Left a 1-Star Review", blurb: "Your friend's dog inspected his tomatoes and left without a word. Very rude review process.", category: "absurd", icon: "⭐" },
  "gary/bathroom-stall": { title: "Number on a Bathroom Stall", blurb: "'Call for great advice', next to a duck doodle. So he's calling.", category: "mixup", icon: "🦆" },
  "gary/car-blocking": { title: "Your Car Is Blocking Mine", blurb: "It's too shiny. It's been staring at his house since 6 a.m. It might be a recycling bin.", category: "confront", icon: "🗑️" },
  "gary/junior-dad": { title: "Kid Thinks You're His Dad", blurb: "'Junior' is 34 and needs Dad to sign a permission slip for a field trip to the moon.", category: "mixup", icon: "🏺", isNew: true, pick: 5 },
  "gary/sushi-order": { title: "Sushi Order", blurb: "One roll shaped like a dinosaur, a friendly one, and how many grains of rice exactly?", category: "orders", icon: "🍣", isNew: true },
  "chad/gains": { title: "Confirm My Gains", blurb: "Does his voice sound bigger? Like, more muscle? He needs an honest answer, bro.", category: "absurd", icon: "💪" },
  "chad/protein-delivery": { title: "Protein Shake, Wrong Gym", blurb: "He has a gallon-sized protein shake labeled 'strong person'. Could be your friend.", category: "orders", icon: "🥤" },
  "chad/snapchatting-my-girl": { title: "Why Are You Snapchatting My Girl?", blurb: "Your friend sent Kayla a sandwich. Crusts cut off. Bro, that's intimate.", category: "relationship", icon: "🥪" },
  "chad/diss-track": { title: "You Made a Diss Track About Me", blurb: "'Chad is sad'? That's the whole bar? He's not mad, he's disappointed in the rhyme.", category: "confront", icon: "🎧", isNew: true, pick: 8 },
  "earl/lefty": { title: "You're His Old Buddy Lefty", blurb: "A 92-year-old is sure your friend is his old army buddy Lefty, and won't hear otherwise.", category: "mixup", icon: "📻" },
  "earl/yard-mystery": { title: "Mystery Lawn Goose", blurb: "A ceramic goose in a tiny hat appeared in his yard. The hat is suspicious.", category: "absurd", icon: "🪿" },
  "earl/dog-pooped": { title: "Your Dog Pooped in My Yard", blurb: "A little present on his prize petunias, and he has some questions.", category: "confront", icon: "🌷" },
  "earl/chinese-food-order": { title: "Chinese Food Order", blurb: "He'd like 'the usual'. From 1974. He can't remember what it is.", category: "orders", icon: "🥡" },
  "earl/smart-fridge": { title: "Grandpa Is Terrified", blurb: "His new smart fridge talks back. It said he's low on milk. He felt judged.", category: "absurd", icon: "🧊", isNew: true },
  "earl/date-your-grandma": { title: "Can I Date Your Grandma?", blurb: "A very polite gentleman would like your blessing to take Grandma to Thursday bingo.", category: "relationship", icon: "🎲", isNew: true },
  "brenda/pro-cuddler": { title: "Did You Hire a Professional Cuddler?", blurb: "Marisol is confirming today's Deluxe Burrito Wrap. She has a hug menu and a clipboard.", category: "mixup", icon: "🤗", isNew: true },
  "tony/wild-grandma": { title: "Can You Babysit My Wild Grandma?", blurb: "Grandma Dot is 84, banned from two trampoline parks, and currently on the roof.", category: "absurd", icon: "🛹", isNew: true },
  "dez/no-tip": { title: "You Didn't Tip Me", blurb: "One grape. Delivered in the rain. With a little bow. And no tip. Jaylen is hurt.", category: "confront", icon: "🍇", isNew: true },
  "gary/water-watch": { title: "Stop Using Your Water", blurb: "The Maple Court Water Watch (just Dennis) clocked a 6-minute shower. With singing.", category: "confront", icon: "🚿", isNew: true },
  "jordan/shoe-fan-club": { title: "Your Shoes Have a Fan Club", blurb: "47 members, a group chat called 'Laces Out', and they need an autograph for the sneakers.", category: "absurd", icon: "👟", isNew: true },
  "jordan/wifi-thief": { title: "Stop Stealing My WiFi", blurb: "No offense, but Tanya's show buffered at the best part, and she has evidence.", category: "confront", icon: "📶", isNew: true },
  "sal/new-stepmom": { title: "I'm Your New Stepmom", blurb: "Crystal is marrying 'your dad Gerald' at a bowling alley and you're the flower kid.", category: "relationship", icon: "💍", isNew: true },
  "sal/penguin-escape": { title: "A Zoo Penguin Escaped", blurb: "Waddles got out of the petting zoo and keeps calling your number with his beak.", category: "absurd", icon: "🐧", isNew: true },
  "chad/bowling-rival": { title: "Your Mom Keeps Beating Me at Bowling", blurb: "Five weeks in a row. A strike while eating a pretzel. Rick needs her secret.", category: "confront", icon: "🎳", isNew: true },
  "earl/karaoke-partner": { title: "We Met at Karaoke Night", blurb: "Jess says your friend promised to be her duet partner for Friday's karaoke finals.", category: "mixup", icon: "🎤", isNew: true },
};


const toPrank = (c: Character, s: Scenario): Prank => {
  const m = prankMeta[`${c.id}/${s.id}`] ?? { title: s.title, blurb: s.setup.split(". ")[0], category: "absurd" as const, icon: "📞" };
  return {
    slug: `${c.id}-${s.id}`,
    characterId: c.id,
    scenarioId: s.id,
    title: m.title,
    blurb: m.blurb,
    category: m.category,
    icon: m.icon,
    isNew: !!m.isNew,
    pick: m.pick ?? null,
    tier: c.tier,
    accent: c.accent,
    opener: s.opener,
    look: s.look!,
  };
};

/** Public-safe list (no prompts): only titles, blurbs, opener and ids. */
export const pranks: Prank[] = characters.flatMap((c) => c.scenarios.map((s) => toPrank(c, s)));

export const featuredPranks = pranks.filter((p) => p.pick !== null).sort((a, b) => a.pick! - b.pick!);

export function findPrank(slug: string | undefined | null) {
  return slug ? pranks.find((p) => p.slug === slug) ?? null : null;
}
