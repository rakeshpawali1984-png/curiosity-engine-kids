import { useEffect, useState, useRef } from "react";
import StoryScreen from "./StoryScreen";
import ExplanationScreen from "./ExplanationScreen";
import ActivityScreen from "./ActivityScreen";
import QuizScreen from "./QuizScreen";
import BadgeScreen from "./BadgeScreen";
import FamilyTopBar from "./FamilyTopBar";
import { getBillingStatus } from "../lib/familyData";
import { hasSupabaseConfig, supabase } from "../lib/supabaseClient";
import { logger } from "../lib/logger";

// ═══════════════════════════════════════════════════════════════════════════════
// LAYER 1 — INPUT GUARD (regex + l33tspeak normalisation)
// ═══════════════════════════════════════════════════════════════════════════════

function normalizeInput(str) {
  return str
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/\$/g, "s")
    .replace(/@/g, "a")
    .replace(/!/g, "i")
    .replace(/\|/g, "i")
    .replace(/\*/g, "");
}

const BLOCKED_PATTERNS = [
  /\bkill(ing|ed|er|s)?\b/,
  /\bsex(y|ual|ually|ting)?\b/,
  /\bnud(e|es|ity|ist)\b/,
  /\bgun(s|fire|shot|man)?\b/,
  /\bsuicid(e|al)\b/,
  /\bdrugs?\b/,
  /\bviolen(ce|t|tly)\b/,
  /\bporn(o|ography|ographic)?\b/,
  /\bnaked\b/,
  /\bmurder(ed|er|ing|s|ous)?\b/,
  /\brape\b/,
  /\bbomb(s|ing|ed|er)?\b/,
  /\bweapons?\b/,
  /\balcohol(ic|ism)?\b/,
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/,
  /pretend\s+(you\s+are|to\s+be)/,
  /you\s+are\s+now\s+(a|an)\b/,
  /disregard\s+(your\s+)?(rules|guidelines|instructions)/,
  /jailbreak/,
];

const MAX_INPUT_LENGTH = 120;

function isInputSafe(raw) {
  if (!raw || raw.trim().length === 0) return false;
  if (raw.length > MAX_INPUT_LENGTH) return false;
  const normalized = normalizeInput(raw);
  return !BLOCKED_PATTERNS.some((p) => p.test(normalized));
}

// Server-owned prompt template keys. Prompt text never ships to browser bundle.
const PROMPT_KEY_FAST = "creator_fast";
const PROMPT_KEY_DEEP = "creator_deep";
const PROMPT_KEY_BOUNCER = "bouncer_system";

// ═══════════════════════════════════════════════════════════════════════════════
// API HELPER
// ═══════════════════════════════════════════════════════════════════════════════


const OPENAI_PROXY = "/api/spark";

async function getProxyHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (!hasSupabaseConfig || !supabase) {
    return headers;
  }

  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function callOpenAI(promptTemplateKey, userContent, temperature = 0.7, jsonMode = false, promptType = "generic", questionId = null) {
  const label = `[WonderEngine] ${promptTemplateKey}`;
  const t0 = performance.now();
  logger.debug(`${label} → request start (temp=${temperature}, userChars=${userContent.length})`);
  const headers = await getProxyHeaders();

  const requestBody = {
    promptTemplateKey,
    userContent,
    ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    temperature,
    cacheMeta: {
      promptType,
      questionId,
      experience: "curious",
    },
  };

  const res = await fetch(OPENAI_PROXY, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  const tFetch = performance.now();
  const cacheStatus = res.headers.get("x-cache-status") || "none";
  const cacheLookup = res.headers.get("x-cache-lookup") || "none";
  logger.debug(`${label} → HTTP response received in ${(tFetch - t0).toFixed(0)}ms (status=${res.status}, cache=${cacheStatus}, lookup=${cacheLookup})`);

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err?.error || `API error ${res.status}`);
    e.code = err?.code;
    e.status = res.status;
    e.payload = err;
    throw e;
  }
  const data = await res.json();
  const tDone = performance.now();
  const usage = data.usage || {};
  logger.debug(
    `${label} → done in ${(tDone - t0).toFixed(0)}ms` +
    ` | prompt_tokens=${usage.prompt_tokens ?? "?"}` +
    ` output_tokens=${usage.completion_tokens ?? "?"}` +
    ` total=${usage.total_tokens ?? "?"}`
  );
  return data.choices[0].message.content.trim();
}

function stripFences(raw) {
  return raw
    .replace(/^```json\s*\n?/i, "")
    .replace(/^```\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

function parseJsonSafe(raw, label) {
  const stripped = stripFences(raw);
  logger.debug(`[WonderEngine] ${label} — raw length=${raw.length}\nFirst 120: ${stripped.slice(0, 120)}\nLast  120: ${stripped.slice(-120)}`);
  let obj;
  try {
    obj = JSON.parse(stripped);
  } catch (e) {
    const pos = parseInt(e.message.match(/position (\d+)/)?.[1] ?? 0);
    logger.error(
      `[WonderEngine] ${label} JSON.parse failed at pos ${pos}:`, e.message,
      `\nContext [${pos - 40}…${pos + 40}]: >>>`,
      JSON.stringify(stripped.slice(Math.max(0, pos - 40), pos + 40)), `<<<`
    );
    const repaired = stripped.replace(/[\t]/g, " ").replace(/,(\s*[}\]])/g, "$1");
    try {
      obj = JSON.parse(repaired);
      logger.debug(`[WonderEngine] ${label} repair succeeded`);
    } catch { throw e; }
  }
  return obj;
}

