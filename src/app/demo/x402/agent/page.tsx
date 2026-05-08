"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { generateSessionKeypair } from "@/lib/signet-sdk/session";
import { authenticateWithDelegation } from "@/lib/signet-sdk/delegate";
import { signTypedData, CHAIN_PRESETS, type EIP712TypedData } from "@/lib/signet-sdk/scopedSign";
import { env } from "@/config/env";
import type { SessionKeypair, IdTokenClaims } from "@/lib/signet-sdk/types";
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

export default function AgentSimulatorPageWrapper() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-2xl px-6 py-12 text-neutral-400">Loading...</div>}>
      <AgentSimulatorPage />
    </Suspense>
  );
}

function AgentSimulatorPage() {
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token");

  // Token input
  const [token, setToken] = useState(tokenFromUrl ?? "");

  // Agent session
  const [agentKeypair, setAgentKeypair] = useState<SessionKeypair | null>(null);
  const [agentIdentity, setAgentIdentity] = useState<string | null>(null);
  const [agentKeyId, setAgentKeyId] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [authError, setAuthError] = useState<string | null>(null);

  // Signing
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [toAddress, setToAddress] = useState("0x0000000000000000000000000000000000000001");
  const [value, setValue] = useState("1000000"); // 1 USDC (6 decimals)
  const [signStatus, setSignStatus] = useState<"idle" | "signing" | "done" | "error">("idle");
  const [signature, setSignature] = useState<string | null>(null);
  const [ecdsaSignature, setEcdsaSignature] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);

  // Pre-fill from URL
  useEffect(() => {
    if (tokenFromUrl) setToken(tokenFromUrl);
  }, [tokenFromUrl]);

  // ---------------------------------------------------------------------------
  // Authenticate as agent
  // ---------------------------------------------------------------------------

  async function connectAsAgent() {
    if (!token.trim()) return;
    setAuthStatus("connecting");
    setAuthError(null);

    try {
      const keypair = await generateSessionKeypair();
      setAgentKeypair(keypair);

      // Auth with each node using the delegation token
      let result;
      for (const nodeUrl of DEMO_NODES) {
        result = await authenticateWithDelegation(
          nodeUrl,
          PROXY,
          DEMO_GROUP,
          token.trim(),
          keypair,
        );
      }

      setAgentIdentity(result!.identity);
      setAgentKeyId(result!.keyId);
      setAuthStatus("connected");
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : String(e));
      setAuthStatus("error");
    }
  }

  // ---------------------------------------------------------------------------
  // Sign EIP-712 typed data
  // ---------------------------------------------------------------------------

  async function signPayload() {
    if (!agentKeypair || !agentKeyId) return;
    setSignStatus("signing");
    setSignError(null);

    try {
      const preset = CHAIN_PRESETS[selectedPreset];
      const now = Math.floor(Date.now() / 1000);

      const typedData: EIP712TypedData = {
        domain: {
          name: preset.eip712Name,
          version: preset.eip712Version,
          chainId: preset.chainId,
          verifyingContract: preset.verifyingContract,
        },
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
          TransferWithAuthorization: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "validAfter", type: "uint256" },
            { name: "validBefore", type: "uint256" },
            { name: "nonce", type: "bytes32" },
          ],
        },
        primaryType: "TransferWithAuthorization",
        message: {
          from: "0x0000000000000000000000000000000000000000", // will be overridden by key's address
          to: toAddress,
          value: value,
          validAfter: String(now - 60),
          validBefore: String(now + 3600),
          nonce: "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map((b) => b.toString(16).padStart(2, "0")).join(""),
        },
      };

      console.log("[agent] sign: identity=" + agentIdentity + " keyId=" + agentKeyId);
      console.log("[agent] typed_data:", JSON.stringify(typedData, null, 2));

      // Dummy claims — the delegation session uses the token's identity, not OAuth claims
      const dummyClaims = { iss: "", sub: "", email: "", azp: "", aud: "", exp: 0, iat: 0 } as IdTokenClaims;

      const result = await signTypedData(
        DEMO_NODES[0],
        PROXY,
        DEMO_GROUP,
        agentKeyId!,
        "ecdsa_secp256k1",
        typedData,
        agentKeypair,
        dummyClaims,
        agentIdentity ?? undefined,
      );

      setSignature(result.signature);
      setEcdsaSignature(result.ecdsaSignature);
      setSignStatus("done");
    } catch (e) {
      setSignError(e instanceof Error ? e.message : String(e));
      setSignStatus("error");
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const preset = CHAIN_PRESETS[selectedPreset];

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <Link href="/demo/x402" className="text-neutral-400 hover:text-neutral-600 text-sm">
            &larr; Back
          </Link>
        </div>
        <h1 className="text-3xl font-bold text-primary-900">Agent Simulator</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Authenticate with a delegation token and sign x402 payments
        </p>
      </div>

      {/* Token Input */}
      <div className="mb-8 rounded-lg border border-neutral-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-primary-900 mb-4">Delegation Token</h2>
        <textarea
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste delegation JWT here..."
          rows={3}
          className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-mono text-primary-900 placeholder-neutral-400 focus:border-accent-500 focus:outline-none"
        />
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={connectAsAgent}
            disabled={!token.trim() || authStatus === "connecting"}
            className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 transition-colors disabled:opacity-50"
          >
            {authStatus === "connecting" ? "Authenticating..." : "Authenticate as Agent"}
          </button>
          {authStatus === "connected" && (
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-success-500" />
              <span className="text-xs text-success-700">
                Connected — {agentIdentity} / {agentKeyId?.slice(-12)}
              </span>
            </div>
          )}
        </div>
        {authError && <p className="mt-2 text-xs text-error-600">{authError}</p>}
      </div>

      {/* Sign Payload */}
      {authStatus === "connected" && (
        <div className="mb-8 rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-primary-900 mb-4">
            Sign TransferWithAuthorization
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Chain + Contract</label>
              <select
                value={selectedPreset}
                onChange={(e) => setSelectedPreset(Number(e.target.value))}
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-primary-900"
              >
                {CHAIN_PRESETS.map((p, i) => (
                  <option key={i} value={i}>{p.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-neutral-500 mb-1">To Address</label>
              <input
                type="text"
                value={toAddress}
                onChange={(e) => setToAddress(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-mono text-primary-900"
              />
            </div>

            <div>
              <label className="block text-xs text-neutral-500 mb-1">Value (smallest unit, e.g. 1000000 = 1 USDC)</label>
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-mono text-primary-900"
              />
            </div>

            <button
              onClick={signPayload}
              disabled={signStatus === "signing"}
              className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 transition-colors disabled:opacity-50"
            >
              {signStatus === "signing" ? "Signing..." : "Sign Payment"}
            </button>

            {signError && <p className="text-xs text-error-600">{signError}</p>}

            {signature && (
              <div className="space-y-2 mt-4">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">ECDSA Signature</label>
                  <pre className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs font-mono text-primary-900 break-all">
                    {ecdsaSignature}
                  </pre>
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Raw Signature</label>
                  <pre className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs font-mono text-neutral-500 break-all">
                    {signature}
                  </pre>
                </div>
                <p className="text-xs text-success-600">
                  Payment authorization signed for {preset.contractName} on chain {preset.chainId}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
