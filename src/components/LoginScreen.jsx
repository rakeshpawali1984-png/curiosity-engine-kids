import { signInWithGoogle } from "../lib/familyData";

export default function LoginScreen() {
  const handleGoogleLogin = async () => {
    try {
      await signInWithGoogle();
    } catch (e) {
      // Keep UX simple for now; surface a basic alert in local dev.
      alert(e.message || "Could not start Google login");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-sky-100 via-purple-50 to-pink-100">
      <div className="max-w-lg mx-auto min-h-[100dvh] px-4 py-10 flex items-center">
        <div className="w-full bg-white rounded-3xl shadow-lg p-7 border border-purple-100">
          <button
            onClick={() => {
              window.location.href = "/";
            }}
            className="mb-4 text-sm font-bold text-purple-600 hover:text-purple-700 transition-colors"
          >
            ← Back to Home
          </button>

          <p className="text-xs font-bold uppercase tracking-widest text-purple-500 mb-2">
            Parent Login
          </p>
          <h1 className="text-3xl font-black text-gray-800 mb-3">
            Welcome to Curiosity Engine
          </h1>
          <p className="text-gray-500 text-base mb-6">
            Sign in with Google to create child profiles and keep each child&apos;s discoveries and badges separate.
          </p>

          <button
            onClick={handleGoogleLogin}
            className="w-full bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-300 rounded-2xl px-5 py-4 font-bold text-gray-700 transition-all active:scale-95"
          >
            Continue with Google
          </button>

          <button
            onClick={() => {
              window.location.href = "/demo";
            }}
            className="w-full mt-3 bg-purple-50 hover:bg-purple-100 border-2 border-purple-200 hover:border-purple-300 rounded-2xl px-5 py-4 font-bold text-purple-700 transition-all active:scale-95"
          >
            Try demo without login
          </button>
        </div>
      </div>
    </div>
  );
}
