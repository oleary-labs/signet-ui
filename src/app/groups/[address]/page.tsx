"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { type Address, type Hex, type Abi, keccak256, toHex, encodePacked } from "viem";
import { useQuery } from "@tanstack/react-query";
import { useGroupDetails, useRegisteredNodes, useRemovalRequests } from "@/hooks/useFactory";
import { useSignetAuth } from "@/hooks/useSignetAuth";
import { useTxStatus } from "@/providers/txStatus";
import { sessionKeyMaterial } from "@/providers/signetAuth";
import { adminRequest, type AdminAuthConfig } from "@/lib/signet-sdk/admin";
import { signetGroup } from "@/config/contracts";
import { env } from "@/config/env";
import { loadNodeRegistry, getNodeMetadata, type NodeRegistry, type NodeMetadata } from "@/lib/nodeRegistry";
import { useNodeHealth } from "@/hooks/useNodeApi";

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

  const { account, groupPublicKey, claims, reauthenticate } = useSignetAuth();
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

  interface ReshareStatus {
    group_id?: string;
    status: "active" | "resharing";
    keys_total?: number;
    keys_done?: number;
    keys_stale?: number;
    started_at?: string;
    is_coordinator?: boolean;
  }

  const { data: reshareStatus } = useQuery<ReshareStatus | null>({
    queryKey: ["reshare-status", address],
    queryFn: async () => {
      if (!authKeyPub || !sessionKeyMaterial.keypair || !claims) return null;
      try {
        return await adminRequest<ReshareStatus>(
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
      } catch (e) {
        console.error("[reshare-status]", e);
        return null;
      }
    },
    enabled: !!authKeyPub && !!sessionKeyMaterial.keypair && !!claims,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === "resharing" ? 3_000 : 30_000;
    },
    retry: 1,
  });

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
          undefined,
          reauthenticate,
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
    removalDelayResult,
    issuersResult,
    authKeysResult,
    pendingRemovalsResult,
  ] = details ?? [];

  const threshold = thresholdResult?.result as bigint | undefined;
  const quorum = quorumResult?.result as bigint | undefined;
  const manager = managerResult?.result as Address | undefined;
  const activeNodes = (activeNodesResult?.result as Address[] | undefined) ?? [];
  const pendingNodes = (pendingNodesResult?.result as Address[] | undefined) ?? [];
  const isOperational = isOperationalResult?.result as boolean | undefined;
  const removalDelay = removalDelayResult?.result as bigint | undefined;
  const pendingRemovals = (pendingRemovalsResult?.result as Address[] | undefined) ?? [];

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
          value={
            manager
              ? manager.toLowerCase() === account?.toLowerCase()
                ? `You (${manager.slice(0, 6)}...${manager.slice(-4)})`
                : `${manager.slice(0, 6)}...${manager.slice(-4)}`
              : "-"
          }
          mono
        />
      </div>

      {/* Reshare progress */}
      {reshareStatus?.status === "resharing" && !!reshareStatus.keys_total && reshareStatus.keys_done !== reshareStatus.keys_total && (
        <div className="mb-12 rounded-lg border border-accent-200 bg-accent-50/50 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent-300 border-t-accent-600" />
              <span className="text-sm font-semibold text-accent-800">
                Key reshare in progress
              </span>
            </div>
            <span className="text-xs text-accent-600">
              {reshareStatus.keys_done} / {reshareStatus.keys_total} keys
            </span>
          </div>
          <div className="h-2 rounded-full bg-accent-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-accent-500 transition-all duration-500"
              style={{
                width: `${reshareStatus.keys_total ? (reshareStatus.keys_done! / reshareStatus.keys_total) * 100 : 0}%`,
              }}
            />
          </div>
          {reshareStatus.keys_stale != null && reshareStatus.keys_stale > 0 && (
            <p className="mt-1.5 text-xs text-accent-600">
              {reshareStatus.keys_stale} key{reshareStatus.keys_stale === 1 ? "" : "s"} remaining
            </p>
          )}
        </div>
      )}

      {/* Sections */}
      <div className="space-y-12">
        {/* Providers */}
        <NodesSection
          groupAddress={address}
          activeNodes={activeNodes}
          pendingNodes={pendingNodes}
          pendingRemovals={pendingRemovals}
          threshold={threshold}
          removalDelay={removalDelay}
          registry={registry}
        />

        {/* OAuth Issuers */}
        <AddIssuerSection
          groupAddress={address}
          issuers={issuers}
        />

        {/* Auth Keys */}
        <AuthKeysSection
          groupAddress={address}
          authKeys={authKeys}
          adminKeyPub={groupPublicKey ? `0x01${groupPublicKey.slice(2)}` : null}
        />

        {/* Time-Lock Queue */}
        <PendingOperationsSection
          groupAddress={address}
          pendingRemovals={pendingRemovals}
          registry={registry}
        />
      </div>
    </div>
  );
}

