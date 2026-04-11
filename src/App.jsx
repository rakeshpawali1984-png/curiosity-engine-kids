import { useState } from "react";
import { topics } from "./data/topics";
import { topicsSparkRaw } from "./data/topics-spark.js";
import { normalizeTopicsSpark } from "./data/normalize";
import HomeScreen from "./components/HomeScreen";
import StoryScreen from "./components/StoryScreen";
import ExplanationScreen from "./components/ExplanationScreen";
import ActivityScreen from "./components/ActivityScreen";
import QuizScreen from "./components/QuizScreen";
import BadgeScreen from "./components/BadgeScreen";
import CuriousScreen from "./components/CuriousScreen";

const topicsSpark = normalizeTopicsSpark(topicsSparkRaw);

export default function App() {
  // Secret hidden route — not linked anywhere in the main UI
  if (window.location.pathname === "/get-curious") {
    return <CuriousScreen />;
  }
  return <MainApp />;
}

function MainApp() {
  const [screen, setScreen] = useState("home");
  const [currentTopic, setCurrentTopic] = useState(null);
  const [pack, setPack] = useState("original"); // "original" | "spark"

  const activePack = pack === "original" ? topics : topicsSpark;

  const selectTopic = (topic) => {
    setCurrentTopic(topic);
    setScreen("story");
  };

  const goHome = () => {
    setScreen("home");
    setCurrentTopic(null);
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100">
      <div className="max-w-lg mx-auto min-h-[100dvh] px-4 pt-4 pb-8">
        <div key={screen} className="screen-enter">
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
    </div>
  );
}
