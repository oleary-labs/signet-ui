"use client";

import Link from "next/link";
import { useSignetAuth } from "@/hooks/useSignetAuth";

/**
 * Dashboard — shows groups managed by the authenticated developer.
 *
 * Walks the factory's group list and displays all groups where
 * the connected SignetAccount is the manager.
 */
export default function DashboardPage() {
  const { isAuthenticated, account } = useSignetAuth();

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

  // TODO: fetch all groups from factory, filter by manager === account
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

      {/* TODO: group cards */}
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
    </div>
  );
}
