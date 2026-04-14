const SUPERPOWER_DEFS = [
  {
    key: "space-seeker",
    name: "Space Seeker",
    emoji: "🚀",
    summary: "You love giant questions about space, planets, and the universe.",
    journeyText: "You keep exploring the biggest mysteries out there.",
    parentTip: "Ask one compare question next, like Earth vs Mars, to deepen reasoning.",
    keywords: ["space", "planet", "moon", "star", "sun", "galaxy", "rocket", "gravity", "orbit", "venus", "mars"],
  },
  {
    key: "nature-detective",
    name: "Nature Detective",
    emoji: "🌿",
    summary: "You notice how animals, weather, oceans, and living things work.",
    journeyText: "You are always spotting clues in the natural world.",
    parentTip: "Encourage a quick observation walk and ask what patterns Shlok notices.",
    keywords: ["animal", "animals", "ocean", "tree", "plant", "butterfly", "dinosaur", "rain", "cloud", "weather", "forest", "earth", "volcano", "frog", "bird"],
  },
  {
    key: "experiment-builder",
    name: "Experiment Builder",
    emoji: "🛠️",
    summary: "You like trying, testing, and building ideas with your own hands.",
    journeyText: "You learn best by testing ideas and seeing what happens.",
    parentTip: "Offer simple home mini-experiments so curiosity turns into action.",
    keywords: ["experiment", "build", "make", "test", "try", "activity", "invent", "create", "drop", "mix"],
  },
  {
    key: "pattern-spotter",
    name: "Pattern Spotter",
    emoji: "🔍",
    summary: "You are great at noticing changes, cycles, and how things connect.",
    journeyText: "You keep finding links, patterns, and repeatable clues.",
    parentTip: "Try asking what is same and what is different to strengthen pattern thinking.",
    keywords: ["pattern", "change", "cycle", "shape", "same", "different", "turn into", "remember", "again", "grow"],
  },
  {
    key: "how-it-works-hero",
    name: "How-It-Works Hero",
    emoji: "⚙️",
    summary: "You want to understand what is happening behind the scenes.",
    journeyText: "You chase the hidden mechanics behind how things work.",
    parentTip: "Use everyday objects and ask what each part does and why.",
    keywords: ["how", "work", "works", "lightning", "electric", "brain", "heart", "memory", "sound", "machine", "body", "food", "digestion"],
  },
];

const DEFAULT_SUPERPOWER = {
  key: "big-why-thinker",
  name: "Big Why Thinker",
  emoji: "💡",
  summary: "You love asking the big why questions behind everything.",
  journeyText: "You keep digging for deeper reasons and bigger ideas.",
  parentTip: "Celebrate why questions first, then ask one follow-up together.",
};

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

export function inferCuriositySuperpower(input) {
  const text = normalizeText(input);
  const scores = new Map();

  for (const definition of SUPERPOWER_DEFS) {
    let score = 0;
    for (const keyword of definition.keywords) {
      if (text.includes(keyword)) score += 1;
    }
    scores.set(definition.key, score);
  }

  if (text.trim().startsWith("why ")) {
    scores.set(DEFAULT_SUPERPOWER.key, (scores.get(DEFAULT_SUPERPOWER.key) || 0) + 2);
  }

  let best = DEFAULT_SUPERPOWER;
  let bestScore = scores.get(DEFAULT_SUPERPOWER.key) || 0;

  for (const definition of SUPERPOWER_DEFS) {
    const score = scores.get(definition.key) || 0;
    if (score > bestScore) {
      best = definition;
      bestScore = score;
    }
  }

  return best;
}

export function summarizeCuriositySuperpowers(entries) {
  const counts = new Map();

  for (const entry of entries || []) {
    const power = inferCuriositySuperpower(entry?.query_text || entry?.title || entry?.badge_title || "");
    const existing = counts.get(power.key);
    counts.set(power.key, {
      ...power,
      count: (existing?.count || 0) + 1,
    });
  }

  const ranked = [...counts.values()].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));

  return {
    dominant: ranked[0] || DEFAULT_SUPERPOWER,
    distinctCount: ranked.length,
    ranked,
  };
}