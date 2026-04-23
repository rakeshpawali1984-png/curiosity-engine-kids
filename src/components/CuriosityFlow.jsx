import { useEffect, useMemo, useState } from "react";
import StoryBlock from "./StoryBlock";
import MicroCheck from "./MicroCheck";

function clipSentences(text, maxSentences = 2) {
  const chunks = String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  return chunks.slice(0, maxSentences).join(" ");
}

function OptionalExtras({ topic }) {
  const [openKey, setOpenKey] = useState(null);

  const extras = [];
  if (topic?.wow) {
    extras.push({ key: "wow", icon: "🤯", label: "Did you know...", content: topic.wow });
  }
  if (Array.isArray(topic?.activity?.steps) && topic.activity.steps.length > 0) {
    extras.push({ key: "activity", icon: "🧪", label: "Try it!", steps: topic.activity.steps });
  }
  if (topic?.observe) {
    extras.push({ key: "observe", icon: "🕵️", label: "Real-world mission", content: topic.observe });
  }

  if (extras.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      {extras.map((extra) => {
        const isOpen = openKey === extra.key;
        return (
          <div key={extra.key} className="rounded-2xl border border-slate-200 overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenKey(isOpen ? null : extra.key)}
              className="w-full flex items-center justify-between px-4 py-3 text-left bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <span className="flex items-center gap-2 text-sm font-bold text-slate-700">
                <span>{extra.icon}</span>
                <span>{extra.label}</span>
              </span>
              <span className="text-slate-400 text-xs">{isOpen ? "▲" : "▼"}</span>
            </button>
            {isOpen && (
              <div className="px-4 py-3 bg-white border-t border-slate-100">
                {extra.key === "activity" ? (
                  <div className="space-y-2">
                    {extra.steps.map((step, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500 text-xs font-black text-white">{i + 1}</span>
                        <p className="text-sm text-gray-700 leading-snug">{step}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-700 leading-relaxed">{extra.content}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function CuriosityFlow({ topic, onMicroCheck, onNextQuestion, onAskOwnWhy }) {
  const [stage, setStage] = useState("learn");

  useEffect(() => {
    setStage("learn");
  }, [topic?.id]);

  const mergedCopy = useMemo(() => {
    const story = clipSentences(topic?.story || "", 2);
    const explanation = clipSentences(topic?.explanation || "", 2);
    const insight = clipSentences(topic?.keyLesson || topic?.explanation || "", 1);
    return { story, explanation, insight };
  }, [topic?.story, topic?.explanation, topic?.keyLesson]);

  return (
    <div className="bg-white rounded-3xl shadow-lg border border-purple-100 p-5 sm:p-6">
      {stage === "learn" && (
        <StoryBlock
          topic={{
            ...topic,
            story: mergedCopy.story,
            explanation: mergedCopy.explanation,
            keyLesson: mergedCopy.insight,
          }}
          onContinue={() => setStage("check")}
        />
      )}

      {stage === "check" && (
        <>
          <MicroCheck
            check={topic?.microCheck}
            topicTitle={topic?.title}
            keyIdea={mergedCopy.insight}
            onInteracted={onMicroCheck}
            onComplete={onAskOwnWhy ?? onNextQuestion}
          />
          <OptionalExtras topic={topic} />
        </>
      )}
    </div>
  );
}

