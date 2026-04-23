"use client";

import { useState } from "react";

interface InviteCodeDialogProps {
  onSubmit: (code: string) => void;
}

/**
 * Modal dialog that asks the user for a testnet invite code.
 *
 * Shown when the paymaster rejects a sender as "not whitelisted".
 * The invite code is passed in the ERC-7677 context to whitelist
 * the sender — after one successful call, future calls work without it.
 */
export function InviteCodeDialog({ onSubmit }: InviteCodeDialogProps) {
  const [code, setCode] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.trim()) {
      onSubmit(code.trim());
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
        <h3 className="text-sm font-semibold text-primary-900">
          Invite Code Required
        </h3>
        <p className="mt-2 text-sm text-neutral-500">
          This testnet requires an invite code for gas sponsorship. Enter your
          code below to whitelist your account.
        </p>
        <form onSubmit={handleSubmit} className="mt-4">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. a3f1b2c4"
            autoFocus
            className="w-full rounded-md border border-neutral-300 px-3 py-2 font-mono text-sm text-primary-900 placeholder:text-neutral-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
          />
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={!code.trim()}
              className="rounded-lg bg-accent-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-600 transition-colors disabled:opacity-50"
            >
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
