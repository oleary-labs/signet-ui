"use client";

import Link from "next/link";
import { useSignetAuth } from "@/hooks/useSignetAuth";
import type { AuthStatus } from "@/providers/signetAuth";

const STATUS_LABELS: Partial<Record<AuthStatus, string>> = {
  oauth: "Redirecting to Google...",
  "session-key": "Generating session key...",
  proving: "Generating zero-knowledge proof...",
  registering: "Registering with network...",
};

export function Header() {
  const { isAuthenticated, claims, signIn, signOut, status, error } = useSignetAuth();

  const isInProgress =
    status === "oauth" ||
    status === "session-key" ||
    status === "proving" ||
    status === "registering";

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
              <span className="text-sm text-neutral-500">
                {claims?.email ?? claims?.sub}
              </span>
              <button
                onClick={signOut}
                className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-primary-700 hover:border-neutral-400 transition-colors"
              >
                Sign Out
              </button>
            </div>
          ) : isInProgress ? (
            <AuthProgress status={status} />
          ) : status === "error" ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-error-500" title={error?.message}>
                Sign in failed
              </span>
              <button
                onClick={signOut}
                className="text-sm text-neutral-500 hover:text-primary-800 transition-colors"
              >
                Clear
              </button>
              <button
                onClick={signIn}
                className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-white hover:bg-accent-600 transition-colors"
              >
                Retry
              </button>
            </div>
          ) : (
            <button
              onClick={signIn}
              className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-medium text-white hover:bg-accent-600 transition-colors"
            >
              Sign In
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function AuthProgress({ status }: { status: AuthStatus }) {
  const label = STATUS_LABELS[status] ?? "Signing in...";
  const isProving = status === "proving";

  return (
    <div className="flex items-center gap-3">
      <div
        className={`h-4 w-4 rounded-full border-2 border-t-transparent animate-spin ${
          isProving ? "border-accent-500" : "border-neutral-400"
        }`}
      />
      <div className="flex flex-col">
        <span
          className={`text-sm font-medium ${
            isProving ? "text-accent-600" : "text-neutral-600"
          }`}
        >
          {label}
        </span>
        {isProving && (
          <span className="text-xs text-neutral-400">
            Proving JWT validity without revealing credentials
          </span>
        )}
      </div>
    </div>
  );
}
