"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { hashTypedData, recoverAddress, type Hex } from "viem";
import { generateSessionKeypair } from "@/lib/signet-sdk/session";
import { authenticateWithDelegation } from "@/lib/signet-sdk/delegate";
import { signTypedData, CHAIN_PRESETS, type EIP712TypedData } from "@/lib/signet-sdk/scopedSign";
import { x402Fetch } from "@/lib/signet-sdk/x402";
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
  const addressFromUrl = searchParams.get("address");

  // Token input
  const [token, setToken] = useState(tokenFromUrl ?? "");
  const [signerAddress, setSignerAddress] = useState(addressFromUrl ?? "");

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
  const [recoveredAddress, setRecoveredAddress] = useState<string | null>(null);

  // x402 API query
  const [queryAddress, setQueryAddress] = useState("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"); // vitalik.eth
  const [queryStatus, setQueryStatus] = useState<"idle" | "requesting" | "paying" | "done" | "error">("idle");
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryResult, setQueryResult] = useState<Record<string, unknown> | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<{ amount: string; network: string } | null>(null);

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

      // Client-side ecrecover verification
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const hash = hashTypedData(typedData as any);
        const recovered = await recoverAddress({ hash, signature: result.ecdsaSignature as Hex });
        setRecoveredAddress(recovered);
      } catch (e) {
        console.error("[agent] ecrecover failed:", e);
        setRecoveredAddress(null);
      }

      setSignStatus("done");
    } catch (e) {
      setSignError(e instanceof Error ? e.message : String(e));
      setSignStatus("error");
    }
  }

  // ---------------------------------------------------------------------------
  // Query x402 API (Nansen)
  // ---------------------------------------------------------------------------

  async function queryNansen() {
    if (!agentKeypair || !agentKeyId || !agentIdentity) return;
    setQueryStatus("requesting");
    setQueryError(null);
    setQueryResult(null);
    setPaymentInfo(null);

    try {
      const dummyClaims = { iss: "", sub: "", email: "", azp: "", aud: "", exp: 0, iat: 0 } as IdTokenClaims;

      const { response, paid, paymentDetails } = await x402Fetch(
        "/api/x402",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-target-url": "https://api.nansen.ai/api/v1/profiler/address/current-balance",
            "x-target-method": "POST",
          },
          body: JSON.stringify({
            address: queryAddress,
            chain: "ethereum",
            hide_spam_token: true,
            pagination: { page: 1, per_page: 5 },
          }),
        },
        {
          signerAddress: signerAddress || "0x0000000000000000000000000000000000000000",
          preferredNetwork: "eip155:8453",
          signTypedData: async (typedData) => {
            setQueryStatus("paying");
            const result = await signTypedData(
              DEMO_NODES[0],
              PROXY,
              DEMO_GROUP,
              agentKeyId!,
              "ecdsa_secp256k1",
              typedData as EIP712TypedData,
              agentKeypair!,
              dummyClaims,
              agentIdentity ?? undefined,
            );
            return result.ecdsaSignature;
          },
        },
      );

      if (paid && paymentDetails) {
        setPaymentInfo({ amount: paymentDetails.amount, network: paymentDetails.network });
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`API returned ${response.status}: ${body}`);
      }

      const data = await response.json();
      setQueryResult(data);
      setQueryStatus("done");
    } catch (e) {
      setQueryError(e instanceof Error ? e.message : String(e));
      setQueryStatus("error");
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
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-success-500" />
              <span className="text-xs text-success-700 font-mono break-all">
                {agentKeyId}
              </span>
            </div>
          )}
        </div>
        {authError && <p className="mt-2 text-xs text-error-600">{authError}</p>}
        {signerAddress && (
          <p className="mt-2 text-xs text-neutral-400">
            Signer: <span className="font-mono text-neutral-500">{signerAddress}</span>
          </p>
        )}
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

            {ecdsaSignature && (
              <div className="space-y-2 mt-4">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">ECDSA Signature (65 bytes)</label>
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs font-mono text-primary-900 break-all overflow-hidden">
                    {ecdsaSignature}
                  </div>
                </div>
                {recoveredAddress && (
                  <div className={`rounded-lg border p-2 ${
                    signerAddress && recoveredAddress.toLowerCase() === signerAddress.toLowerCase()
                      ? "border-success-200 bg-success-50"
                      : "border-error-200 bg-error-50"
                  }`}>
                    <p className="text-xs font-mono break-all">
                      ecrecover: {recoveredAddress}
                    </p>
                    {signerAddress && (
                      <p className={`text-xs mt-1 ${
                        recoveredAddress.toLowerCase() === signerAddress.toLowerCase()
                          ? "text-success-700"
                          : "text-error-700"
                      }`}>
                        {recoveredAddress.toLowerCase() === signerAddress.toLowerCase()
                          ? "Matches sub-key address"
                          : `Mismatch! Expected ${signerAddress}`}
                      </p>
                    )}
                  </div>
                )}
                <p className="text-xs text-success-600">
                  Payment authorization signed for {preset.contractName} on chain {preset.chainId}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* x402 API Query */}
      {authStatus === "connected" && (
        <div className="mb-8 rounded-lg border border-neutral-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-primary-900 mb-4">
            Query x402 API (Nansen)
          </h2>
          <p className="text-xs text-neutral-500 mb-4">
            Make a real API request. If the server returns HTTP 402, the agent
            automatically signs a USDC payment authorization and retries.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">Ethereum Address to Look Up</label>
              <input
                type="text"
                value={queryAddress}
                onChange={(e) => setQueryAddress(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-mono text-primary-900"
              />
            </div>

            <p className="text-xs font-mono text-neutral-400">POST https://api.nansen.ai/api/v1/profiler/address/current-balance</p>

            <button
              onClick={queryNansen}
              disabled={queryStatus === "requesting" || queryStatus === "paying"}
              className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 transition-colors disabled:opacity-50"
            >
              {queryStatus === "requesting" ? "Requesting..." :
               queryStatus === "paying" ? "Signing payment..." :
               "Query Nansen ($0.01 USDC)"}
            </button>

            {queryError && <p className="text-xs text-error-600">{queryError}</p>}

            {paymentInfo && (
              <div className="rounded-lg border border-accent-200 bg-accent-50 p-3">
                <p className="text-xs text-accent-700">
                  Paid {parseInt(paymentInfo.amount) / 1e6} USDC on {paymentInfo.network}
                </p>
              </div>
            )}

            {queryResult && (
              <div>
                <label className="block text-xs text-neutral-500 mb-1">Response</label>
                <pre className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs font-mono text-primary-900 overflow-x-auto max-h-64 overflow-y-auto">
                  {JSON.stringify(queryResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
