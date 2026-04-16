"use client";

import { useEffect, useState } from "react";
import { type Address } from "viem";
import { useRegisteredNodes } from "@/hooks/useFactory";
import {
  type NodeRegistry,
  loadNodeRegistry,
  getNodeMetadata,
} from "@/lib/nodeRegistry";
import { NodeCard } from "./NodeCard";

interface NodeGridProps {
  onSelect?: (address: Address) => void;
  selected?: Set<string>;
}

export function NodeGrid({ onSelect, selected }: NodeGridProps) {
  const { data: nodes, isLoading, error } = useRegisteredNodes();
  const [registry, setRegistry] = useState<NodeRegistry>({});

  useEffect(() => {
    loadNodeRegistry().then(setRegistry);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl border border-neutral-200 bg-neutral-50"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-error-400/30 bg-error-50 p-8 text-center">
        <p className="text-sm text-error-600">
          Failed to load providers. Check your RPC connection.
        </p>
        <p className="mt-1 text-xs text-error-500">{error.message}</p>
      </div>
    );
  }

  const nodeAddresses = (nodes as Address[]) ?? [];

  if (nodeAddresses.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-12 text-center">
        <p className="text-sm text-neutral-500">
          No signing providers registered yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {nodeAddresses.map((address) => (
        <NodeCard
          key={address}
          address={address}
          isOpen={true}
          registeredAt={BigInt(Math.floor(Date.now() / 1000))}
          metadata={getNodeMetadata(registry, address)}
          onSelect={onSelect}
          selected={selected?.has(address.toLowerCase())}
        />
      ))}
    </div>
  );
}
