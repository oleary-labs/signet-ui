import Link from "next/link";
import { type Address } from "viem";

interface GroupCardProps {
  address: Address;
  threshold?: bigint;
  activeNodeCount: number;
  isOperational?: boolean;
}

export function GroupCard({
  address,
  threshold,
  activeNodeCount,
  isOperational,
}: GroupCardProps) {
  const initials = address.slice(2, 4).toUpperCase();

  return (
    <Link
      href={`/groups/${address}`}
      className="flex items-center gap-5 rounded-xl border border-neutral-200 bg-white px-5 py-4 hover:border-neutral-300 hover:shadow-sm transition-all"
    >
      {/* Avatar */}
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent-600 to-accent-400 text-sm font-bold text-white">
        {initials}
      </div>

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-primary-900 truncate">
            Trust Group
          </h3>
          {threshold !== undefined && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
              {String(threshold)}-of-{activeNodeCount}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-neutral-500 truncate">
          {activeNodeCount} {activeNodeCount === 1 ? "node" : "nodes"}
        </p>
      </div>

      {/* Status badge */}
      <div className="flex shrink-0 items-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            isOperational
              ? "bg-success-50 text-success-700"
              : "bg-error-50 text-error-600"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isOperational ? "bg-success-500" : "bg-error-500"
            }`}
          />
          {isOperational ? "Operational" : "Degraded"}
        </span>
      </div>

      {/* Address */}
      <div className="hidden sm:block shrink-0 font-mono text-xs text-neutral-400">
        {address.slice(0, 6)}...{address.slice(-4)}
      </div>
    </Link>
  );
}

export function GroupCardSkeleton() {
  return (
    <div className="flex items-center gap-5 rounded-xl border border-neutral-200 bg-white px-5 py-4 animate-pulse">
      <div className="h-11 w-11 shrink-0 rounded-lg bg-neutral-200" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-32 rounded bg-neutral-200" />
        <div className="h-3 w-20 rounded bg-neutral-200" />
      </div>
      <div className="h-6 w-20 rounded-full bg-neutral-200" />
      <div className="hidden sm:block h-4 w-24 rounded bg-neutral-200" />
    </div>
  );
}
