export const MAX_CHILD_INTERESTS = 5;

export const INTEREST_SUGGESTIONS = [
  "Cricket",
  "Tennis",
  "Football",
  "Swimming",
  "Basketball",
  "Dance",
  "Music",
  "Drawing",
  "Animals",
  "Space",
  "Dinosaurs",
  "Cooking",
];

const INTEREST_ALIASES = {
  soccer: "football",
  futbol: "football",
  footy: "football",
  swim: "swimming",
  art: "drawing",
  painting: "drawing",
  singing: "music",
  piano: "music",
  guitar: "music",
  pets: "animals",
  astronomy: "space",
  stars: "space",
};

const INTEREST_QUESTION_BANK = {
  cricket: [
    "Why does a cricket ball swing more when one side stays shiny?",
    "Why do spinners change speed if they are bowling the same spin?",
    "Why does timing beat power in many cricket shots?",
    "Why do fielders stand in different places for each batter?",
    "Why is it harder to bat against bounce on some pitches?",
    "Why do fast bowlers use run-up rhythm before bowling?",
    "Why does seam position matter after the ball lands?",
    "Why do captains rotate bowlers even when one is doing well?",
    "Why can the same shot be safe in one over but risky in another?",
    "Why do players leave some balls instead of hitting everything?",
  ],
  tennis: [
    "Why does topspin make the ball dip faster into the court?",
    "Why do players stand wide on some serves but not others?",
    "Why is footwork so important before a tennis shot?",
    "Why do players hit cross-court more often than down the line?",
    "Why does racket string tension change how shots feel?",
    "Why can a slower serve still win points with good placement?",
    "Why do players mix high balls and low slices in a rally?",
    "Why does the toss matter so much on serve?",
    "Why do players recover to the middle after each shot?",
    "Why does reading an opponent early help in long rallies?",
  ],
  football: [
    "Why do teams switch between short passes and long passes?",
    "Why is first touch so important in football?",
    "Why do players make runs even when they may not get the ball?",
    "Why do defenders stay compact instead of chasing everywhere?",
    "Why can ball movement be faster than dribbling?",
    "Why do goalkeepers position themselves before the shot happens?",
    "Why is scanning the field useful before receiving the ball?",
    "Why do coaches talk so much about spacing?",
    "Why does pressing work better when teammates press together?",
    "Why can a simple pass be the smartest play?",
  ],
  swimming: [
    "Why does body position change how fast you move in water?",
    "Why do swimmers exhale underwater before turning to breathe?",
    "Why can a strong kick help even in upper-body strokes?",
    "Why do streamlines matter right after a push-off?",
    "Why do swimmers count strokes in some training sets?",
    "Why does looking down help balance in freestyle?",
    "Why do flip turns save time in races?",
    "Why does relaxed technique often beat splashing harder?",
    "Why do swimmers warm up before trying top speed?",
    "Why is rhythm between arms and breathing so important?",
  ],
  basketball: [
    "Why does spacing create better shots in basketball?",
    "Why do players use bounce passes in traffic?",
    "Why is balance important when shooting?",
    "Why do teams set screens to free a teammate?",
    "Why can quick ball movement beat a strong defender?",
    "Why do players bend knees before a jump shot?",
    "Why is defense often about angles, not just speed?",
    "Why do coaches value rebounds so much?",
    "Why does pacing the game affect scoring chances?",
    "Why do players fake passes or shots?",
  ],
  dance: [
    "Why does counting beats help dancers stay in sync?",
    "Why do dancers practice slowly before full speed?",
    "Why is posture important in almost every dance style?",
    "Why do choreographers repeat movement patterns?",
    "Why can expression change how the same move feels?",
    "Why do transitions between moves matter so much?",
    "Why do dancers use mirrors during practice?",
    "Why does core strength help with balance?",
    "Why does timing with music matter more than big moves?",
    "Why do warm-ups reduce injury risk in dance?",
  ],
  music: [
    "Why does rhythm help us remember songs so easily?",
    "Why do some notes sound happy and others sound tense?",
    "Why does practice in short sessions often work best?",
    "Why do musicians use scales before playing songs?",
    "Why does tempo change the feeling of the same tune?",
    "Why do harmonies sound richer than one note alone?",
    "Why do drummers count before everyone starts together?",
    "Why can silence make a song more powerful?",
    "Why does breathing matter for singing and wind instruments?",
    "Why do musicians listen to each other while performing?",
  ],
  drawing: [
    "Why does light direction change how a drawing looks?",
    "Why do artists sketch simple shapes before details?",
    "Why can shadows make flat drawings look 3D?",
    "Why do proportions matter when drawing people or animals?",
    "Why do artists use different line thicknesses?",
    "Why does perspective make far objects look smaller?",
    "Why do color choices change mood in art?",
    "Why is observing first better than rushing to draw?",
    "Why do artists erase and redraw so often?",
    "Why do tiny highlights make objects look real?",
  ],
  animals: [
    "Why do different animals have such different eye shapes?",
    "Why do some animals live in groups while others stay alone?",
    "Why do predators and prey move differently?",
    "Why do some animals migrate huge distances?",
    "Why do animal ears and tails help with communication?",
    "Why do habitats shape how animals behave?",
    "Why are camouflage patterns useful in nature?",
    "Why do baby animals often learn by play?",
    "Why do some animals sleep during the day and hunt at night?",
    "Why do food chains stay balanced in healthy ecosystems?",
  ],
  space: [
    "Why do planets stay in orbit instead of flying away?",
    "Why does the Moon show different shapes each month?",
    "Why do astronauts float in space stations?",
    "Why are some stars much brighter than others?",
    "Why does Mars look red?",
    "Why can rockets not just fly straight up forever?",
    "Why are day and night lengths different on other planets?",
    "Why do eclipses only happen at certain times?",
    "Why do scientists use telescopes in space and on Earth?",
    "Why are there seasons on Earth?",
  ],
  dinosaurs: [
    "Why were some dinosaurs enormous while others stayed small?",
    "Why do scientists think birds are related to dinosaurs?",
    "Why are dinosaur teeth clues to what they ate?",
    "Why were long necks useful for some dinosaurs?",
    "Why are footprints and fossils both important clues?",
    "Why did some dinosaurs have armor or horns?",
    "Why do we find more fossils in some places than others?",
    "Why did dinosaur babies need different survival skills than adults?",
    "Why are there still debates about dinosaur colors?",
    "Why do extinction events affect some species more than others?",
  ],
  cooking: [
    "Why does heat change food texture and taste?",
    "Why do we mix dry and wet ingredients separately in some recipes?",
    "Why does dough rise when yeast is used?",
    "Why does caramelization make food taste sweeter?",
    "Why does salt make many foods taste stronger?",
    "Why do chefs taste while cooking?",
    "Why does chopping size change cooking time?",
    "Why can resting food after cooking improve flavor?",
    "Why do oils behave differently at high heat?",
    "Why do some dishes need exact measurements while others do not?",
  ],
};