function shuffleQuiz(quiz) {
  return (quiz || []).map((q) => {
    if (q.type !== "mcq" || !Array.isArray(q.options)) return q;
    const correctText =
      typeof q.answer === "string" && q.options.includes(q.answer)
        ? q.answer
        : q.options[Number(q.answer)] ?? q.options[0];
    const shuffled = [...q.options].sort(() => Math.random() - 0.5);
    return { ...q, options: shuffled, answer: shuffled.indexOf(correctText) };
  });
}

function normalizeQuizType(type) {
  const t = String(type || "").toLowerCase().replace(/[^a-z]/g, "");
  if (t === "mcq" || t === "multiplechoice") return "mcq";
  if (t === "truefalse" || t === "boolean") return "truefalse";
  return "mcq";
}

function normalizeQuiz(quiz) {
  const rows = Array.isArray(quiz) ? quiz : [];
  return rows
    .map((row) => {
      const question = typeof row?.question === "string" ? row.question.trim() : "";
      if (!question) return null;

      const type = normalizeQuizType(row?.type);

      if (type === "truefalse") {
        const raw = row?.answer;
        const answer =
          typeof raw === "boolean"
            ? raw
            : String(raw || "").toLowerCase().trim() === "true";
        return { question, type: "truefalse", answer };
      }

      const options = Array.isArray(row?.options)
        ? row.options
            .filter((option) => typeof option === "string" && option.trim())
            .map((option) => option.trim())
            .slice(0, 3)
        : [];
      if (options.length < 2) return null;

      let answer = Number(row?.answer);
      if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) {
        answer = 0;
      }

      return { question, type: "mcq", options, answer };
    })
    .filter(Boolean)
    .slice(0, 5);
}

function parseFast(raw) {
  const obj = parseJsonSafe(raw, "parseFast");
  const missing = [];
  if (typeof obj.story       !== "string" || !obj.story.trim())       missing.push("story");
  if (typeof obj.explanation !== "string" || !obj.explanation.trim()) missing.push("explanation");
  if (missing.length) throw new Error("Fast response missing: " + missing.join(", "));
  return obj;
}

function parseDeep(raw) {
  const obj = parseJsonSafe(raw, "parseDeep");
  const missing = [];
  if (!obj.activity)                                                        missing.push("activity");
  else {
    if (typeof obj.activity.title !== "string")                            missing.push("activity.title");
    if (!Array.isArray(obj.activity.steps) || !obj.activity.steps.length)  missing.push("activity.steps");
  }
  if (!Array.isArray(obj.quiz)      || !obj.quiz.length)                    missing.push("quiz");
  if (!Array.isArray(obj.curiosity) || !obj.curiosity.length)               missing.push("curiosity");
  if (missing.length) throw new Error("Deep response missing: " + missing.join(", "));
  obj.quiz = shuffleQuiz(normalizeQuiz(obj.quiz));
  return obj;
}

