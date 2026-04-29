"use client";

import Link from "next/link";
import { useSignetAuth } from "@/hooks/useSignetAuth";
import type { AuthStatus } from "@/providers/signetAuth";
import { useTxStatus, TX_STATUS_LABELS } from "@/providers/txStatus";
import { InviteCodeDialog } from "@/components/ui/InviteCodeDialog";

const STATUS_LABELS: Partial<Record<AuthStatus, string>> = {
  oauth: "Redirecting to Google...",
  "session-key": "Generating session key...",
  proving: "Generating zero-knowledge proof...",
  registering: "Registering with network...",
  keygen: "Preparing signing key...",
};

export function Header() {
  const { isAuthenticated, claims, signIn, signOut, status, error } = useSignetAuth();

  const isInProgress =
    status === "oauth" ||
    status === "session-key" ||
    status === "proving" ||
    status === "registering" ||
    status === "keygen";

  const txStatus = useTxStatus();

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
          {txStatus.current && <TxProgress />}
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-neutral-500">
                {claims?.email ?? claims?.sub}
              </span>
              <button
                onClick={() => { signOut(); window.location.href = "/"; }}
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
            Proving OAuth validity without revealing credentials
          </span>
        )}
      </div>
    </div>
  );
}

function TxProgress() {
  const { current, queueLength, dismiss, needsInviteCode, submitInviteCode } = useTxStatus();
  if (!current) return null;

  const isSuccess = current.status === "success";
  const isError = current.status === "error";
  const stepLabel = TX_STATUS_LABELS[current.status] ?? "";

  return (
    <div className="flex items-center gap-3">
      {isSuccess ? (
        <div className="h-4 w-4 rounded-full bg-success-500 flex items-center justify-center">
          <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
      ) : isError ? (
        <div className="h-4 w-4 rounded-full bg-error-500" />
      ) : (
        <div className="h-4 w-4 rounded-full border-2 border-accent-500 border-t-transparent animate-spin" />
      )}
      <div className="flex flex-col">
        <span className={`text-sm font-medium ${isError ? "text-error-600" : isSuccess ? "text-success-600" : "text-neutral-600"}`}>
          {current.label}
          {!isSuccess && !isError && (
            <span className="text-neutral-400 ml-1">{stepLabel}</span>
          )}
          {isSuccess && current.txHash && (
            <span className="text-neutral-400 ml-1 font-mono text-xs">
              {current.txHash.slice(0, 10)}...
            </span>
          )}
          {queueLength > 0 && (
            <span className="text-neutral-400 ml-1 text-xs">+{queueLength} queued</span>
          )}
        </span>
        {isError && current.error && (
          <span className="text-xs text-error-500 max-w-xs truncate">
            {current.error.message}
          </span>
        )}
      </div>
      {(isError || isSuccess) && (
        <button
          onClick={dismiss}
          className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors"
        >
          Dismiss
        </button>
      )}
      {needsInviteCode && <InviteCodeDialog onSubmit={submitInviteCode} />}
    </div>
  );
}
