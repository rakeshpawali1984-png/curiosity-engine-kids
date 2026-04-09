import { useState } from "react";
import ProgressBar from "./ProgressBar";

export default function QuizScreen({ topic, onComplete, onHome }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const question = topic.quiz[index];
  const isLastQuestion = index === topic.quiz.length - 1;

  const handleAnswer = (value) => {
    if (showFeedback) return;
    setSelected(value);
    setShowFeedback(true);
  };

  const handleNext = () => {
    if (isLastQuestion) {
      onComplete();
    } else {
      setIndex((i) => i + 1);
      setSelected(null);
      setShowFeedback(false);
    }
  };

  // Returns true/false/null (null = open question, not graded)
  const isCorrect =
    question.type === "open"
      ? null
      : selected === question.answer;

  return (
    <div>
      <button onClick={onHome} className="mb-4 flex items-center gap-1 text-gray-400 hover:text-purple-600 font-semibold text-base transition-colors">
        ← Home
      </button>
      <ProgressBar step={4} />

      {/* Question counter */}
      <div className="flex justify-between items-center mb-4 px-1">
        <span className="text-base font-bold text-gray-500">
          Question {index + 1} of {topic.quiz.length}
        </span>
        <span className="text-sm font-semibold text-purple-500">
          {question.type === "mcq"
            ? "📋 Pick one"
            : question.type === "truefalse"
            ? "👍👎 True or False?"
            : "💬 Think & Share"}
        </span>
      </div>

      <div className="bg-white rounded-3xl shadow-lg p-6 mb-4">
        <p className="text-xl font-bold text-gray-800 mb-6 leading-snug">
          {question.question}
        </p>

        {/* MCQ Options */}
        {question.type === "mcq" && (
          <div className="space-y-3">
            {question.options.map((option, i) => {
              let cls =
                "w-full text-left p-4 rounded-2xl text-base font-semibold border-2 transition-all ";
              if (!showFeedback) {
                cls += "border-gray-200 hover:border-purple-400 hover:bg-purple-50 active:scale-95";
              } else if (i === question.answer) {
                cls += "border-green-400 bg-green-50 text-green-700";
              } else if (i === selected && i !== question.answer) {
                cls += "border-red-400 bg-red-50 text-red-600";
              } else {
                cls += "border-gray-100 text-gray-400 bg-gray-50";
              }
              return (
                <button
                  key={i}
                  onClick={() => handleAnswer(i)}
                  disabled={showFeedback}
                  className={cls}
                >
                  {option}
                </button>
              );
            })}
          </div>
        )}

        {/* True / False */}
        {question.type === "truefalse" && (
          <div className="flex gap-4">
            {[true, false].map((val) => {
              let cls =
                "flex-1 py-5 rounded-2xl text-lg font-black border-2 transition-all ";
              if (!showFeedback) {
                cls += "border-gray-200 hover:border-purple-400 hover:bg-purple-50 active:scale-95";
              } else if (val === question.answer) {
                cls += "border-green-400 bg-green-50 text-green-700";
              } else if (val === selected && val !== question.answer) {
                cls += "border-red-400 bg-red-50 text-red-600";
              } else {
                cls += "border-gray-100 text-gray-400";
              }
              return (
                <button
                  key={String(val)}
                  onClick={() => handleAnswer(val)}
                  disabled={showFeedback}
                  className={cls}
                >
                  {val ? "✅ True" : "❌ False"}
                </button>
              );
            })}
          </div>
        )}

        {/* Open Question */}
        {question.type === "open" && (
          <div>
            {!showFeedback ? (
              <button
                onClick={() => handleAnswer("shown")}
                className="w-full p-4 rounded-2xl text-base font-semibold bg-yellow-100 hover:bg-yellow-200 border-2 border-yellow-300 text-yellow-700 transition-all active:scale-95"
              >
                💡 Show a Hint / Sample Answer
              </button>
            ) : (
              <div className="bg-yellow-50 border-2 border-yellow-200 rounded-2xl p-4">
                <p className="text-xs text-yellow-600 font-bold uppercase mb-1">
                  Sample Answer
                </p>
                <p className="text-yellow-800 text-base font-medium leading-snug">
                  {question.answer}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Feedback banner */}
        {showFeedback && question.type !== "open" && (
          <div
            className={`mt-5 p-4 rounded-2xl text-center font-black text-lg ${
              isCorrect
                ? "bg-green-100 text-green-600"
                : "bg-orange-100 text-orange-500"
            }`}
          >
            {isCorrect ? "🎉 Nice one!" : "Hmm… not quite — you've got this!"}
          </div>
        )}
        {showFeedback && question.type === "open" && (
          <div className="mt-5 p-4 rounded-2xl text-center font-bold text-lg bg-purple-50 text-purple-600">
            ✨ Every answer is a great answer!
          </div>
        )}
      </div>

      {/* Next button — only shows after answering */}
      {showFeedback && (
        <button
          onClick={handleNext}
          className="w-full bg-purple-500 hover:bg-purple-600 hover:scale-105 active:scale-95 text-white font-black py-5 rounded-2xl text-xl transition-all shadow-md"
        >
          {isLastQuestion
            ? "🏆 Get My Badge!"
            : isCorrect
            ? "Nice! Next →"
            : "Keep going →"}
        </button>
      )}
    </div>
  );
}
