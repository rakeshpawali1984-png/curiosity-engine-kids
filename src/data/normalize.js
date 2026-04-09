// Maps topics-spark.js schema → app's internal schema

const EMOJI_MAP = {
  fat_energy: "🍔",
  cricket_bat: "🏏",
  dreams: "💭",
  rocket: "🚀",
  space_breathing: "👨‍🚀",
  orbit: "🌍",
};

function normalizeQuestion(q) {
  if (q.type === "mcq") {
    const answerIndex = q.options.indexOf(q.answer);
    return {
      type: "mcq",
      question: q.question,
      options: q.options,
      answer: answerIndex >= 0 ? answerIndex : 0,
    };
  }
  if (q.type === "true_false") {
    return {
      type: "truefalse",
      question: q.question,
      answer: q.answer === "True",
    };
  }
  // fill_blank and open both become open
  return {
    type: "open",
    question: q.question,
    answer: q.answer,
  };
}

export function normalizeTopicsSpark(rawTopics) {
  return rawTopics.map((t) => ({
    id: t.id,
    title: t.title,
    emoji: EMOJI_MAP[t.id] || "🌟",
    story: t.story,
    explanation: t.explanation,
    keyLesson: t.explanation.split(".")[0] + ".",
    activity: t.activity,
    quiz: t.quiz.map(normalizeQuestion),
    badge: t.badge,
  }));
}
