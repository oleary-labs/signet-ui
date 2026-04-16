"use client";

import { useQuery } from "@tanstack/react-query";
import { NodeApiClient, type NodeHealth, type NodeInfo, type KeyInfo } from "@/lib/nodeApi";

/**
 * Query a node's health status.
 */
export function useNodeHealth(apiUrl: string | undefined) {
  return useQuery<NodeHealth>({
    queryKey: ["node-health", apiUrl],
    queryFn: () => new NodeApiClient(apiUrl!).health(),
    enabled: !!apiUrl,
    refetchInterval: 15_000,
    retry: 1,
  });
}

/**
 * Query a node's identity info.
 */
export function useNodeInfo(apiUrl: string | undefined) {
  return useQuery<NodeInfo>({
    queryKey: ["node-info", apiUrl],
    queryFn: () => new NodeApiClient(apiUrl!).info(),
    enabled: !!apiUrl,
    staleTime: 60_000,
    retry: 1,
  });
}

/**
 * Query key shards held by a node, optionally filtered by group.
 */
export function useNodeKeys(apiUrl: string | undefined, groupId?: string) {
  return useQuery<KeyInfo[]>({
    queryKey: ["node-keys", apiUrl, groupId],
    queryFn: () => new NodeApiClient(apiUrl!).keys(groupId),
    enabled: !!apiUrl,
    staleTime: 30_000,
    retry: 1,
  });
}
