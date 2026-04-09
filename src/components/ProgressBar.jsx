const STEPS = ["📖 Story", "🧠 Learn", "🎮 Try", "🎯 Quiz", "🏆 Win"];

export default function ProgressBar({ step }) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500 font-medium">
          Step {step} of 5
        </span>
        <span className="text-sm font-bold text-purple-600">
          {STEPS[step - 1]}
        </span>
      </div>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className={`h-3 flex-1 rounded-full transition-all duration-300 ${
              i < step
                ? "bg-green-400"
                : i === step
                ? "bg-purple-500"
                : "bg-gray-200"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