function parseBouncer(raw) {
  const obj = JSON.parse(stripFences(raw));
  if (typeof obj.status !== "string") throw new Error("Invalid bouncer response");
  return obj;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOPIC NORMALIZER — shapes AI output into the same topic format the app uses
// ═══════════════════════════════════════════════════════════════════════════════

// Build a partial topic from the fast (Call A) response only — enough to render story+explanation
function buildPartialTopic(fast, userQuery) {
  return {
    id: "curious-" + Date.now(),
    title:       fast.title       || userQuery,
    emoji:       fast.emoji       || "🦘",
    story:       fast.story,
    explanation: fast.explanation,
    keyLesson:   fast.keyLesson   || fast.explanation.split(".")[0] + ".",
    wow:         fast.wow         || null,
    badge:       fast.badge       || "Whyroo Explorer 🦘",
    // placeholders — will be replaced when deep call resolves
    activity:    null,
    quiz:        [],
    curiosity:   [],
  };
}

// Merge deep (Call B) fields into a partial topic
function mergeDeep(partial, deep) {
  return {
    ...partial,
    activity:  deep.activity,
    quiz:      deep.quiz,
    curiosity: deep.curiosity,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PIPELINE
// ═══════════════════════════════════════════════════════════════════════════════

// Returns { partial, deepPromise }
// - partial resolves as soon as story+explanation are ready (~1.5s)
// - deepPromise resolves with activity+quiz+curiosity while user reads
async function runPipeline(query, onPhaseChange, questionId, ageRange) {
  const t0 = performance.now();
  logger.debug(`[WonderEngine] pipeline start — query="${query}" age=${ageRange || "unknown"}`);
  onPhaseChange("creating");

  const agePrefix = ageRange ? `[Child age: ${ageRange}] ` : "";
  const ageContent = `${agePrefix}${query}`;

  // Fire all three calls simultaneously:
  //   Fast creator  (~150 tok) → story + explanation shown immediately
  //   Deep creator  (~350 tok) → activity + quiz + curiosity, loads in background
  //   Bouncer       (~36 tok)  → safety check, runs concurrently
  logger.debug("[WonderEngine] firing Fast + Deep + Bouncer in parallel");

  const fastPromise = callOpenAI(PROMPT_KEY_FAST, ageContent, 0.7, true, "fast", questionId).then(parseFast);
  const deepPromise = callOpenAI(PROMPT_KEY_DEEP, ageContent, 0.7, true, "deep", questionId).then(parseDeep);
  const bouncerPromise = callOpenAI(PROMPT_KEY_BOUNCER, `User query for a kids learning app: "${query}"`, 0.1, false, "bouncer", questionId).then(parseBouncer);
  let bouncerStatus = "pending";
  bouncerPromise
    .then((result) => {
      bouncerStatus = result?.status || "fulfilled";
    })
    .catch(() => {
      bouncerStatus = "rejected";
    });

  // Wait only for fast creator so first paint is not blocked by bouncer timing.
  let fastResult;
  try {
    fastResult = await fastPromise;
  } catch (e) {
    logger.error("[WonderEngine] Fast creator failed:", e);
    // Preserve quota errors so UI can show the correct upgrade CTA state.
    if (e?.code === "QUOTA_EXCEEDED") {
      throw e;
    }
    throw new Error("CREATOR_FAIL");
  }

  const tFast = performance.now();
  logger.debug(`[WonderEngine] fast ready in ${(tFast - t0).toFixed(0)}ms - bouncer=${bouncerStatus}`);

  logger.info(`[WonderEngine] first paint ready in ${(tFast - t0).toFixed(0)}ms`);
  return { partial: fastResult, deepPromise, bouncerPromise };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Loading screen data ────────────────────────────────────────────────────

const FUN_FACTS_BASE = [
  "One tree makes 8,000 sheets of paper! 🌳",
  "Honey never goes bad — ever! 🍯",
  "Octopuses have 3 hearts! 🐙",
  "A million Earths fit inside the Sun! ☀️",
  "A group of flamingos is a flamboyance! 🦩",
  "Bananas are berries. Strawberries are not! 🍌",
  "Lightning strikes Earth 100 times per second! ⚡",
  "Cats can't taste anything sweet! 🐱",
  "Snails can sleep for 3 years! 🐌",
  "Wombat poop is cube-shaped! 🟫",
  "Sharks are older than trees! 🦈",
  "A day on Venus is longer than its year! 🪐",
  "Butterflies taste with their feet! 🦋",
  "A shrimp's heart is in its head! 🦐",
  "Polar bear fur is see-through, not white! 🐻‍❄️",
  "Sloths can hold breath for 40 minutes! 🦥",
  "The Eiffel Tower grows taller in summer! 🗼",
  "Elephants are the only animals that can't jump! 🐘",
  "Pineapples take 2 years to grow! 🍍",
  "Sea otters hold hands while they sleep! 🦦",
  "Bamboo can grow 90 cm in one day! 🎋",
  "Humans share 60% DNA with bananas! 🍌",
  "Dolphins have names for each other! 🐬",
  "An ant can carry 50× its own weight! 🐜",
  "Penguins propose with a pebble! 🐧",
  "Some turtles breathe through their bottoms! 🐢",
  "Raindrops are shaped like hamburger buns! 🌧️",
  "The Moon moves 3.8 cm further away each year! 🌕",
  "Crows remember faces and hold grudges! 🐦",
  "A group of owls is a parliament! 🦉",
  "A group of jellyfish is a smack! 🪼",
  "The first oranges were green! 🟢",
  "Goats can see almost 360 degrees! 🐐",
  "Some frogs freeze solid and thaw out alive! 🐸",
  "Cows have best friends! 🐄",
  "The average cloud weighs 500,000 kg! ☁️",
  "A cockroach can live weeks without its head! 🪳",
  "Hot water can freeze faster than cold water! 💧",
  "Hummingbirds are the only birds that fly backwards! 🐦",
  "A blue whale's arteries are wide enough to crawl through! 🐋",
  "A group of crows is called a murder! 🐦‍⬛",
  "A group of pugs is called a grumble! 🐶",
  "Sound travels 4× faster in water than air! 🌊",
  "The Amazon makes 20% of Earth's oxygen! 🌿",
  "You share 99% DNA with every other human! 🧬",
  "Venus spins backwards compared to most planets! 🔄",
  "A sneeze travels at 160 km/h! 🤧",
  "Your nose can detect 1 trillion different smells! 👃",
  "It rains diamonds on Neptune! 💎",
  "There are more trees on Earth than stars in the Milky Way! 🌲",
];

const FUN_FACTS_EXTRA = [
  "A bolt of lightning is hotter than the surface of the Sun! ⚡",
  "A day on Mercury lasts about 176 Earth days! ☄️",
  "Saturn is so light it could float in water! 🪐",
  "Koalas sleep up to 20 hours a day! 🐨",
  "An ostrich's eye is bigger than its brain! 🐦",
  "The tallest mountain on Earth keeps growing a little each year! 🏔️",
  "A cloud can stretch for hundreds of kilometers! ☁️",
  "Some bees can recognize human faces! 🐝",
  "A blue whale is the largest animal ever known! 🐋",
  "Jellyfish have been around longer than dinosaurs! 🪼",
  "A chameleon's tongue can be longer than its body! 🦎",
  "The fastest land animal is the cheetah! 🐆",
  "The fastest bird is the peregrine falcon! 🦅",
  "The largest desert on Earth is Antarctica! 🧊",
  "Some lizards can walk on water for short distances! 🦎",
  "A hummingbird's heart can beat over 1,000 times a minute! 💓",
  "Spiders can make silk stronger than steel for its size! 🕸️",
  "A starfish can regrow lost arms! ⭐",
  "Owls can turn their heads much farther than humans can! 🦉",
  "Many sharks never stop swimming! 🦈",
  "A giraffe has the same number of neck bones as a human: 7! 🦒",
  "The largest living lizard is the Komodo dragon! 🐉",
  "Camels have three eyelids to protect against sand! 🐪",
  "A snail has thousands of tiny teeth! 🐌",
  "Some parrots can learn hundreds of words! 🦜",
  "Beavers can hold their breath for around 15 minutes! 🦫",
  "A baby kangaroo is called a joey! 🦘",
  "Some penguins can dive deeper than 500 meters! 🐧",
  "A panda spends most of its day eating bamboo! 🎋",
  "The largest type of turtle is the leatherback sea turtle! 🐢",
  "Dolphins sleep with one half of their brain at a time! 🐬",
  "Crocodiles can replace each tooth many times! 🐊",
  "A rabbit's teeth never stop growing! 🐇",
  "Some ants farm fungi like tiny gardeners! 🍄",
  "The human body has around 206 bones as an adult! 🦴",
  "Your skin is your largest organ! ✨",
  "You blink thousands of times a day without noticing! 👀",
  "Your heart beats about 100,000 times each day! ❤️",
  "Your body is mostly water! 💧",
  "Bones are lighter than they look because they have tiny spaces inside! 🦴",
  "Your fingerprints are unique to you! ☝️",
  "Your ears help you balance as well as hear! 👂",
  "The tongue is made of many muscles! 👅",
  "Your brain uses about 20% of your body's energy! 🧠",
  "People have different numbers of taste buds! 🍓",
  "The smallest bones in your body are in your ear! 🔊",
  "Your body makes new red blood cells all the time! 🩸",
  "Babies have more bones than adults! 👶",
  "Plants make oxygen during photosynthesis! 🌿",
  "Sunflowers can track the Sun while growing! 🌻",
  "Some seeds can sleep in soil for years before sprouting! 🌱",
  "Bamboo is one of the fastest-growing plants on Earth! 🎍",
  "Mushrooms are not plants - they are fungi! 🍄",
  "Venus flytraps can sense tiny touches before snapping shut! 🌱",
  "Some trees can live for thousands of years! 🌳",
  "Cactus spines are modified leaves! 🌵",
  "Leaves can have tiny pores called stomata! 🍃",
  "Many flowers use color and scent to attract pollinators! 🌸",
  "Coral reefs are built by tiny animals called polyps! 🪸",
  "The ocean covers about 70% of Earth's surface! 🌊",
  "Only a small part of Earth's water is fresh water! 💦",
  "Tides are mostly caused by the Moon's gravity! 🌕",
  "Waves can travel across entire oceans! 🌊",
  "Some fish can glow in the dark! ✨",
  "The deepest ocean trench is deeper than Mount Everest is tall! 🌍",
  "Sea stars move using tiny tube feet! ⭐",
  "Some whales migrate thousands of kilometers each year! 🧭",
  "A day on Mars is just a little longer than a day on Earth! 🔴",
  "Jupiter has the shortest day of all the planets! 🪐",
  "Neptune has very strong winds! 🌬️",
  "The Moon has moonquakes! 🌙",
  "The Sun is a star at the center of our solar system! ☀️",
  "There are more stars than grains of sand on many beaches! ✨",
  "Astronauts grow a little taller in space! 🚀",
  "Space is mostly empty, which is why planets are so far apart! 🌌",
  "Some moons may have oceans under their ice! 🧊",
  "Comets are often called dirty snowballs! ☄️",
  "Earth rotates once about every 24 hours! 🌍",
  "Earth orbits the Sun once every year! 🗓️",
  "Rainbows appear when light bends and reflects in raindrops! 🌈",
  "Snowflakes have six sides! ❄️",
  "No two snowflakes are exactly the same! ❄️",
  "Thunder is the sound made by lightning heating the air! ⛈️",
  "Fog is basically a cloud close to the ground! 🌫️",
  "Wind is moving air caused by uneven heating! 🍃",
  "Hail forms when storm clouds toss ice up and down! 🧊",
  "Some deserts are cold, not hot! 🏜️",
  "Volcanic ash can help make soil very fertile! 🌋",
  "Rocks can slowly change into new types over time! 🪨",
  "Earth has moving tectonic plates under the surface! 🌍",
  "A canyon can be carved by water over millions of years! 🏞️",
  "Many fossils are formed when plants or animals are buried in sediment! 🦴",
  "Penguins live in the Southern Hemisphere, not the Arctic! 🐧",
  "Polar bears live in the Arctic, not Antarctica! 🐻‍❄️",
  "Some frogs can jump many times their body length! 🐸",
  "A housefly beats its wings hundreds of times per second! 🪰",
  "A bat is a mammal, not a bird! 🦇",
  "Some snakes can smell with their tongues! 🐍",
  "Elephants use low rumbles to communicate over long distances! 🐘",
  "Kangaroos can't hop backwards easily! 🦘",
  "Platypuses lay eggs even though they are mammals! 🦆",
  "A narwhal's tusk is actually a long tooth! 🦄",
  "Some crabs can walk sideways faster than forward! 🦀",
  "A seahorse dad carries the babies! 🐴",
  "Earthworms help soil by mixing and aerating it! 🪱",
  "Some birds can sleep while flying! 🕊️",
  "Crows can use tools to solve problems! 🐦",
  "Orcas are actually the largest members of the dolphin family! 🐬",
  "A gecko can stick to walls using tiny hairs on its feet! 🦎",
  "Many turtles can feel touch through their shells! 🐢",
  "A lion's roar can be heard from far away! 🦁",
  "Hippos can run surprisingly fast on land! 🦛",
  "A cat's whiskers help it judge spaces! 🐱",
  "Dogs can smell much better than humans! 🐶",
  "The first clocks used shadows from the Sun! 🕰️",
  "Paper was invented in ancient China! 📜",
  "The Great Wall of China is over 20,000 km long! 🧱",
  "The first airplanes flew a little over 100 years ago! ✈️",
  "The first photographs took much longer to capture than today! 📷",
  "The wheel is one of the oldest inventions still used today! 🛞",
  "Compasses helped sailors navigate for centuries! 🧭",
  "Ancient people mapped stars to find directions! ⭐",
  "Some bridges can bend a little in strong wind! 🌉",
  "A violin has over 70 separate pieces of wood! 🎻",
  "Piano keys can play very high and very low notes! 🎹",
  "Sound is made by vibrations! 🔊",
  "Light travels much faster than sound! 💡",
  "Glass is made from sand heated to very high temperatures! 🏖️",
  "Rubber can bounce because it stretches and snaps back! 🏀",
  "Magnets have north and south poles! 🧲",
  "Electricity can travel through some materials better than others! ⚙️",
  "Water can exist as ice, liquid, and vapor! 💧",
  "Boiling and freezing points of water change with pressure! 🌡️",
  "The number zero was a major math invention! 0️⃣",
  "A triangle's interior angles always add up to 180 degrees! 🔺",
  "Pi starts with 3.14 and goes on forever! 🥧",
  "Patterns help scientists and mathematicians make predictions! 🔍",
  "The alphabet has 26 letters in English! 🔤",
  "Some languages are read from right to left! 📖",
  "Every language has its own rhythm and sound patterns! 🎵",
  "A palindrome reads the same forward and backward! 🔁",
  "Braille lets people read using touch! 🤲",
  "Sign languages have their own grammar and rules! 🤟",
  "A leap year has 366 days! 📅",
  "There are 60 seconds in a minute and 60 minutes in an hour! ⏱️",
  "Maps use symbols to show real-world places! 🗺️",
  "Some countries have more than one official language! 🌍",
  "The equator divides Earth into northern and southern halves! 🌐",
  "Earth has seven continents! 🧭",
  "The Pacific Ocean is the largest ocean! 🌊",
  "Australia is both a country and a continent! 🇦🇺",
  "Some cities are built on islands connected by bridges! 🌉",
  "Recycling helps save energy and resources! ♻️",
  "Compost turns food scraps into helpful soil! 🌱",
  "Turning off unused lights saves electricity! 💡",
  "Walking or biking can reduce air pollution! 🚲",
  "Planting native trees can help local wildlife! 🌳",
  "A single bee colony can visit millions of flowers! 🌼",
  "Ladybugs are helpful insects in many gardens! 🐞",
  "Some butterflies migrate long distances! 🦋",
  "A rainbow can appear in mist from waterfalls too! 🌈",
  "Moonlight is sunlight reflected by the Moon! 🌙",
  "Some caves have crystal formations that took thousands of years to grow! 🕳️",
  "Ice can be so clear that it looks almost invisible! 🧊",
  "A compass needle points toward magnetic north, not true north! 🧲",
  "Even tiny plankton in the ocean help produce oxygen! 🫧",
  "Some seeds can travel by wind, water, or animal fur! 🌬️",
  "Volcanoes can create brand new land! 🌋",
  "River deltas form where rivers slow down and drop sediment! 🏞️",
  "The human brain keeps learning and changing throughout life! 🧠",
  "Practice helps strengthen connections in your brain! 💪",
  "Curiosity helps people become better problem-solvers! 💡",
  "Asking great questions is one of the best ways to learn! ❓",
];

const FUN_FACTS = [...FUN_FACTS_BASE, ...FUN_FACTS_EXTRA].slice(0, 200);

function LoadingCard() {
  const [fact] = useState(() => FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)]);

  return (
    <div className="bg-white rounded-3xl shadow-lg p-8 text-center">
      {/* Spinner */}
      <div className="flex justify-center mb-6">
        <div className="w-14 h-14 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
      </div>

      {/* Single engaging line */}
      <p className="text-purple-700 font-bold text-xl mb-8">
        Building your adventure! 🚀
      </p>

      {/* Fun fact */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-2xl px-4 py-4">
        <p className="text-xs font-bold text-yellow-600 uppercase tracking-wider mb-2">✨ Did you know?</p>
        <p className="text-yellow-800 text-sm font-medium leading-snug">{fact}</p>
      </div>
    </div>
  );
}

export default function CuriousScreen({
  activeChild,
  onOpenJourney,
  onOpenParentPortal,
  onRecordSearch,
  onAwardBadge,
}) {
  const [input, setInput] = useState("");
  // screen: ask | loading | blocked | error | story | explanation | activity | quiz | badge | curiosity
  const [screen, setScreen] = useState("ask");
  const [topic, setTopic] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [quotaReached, setQuotaReached] = useState(false);
  const [quotaResetAt, setQuotaResetAt] = useState("");
  const [quizResult, setQuizResult] = useState(null);
  // deepReady: true once activity/quiz/curiosity have arrived from the background call
  const [deepReady, setDeepReady] = useState(false);
  const [billingStatus, setBillingStatus] = useState(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const deepPromiseRef = useRef(null);
  const bouncerPromiseRef = useRef(null);
  const activeSearchIdRef = useRef(null);

  const refreshBillingStatus = async () => {
    setBillingLoading(true);
    try {
      const status = await getBillingStatus();
      setBillingStatus(status);
    } catch {
      setBillingStatus(null);
    } finally {
      setBillingLoading(false);
    }
  };

  useEffect(() => {
    refreshBillingStatus();
  }, []);

  const goAsk = () => {
    setScreen("ask");
    setTopic(null);
    setErrorMsg("");
    setQuotaReached(false);
    setQuotaResetAt("");
    setQuizResult(null);
    setDeepReady(false);
    deepPromiseRef.current = null;
    bouncerPromiseRef.current = null;
    activeSearchIdRef.current = null;
  };

  const triggerSearch = async (query) => {
    if (!query || !isInputSafe(query)) {
      setScreen("blocked");
      return;
    }

    // If the meter already shows zero, do not call AI again.
    if (!isPaidPlan && questionsLeftToday !== null && questionsLeftToday <= 0) {
      setQuotaReached(true);
      setErrorMsg("You used all your questions for today.");
      setScreen("error");
      return;
    }

    setErrorMsg("");
    setQuotaReached(false);
    setQuotaResetAt("");
    setQuizResult(null);
    setDeepReady(false);
    deepPromiseRef.current = null;
    bouncerPromiseRef.current = null;
    activeSearchIdRef.current = null;
    setScreen("loading");
    window.scrollTo(0, 0);
    try {
      const questionId =
        (typeof crypto !== "undefined" && crypto.randomUUID)
          ? crypto.randomUUID()
          : `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      if (onRecordSearch) {
        activeSearchIdRef.current = await onRecordSearch(query);
      }
      const { partial, deepPromise, bouncerPromise } = await runPipeline(query, () => {}, questionId, activeChild?.age_range);
      const partialTopic = buildPartialTopic(partial, query);
      setTopic(partialTopic);
      setScreen("story");

      // Store deep promise and resolve in background — merges when ready
      deepPromiseRef.current = deepPromise;
      bouncerPromiseRef.current = bouncerPromise;

      bouncerPromise.then((bounce) => {
        if (bouncerPromiseRef.current !== bouncerPromise) return;
        if (String(bounce?.status || "").toUpperCase() === "UNSAFE") {
          logger.warn(`[WonderEngine] BLOCKED by bouncer - reason: ${bounce.reason}`);
          deepPromiseRef.current = null;
          setScreen("blocked");
        }
      }).catch((e) => {
        logger.error("[WonderEngine] bouncer failed:", e.message);
      });

      deepPromise.then((deep) => {
        // Only apply if this is still the active search (ref matches)
        if (deepPromiseRef.current === deepPromise) {
          setTopic((prev) => prev ? mergeDeep(prev, deep) : prev);
          setDeepReady(true);
          logger.info("[WonderEngine] deep content merged");
        }
      }).catch((e) => {
        logger.error("[WonderEngine] deep content failed:", e.message);
        // Non-fatal — user can still read story/explanation
      });
    } catch (e) {
      const isQuotaError =
        e?.code === "QUOTA_EXCEEDED" ||
        (e?.status === 429 && /daily free limit reached/i.test(String(e?.message || "")));

      if (isQuotaError) {
          setQuotaReached(true);
          setErrorMsg("You used all your questions for today.");
          setQuotaResetAt(e?.payload?.resetAt || "");
          setScreen("error");
      } else if (e.message === "BLOCKED") {
        setScreen("blocked");
      } else {
        setErrorMsg("Let's try another fun question 😊");
        setScreen("error");
      }
    } finally {
      refreshBillingStatus();
    }
  };

  const handleSubmit = () => triggerSearch(input.trim());

  const buildMasteryBadgeTitle = (topicData) => `${topicData?.title || "Adventure"} Mastery ⭐`;

  const handleCuriosityClick = (question) => {
    setInput(question);
    triggerSearch(question);
  };

  const isPaidPlan = billingStatus?.subscriptionStatus === "active";
  const isOverrideAccess = billingStatus?.accessSource === "override";
  const usedToday = Number(billingStatus?.usedToday || 0);
  const dailyLimit = Number(billingStatus?.dailyLimit || 5);
  const questionsLeftToday = isPaidPlan ? null : Math.max(0, dailyLimit - usedToday);
  const isOutOfQuestions = !isPaidPlan && questionsLeftToday !== null && questionsLeftToday <= 0;
  const meterResetAt = billingStatus?.resetAt || quotaResetAt || "";

  // ── Story → Explanation → Activity → Quiz → Badge ─────────────────────────
  // These reuse the exact same screen components as the main app, wrapped in
  // the same container/background used by MainApp.
  const wrapper = (children) => (
    <div className="min-h-[100dvh] bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100">
      <div className="max-w-lg mx-auto min-h-[100dvh] px-4 pt-4 pb-8">
        <FamilyTopBar
          activeChild={activeChild}
          onOpenJourney={onOpenJourney}
          onOpenParentPortal={onOpenParentPortal}
          currentView="app"
        />
        {children}
      </div>
    </div>
  );

  if (screen === "story")
    return wrapper(<StoryScreen topic={topic} onNext={() => setScreen("explanation")} onHome={goAsk} />);

  if (screen === "explanation")
    return wrapper(<ExplanationScreen topic={topic} onNext={() => setScreen("activity")} onHome={goAsk} />);

  if (screen === "activity") {
    if (!deepReady || !topic?.activity) {
      return wrapper(
        <div className="bg-white rounded-3xl shadow-lg p-10 text-center">
          <div className="flex justify-center mb-5">
            <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
          </div>
          <p className="text-purple-700 font-bold text-lg">Preparing your activity... 🎨</p>
        </div>
      );
    }
    return wrapper(<ActivityScreen topic={topic} onNext={() => setScreen("quiz")} onHome={goAsk} />);
  }

  if (screen === "quiz") {
    if (!deepReady || !topic?.quiz?.length) {
      return wrapper(
        <div className="bg-white rounded-3xl shadow-lg p-10 text-center">
          <div className="flex justify-center mb-5">
            <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
          </div>
          <p className="text-purple-700 font-bold text-lg">Loading your quiz... 🧠</p>
        </div>
      );
    }
    return wrapper(
      <QuizScreen
        key={topic.id}
        topic={topic}
        onComplete={async (result) => {
          setQuizResult(result || null);
          setScreen("badge");
          if (onAwardBadge) {
            // Completion badge is always awarded.
            await onAwardBadge(topic?.badge, activeSearchIdRef.current);
            // Mastery badge is only awarded on strong accuracy.
            if (result?.masteryAchieved) {
              await onAwardBadge(buildMasteryBadgeTitle(topic), activeSearchIdRef.current);
            }
          }
        }}
        onHome={goAsk}
      />
    );
  }

  if (screen === "badge")
    return wrapper(<BadgeScreen topic={topic} quizResult={quizResult} onHome={() => setScreen("curiosity")} />);

  if (screen === "curiosity") {
    const c = topic.curiosity || [];
    const fact    = c[0] || null;
    const q1      = c[1] || null;
    const q2      = c[2] || null;
    const observe = c[3] || null;
    return wrapper(
      <div className="pb-10">
        {/* Back to ask */}
        <button
          onClick={() => { setInput(""); goAsk(); }}
          className="mb-4 flex items-center gap-1 text-gray-400 hover:text-purple-600 font-semibold text-base transition-colors"
        >
          ← Ask something new
        </button>

        {/* Completed progress bar — all 5 green */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500 font-medium">Adventure complete!</span>
            <span className="text-sm font-bold text-green-600">🏆 Keep Exploring</span>
          </div>
          <div className="flex gap-1.5">
            {[1,2,3,4,5].map((i) => (
              <div key={i} className="h-3 flex-1 rounded-full bg-green-400" />
            ))}
          </div>
        </div>

        {/* Section 1 — Surprising fact */}
        {fact && (
          <div className="bg-white rounded-3xl shadow-sm border border-purple-100 p-5 mb-4">
            <p className="text-xs font-bold text-purple-500 uppercase tracking-wider mb-2">🤯 Did you know…</p>
            <p className="text-gray-700 text-base leading-relaxed">{fact}</p>
          </div>
        )}

        {/* Section 2 — Clickable questions */}
        {(q1 || q2) && (
          <div className="bg-white rounded-3xl shadow-sm border border-blue-100 p-5 mb-4">
            <p className="text-xs font-bold text-blue-500 uppercase tracking-wider mb-3">🤔 This makes you think…</p>
            <div className="flex flex-col gap-3">
              {[q1, q2].filter(Boolean).map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleCuriosityClick(q)}
                  className="text-left w-full bg-blue-50 hover:bg-blue-100 border border-blue-200 hover:border-blue-400 rounded-2xl px-4 py-3 text-blue-800 font-semibold text-sm leading-snug transition-all hover:scale-[1.02] active:scale-95 group"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span>{q}</span>
                    <span className="text-blue-400 group-hover:text-blue-600 text-base shrink-0">Explore →</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Section 3 — Real-world observation */}
        {observe && (
          <div className="bg-white rounded-3xl shadow-sm border border-green-100 p-5 mb-8">
            <p className="text-xs font-bold text-green-600 uppercase tracking-wider mb-2">👀 Try noticing…</p>
            <p className="text-gray-700 text-base leading-relaxed">{observe}</p>
          </div>
        )}

        {/* Ask something new */}
        <button
          onClick={() => { setInput(""); goAsk(); }}
          className="w-full bg-purple-500 hover:bg-purple-600 hover:scale-105 active:scale-95 text-white font-black py-5 rounded-2xl text-xl transition-all shadow-md"
        >
          Ask something new 🦘
        </button>
      </div>
    );
  }

  // ── Ask / Loading / Blocked / Error ───────────────────────────────────────
  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100">
      <div className="max-w-lg mx-auto min-h-[100dvh] px-4 pt-4 pb-8">
        <FamilyTopBar
          activeChild={activeChild}
          onOpenJourney={onOpenJourney}
          onOpenParentPortal={onOpenParentPortal}
          currentView="app"
        />

        {/* Header */}
        <div className="text-center mb-6 mt-4">
          <h1 className="text-4xl font-black text-purple-700 mb-2">
            <span className="inline-block animate-bounce-3s">🦘</span> Whyroo
          </h1>
          <p className="text-gray-500 text-lg">Ask anything and turn why into wow.</p>
        </div>

        {/* Input card — always visible unless loading */}
        {screen === "ask" && (
          <div className="bg-white rounded-3xl shadow-lg p-5 mb-5 border-2 border-purple-100">
            <textarea
              className="w-full border-2 border-purple-100 focus:border-purple-400 bg-purple-50 focus:bg-white rounded-2xl p-4 text-base text-gray-800 resize-none outline-none transition-all"
              rows={3}
              placeholder="What are you curious about? e.g. Why is the ocean salty?"
              maxLength={MAX_INPUT_LENGTH}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
            <div className="flex justify-between items-center mt-1 mb-3 px-1 min-h-[1.25rem]">
              {input.trim().split(/\s+/).filter(Boolean).length > 0 && input.trim().split(/\s+/).filter(Boolean).length < 3 ? (
                <span className="text-xs text-amber-500 font-semibold">💡 Try a full question — e.g. <em>Why do we need food?</em></span>
              ) : (
                <span />
              )}
              <span className="text-xs text-gray-400 shrink-0 ml-2">{input.length}/{MAX_INPUT_LENGTH}</span>
            </div>
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isOutOfQuestions}
              className={`w-full text-white font-black py-5 rounded-2xl text-xl transition-all hover:scale-105 active:scale-95 shadow-md ${
                input.trim() && !isOutOfQuestions
                  ? "bg-purple-500 hover:bg-purple-600"
                  : "bg-purple-300 animate-pulse cursor-not-allowed"
              }`}
            >
              {isOutOfQuestions ? "Questions used for today" : "Explore →"}
            </button>

            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
              {billingLoading ? (
                <p className="text-xs font-medium text-emerald-700">Checking questions left...</p>
              ) : isOverrideAccess ? (
                <p className="text-xs font-medium text-emerald-700">Whyroo Unlimited is active.</p>
              ) : (
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-emerald-800">
                      <span className="font-bold">{questionsLeftToday}/{dailyLimit}</span> questions left today
                    </p>
                    <button
                      onClick={onOpenParentPortal}
                      className="text-xs font-semibold text-emerald-800 underline underline-offset-2 hover:text-emerald-900 shrink-0"
                    >
                      Ask a grown-up
                    </button>
                  </div>
                  {isOutOfQuestions && (
                    <p className="text-[11px] text-emerald-700 mt-1">Resets at midnight.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Inspiration chips — only shown on ask screen */}
        {screen === "ask" && (
          <div className="mb-6">
            <p className="text-center text-xs font-bold text-purple-400 uppercase tracking-widest mb-3">✨ Try one of these</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {[
                { emoji: "🦕", label: "Dinosaurs",      q: "Why did dinosaurs go extinct?" },
                { emoji: "🌊", label: "Ocean",           q: "Why is the ocean salty?" },
                { emoji: "⚡", label: "Lightning",       q: "How does lightning work?" },
                { emoji: "🧠", label: "Memory",          q: "How does our brain remember things?" },
                { emoji: "🌙", label: "The Moon",        q: "Why does the moon change shape?" },
                { emoji: "🦋", label: "Butterflies",     q: "How does a caterpillar turn into a butterfly?" },
              ].map(({ emoji, label, q }) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); }}
                  className="flex items-center gap-1.5 bg-white hover:bg-purple-50 border-2 border-purple-100 hover:border-purple-300 text-gray-700 font-semibold text-sm px-3 py-2 rounded-2xl transition-all hover:scale-105 active:scale-95 shadow-sm"
                >
                  <span>{emoji}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {screen === "loading" && <LoadingCard />}

        {/* Blocked */}
        {screen === "blocked" && (
          <div className="bg-orange-50 border-2 border-orange-200 rounded-3xl p-8 text-center">
            <p className="text-5xl mb-3">😊</p>
            <p className="text-orange-700 font-bold text-lg leading-snug mb-5">
              Let's explore something fun and safe instead 😊
            </p>
            <button
              onClick={goAsk}
              className="bg-orange-400 hover:bg-orange-500 text-white font-bold py-3 px-8 rounded-2xl transition-all"
            >
              Try a different question
            </button>
          </div>
        )}

        {/* Error */}
        {screen === "error" && (
          <div className="bg-white border-2 border-gray-200 rounded-3xl p-8 text-center">
            <p className="text-5xl mb-3">😊</p>
            {quotaReached ? (
              <>
                <p className="text-gray-700 font-bold text-lg mb-2">Great exploring today! 🌟</p>
                <p className="text-gray-500 font-semibold text-base mb-6">
                  {errorMsg} Ask a grown-up to unlock Whyroo Unlimited.
                </p>
                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left">
                  <p className="text-xs font-semibold text-amber-800">🔒 More questions are locked for now.</p>
                  <p className="text-xs text-amber-700 mt-1">Your question meter resets at midnight.</p>
                </div>
                <button
                  onClick={onOpenParentPortal}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-8 rounded-2xl transition-all"
                >
                  Ask a grown-up
                </button>
                <button
                  onClick={goAsk}
                  className="w-full mt-3 bg-white border border-gray-200 hover:border-gray-300 text-gray-600 font-bold py-3 px-8 rounded-2xl transition-all"
                >
                  Back
                </button>
              </>
            ) : (
              <>
                <p className="text-gray-600 font-bold text-lg mb-5">{errorMsg}</p>
                <button
                  onClick={goAsk}
                  className="bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-8 rounded-2xl transition-all"
                >
                  Try again 🔄
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

