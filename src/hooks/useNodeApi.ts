"use client";

import { useQuery } from "@tanstack/react-query";
import { type NodeHealth, type NodeInfo, type KeyInfo } from "@/lib/nodeApi";

/**
 * Fetch from a node via the server-side proxy to avoid CORS.
 */
async function proxyGet<T>(nodeUrl: string, path: string): Promise<T> {
  const res = await fetch("/api/node/proxy", {
    method: "POST",
    headers: {
      "x-node-url": nodeUrl,
      "x-node-path": path,
      "x-node-method": "GET",
    },
  });
  if (!res.ok) throw new Error(`Node ${path} failed: ${res.status}`);
  return res.json();
}

/**
 * Query a node's health status.
 */
export function useNodeHealth(apiUrl: string | undefined) {
  return useQuery<NodeHealth>({
    queryKey: ["node-health", apiUrl],
    queryFn: () => proxyGet<NodeHealth>(apiUrl!, "/v1/health"),
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
    queryFn: () => proxyGet<NodeInfo>(apiUrl!, "/v1/info"),
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
    queryFn: () => proxyGet<KeyInfo[]>(apiUrl!, `/v1/keys${groupId ? `?group_id=${groupId}` : ""}`),
    enabled: !!apiUrl,
    staleTime: 30_000,
    retry: 1,
  });
}