const INTEREST_DEEP_DIVE_TEMPLATES = {
  more_questions: [
    "What is one more surprising idea kids often discover about {interest}?",
    "Why do the smartest questions in {interest} usually start with one tiny detail?",
    "What part of {interest} looks simple at first but is actually tricky?",
    "How do people get better at noticing hidden patterns in {interest}?",
    "What is a really good {interest} question that most beginners never think to ask?",
    "What changes in {interest} when someone starts paying attention more carefully?",
  ],
  how_it_works: [
    "What are the first big ideas someone should understand about how {interest} works?",
    "How do cause and effect show up in {interest}?",
    "What invisible forces or rules help explain {interest}?",
    "Why does technique matter so much in how {interest} works?",
    "What small change can totally change what happens in {interest}?",
    "How do experts break {interest} into simple parts they can understand?",
  ],
  amazing_facts: [
    "What is one weird or amazing fact about {interest} that sounds almost impossible?",
    "What makes {interest} more surprising than most kids expect?",
    "What is a fun fact about {interest} that has a real scientific reason behind it?",
    "What unusual thing in {interest} makes people say wow?",
    "What is one unforgettable fact about {interest} that is actually true?",
    "What is the coolest hidden detail about {interest}?",
  ],
  next_level: [
    "What is a slightly harder {interest} idea that a curious kid could understand next?",
    "What deeper question helps kids level up in {interest}?",
    "What makes advanced thinking in {interest} different from beginner thinking?",
    "What is a next-level {interest} idea that connects lots of smaller ideas together?",
    "What is one tricky part of {interest} that becomes exciting once you understand it?",
    "What should a kid explore after they already know the basics of {interest}?",
  ],
};

