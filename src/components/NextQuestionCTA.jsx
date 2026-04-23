export default function NextQuestionCTA({ onClick, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-2xl px-5 py-6 text-xl font-bold transition-all shadow-md ${
        disabled
          ? "cursor-not-allowed bg-purple-300 text-white"
          : "bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.99]"
      }`}
    >
      Try another why? →
    </button>
  );
}
