"use client";

import { LogIn, LogOut } from "lucide-react";
import { signIn, signOut } from "next-auth/react";

export function SignInButton() {
  return (
    <button
      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 font-bold text-slate-950 transition hover:bg-sky-100"
      onClick={() => void signIn("google")}
    >
      <LogIn className="h-4 w-4" />
      Continue with Google
    </button>
  );
}

export function SignOutButton() {
  return (
    <button
      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-200 transition hover:bg-white/10"
      onClick={() => void signOut()}
    >
      <LogOut className="h-4 w-4" />
      Sign out
    </button>
  );
}
