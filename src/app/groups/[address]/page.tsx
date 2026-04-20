"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { type Address, type Hex } from "viem";
import { useQuery } from "@tanstack/react-query";
import { useGroupDetails } from "@/hooks/useFactory";
import { useSignetAuth } from "@/hooks/useSignetAuth";
import { sessionKeyMaterial } from "@/providers/signetAuth";
import { adminRequest, type AdminAuthConfig } from "@/lib/signet-sdk/admin";
import { env } from "@/config/env";
import { loadNodeRegistry, getNodeMetadata, type NodeRegistry } from "@/lib/nodeRegistry";

/**
 * Group detail / management page.
 *
 * Shows full group state and provides management controls:
 * - Membership (active nodes, pending invites, pending removals)
 * - OAuth issuers
 * - Authorization keys
 * - Unified time-lock queue
 */
export default function GroupDetailPage() {
  const params = useParams();
  const address = params.address as Address;

  const { groupPublicKey, claims } = useSignetAuth();
  const { data: details, isLoading } = useGroupDetails(address);
  const [registry, setRegistry] = useState<NodeRegistry>({});

  useEffect(() => {
    loadNodeRegistry().then(setRegistry);
  }, []);

  const authKeyPub = groupPublicKey ? `0x01${groupPublicKey.slice(2)}` : null;
  const adminConfig: AdminAuthConfig = {
    nodeProxyUrl: "/api/node/proxy",
    bootstrapGroup: env.bootstrapGroup,
    bootstrapNodes: env.bootstrapNodes,
  };

  const { data: keyCount } = useQuery({
    queryKey: ["admin-keys-count", address],
    queryFn: async () => {
      if (!authKeyPub || !sessionKeyMaterial.keypair || !claims) return null;
      try {
        const keys = await adminRequest<unknown[]>(
          adminConfig,
          env.bootstrapNodes[0],
          "/admin/keys",
          address,
          authKeyPub,
          sessionKeyMaterial.keypair,
          claims,
        );
        return keys.length;
      } catch (e) {
        console.error("[admin-keys]", e);
        return null;
      }
    },
    enabled: !!authKeyPub && !!sessionKeyMaterial.keypair && !!claims,
    staleTime: 30_000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 rounded bg-neutral-200" />
          <div className="h-4 w-96 rounded bg-neutral-200" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-neutral-200" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const [
    thresholdResult,
    quorumResult,
    managerResult,
    activeNodesResult,
    pendingNodesResult,
    isOperationalResult,
    _removalDelayResult,
    issuersResult,
    authKeysResult,
  ] = details ?? [];

  const threshold = thresholdResult?.result as bigint | undefined;
  const quorum = quorumResult?.result as bigint | undefined;
  const manager = managerResult?.result as Address | undefined;
  const activeNodes = (activeNodesResult?.result as Address[] | undefined) ?? [];
  const pendingNodes = (pendingNodesResult?.result as Address[] | undefined) ?? [];
  const isOperational = isOperationalResult?.result as boolean | undefined;

  type OAuthIssuer = { issuer: string; clientIds: readonly string[] };
  const issuers = (issuersResult?.result as OAuthIssuer[] | undefined) ?? [];
  const authKeys = (authKeysResult?.result as readonly `0x${string}`[] | undefined) ?? [];

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-primary-900">Group</h1>
        <p className="mt-1 font-mono text-sm text-neutral-500">{address}</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-12">
        <StatCard
          label="Status"
          value={isOperational ? "Operational" : "Degraded"}
          color={isOperational ? "success" : "error"}
        />
        <StatCard
          label="Threshold"
          value={threshold !== undefined ? `${threshold} of ${activeNodes.length}` : "-"}
        />
        <StatCard
          label="Keys"
          value={keyCount != null ? String(keyCount) : "—"}
          muted={keyCount == null}
        />
        <StatCard
          label="Manager"
          value={manager ? `${manager.slice(0, 6)}...${manager.slice(-4)}` : "-"}
          mono
        />
      </div>

      {/* Sections */}
      <div className="space-y-12">
        {/* Membership */}
        <section>
          <h2 className="text-lg font-semibold text-primary-900 mb-4">
            Membership
          </h2>
          <div className="space-y-3">
            {activeNodes.map((node) => {
              const meta = getNodeMetadata(registry, node);
              return (
                <div
                  key={node}
                  className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="h-2 w-2 rounded-full bg-success-500" />
                    <span className="text-sm text-primary-900">
                      {meta?.name ? (
                        <>
                          <span className="font-medium">{meta.name}</span>{" "}
                          <span className="font-mono text-neutral-400">
                            ({node.slice(0, 6)}...{node.slice(-4)})
                          </span>
                        </>
                      ) : (
                        <span className="font-mono">{node}</span>
                      )}
                    </span>
                  </div>
                  <span className="text-xs text-success-700">Active</span>
                </div>
              );
            })}
            {pendingNodes.map((node) => {
              const meta = getNodeMetadata(registry, node);
              return (
                <div
                  key={node}
                  className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="h-2 w-2 rounded-full bg-accent-400" />
                    <span className="text-sm text-primary-900">
                      {meta?.name ? (
                        <>
                          <span className="font-medium">{meta.name}</span>{" "}
                          <span className="font-mono text-neutral-400">
                            ({node.slice(0, 6)}...{node.slice(-4)})
                          </span>
                        </>
                      ) : (
                        <span className="font-mono">{node}</span>
                      )}
                    </span>
                  </div>
                  <span className="text-xs text-accent-600">Pending</span>
                </div>
              );
            })}
            {activeNodes.length === 0 && pendingNodes.length === 0 && (
              <p className="text-sm text-neutral-500">No nodes in this group.</p>
            )}
          </div>
        </section>

        {/* OAuth Issuers */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-primary-900">
                OAuth Issuers
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Configure which OAuth providers can authenticate users.{" "}
                <a href="#" className="text-accent-500 hover:text-accent-600">
                  Learn more &rarr;
                </a>
              </p>
            </div>
            <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:border-neutral-400 transition-colors">
              Add Issuer
            </button>
          </div>
          {issuers.length > 0 ? (
            <div className="space-y-3">
              {issuers.map((iss, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-neutral-200 bg-white px-4 py-3"
                >
                  <p className="text-sm font-medium text-primary-900">
                    {iss.issuer}
                  </p>
                  {iss.clientIds.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {iss.clientIds.map((cid) => (
                        <span
                          key={cid}
                          className="rounded bg-neutral-100 px-2 py-0.5 font-mono text-xs text-neutral-600"
                        >
                          {cid}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center">
              <p className="text-sm text-neutral-500">
                No issuers configured. Add an OAuth issuer to enable social login for your app.
              </p>
            </div>
          )}
        </section>

        {/* Auth Keys */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-primary-900">
                Authorization Keys
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Configure API keys that can manage keygen and signing directly.{" "}
                <a href="#" className="text-accent-500 hover:text-accent-600">
                  Learn more &rarr;
                </a>
              </p>
            </div>
            <button className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:border-neutral-400 transition-colors">
              Add Key
            </button>
          </div>
          {authKeys.length > 0 ? (
            <div className="space-y-3">
              {authKeys.map((key) => {
                const isOwnKey = groupPublicKey &&
                  key.toLowerCase() === `0x01${groupPublicKey.slice(2)}`.toLowerCase();
                const prefixByte = key.slice(2, 4);
                const keyType = prefixByte === "00" ? "ECDSA" : prefixByte === "01" ? "Schnorr" : "Unknown";
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-primary-900">
                        {key.slice(4, 12)}...{key.slice(-8)}
                      </span>
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                        {keyType}
                      </span>
                      {isOwnKey && (
                        <span className="rounded-full bg-accent-50 px-2 py-0.5 text-xs font-medium text-accent-700">
                          Admin key
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center">
              <p className="text-sm text-neutral-500">
                No authorization keys configured.
              </p>
            </div>
          )}
        </section>

        {/* Time-Lock Queue */}
        <section>
          <h2 className="text-lg font-semibold text-primary-900 mb-4">
            Pending Operations
          </h2>
          <p className="text-sm text-neutral-500">
            {/* TODO: unified time-lock queue */}
            No pending operations.
          </p>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  mono,
  muted,
}: {
  label: string;
  value: string;
  color?: "success" | "error";
  mono?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p
        className={`${muted ? "text-sm text-neutral-400" : "text-lg font-semibold"} ${
          !muted && color === "success"
            ? "text-success-600"
            : !muted && color === "error"
            ? "text-error-500"
            : muted
            ? ""
            : "text-primary-900"
        } ${mono ? "font-mono text-sm" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