export function normalizeInterest(value) {
  const trimmed = String(value || "").trim().toLowerCase();
  if (!trimmed) return "";
  const normalized = trimmed.replace(/\s+/g, " ");
  return INTEREST_ALIASES[normalized] || normalized;
}

export function formatInterestLabel(value) {
  const normalized = normalizeInterest(value);
  if (!normalized) return "";
  return normalized
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function sanitizeInterests(values) {
  const input = Array.isArray(values) ? values : [];
  const out = [];
  const seen = new Set();

  for (const value of input) {
    const normalized = normalizeInterest(value);
    if (!normalized) continue;
    if (normalized.length > 40) continue;
    if (seen.has(normalized)) continue;
    out.push(normalized);
    seen.add(normalized);
    if (out.length >= MAX_CHILD_INTERESTS) break;
  }

  return out;
}

export function hasCuratedInterestQuestions(interest) {
  const normalized = normalizeInterest(interest);
  return Boolean(normalized && Array.isArray(INTEREST_QUESTION_BANK[normalized]) && INTEREST_QUESTION_BANK[normalized].length);
}

export function getInterestQuestionTriggers(interests, limit = 10) {
  const normalizedInterests = sanitizeInterests(interests);
  if (!normalizedInterests.length) return [];

  const pools = normalizedInterests.map((interest) => {
    const questions = INTEREST_QUESTION_BANK[interest] || [];
    return {
      interest,
      label: formatInterestLabel(interest),
      questions,
      index: 0,
    };
  });

  const fallback = [
    "Why do small changes in practice make a big difference over time?",
    "Why is asking better questions one of the fastest ways to learn?",
    "Why do experts spend so much time on simple basics?",
  ];

  const triggers = [];
  let guard = 0;
  while (triggers.length < limit && guard < 200) {
    guard += 1;
    for (const pool of pools) {
      if (triggers.length >= limit) break;
      const q = pool.questions[pool.index] || fallback[pool.index % fallback.length];
      pool.index += 1;
      triggers.push({
        id: `${pool.interest}-${pool.index}`,
        interest: pool.interest,
        interestLabel: pool.label,
        question: q,
      });
    }
  }

  return triggers.slice(0, limit);
}

export function getInterestGuidedQuestions(interest, category, limit = 6) {
  const normalizedInterest = normalizeInterest(interest);
  if (!normalizedInterest) return [];

  const interestLabel = formatInterestLabel(normalizedInterest);
  const interestLower = interestLabel.toLowerCase();
  const templates = INTEREST_DEEP_DIVE_TEMPLATES[category] || INTEREST_DEEP_DIVE_TEMPLATES.more_questions;

  return templates.slice(0, limit).map((template, index) => ({
    id: `${normalizedInterest}-${category}-${index + 1}`,
    interest: normalizedInterest,
    interestLabel,
    question: template.replaceAll("{interest}", interestLower),
  }));
}