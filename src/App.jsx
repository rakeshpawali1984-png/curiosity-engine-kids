import { useState } from "react";
import { topics } from "./data/topics";
import { topicsGptRaw } from "./data/topicsgpt.js";
import { normalizeTopicsGpt } from "./data/normalize";
import HomeScreen from "./components/HomeScreen";

const topicsGpt = normalizeTopicsGpt(topicsGptRaw);
import StoryScreen from "./components/StoryScreen";
import ExplanationScreen from "./components/ExplanationScreen";
import ActivityScreen from "./components/ActivityScreen";
import QuizScreen from "./components/QuizScreen";
import BadgeScreen from "./components/BadgeScreen";

export default function App() {
  const [screen, setScreen] = useState("home");
  const [currentTopic, setCurrentTopic] = useState(null);
  const [pack, setPack] = useState("original"); // "original" | "gpt"

  const activePack = pack === "original" ? topics : topicsGpt;

  const selectTopic = (topic) => {
    setCurrentTopic(topic);
    setScreen("story");
  };

  const goHome = () => {
    setScreen("home");
    setCurrentTopic(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100">
      <div className="max-w-lg mx-auto min-h-screen px-4 py-6">
        {screen === "home" && (
          <HomeScreen
            topics={activePack}
            pack={pack}
            onPackChange={setPack}
            onSelect={selectTopic}
          />
        )}

        {screen === "story" && (
          <StoryScreen
            topic={currentTopic}
            onNext={() => setScreen("explanation")}
            onHome={goHome}
          />
        )}

        {screen === "explanation" && (
          <ExplanationScreen
            topic={currentTopic}
            onNext={() => setScreen("activity")}
            onHome={goHome}
          />
        )}

        {screen === "activity" && (
          <ActivityScreen
            topic={currentTopic}
            onNext={() => setScreen("quiz")}
            onHome={goHome}
          />
        )}

        {screen === "quiz" && (
          <QuizScreen
            key={currentTopic.id}
            topic={currentTopic}
            onHome={goHome}
            onComplete={() => setScreen("badge")}
          />
        )}

        {screen === "badge" && (
          <BadgeScreen topic={currentTopic} onHome={goHome} />
        )}
      </div>
    </div>
  );
}
