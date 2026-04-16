"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { handleOAuthCallback, getOAuthReturnTo } from "@/lib/signet-sdk";

/**
 * OAuth callback page.
 *
 * Google redirects here with ?code=...&state=...
 * We exchange the code via the SDK, store the JWT, and navigate back.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function process() {
      try {
        const jwt = await handleOAuthCallback("/api/auth/token");

        // Store the JWT for the auth provider to pick up on remount
        sessionStorage.setItem("signet_id_token", jwt);

        const returnTo = getOAuthReturnTo();
        window.location.replace(returnTo);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }

    process();
  }, [router]);

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="text-xl font-bold text-error-600">Sign In Failed</h1>
        <p className="mt-4 text-sm text-neutral-600">{error}</p>
        <button
          onClick={() => (window.location.href = "/")}
          className="mt-6 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 transition-colors"
        >
          Back to Home
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-24 text-center">
      <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-accent-200 border-t-accent-500" />
      <p className="mt-4 text-sm text-neutral-500">Completing sign in...</p>
    </div>
  );
}
