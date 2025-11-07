import { Authenticated, Unauthenticated, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { SignInForm } from "./SignInForm";
import { SignOutButton } from "./SignOutButton";
import { Toaster } from "sonner";
import VoiceAssistant from "./VoiceAssistant";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-blue-50 to-indigo-100">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm h-16 flex justify-between items-center border-b shadow-sm px-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-bold">🎤</span>
          </div>
          <h2 className="text-xl font-semibold text-gray-800">Voice Assistant AI</h2>
        </div>
        <SignOutButton />
      </header>
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-4xl mx-auto">
          <Content />
        </div>
      </main>
      <Toaster />
    </div>
  );
}

function Content() {
  const loggedInUser = useQuery(api.auth.loggedInUser);

  if (loggedInUser === undefined) {
    return (
      <div className="flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-800 mb-4">
          Intelligent Voice Assistant
        </h1>
        <Authenticated>
          <p className="text-lg text-gray-600 mb-2">
            Welcome back, {loggedInUser?.email ?? "friend"}!
          </p>
          <p className="text-sm text-gray-500">
            Speak naturally - I understand sentiment, intent, and context
          </p>
        </Authenticated>
        <Unauthenticated>
          <p className="text-lg text-gray-600">
            Sign in to start your intelligent conversation
          </p>
        </Unauthenticated>
      </div>

      <Unauthenticated>
        <div className="max-w-md mx-auto">
          <SignInForm />
        </div>
      </Unauthenticated>

      <Authenticated>
        <VoiceAssistant />
      </Authenticated>
    </div>
  );
}
