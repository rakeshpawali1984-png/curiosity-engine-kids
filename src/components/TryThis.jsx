export default function TryThis({ text }) {
  if (!text) return null;

  return (
    <p className="mt-4 text-sm text-slate-600">
      <span className="font-bold text-slate-700">Try this:</span> {text}
    </p>
  );
}
