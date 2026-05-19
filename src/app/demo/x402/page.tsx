"use client";

import { useState, useCallback, useEffect } from "react";
import { useSignetAuth } from "@/hooks/useSignetAuth";
import { sessionKeyMaterial } from "@/providers/signetAuth";
import { keygen } from "@oleary-labs/signet-sdk/keygen";
import { requestDelegation } from "@oleary-labs/signet-sdk/delegate";
import { buildEIP712Scope, CHAIN_PRESETS } from "@oleary-labs/signet-sdk/scopedSign";
import { env } from "@/config/env";
import type { SessionKeypair, IdTokenClaims } from "@oleary-labs/signet-sdk/types";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEMO_GROUP = process.env.NEXT_PUBLIC_X402_GROUP ?? env.bootstrapGroup;
const DEMO_NODES = (process.env.NEXT_PUBLIC_X402_NODES ?? env.bootstrapNodes.join(",")).split(",").filter(Boolean);
const PROXY = "/api/node/proxy";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function X402DemoPage() {
  const { isAuthenticated, signIn, status: authStatus, claims, groupPublicKey } = useSignetAuth();

  // Parent key
  const [parentKeyId, setParentKeyId] = useState<string | null>(null);
  const [parentAddress, setParentAddress] = useState<string | null>(null);
  const [parentAlreadyExisted, setParentAlreadyExisted] = useState(false);
  const [parentStatus, setParentStatus] = useState<"idle" | "creating" | "done" | "error">("idle");

  // Sub-key
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [subKeyId, setSubKeyId] = useState<string | null>(null);
  const [subKeySuffix, setSubKeySuffix] = useState<string | null>(null);
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
  // Create parent key (ECDSA, unscoped) — auto-triggered after auth
  // ---------------------------------------------------------------------------

  const createParentKey = useCallback(async () => {
    if (!sessionKeyMaterial.keypair || !claims) return;
    setParentStatus("creating");
    setError(null);

    try {
      const result = await keygen(
        { nodeUrls: DEMO_NODES, groupId: DEMO_GROUP, proxyEndpoint: PROXY },
        sessionKeyMaterial.keypair,
        claims,
        undefined, // no suffix = parent key
        undefined, // no identity override
        "ecdsa_secp256k1",
      );
      setParentKeyId(result.keyId);
      setParentAddress(result.ethereumAddress);
      setParentAlreadyExisted(result.alreadyExisted);
      setParentStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setParentStatus("error");
    }
  }, [claims]);

  // Auto-create parent key when authenticated
  useEffect(() => {
    if (isAuthenticated && parentStatus === "idle" && sessionKeyMaterial.keypair && claims) {
      createParentKey();
    }
  }, [isAuthenticated, parentStatus, claims, createParentKey]);

  // ---------------------------------------------------------------------------
  // Create scoped sub-key (ECDSA, EIP-712 domain)
  // ---------------------------------------------------------------------------

  const createSubKey = useCallback(async () => {
    if (!sessionKeyMaterial.keypair || !claims) return;
    setSubKeyStatus("creating");
    setError(null);

    try {
      const preset = CHAIN_PRESETS[selectedPreset];
      const scope = buildEIP712Scope(preset.chainId, preset.verifyingContract);
      setSubKeyScope(scope);

      // Compute suffix from scope (same as node: first 8 bytes of SHA-256)
      const scopeBytes = new Uint8Array(
        scope.slice(2).match(/.{2}/g)!.map((b) => parseInt(b, 16)),
      );
      const hash = await crypto.subtle.digest("SHA-256", scopeBytes);
      const suffix = Array.from(new Uint8Array(hash).slice(0, 8))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const result = await keygen(
        { nodeUrls: DEMO_NODES, groupId: DEMO_GROUP, proxyEndpoint: PROXY },
        sessionKeyMaterial.keypair,
        claims,
        suffix,
        undefined, // no identity override
        "ecdsa_secp256k1",
        scope,
      );
      setSubKeyId(result.keyId);
      setSubKeySuffix(suffix);
      setSubKeyAddress(result.ethereumAddress);
      setSubKeyStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubKeyStatus("error");
    }
  }, [claims, selectedPreset]);

  // ---------------------------------------------------------------------------
  // Mint delegation token
  // ---------------------------------------------------------------------------

  const mintDelegation = useCallback(async () => {
    if (!subKeySuffix || !parentKeyId || !sessionKeyMaterial.keypair || !claims) return;
    setDelegateStatus("minting");
    setError(null);

    try {
      const result = await requestDelegation(
        DEMO_NODES[0],
        PROXY,
        DEMO_GROUP,
        subKeySuffix,
        parentKeyId,
        "ecdsa_secp256k1",
        delegationExpiry,
        sessionKeyMaterial.keypair,
        claims,
      );
      setDelegationToken(result.token);
      setDelegateStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDelegateStatus("error");
    }
  }, [subKeySuffix, parentKeyId, claims, delegationExpiry]);

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
      <Section number={1} title="Authenticate" done={isAuthenticated}>
        {!isAuthenticated ? (
          <div className="text-center py-6">
            <button
              onClick={signIn}
              disabled={authStatus === "oauth"}
              className="rounded-lg bg-accent-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 transition-colors disabled:opacity-50"
            >
              {authStatus === "oauth" ? "Signing in..." : "Sign In with Google"}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="h-2.5 w-2.5 rounded-full bg-success-500" />
            <div>
              <p className="text-sm font-medium text-primary-900">{claims?.email}</p>
              <p className="text-xs text-neutral-400">Session established with {DEMO_NODES.length} nodes</p>
            </div>
          </div>
        )}
      </Section>

      {/* Step 2: Parent Key (auto-created after auth) */}
      <Section number={2} title="Parent Key" done={parentStatus === "done"} disabled={!isAuthenticated}>
        {parentStatus === "done" ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                parentAlreadyExisted
                  ? "bg-neutral-100 text-neutral-600"
                  : "bg-success-50 text-success-700"
              }`}>
                {parentAlreadyExisted ? "Found existing" : "Created"}
              </span>
              <span className="text-xs text-neutral-400">ECDSA secp256k1, unscoped</span>
            </div>
            <Row label="Key ID" value={parentKeyId!} mono />
            <Row label="Address" value={parentAddress!} mono />
          </div>
        ) : parentStatus === "creating" ? (
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded-full border-2 border-accent-500 border-t-transparent animate-spin" />
            <span className="text-sm text-neutral-500">Creating parent key...</span>
          </div>
        ) : null}
      </Section>

      {/* Step 3: Scoped Sub-Key */}
      <Section number={3} title="Create Scoped Sub-Key" done={subKeyStatus === "done"} disabled={parentStatus !== "done"}>
        <div className="space-y-4">
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
            <div className="space-y-2">
              <Row label="Sub-Key ID" value={subKeyId!} mono />
              <div className="flex items-center justify-between">
                <span className="text-sm text-neutral-500">Address</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-primary-900">{subKeyAddress}</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(subKeyAddress!); }}
                    className="rounded border border-neutral-200 px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-50"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <p className="text-xs text-neutral-400">
                Scoped to {preset.eip712Name} on chain {preset.chainId}
              </p>
              <p className="text-xs text-accent-600">
                Fund this address with USDC on Base to enable x402 payments.
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
                href={`/demo/x402/agent?token=${encodeURIComponent(delegationToken)}&address=${encodeURIComponent(subKeyAddress ?? "")}`}
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
