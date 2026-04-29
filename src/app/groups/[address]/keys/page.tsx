"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { type Address, type Hex } from "viem";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignetAuth } from "@/hooks/useSignetAuth";
import { sessionKeyMaterial } from "@/providers/signetAuth";
import { env } from "@/config/env";
import { adminRequest, type AdminAuthConfig } from "@/lib/signet-sdk/admin";
import { keygen } from "@/lib/signet-sdk/keygen";
import { signSignRequest } from "@/lib/signet-sdk/request";
import { verifyFrostSignature } from "@/lib/signet-sdk/frostVerify";
import { authenticateWithSchnorrAuthKey } from "@/lib/signet-sdk/authkey-session";
import { generateSessionKeypair } from "@/lib/signet-sdk/session";
import type { SessionKeypair } from "@/lib/signet-sdk/types";
import { useGroupDetails } from "@/hooks/useFactory";
import { loadNodeRegistry, getNodeMetadata, type NodeRegistry } from "@/lib/nodeRegistry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KeyInfo {
  group_id: string;
  key_id: string;
  public_key: string;
  ethereum_address: string;
  threshold: number;
  parties: string[];
}

interface ReshareStatus {
  group_id?: string;
  status: "active" | "resharing";
  keys_total?: number;
  keys_done?: number;
  keys_stale?: number;
  started_at?: string;
}

type KeyStatus = "untested" | "signing" | "verified" | "failed";

