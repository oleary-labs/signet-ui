"use client";

import { useParams } from "next/navigation";
import { type Address } from "viem";
import { useGroupDetails } from "@/hooks/useFactory";

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

  const { data: details, isLoading } = useGroupDetails(address);

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
  ] = details ?? [];

  const threshold = thresholdResult?.result as bigint | undefined;
  const quorum = quorumResult?.result as bigint | undefined;
  const manager = managerResult?.result as Address | undefined;
  const activeNodes = (activeNodesResult?.result as Address[] | undefined) ?? [];
  const pendingNodes = (pendingNodesResult?.result as Address[] | undefined) ?? [];
  const isOperational = isOperationalResult?.result as boolean | undefined;

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
          label="Quorum"
          value={quorum !== undefined ? String(quorum) : "-"}
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
            {activeNodes.map((node) => (
              <div
                key={node}
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-success-500" />
                  <span className="font-mono text-sm text-primary-900">{node}</span>
                </div>
                <span className="text-xs text-success-700">Active</span>
              </div>
            ))}
            {pendingNodes.map((node) => (
              <div
                key={node}
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-accent-400" />
                  <span className="font-mono text-sm text-primary-900">{node}</span>
                </div>
                <span className="text-xs text-accent-600">Pending</span>
              </div>
            ))}
            {activeNodes.length === 0 && pendingNodes.length === 0 && (
              <p className="text-sm text-neutral-500">No nodes in this group.</p>
            )}
          </div>
        </section>

        {/* OAuth Issuers */}
        <section>
          <h2 className="text-lg font-semibold text-primary-900 mb-4">
            OAuth Issuers
          </h2>
          <p className="text-sm text-neutral-500">
            {/* TODO: render issuers from contract read */}
            Issuer management coming soon.
          </p>
        </section>

        {/* Auth Keys */}
        <section>
          <h2 className="text-lg font-semibold text-primary-900 mb-4">
            Authorization Keys
          </h2>
          <p className="text-sm text-neutral-500">
            {/* TODO: render auth keys from contract read */}
            Auth key management coming soon.
          </p>
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
}: {
  label: string;
  value: string;
  color?: "success" | "error";
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="text-xs text-neutral-500 mb-1">{label}</p>
      <p
        className={`text-lg font-semibold ${
          color === "success"
            ? "text-success-600"
            : color === "error"
            ? "text-error-500"
            : "text-primary-900"
        } ${mono ? "font-mono text-sm" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
