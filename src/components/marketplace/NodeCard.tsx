"use client";

import { type Address } from "viem";
import { type NodeMetadata } from "@/lib/nodeRegistry";
import { useNodeHealth } from "@/hooks/useNodeApi";

interface NodeCardProps {
  address: Address;
  isOpen: boolean;
  registeredAt: bigint;
  metadata?: NodeMetadata;
  onSelect?: (address: Address) => void;
  selected?: boolean;
}

export function NodeCard({
  address,
  isOpen,
  registeredAt,
  metadata,
  onSelect,
  selected,
}: NodeCardProps) {
  const { data: health } = useNodeHealth(metadata?.apiUrl);
  const isOnline = health?.status === "ok";

  const registeredDate = new Date(Number(registeredAt) * 1000);
  const initials = (metadata?.name ?? address.slice(2, 4))
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      onClick={() => onSelect?.(address)}
      className={`
        flex items-center gap-5 rounded-xl border px-5 py-4 transition-all
        ${
          selected
            ? "border-accent-500 bg-accent-50 ring-2 ring-accent-200"
            : "border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-sm"
        }
        ${onSelect ? "cursor-pointer" : ""}
      `}
    >
      {/* Avatar */}
      {metadata?.logo ? (
        <img
          src={metadata.logo}
          alt={metadata.name}
          className="h-11 w-11 rounded-lg object-cover"
        />
      ) : (
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-700 to-primary-500 text-sm font-bold text-white">
          {initials}
        </div>
      )}

      {/* Main info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-primary-900 truncate">
            {metadata?.name ??
              `${address.slice(0, 6)}...${address.slice(-4)}`}
          </h3>
          {metadata?.category && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
              {metadata.category}
            </span>
          )}
        </div>
        {metadata?.description && (
          <p className="mt-0.5 text-sm text-neutral-500 truncate">
            {metadata.description}
          </p>
        )}
      </div>

      {/* Status badges */}
      <div className="flex shrink-0 items-center gap-3">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
            isOpen
              ? "bg-success-50 text-success-700"
              : "bg-accent-50 text-accent-700"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isOpen ? "bg-success-500" : "bg-accent-500"
            }`}
          />
          {isOpen ? "Open" : "Permissioned"}
        </span>

        {metadata?.apiUrl && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              isOnline
                ? "bg-success-50 text-success-700"
                : "bg-neutral-100 text-neutral-400"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isOnline ? "bg-success-500" : "bg-neutral-300"
              }`}
            />
            {isOnline ? "Online" : "Offline"}
          </span>
        )}
      </div>

      {/* Address */}
      <div className="hidden sm:block shrink-0 font-mono text-xs text-neutral-400">
        {address.slice(0, 6)}...{address.slice(-4)}
      </div>
    </div>
  );
}
