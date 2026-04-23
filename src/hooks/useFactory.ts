"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { type Address, type Abi } from "viem";
import { signetFactory, signetGroup } from "@/config/contracts";

/**
 * Fetch all group addresses from the factory.
 */
export function useAllGroups() {
  return useReadContract({
    ...signetFactory,
    functionName: "getGroups",
  });
}

/**
 * Fetch all registered node addresses from the factory.
 */
export function useRegisteredNodes() {
  return useReadContract({
    ...signetFactory,
    functionName: "getRegisteredNodes",
  });
}

/**
 * Fetch NodeInfo for a specific node address.
 */
export function useNodeOnChain(address: Address | undefined) {
  return useReadContract({
    ...signetFactory,
    functionName: "getNode",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
}

/**
 * Fetch all groups a node participates in.
 */
export function useNodeGroups(address: Address | undefined) {
  return useReadContract({
    ...signetFactory,
    functionName: "getNodeGroups",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
}

/**
 * Fetch core group state: threshold, quorum, manager, active nodes.
 */
export function useGroupDetails(address: Address | undefined) {
  return useReadContracts({
    contracts: address
      ? [
          { ...signetGroup(address), functionName: "threshold" },
          { ...signetGroup(address), functionName: "quorum" },
          { ...signetGroup(address), functionName: "manager" },
          { ...signetGroup(address), functionName: "getActiveNodes" },
          { ...signetGroup(address), functionName: "getPendingNodes" },
          { ...signetGroup(address), functionName: "isOperational" },
          { ...signetGroup(address), functionName: "removalDelay" },
          { ...signetGroup(address), functionName: "getIssuers" },
          { ...signetGroup(address), functionName: "getAuthKeys" },
          { ...signetGroup(address), functionName: "getPendingRemovals" },
        ]
      : [],
    query: { enabled: !!address },
  });
}

/**
 * Fetch removal request details for specific nodes in a group.
 */
export function useRemovalRequests(
  groupAddress: Address | undefined,
  nodes: Address[],
) {
  return useReadContracts({
    contracts: groupAddress
      ? nodes.map((node) => ({
          address: groupAddress,
          abi: signetGroup(groupAddress).abi as Abi,
          functionName: "removalRequests",
          args: [node],
        }))
      : [],
    query: { enabled: !!groupAddress && nodes.length > 0 },
  });
}
