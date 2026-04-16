"use client";

import Link from "next/link";
import { useSignetAuth } from "@/hooks/useSignetAuth";

export function Header() {
  const { isAuthenticated, account, signIn, signOut, status } = useSignetAuth();

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-lg font-semibold text-primary-900">
            Signet
          </Link>
          <nav className="flex items-center gap-6 text-sm text-neutral-500">
            <Link href="/" className="hover:text-primary-800 transition-colors">
              Providers
            </Link>
            {isAuthenticated && (
              <Link
                href="/dashboard"
                className="hover:text-primary-800 transition-colors"
              >
                Dashboard
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-neutral-500 font-mono">
                {account?.slice(0, 6)}...{account?.slice(-4)}
              </span>
              <button
                onClick={signOut}
                className="text-sm text-neutral-500 hover:text-primary-800 transition-colors"
              >
                Sign Out
              </button>
            </div>
          ) : (
            <button
              onClick={signIn}
              disabled={status === "authenticating"}
              className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-white hover:bg-accent-600 transition-colors disabled:opacity-50"
            >
              {status === "authenticating" ? "Signing in..." : "Sign In"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
