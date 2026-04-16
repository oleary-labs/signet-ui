"use client";

import { useContext } from "react";
import { SignetAuthContext } from "@/providers/signetAuth";

/**
 * Access the Signet authentication state.
 *
 * Provides:
 * - `isAuthenticated`: whether the user has an active session
 * - `account`: the user's SignetAccount address (if authenticated)
 * - `signIn`: initiate the OAuth → session key → SignetAccount flow
 * - `signOut`: clear the session
 * - `status`: "idle" | "authenticating" | "authenticated" | "error"
 */
export function useSignetAuth() {
  const context = useContext(SignetAuthContext);
  if (!context) {
    throw new Error("useSignetAuth must be used within a SignetAuthProvider");
  }
  return context;
}
