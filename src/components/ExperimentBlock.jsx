export default function ExperimentBlock({ activity, onDone }) {
  const steps = Array.isArray(activity?.steps) ? activity.steps : [];

  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-green-700">Experiment</p>
        <h2 className="text-2xl font-black text-slate-800 leading-tight">{activity?.title || "Try it now"}</h2>
        <p className="text-sm text-slate-600">Do this now and see the idea in action.</p>
      </div>

      <div className="space-y-3">
        {steps.map((step, index) => (
          <div key={`${step}-${index}`} className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500 text-sm font-black text-white">
              {index + 1}
            </div>
            <p className="text-lg leading-relaxed text-gray-700">{step}</p>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onDone}
        className="w-full rounded-2xl bg-green-500 px-5 py-6 text-xl font-bold text-white transition-all shadow-md hover:bg-green-600 hover:scale-[1.02] active:scale-95"
      >
        I tried it →
      </button>
    </section>
  );
}
