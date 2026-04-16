"use client";

import { createContext, useState, useCallback, type ReactNode } from "react";
import { type Address } from "viem";

type AuthStatus = "idle" | "authenticating" | "authenticated" | "error";

export interface SignetAuthState {
  status: AuthStatus;
  isAuthenticated: boolean;
  account: Address | null;
  error: Error | null;
  signIn: () => Promise<void>;
  signOut: () => void;
}

export const SignetAuthContext = createContext<SignetAuthState | null>(null);

/**
 * Provider for Signet authentication.
 *
 * Manages the OAuth → session key → SignetAccount lifecycle.
 * All child components can access auth state via useSignetAuth().
 *
 * TODO: Implement the full flow:
 * 1. OAuth popup/redirect with social provider
 * 2. Generate ephemeral session keypair
 * 3. POST to bootstrap group nodes /v1/auth
 * 4. Look up or create SignetAccount
 */
export function SignetAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [account, setAccount] = useState<Address | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const signIn = useCallback(async () => {
    try {
      setStatus("authenticating");
      setError(null);

      // TODO: replace with real OAuth → session key → bootstrap group flow
      // Mock: simulate a short delay then set a fake account
      await new Promise((r) => setTimeout(r, 600));
      setAccount("0x1234567890abcdef1234567890abcdef12345678" as Address);
      setStatus("authenticated");
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      setStatus("error");
    }
  }, []);

  const signOut = useCallback(() => {
    setAccount(null);
    setStatus("idle");
    setError(null);
    // TODO: clear session key material
  }, []);

  return (
    <SignetAuthContext.Provider
      value={{
        status,
        isAuthenticated: status === "authenticated",
        account,
        error,
        signIn,
        signOut,
      }}
    >
      {children}
    </SignetAuthContext.Provider>
  );
}
