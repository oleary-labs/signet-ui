"use client";

import { useState, useCallback } from "react";
import { SignInButton, SignOutButton, useUser, useAuth } from "@clerk/nextjs";
import { generateSessionKeypair } from "@/lib/signet-sdk/session";
import { generateJWTProof, getJWTModulusBytes } from "@/lib/signet-sdk/proof";
import { generateServerProof } from "@/lib/signet-sdk/server-prover";
import { authenticateWithBootstrap } from "@/lib/signet-sdk/bootstrap";
import { decodeIdToken } from "@/lib/signet-sdk/oauth";
import { keygen } from "@/lib/signet-sdk/keygen";
import { requestDelegation } from "@/lib/signet-sdk/delegate";
import { buildEIP712Scope, CHAIN_PRESETS } from "@/lib/signet-sdk/scopedSign";
import { env } from "@/config/env";
import type { SessionKeypair, IdTokenClaims } from "@/lib/signet-sdk/types";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Target group for the demo — should have Clerk's issuer registered
const DEMO_GROUP = env.bootstrapGroup;
const DEMO_NODES = env.bootstrapNodes;
const PROXY = "/api/node/proxy";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function X402DemoPage() {
  const { isSignedIn, user } = useUser();
  const { getToken } = useAuth();

  // Session state
  const [sessionKeypair, setSessionKeypair] = useState<SessionKeypair | null>(null);
  const [claims, setClaims] = useState<IdTokenClaims | null>(null);
  const [sessionStatus, setSessionStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Parent key
  const [parentKeyId, setParentKeyId] = useState<string | null>(null);
  const [parentAddress, setParentAddress] = useState<string | null>(null);
  const [parentStatus, setParentStatus] = useState<"idle" | "creating" | "done" | "error">("idle");

  // Sub-key
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [subKeyId, setSubKeyId] = useState<string | null>(null);
  const [subKeyAddress, setSubKeyAddress] = useState<string | null>(null);
  const [subKeyScope, setSubKeyScope] = useState<string | null>(null);
  const [subKeyStatus, setSubKeyStatus] = useState<"idle" | "creating" | "done" | "error">("idle");

  // Delegation
  const [delegationToken, setDelegationToken] = useState<string | null>(null);
  const [delegationExpiry, setDelegationExpiry] = useState(2592000); // 30 days
  const [delegateStatus, setDelegateStatus] = useState<"idle" | "minting" | "done" | "error">("idle");

  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ---------------------------------------------------------------------------
  // Establish Signet session from Clerk JWT
  // ---------------------------------------------------------------------------

  const establishSession = useCallback(async () => {
    setSessionStatus("connecting");
    setSessionError(null);

    try {
      // Get Clerk's JWT token
      const jwt = await getToken();
      if (!jwt) throw new Error("No Clerk token available");

      const decoded = decodeIdToken(jwt);
      setClaims(decoded);

      // Generate session keypair
      const keypair = await generateSessionKeypair();
      setSessionKeypair(keypair);

      // Generate ZK proof of the Clerk JWT
      let proof: Uint8Array;
      let modulusBytes: Uint8Array;

      if (env.useServerProver) {
        const result = await generateServerProof(
          "/api/bundler",
          jwt,
          keypair.publicKeyHex,
        );
        proof = result.proof;
        modulusBytes = result.jwksModulus;
      } else {
        const clientResult = await generateJWTProof(jwt, keypair.publicKeyHex);
        proof = clientResult.proof;
        modulusBytes = await getJWTModulusBytes(jwt);
      }

      // Authenticate with all group nodes
      await authenticateWithBootstrap(
        {
          groupId: DEMO_GROUP,
          nodeUrls: DEMO_NODES,
          proxyEndpoint: PROXY,
        },
        proof,
        keypair.publicKeyHex,
        decoded,
        modulusBytes,
      );

      setSessionStatus("connected");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSessionError(msg);
      setSessionStatus("error");
    }
  }, [getToken]);

  // ---------------------------------------------------------------------------
  // Create parent key (ECDSA, unscoped)
  // ---------------------------------------------------------------------------

  const createParentKey = useCallback(async () => {
    if (!sessionKeypair || !claims) return;
    setParentStatus("creating");
    setError(null);

    try {
      const result = await keygen(
        { nodeUrls: DEMO_NODES, groupId: DEMO_GROUP, proxyEndpoint: PROXY },
        sessionKeypair,
        claims,
        undefined, // no suffix = parent key
      );
      setParentKeyId(result.keyId);
      setParentAddress(result.ethereumAddress);
      setParentStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setParentStatus("error");
    }
  }, [sessionKeypair, claims]);

  // ---------------------------------------------------------------------------
  // Create scoped sub-key (ECDSA, EIP-712 domain)
  // ---------------------------------------------------------------------------

  const createSubKey = useCallback(async () => {
    if (!sessionKeypair || !claims) return;
    setSubKeyStatus("creating");
    setError(null);

    try {
      const preset = CHAIN_PRESETS[selectedPreset];
      const scope = buildEIP712Scope(preset.chainId, preset.verifyingContract);
      setSubKeyScope(scope);

      // Scope hash becomes the key suffix (first 8 bytes of SHA-256)
      const scopeBytes = new Uint8Array(
        scope.slice(2).match(/.{2}/g)!.map((b) => parseInt(b, 16)),
      );
      const hash = await crypto.subtle.digest("SHA-256", scopeBytes);
      const suffix = Array.from(new Uint8Array(hash).slice(0, 8))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const result = await keygen(
        { nodeUrls: DEMO_NODES, groupId: DEMO_GROUP, proxyEndpoint: PROXY },
        sessionKeypair,
        claims,
        suffix,
      );
      setSubKeyId(result.keyId);
      setSubKeyAddress(result.ethereumAddress);
      setSubKeyStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubKeyStatus("error");
    }
  }, [sessionKeypair, claims, selectedPreset]);

  // ---------------------------------------------------------------------------
  // Mint delegation token
  // ---------------------------------------------------------------------------

  const mintDelegation = useCallback(async () => {
    if (!sessionKeypair || !claims || !subKeyId || !parentKeyId) return;
    setDelegateStatus("minting");
    setError(null);

    try {
      const result = await requestDelegation(
        DEMO_NODES[0],
        PROXY,
        DEMO_GROUP,
        subKeyId,
        parentKeyId,
        "ecdsa_secp256k1",
        delegationExpiry,
        sessionKeypair,
        claims,
      );
      setDelegationToken(result.token);
      setDelegateStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDelegateStatus("error");
    }
  }, [sessionKeypair, claims, subKeyId, parentKeyId, delegationExpiry]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const preset = CHAIN_PRESETS[selectedPreset];

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-primary-900">x402 Delegation Demo</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Scoped sub-keys and delegation tokens for autonomous agent payments
        </p>
      </div>

      {/* Step 1: Auth */}
      <Section number={1} title="Authenticate" done={sessionStatus === "connected"}>
        {!isSignedIn ? (
          <div className="text-center py-6">
            <SignInButton mode="modal">
              <button className="rounded-lg bg-accent-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 transition-colors">
                Sign In with Clerk
              </button>
            </SignInButton>
          </div>
        ) : sessionStatus === "connected" ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-2.5 w-2.5 rounded-full bg-success-500" />
              <div>
                <p className="text-sm font-medium text-primary-900">{user?.primaryEmailAddress?.emailAddress}</p>
                <p className="text-xs text-neutral-400">Session established with {DEMO_NODES.length} nodes</p>
              </div>
            </div>
            <SignOutButton>
              <button className="text-xs text-neutral-400 hover:text-neutral-600">Sign Out</button>
            </SignOutButton>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-primary-900">{user?.primaryEmailAddress?.emailAddress}</p>
              <p className="text-xs text-neutral-400">Signed in via Clerk. Connect to Signet to continue.</p>
            </div>
            <button
              onClick={establishSession}
              disabled={sessionStatus === "connecting"}
              className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 transition-colors disabled:opacity-50"
            >
              {sessionStatus === "connecting" ? "Connecting..." : "Connect to Signet"}
            </button>
          </div>
        )}
        {sessionError && <p className="mt-2 text-xs text-error-600">{sessionError}</p>}
      </Section>

      {/* Step 2: Parent Key */}
      <Section number={2} title="Create Parent Key" done={parentStatus === "done"} disabled={sessionStatus !== "connected"}>
        {parentStatus === "done" ? (
          <div className="space-y-1">
            <Row label="Key ID" value={parentKeyId!} mono />
            <Row label="Address" value={parentAddress!} mono />
            <p className="text-xs text-neutral-400 mt-2">ECDSA secp256k1, unscoped</p>
          </div>
        ) : (
          <button
            onClick={createParentKey}
            disabled={parentStatus === "creating" || sessionStatus !== "connected"}
            className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 transition-colors disabled:opacity-50"
          >
            {parentStatus === "creating" ? "Creating..." : "Create Parent Key"}
          </button>
        )}
      </Section>

      {/* Step 3: Scoped Sub-Key */}
      <Section number={3} title="Create Scoped Sub-Key" done={subKeyStatus === "done"} disabled={parentStatus !== "done"}>
        <div className="space-y-4">
          {/* Preset selector */}
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Target Chain + Contract</label>
            <select
              value={selectedPreset}
              onChange={(e) => setSelectedPreset(Number(e.target.value))}
              disabled={subKeyStatus === "done"}
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-primary-900"
            >
              {CHAIN_PRESETS.map((p, i) => (
                <option key={i} value={i}>{p.label}</option>
              ))}
            </select>
          </div>

          {subKeyScope && (
            <Row label="Scope" value={subKeyScope} mono />
          )}

          {subKeyStatus === "done" ? (
            <div className="space-y-1">
              <Row label="Sub-Key ID" value={subKeyId!} mono />
              <Row label="Address" value={subKeyAddress!} mono />
              <p className="text-xs text-neutral-400">
                Scoped to {preset.eip712Name} on chain {preset.chainId}
              </p>
            </div>
          ) : (
            <button
              onClick={createSubKey}
              disabled={subKeyStatus === "creating" || parentStatus !== "done"}
              className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 transition-colors disabled:opacity-50"
            >
              {subKeyStatus === "creating" ? "Creating..." : `Create Sub-Key (${preset.contractName} on chain ${preset.chainId})`}
            </button>
          )}
        </div>
      </Section>

      {/* Step 4: Delegate */}
      <Section number={4} title="Mint Delegation Token" done={delegateStatus === "done"} disabled={subKeyStatus !== "done"}>
        <div className="space-y-4">
          {delegateStatus !== "done" && (
            <>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Token Expiry</label>
                <select
                  value={delegationExpiry}
                  onChange={(e) => setDelegationExpiry(Number(e.target.value))}
                  className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-primary-900"
                >
                  <option value={604800}>7 days</option>
                  <option value={2592000}>30 days</option>
                  <option value={7776000}>90 days</option>
                </select>
              </div>
              <button
                onClick={mintDelegation}
                disabled={delegateStatus === "minting" || subKeyStatus !== "done"}
                className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 transition-colors disabled:opacity-50"
              >
                {delegateStatus === "minting" ? "Minting..." : "Mint Delegation Token"}
              </button>
            </>
          )}

          {delegationToken && (
            <div className="space-y-2">
              <label className="block text-xs text-neutral-500">Delegation JWT</label>
              <div className="relative">
                <pre className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs font-mono text-primary-900 overflow-x-auto whitespace-pre-wrap break-all max-h-32">
                  {delegationToken}
                </pre>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(delegationToken);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="absolute top-2 right-2 rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <Link
                href={`/demo/x402/agent?token=${encodeURIComponent(delegationToken)}`}
                className="inline-block rounded-lg border border-accent-300 bg-accent-50 px-4 py-2 text-sm font-semibold text-accent-700 hover:bg-accent-100 transition-colors"
              >
                Open Agent Simulator &rarr;
              </Link>
            </div>
          )}
        </div>
      </Section>

      {/* Error */}
      {error && (
        <div className="mt-6 rounded-lg border border-error-200 bg-error-50 p-4">
          <p className="text-xs text-error-600">{error}</p>
          <button
            onClick={() => setError(null)}
            className="mt-1 text-xs text-error-500 hover:text-error-700"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function Section({
  number,
  title,
  done,
  disabled,
  children,
}: {
  number: number;
  title: string;
  done?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`mb-8 rounded-lg border bg-white p-6 ${
      disabled ? "border-neutral-100 opacity-50" : done ? "border-success-200" : "border-neutral-200"
    }`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
          done ? "bg-success-500 text-white" : "bg-neutral-200 text-neutral-500"
        }`}>
          {done ? (
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          ) : (
            number
          )}
        </div>
        <h2 className="text-lg font-semibold text-primary-900">{title}</h2>
      </div>
      {!disabled && children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-neutral-500">{label}</span>
      <span className={`text-primary-900 ${mono ? "font-mono text-xs" : ""} max-w-xs truncate`}>
        {value}
      </span>
    </div>
  );
}
