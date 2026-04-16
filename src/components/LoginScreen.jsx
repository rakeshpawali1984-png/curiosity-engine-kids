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
          <h1 className="text-3xl font-black text-gray-800 mb-2">
            Welcome to Whyroo
          </h1>
          <p className="text-gray-500 text-base mb-2">
            Create child profiles and track their learning journey.
          </p>
          <p className="text-xs text-slate-400 mb-6">🔒 Your child's data stays private. We never sell it.</p>

          <button
            onClick={handleGoogleLogin}
            className="w-full bg-white hover:bg-gray-50 border-2 border-gray-200 hover:border-gray-300 rounded-2xl px-5 py-4 font-bold text-gray-700 transition-all active:scale-95 flex items-center justify-center gap-3"
          >
            <svg width="20" height="20" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            Continue with Google
          </button>
        </div>
      </div>
    </div>
  );
}