function NodesSection({
  groupAddress,
  activeNodes,
  pendingNodes,
  pendingRemovals,
  threshold,
  removalDelay,
  registry,
}: {
  groupAddress: Address;
  activeNodes: Address[];
  pendingNodes: Address[];
  pendingRemovals: Address[];
  threshold: bigint | undefined;
  removalDelay: bigint | undefined;
  registry: NodeRegistry;
}) {
  const [showInvite, setShowInvite] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<Address | null>(null);
  const { submit } = useTxStatus();

  function handleInvite(node: Address) {
    submit("Inviting node...", {
      address: groupAddress,
      abi: signetGroup(groupAddress).abi as Abi,
      functionName: "inviteNode",
      args: [node],
    });
    setShowInvite(false);
  }

  function handleQueueRemoval(node: Address) {
    submit("Removing node...", {
      address: groupAddress,
      abi: signetGroup(groupAddress).abi as Abi,
      functionName: "queueRemoval",
      args: [node],
    });
    setConfirmRemove(null);
  }

  // Filter out nodes that are already pending removal so they only show once
  const pendingRemovalSet = new Set(pendingRemovals.map((a) => a.toLowerCase()));
  const displayActiveNodes = activeNodes.filter((a) => !pendingRemovalSet.has(a.toLowerCase()));

  // Can't remove if it would drop active count below threshold
  const atThreshold = threshold !== undefined && BigInt(activeNodes.length) <= threshold;

  // All nodes already in the group (active, pending invite, pending removal)
  const existingNodes = new Set([
    ...activeNodes.map((a) => a.toLowerCase()),
    ...pendingNodes.map((a) => a.toLowerCase()),
    ...pendingRemovals.map((a) => a.toLowerCase()),
  ]);

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-primary-900">Providers</h2>
        <button
          onClick={() => { setShowInvite(true); }}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:border-neutral-400 transition-colors"
        >
          Add Node
        </button>
      </div>

      <div className="space-y-3">
        {displayActiveNodes.map((node) => {
          const meta = getNodeMetadata(registry, node);
          return (
            <div
              key={node}
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-success-500" />
                <span className="text-sm text-primary-900">
                  <span className="font-medium">{meta?.name ?? "Unknown Provider"}</span>{" "}
                  <span className="font-mono text-neutral-400">
                    ({node.slice(0, 6)}...{node.slice(-4)})
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-success-700">Active</span>
                <button
                  onClick={() => setConfirmRemove(node)}
                  disabled={atThreshold}
                  className="p-1 text-neutral-300 hover:text-error-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-neutral-300"
                  title={atThreshold ? "Cannot remove — would drop below threshold" : "Remove node"}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
              </div>
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
                  <span className="font-medium">{meta?.name ?? "Unknown Provider"}</span>{" "}
                  <span className="font-mono text-neutral-400">
                    ({node.slice(0, 6)}...{node.slice(-4)})
                  </span>
                </span>
              </div>
              <span className="text-xs text-accent-600">Pending Invite</span>
            </div>
          );
        })}
        {pendingRemovals.map((node) => {
          const meta = getNodeMetadata(registry, node);
          return (
            <div
              key={node}
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-error-400" />
                <span className="text-sm text-primary-900">
                  <span className="font-medium">{meta?.name ?? "Unknown Provider"}</span>{" "}
                  <span className="font-mono text-neutral-400">
                    ({node.slice(0, 6)}...{node.slice(-4)})
                  </span>
                </span>
              </div>
              <span className="text-xs text-error-600">Pending Removal</span>
            </div>
          );
        })}
        {displayActiveNodes.length === 0 && pendingNodes.length === 0 && pendingRemovals.length === 0 && (
          <p className="text-sm text-neutral-500">No nodes in this group.</p>
        )}
      </div>

      {/* Invite node dialog */}
      {showInvite && (
        <InviteNodeDialog
          existingNodes={existingNodes}
          onInvite={handleInvite}
          onClose={() => { setShowInvite(false); }}
          registry={registry}
        />
      )}

      {/* invite code handled by TxStatusProvider in header */}

      {/* Confirm removal dialog */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h3 className="text-sm font-semibold text-primary-900">Remove node?</h3>
            <p className="mt-2 text-sm text-neutral-500">
              This will queue removal of{" "}
              <span className="font-medium text-primary-800">
                {getNodeMetadata(registry, confirmRemove)?.name ?? confirmRemove.slice(0, 10) + "..."}
              </span>.
              {removalDelay !== undefined && (
                <> The node can be removed after a {formatDuration(Number(removalDelay))} delay.</>
              )}
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => { setConfirmRemove(null); }}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:border-neutral-400 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleQueueRemoval(confirmRemove)}
                disabled={false}
                className="rounded-lg bg-error-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-error-600 transition-colors disabled:opacity-50"
              >
                Queue Removal
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function InviteNodeDialog({
  existingNodes,
  onInvite,
  onClose,
  registry,
}: {
  existingNodes: Set<string>;
  onInvite: (node: Address) => void;
  onClose: () => void;
  registry: NodeRegistry;
}) {
  const { data: allNodes, isLoading } = useRegisteredNodes();
  const nodeAddresses = (allNodes as Address[] | undefined) ?? [];
  const availableNodes = nodeAddresses.filter(
    (addr) => !existingNodes.has(addr.toLowerCase()),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-primary-900">Invite Node</h3>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Select a registered provider to invite to this group.
        </p>

        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-neutral-100" />
              ))}
            </div>
          ) : availableNodes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center">
              <p className="text-sm text-neutral-500">
                No available providers to invite.
              </p>
            </div>
          ) : (
            availableNodes.map((addr) => {
              const meta = getNodeMetadata(registry, addr);
              return (
                <InviteNodeRow
                  key={addr}
                  address={addr}
                  metadata={meta}
                  onInvite={onInvite}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function InviteNodeRow({
  address,
  metadata,
  onInvite,
}: {
  address: Address;
  metadata?: NodeMetadata;
  onInvite: (node: Address) => void;
}) {
  const { data: health } = useNodeHealth(metadata?.apiUrl);
  const isOnline = health?.status === "ok";
  const initials = (metadata?.name ?? address.slice(2, 4)).slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-4 rounded-lg border border-neutral-200 bg-white px-4 py-3 hover:border-neutral-300 transition-colors">
      {metadata?.logo ? (
        <img src={metadata.logo} alt={metadata.name} className="h-9 w-9 rounded-lg object-cover" />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-700 to-primary-500 text-xs font-bold text-white">
          {initials}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-primary-900 truncate">
          {metadata?.name ?? "Unknown Provider"}
        </p>
        <p className="font-mono text-xs text-neutral-400">
          {address.slice(0, 6)}...{address.slice(-4)}
        </p>
      </div>
      {metadata?.apiUrl && (
        <span
          className={`inline-flex items-center gap-1 text-xs ${
            isOnline ? "text-success-600" : "text-neutral-400"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? "bg-success-500" : "bg-neutral-300"}`} />
          {isOnline ? "Online" : "Offline"}
        </span>
      )}
      <button
        onClick={() => onInvite(address)}
        disabled={false}
        className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-600 transition-colors disabled:opacity-50"
      >
        Invite
      </button>
    </div>
  );
}

function PendingOperationsSection({
  groupAddress,
  pendingRemovals,
  registry,
}: {
  groupAddress: Address;
  pendingRemovals: Address[];
  registry: NodeRegistry;
}) {
  const { data: removalData } = useRemovalRequests(groupAddress, pendingRemovals);
  const { submit } = useTxStatus();

  function handleExecuteRemoval(node: Address) {
    submit("Executing removal...", {
      address: groupAddress,
      abi: signetGroup(groupAddress).abi as Abi,
      functionName: "executeRemoval",
      args: [node],
    });
  }

  function handleCancelRemoval(node: Address) {
    submit("Cancelling removal...", {
      address: groupAddress,
      abi: signetGroup(groupAddress).abi as Abi,
      functionName: "cancelRemoval",
      args: [node],
    });
  }

  const hasOperations = pendingRemovals.length > 0;

  return (
    <section>
      <h2 className="text-lg font-semibold text-primary-900 mb-4">
        Pending Operations
      </h2>

      {!hasOperations ? (
        <p className="text-sm text-neutral-500">No pending operations.</p>
      ) : (
        <div className="space-y-3">
          {pendingRemovals.map((node, i) => {
            const meta = getNodeMetadata(registry, node);
            const req = removalData?.[i]?.result as
              | { executeAfter: bigint; initiator: Address }
              | undefined;
            const executeAfter = req?.executeAfter ? Number(req.executeAfter) : null;
            const now = Math.floor(Date.now() / 1000);
            const canExecute = executeAfter !== null && now >= executeAfter;
            const timeLeft = executeAfter !== null ? Math.max(0, executeAfter - now) : null;

            return (
              <div
                key={node}
                className="flex items-center justify-between rounded-lg border border-error-200 bg-error-50/50 px-4 py-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-error-700">Node Removal</span>
                    <span className="text-sm font-medium text-primary-900">
                      {meta?.name ?? `${node.slice(0, 6)}...${node.slice(-4)}`}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {canExecute
                      ? "Ready to execute"
                      : timeLeft !== null
                      ? `Executable in ${formatDuration(timeLeft)}`
                      : "Loading..."}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCancelRemoval(node)}
                    className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:border-neutral-400 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleExecuteRemoval(node)}
                    disabled={!canExecute}
                    className="rounded-lg bg-error-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-error-600 transition-colors disabled:opacity-50"
                  >
                    Execute
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </section>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  return h > 0 ? `${d}d ${h}h` : `${d}d`;
}

function AddIssuerSection({
  groupAddress,
  issuers,
}: {
  groupAddress: Address;
  issuers: { issuer: string; clientIds: readonly string[] }[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [issuerUrl, setIssuerUrl] = useState("");
  const [clientIds, setClientIds] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const { submit } = useTxStatus();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ids = clientIds.split(",").map((s) => s.trim()).filter(Boolean);
    submit("Adding issuer...", {
      address: groupAddress,
      abi: signetGroup(groupAddress).abi as Abi,
      functionName: "addIssuer",
      args: [issuerUrl, ids],
    });
    setIssuerUrl("");
    setClientIds("");
    setShowForm(false);
  }

  function handleRemove(issuer: string) {
    const issuerHash = keccak256(encodePacked(["string"], [issuer]));
    submit("Removing issuer...", {
      address: groupAddress,
      abi: signetGroup(groupAddress).abi as Abi,
      functionName: "removeIssuer",
      args: [issuerHash],
    });
    setConfirmRemove(null);
  }

  return (
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
        <button
          onClick={() => { setShowForm(!showForm); }}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:border-neutral-400 transition-colors"
        >
          {showForm ? "Cancel" : "Add Issuer"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 rounded-lg border border-accent-200 bg-accent-50/50 p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-primary-800 mb-1">
              Issuer URL
            </label>
            <input
              type="text"
              value={issuerUrl}
              onChange={(e) => setIssuerUrl(e.target.value)}
              placeholder="https://accounts.google.com"
              className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-primary-900 placeholder:text-neutral-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-primary-800 mb-1">
              Client IDs
            </label>
            <input
              type="text"
              value={clientIds}
              onChange={(e) => setClientIds(e.target.value)}
              placeholder="client-id-1, client-id-2"
              className="w-full rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-primary-900 placeholder:text-neutral-400 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
            />
            <p className="mt-1 text-xs text-neutral-400">Comma-separated. Leave empty for any client ID.</p>
          </div>
          <button
            type="submit"
            disabled={!issuerUrl}
            className="rounded-lg bg-accent-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-accent-600 transition-colors disabled:opacity-50"
          >
            Add Issuer
          </button>
        </form>
      )}

      {issuers.length > 0 ? (
        <div className="space-y-3">
          {issuers.map((iss, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3"
            >
              <div>
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
              <button
                onClick={() => setConfirmRemove(iss.issuer)}
                disabled={false}
                className="p-1 text-neutral-300 hover:text-error-500 transition-colors disabled:opacity-50"
                title="Remove issuer"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        !showForm && (
          <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center">
            <p className="text-sm text-neutral-500">
              No issuers configured. Add an OAuth issuer to enable social login for your app.
            </p>
          </div>
        )
      )}

      {/* invite code handled by TxStatusProvider in header */}

      {/* Confirm remove modal */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h3 className="text-sm font-semibold text-primary-900">Remove issuer?</h3>
            <p className="mt-2 text-sm text-neutral-500">
              This will remove <span className="font-medium text-primary-800">{confirmRemove}</span> and
              all its client IDs. Users authenticating via this issuer will no longer be able to access this group.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setConfirmRemove(null)}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:border-neutral-400 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemove(confirmRemove)}
                className="rounded-lg bg-error-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-error-600 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function AuthKeysSection({
  groupAddress,
  authKeys,
  adminKeyPub,
}: {
  groupAddress: Address;
  authKeys: readonly `0x${string}`[];
  adminKeyPub: string | null;
}) {
  const [generatedKey, setGeneratedKey] = useState<{ privateKey: string; publicKey: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const { submit } = useTxStatus();

  async function handleGenerate() {
    const { utils, getPublicKey } = await import("@noble/secp256k1");
    const privateKey = utils.randomSecretKey();
    const publicKey = getPublicKey(privateKey, true); // 33-byte compressed

    const privHex = Array.from(privateKey).map((b) => b.toString(16).padStart(2, "0")).join("");
    const pubHex = Array.from(publicKey).map((b) => b.toString(16).padStart(2, "0")).join("");

    // ECDSA prefix 0x00 + compressed public key
    const prefixedPub = `0x00${pubHex}` as Hex;

    submit("Adding auth key...", {
      address: groupAddress,
      abi: signetGroup(groupAddress).abi as Abi,
      functionName: "addAuthKey",
      args: [prefixedPub],
    }, () => {
      // onSuccess: show the private key reveal
      setGeneratedKey({ privateKey: privHex, publicKey: pubHex });
    });
  }

  function handleRemove(key: string) {
    const keyHash = keccak256(key as Hex);
    submit("Removing auth key...", {
      address: groupAddress,
      abi: signetGroup(groupAddress).abi as Abi,
      functionName: "removeAuthKey",
      args: [keyHash],
    });
    setConfirmRemove(null);
  }

  function copyPrivateKey() {
    if (!generatedKey) return;
    navigator.clipboard.writeText(generatedKey.privateKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
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
        <button
          onClick={handleGenerate}
          disabled={false}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:border-neutral-400 transition-colors disabled:opacity-50"
        >
          Generate Key
        </button>
      </div>

      {/* Show generated private key — one-time reveal */}
      {generatedKey && (
        <div className="mb-4 rounded-lg border border-success-200 bg-success-50 p-4">
          <p className="text-xs font-semibold text-success-800 mb-1">
            Key generated — save this private key now. It will not be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white px-3 py-2 font-mono text-xs text-primary-900 border border-success-200">
              {generatedKey.privateKey}
            </code>
            <button
              onClick={copyPrivateKey}
              className="shrink-0 rounded-lg border border-success-300 px-3 py-2 text-xs font-semibold text-success-700 hover:bg-success-100 transition-colors"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            onClick={() => setGeneratedKey(null)}
            className="mt-2 text-xs text-success-600 hover:text-success-800 transition-colors"
          >
            Dismiss
          </button>
        </div>
      )}

      {authKeys.length > 0 ? (
        <div className="space-y-3">
          {authKeys.map((key) => {
            const isAdmin = adminKeyPub &&
              key.toLowerCase() === adminKeyPub.toLowerCase();
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
                  {isAdmin && (
                    <span className="rounded-full bg-accent-50 px-2 py-0.5 text-xs font-medium text-accent-700">
                      Admin key
                    </span>
                  )}
                </div>
                {!isAdmin && (
                  <button
                    onClick={() => setConfirmRemove(key)}
                    disabled={false}
                    className="p-1 text-neutral-300 hover:text-error-500 transition-colors disabled:opacity-50"
                    title="Remove key"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  </button>
                )}
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

      {/* invite code handled by TxStatusProvider in header */}

      {/* Confirm remove modal */}
      {confirmRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-lg">
            <h3 className="text-sm font-semibold text-primary-900">Remove authorization key?</h3>
            <p className="mt-2 text-sm text-neutral-500">
              This will revoke access for any application using this key.
              The key <span className="font-mono text-xs">{confirmRemove.slice(4, 12)}...{confirmRemove.slice(-8)}</span> will
              no longer be able to authenticate with this group.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setConfirmRemove(null)}
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:border-neutral-400 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRemove(confirmRemove)}
                className="rounded-lg bg-error-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-error-600 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
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