const IDENTITY = "key-tester";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function KeysTestingPage() {
  const params = useParams();
  const address = params.address as Address;
  const queryClient = useQueryClient();

  const { isAuthenticated, signIn, status: authStatus, claims, groupPublicKey, reauthenticate } = useSignetAuth();
  const { data: details } = useGroupDetails(address);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activeNodes = ((details as any)?.[3]?.result as Address[] | undefined) ?? [];

  // Node registry for API URLs
  const [registry, setRegistry] = useState<NodeRegistry>({});
  useEffect(() => { loadNodeRegistry().then(setRegistry); }, []);

  // Target group session (separate from bootstrap session)
  const [targetSession, setTargetSession] = useState<SessionKeypair | null>(null);
  const [targetNodeUrls, setTargetNodeUrls] = useState<string[]>([]);
  const [sessionStatus, setSessionStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Key status tracking (local per session)
  const [keyStatuses, setKeyStatuses] = useState<Record<string, KeyStatus>>({});

  // Batch generate state
  const [genPrefix, setGenPrefix] = useState("test");
  const [genCount, setGenCount] = useState(10);
  const [genProgress, setGenProgress] = useState<{ done: number; total: number } | null>(null);

  // Batch verify state
  const [verifyProgress, setVerifyProgress] = useState<{ done: number; total: number; failed: number } | null>(null);

  // Abort controllers
  const genAbort = useRef<AbortController | null>(null);
  const verifyAbort = useRef<AbortController | null>(null);

  // Auth key pub (Schnorr prefix 0x01 + group public key)
  const authKeyPub = groupPublicKey
    ? `0x01${groupPublicKey.slice(2)}` as Hex
    : null;

  // Admin config for /admin/* calls (goes through bootstrap group)
  const adminConfig: AdminAuthConfig = {
    nodeProxyUrl: "/api/node/proxy",
    bootstrapGroup: env.bootstrapGroup,
    bootstrapNodes: env.bootstrapNodes,
  };

  // Resolve target group node URLs from registry
  useEffect(() => {
    if (!activeNodes.length) return;
    const urls: string[] = [];
    for (const node of activeNodes) {
      const meta = getNodeMetadata(registry, node);
      if (meta?.apiUrl) urls.push(meta.apiUrl);
    }
    setTargetNodeUrls(urls);
  }, [activeNodes, registry]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Connect: establish session with target group nodes
  // ---------------------------------------------------------------------------

  const connectToGroup = useCallback(async () => {
    if (!claims || !sessionKeyMaterial.keypair || !authKeyPub || targetNodeUrls.length === 0) return;

    setSessionStatus("connecting");
    setSessionError(null);

    try {
      // Generate a fresh session keypair for the target group
      const targetKeypair = await generateSessionKeypair();

      // Authenticate with each target group node using Schnorr auth key cert
      for (const nodeUrl of targetNodeUrls) {
        await authenticateWithSchnorrAuthKey(
          {
            bootstrapGroup: env.bootstrapGroup,
            bootstrapNodes: env.bootstrapNodes,
            nodeProxyUrl: "/api/node/proxy",
          },
          nodeUrl,
          "/api/node/proxy",
          address,
          authKeyPub,
          IDENTITY,
          targetKeypair,
          sessionKeyMaterial.keypair,
          claims,
        );
      }

      setTargetSession(targetKeypair);
      setSessionStatus("connected");
    } catch (e) {
      setSessionError(e instanceof Error ? e.message : String(e));
      setSessionStatus("error");
    }
  }, [claims, authKeyPub, targetNodeUrls, address]);

  // Auto-connect when we have everything
  useEffect(() => {
    if (sessionStatus === "idle" && targetNodeUrls.length > 0 && claims && sessionKeyMaterial.keypair && authKeyPub) {
      connectToGroup();
    }
  }, [sessionStatus, targetNodeUrls, claims, authKeyPub, connectToGroup]);

  // ---------------------------------------------------------------------------
  // Queries (admin APIs use bootstrap auth, not target session)
  // ---------------------------------------------------------------------------

  const { data: keys, isLoading: keysLoading } = useQuery<KeyInfo[]>({
    queryKey: ["keys-full", address],
    queryFn: async () => {
      if (!authKeyPub || !sessionKeyMaterial.keypair || !claims) return [];
      return adminRequest<KeyInfo[]>(
        adminConfig,
        env.bootstrapNodes[0],
        "/admin/keys",
        address,
        authKeyPub,
        sessionKeyMaterial.keypair,
        claims,
        undefined,
        reauthenticate,
      );
    },
    enabled: !!authKeyPub && !!sessionKeyMaterial.keypair && !!claims,
    staleTime: 10_000,
  });

  const { data: reshareStatus } = useQuery<ReshareStatus | null>({
    queryKey: ["reshare-status-keys", address],
    queryFn: async () => {
      if (!authKeyPub || !sessionKeyMaterial.keypair || !claims) return null;
      return adminRequest<ReshareStatus>(
        adminConfig,
        env.bootstrapNodes[0],
        "/admin/reshare/status",
        address,
        authKeyPub,
        sessionKeyMaterial.keypair,
        claims,
        undefined,
        reauthenticate,
      );
    },
    enabled: !!authKeyPub && !!sessionKeyMaterial.keypair && !!claims,
    refetchInterval: (query) =>
      query.state.data?.status === "resharing" ? 3000 : 30000,
  });

  // ---------------------------------------------------------------------------
  // Actions (use target session, not bootstrap session)
  // ---------------------------------------------------------------------------

  // Dummy claims — the identity parameter overrides key ID derivation for cert sessions
  const targetClaims = { iss: "", sub: "", email: "", azp: "", aud: "", exp: 0, iat: 0 } as const;

  async function batchGenerate() {
    if (!targetSession || targetNodeUrls.length === 0) return;
    const abort = new AbortController();
    genAbort.current = abort;
    setGenProgress({ done: 0, total: genCount });

    for (let i = 0; i < genCount; i++) {
      if (abort.signal.aborted) break;
      setGenProgress({ done: i, total: genCount });
      try {
        await keygen(
          {
            nodeUrls: targetNodeUrls,
            groupId: address,
            proxyEndpoint: "/api/node/proxy",
          },
          targetSession,
          targetClaims,
          `${genPrefix}-${i}`,
          IDENTITY,
        );
      } catch (e) {
        console.error(`[keygen] ${genPrefix}-${i} failed:`, e);
      }
    }

    setGenProgress({ done: genCount, total: genCount });
    genAbort.current = null;
    queryClient.invalidateQueries({ queryKey: ["keys-full"] });
    setTimeout(() => setGenProgress(null), 2000);
  }

  async function batchVerify() {
    if (!keys || !targetSession || targetNodeUrls.length === 0) return;
    const abort = new AbortController();
    verifyAbort.current = abort;
    setVerifyProgress({ done: 0, total: keys.length, failed: 0 });

    const testMessage = crypto.getRandomValues(new Uint8Array(32));
    let failed = 0;

    for (let i = 0; i < keys.length; i++) {
      if (abort.signal.aborted) break;
      const key = keys[i];
      setVerifyProgress({ done: i, total: keys.length, failed });
      setKeyStatuses((prev) => ({ ...prev, [key.key_id]: "signing" }));

      // Extract suffix from key_id: "authkey:identity:suffix" or "oauth:iss:sub:suffix"
      const parts = key.key_id.split(":");
      // For authkey keys: authkey:<identity>:<suffix>
      // For oauth keys: oauth:<iss>:<sub>:<suffix> — we can't sign these without the user's OAuth session
      const isAuthKey = parts[0] === "authkey";
      const suffix = isAuthKey && parts.length > 2 ? parts.slice(2).join(":") : undefined;

      if (!isAuthKey) {
        // Skip OAuth keys — we can't sign with them from the cert session
        setKeyStatuses((prev) => ({ ...prev, [key.key_id]: "untested" }));
        continue;
      }

      try {
        const signReq = await signSignRequest(
          targetSession,
          targetClaims,
          address,
          testMessage,
          suffix,
          IDENTITY,
        );

        const res = await fetch("/api/node/proxy", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-node-url": targetNodeUrls[0],
            "x-node-path": "/v1/sign",
          },
          body: JSON.stringify(signReq),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`Sign failed: ${res.status} on ${targetNodeUrls[0]} — ${body}`);
        }

        const { ethereum_signature } = await res.json();
        const sigBytes = hexToBytes(ethereum_signature);
        const pubKeyBytes = hexToBytes(key.public_key);
        const valid = verifyFrostSignature(testMessage, sigBytes, pubKeyBytes);

        setKeyStatuses((prev) => ({ ...prev, [key.key_id]: valid ? "verified" : "failed" }));
        if (!valid) failed++;
      } catch (e) {
        console.error(`[verify] ${key.key_id} failed:`, e);
        setKeyStatuses((prev) => ({ ...prev, [key.key_id]: "failed" }));
        failed++;
      }
    }

    setVerifyProgress({ done: keys.length, total: keys.length, failed });
    verifyAbort.current = null;
    setTimeout(() => setVerifyProgress(null), 5000);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-12 text-center">
        <h1 className="text-2xl font-bold text-primary-900">Key Testing</h1>
        <p className="mt-4 text-neutral-500">Sign in to test key operations.</p>
        <button
          onClick={signIn}
          disabled={authStatus === "oauth"}
          className="mt-6 rounded-lg bg-accent-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 transition-colors disabled:opacity-50"
        >
          Sign In
        </button>
      </div>
    );
  }

  const isResharing = reshareStatus?.status === "resharing";
  const isConnected = sessionStatus === "connected";

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-primary-900">Key Testing</h1>
        <p className="mt-1 text-sm text-neutral-500 font-mono">{address}</p>
      </div>

      {/* Auth Status */}
      <div className="mb-6 rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-2.5 w-2.5 rounded-full ${
              isConnected ? "bg-success-500" :
              sessionStatus === "connecting" ? "bg-accent-500 animate-pulse" :
              sessionStatus === "error" ? "bg-error-500" :
              "bg-neutral-300"
            }`} />
            <div>
              <span className="text-sm font-medium text-primary-900">
                {isConnected ? "Authorized" :
                 sessionStatus === "connecting" ? "Authorizing..." :
                 sessionStatus === "error" ? "Authorization failed" :
                 "Not authorized"}
              </span>
              <span className="ml-2 text-xs text-neutral-400">
                {targetNodeUrls.length} node{targetNodeUrls.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isConnected && (
              <button
                onClick={() => { setSessionStatus("idle"); setTargetSession(null); }}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:border-neutral-400 transition-colors"
              >
                Re-auth
              </button>
            )}
            {!isConnected && sessionStatus !== "connecting" && (
              <button
                onClick={connectToGroup}
                disabled={targetNodeUrls.length === 0}
                className="rounded-lg bg-accent-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-600 transition-colors disabled:opacity-50"
              >
                Authorize
              </button>
            )}
          </div>
        </div>
        {authKeyPub && (
          <p className="mt-2 text-xs text-neutral-400">
            Auth key: <span className="font-mono text-neutral-500">{authKeyPub.slice(0, 14)}...{authKeyPub.slice(-8)}</span>
            <span className="ml-2 rounded-full bg-neutral-100 px-1.5 py-0.5 text-neutral-500">Schnorr</span>
          </p>
        )}
        {targetNodeUrls.length > 0 && (
          <div className="mt-1 text-xs text-neutral-400">
            Nodes: {targetNodeUrls.map((url, i) => (
              <span key={url} className="font-mono text-neutral-500">
                {i > 0 && ", "}
                {url.replace(/^https?:\/\//, "")}
              </span>
            ))}
          </div>
        )}
        {sessionError && (
          <p className="mt-2 text-xs text-error-600">{sessionError}</p>
        )}
        {targetNodeUrls.length === 0 && (
          <p className="mt-2 text-xs text-neutral-400">
            No node API URLs found in registry. Ensure nodes have apiUrl in node-registry.json.
          </p>
        )}
      </div>

      {/* Reshare Status Banner */}
      {reshareStatus && (
        <div className={`mb-6 rounded-lg border p-4 ${
          isResharing ? "border-accent-200 bg-accent-50" : "border-success-200 bg-success-50"
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isResharing ? (
                <div className="h-2.5 w-2.5 rounded-full bg-accent-500 animate-pulse" />
              ) : (
                <div className="h-2.5 w-2.5 rounded-full bg-success-500" />
              )}
              <span className={`text-sm font-medium ${isResharing ? "text-accent-700" : "text-success-700"}`}>
                {isResharing ? "Resharing in progress..." : "All keys up to date"}
              </span>
            </div>
            {isResharing && reshareStatus.keys_total != null && (
              <span className="text-xs text-accent-600">
                {reshareStatus.keys_done ?? 0} / {reshareStatus.keys_total} keys
              </span>
            )}
          </div>
          {isResharing && reshareStatus.keys_total != null && (
            <div className="mt-2 h-1.5 rounded-full bg-accent-200 overflow-hidden">
              <div
                className="h-full bg-accent-500 transition-all"
                style={{ width: `${((reshareStatus.keys_done ?? 0) / reshareStatus.keys_total) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="mb-6 flex flex-wrap gap-4">
        {/* Batch Generate */}
        <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2">
          <span className="text-xs text-neutral-500">Prefix</span>
          <input
            type="text"
            value={genPrefix}
            onChange={(e) => setGenPrefix(e.target.value)}
            className="w-20 rounded border border-neutral-200 px-2 py-1 text-xs font-mono"
            placeholder="test"
          />
          <input
            type="number"
            value={genCount}
            onChange={(e) => setGenCount(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-16 rounded border border-neutral-200 px-2 py-1 text-xs font-mono"
            min={1}
            max={1000}
          />
          <button
            onClick={batchGenerate}
            disabled={!!genProgress || !isConnected}
            className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-600 transition-colors disabled:opacity-50"
          >
            {genProgress ? `${genProgress.done}/${genProgress.total}` : `Generate ${genCount}`}
          </button>
          {genProgress && (
            <button onClick={() => genAbort.current?.abort()} className="text-xs text-neutral-400 hover:text-error-500">
              Stop
            </button>
          )}
        </div>

        {/* Batch Verify */}
        <div className="flex items-center gap-2">
          <button
            onClick={batchVerify}
            disabled={!!verifyProgress || !keys?.length || !isConnected}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:border-neutral-400 transition-colors disabled:opacity-50"
          >
            {verifyProgress
              ? `Verifying ${verifyProgress.done}/${verifyProgress.total}${verifyProgress.failed ? ` (${verifyProgress.failed} failed)` : ""}`
              : `Verify All (${keys?.length ?? 0})`}
          </button>
          {verifyProgress && (
            <button onClick={() => verifyAbort.current?.abort()} className="text-xs text-neutral-400 hover:text-error-500">
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Key List */}
      <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50">
              <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500">Key ID</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500">Public Key</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500">Address</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-neutral-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {keysLoading ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-neutral-400">Loading...</td></tr>
            ) : !keys?.length ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-neutral-400">No keys found</td></tr>
            ) : (
              keys.map((key) => {
                const status = keyStatuses[key.key_id] ?? "untested";
                const parts = key.key_id.split(":");
                const displayId = parts.length > 2 ? parts.slice(2).join(":") : key.key_id.slice(-20);

                return (
                  <tr key={key.key_id} className="border-b border-neutral-50 hover:bg-neutral-50/50">
                    <td className="px-4 py-2 font-mono text-xs text-primary-900">{displayId}</td>
                    <td className="px-4 py-2 font-mono text-xs text-neutral-500">
                      {key.public_key.slice(0, 10)}...{key.public_key.slice(-6)}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-neutral-500">
                      {key.ethereum_address.slice(0, 8)}...{key.ethereum_address.slice(-4)}
                    </td>
                    <td className="px-4 py-2"><StatusBadge status={status} /></td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {keys && keys.length > 0 && (
          <div className="px-4 py-2 border-t border-neutral-100 text-xs text-neutral-400">
            {keys.length} keys total
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: KeyStatus }) {
  switch (status) {
    case "verified":
      return <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2 py-0.5 text-xs font-medium text-success-700">
        <span className="h-1.5 w-1.5 rounded-full bg-success-500" /> Verified
      </span>;
    case "failed":
      return <span className="inline-flex items-center gap-1 rounded-full bg-error-50 px-2 py-0.5 text-xs font-medium text-error-700">
        <span className="h-1.5 w-1.5 rounded-full bg-error-500" /> Failed
      </span>;
    case "signing":
      return <span className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-xs font-medium text-accent-700">
        <span className="h-1.5 w-1.5 rounded-full bg-accent-500 animate-pulse" /> Signing...
      </span>;
    default:
      return <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
        <span className="h-1.5 w-1.5 rounded-full bg-neutral-300" /> Untested
      </span>;
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
