"use client";

import { useMemo } from "react";
import Link from "next/link";
import { type Address, type Abi } from "viem";
import { useReadContracts } from "wagmi";
import { useSignetAuth } from "@/hooks/useSignetAuth";
import { useAllGroups } from "@/hooks/useFactory";
import { signetGroup } from "@/config/contracts";
import {
  GroupCard,
  GroupCardSkeleton,
} from "@/components/dashboard/GroupCard";

/**
 * Dashboard — shows groups managed by the authenticated developer.
 *
 * Fetches all groups from the factory, reads manager() on each,
 * then displays those where manager === the signed-in account.
 */
export default function DashboardPage() {
  const { isAuthenticated, account } = useSignetAuth();
  const { data: allGroups, isLoading: groupsLoading } = useAllGroups();

  const groups = (allGroups as Address[] | undefined) ?? [];

  // Single multicall: read manager + threshold + isOperational + activeNodes for all groups
  const allContracts = groups.flatMap((addr) => {
    const abi = signetGroup(addr).abi as Abi;
    return [
      { address: addr, abi, functionName: "manager" as const },
      { address: addr, abi, functionName: "threshold" as const },
      { address: addr, abi, functionName: "isOperational" as const },
      { address: addr, abi, functionName: "getActiveNodes" as const },
    ];
  });
  const { data: allResults, isLoading: detailsLoading } = useReadContracts({
    contracts: allContracts,
    query: { enabled: groups.length > 0 },
  });

  // Filter to groups managed by this account, with details already loaded
  const FIELDS_PER_GROUP = 4;
  const myGroups = useMemo(() => {
    if (!allResults || !account) return [];
    return groups
      .map((addr, i) => {
        const base = i * FIELDS_PER_GROUP;
        const manager = allResults[base]?.result as Address | undefined;
        const threshold = allResults[base + 1]?.result as bigint | undefined;
        const isOperational = allResults[base + 2]?.result as boolean | undefined;
        const activeNodes = (allResults[base + 3]?.result as Address[] | undefined) ?? [];
        return { addr, manager, threshold, isOperational, activeNodes };
      })
      .filter((g) => g.manager?.toLowerCase() === account.toLowerCase());
  }, [groups, allResults, account]);

  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-24 text-center">
        <h1 className="text-2xl font-bold text-primary-900">Dashboard</h1>
        <p className="mt-4 text-neutral-500">
          Sign in to view and manage your trust groups.
        </p>
      </div>
    );
  }

  const isLoading = groupsLoading || detailsLoading;

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-primary-900">Your Groups</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Trust groups managed by{" "}
            <span className="font-mono">
              {account?.slice(0, 6)}...{account?.slice(-4)}
            </span>
          </p>
        </div>
        <Link
          href="/groups/new"
          className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 transition-colors"
        >
          New Group
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <GroupCardSkeleton key={i} />
          ))}
        </div>
      ) : myGroups.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-12 text-center">
          <p className="text-sm text-neutral-500">
            No groups found. Create your first trust group to get started.
          </p>
          <Link
            href="/groups/new"
            className="mt-4 inline-block text-sm font-medium text-accent-500 hover:text-accent-600 transition-colors"
          >
            Create a Trust Group &rarr;
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {myGroups.map((g) => (
            <GroupCard
              key={g.addr}
              address={g.addr}
              threshold={g.threshold}
              activeNodeCount={g.activeNodes.length}
              isOperational={g.isOperational}
            />
          ))}
        </div>
      )}
    </div>
  );
}
