"use client";

import { useState, useCallback } from "react";
import { type Address, type Hex, encodeFunctionData, type Abi } from "viem";
import { useSignetAuth } from "./useSignetAuth";
import { sessionKeyMaterial } from "@/providers/signetAuth";
import { submitUserOp, type UserOpStatus } from "@/lib/signet-sdk/userop";
import { signetAccountFactory } from "@/config/contracts";
import { env } from "@/config/env";

type WriteStatus = "idle" | UserOpStatus | "success" | "error";

interface UseSignetWriteReturn {
  write: (params: {
    address: Address;
    abi: Abi;
    functionName: string;
    args?: unknown[];
    value?: bigint;
  }) => Promise<Hex>;
  status: WriteStatus;
  error: Error | null;
  txHash: Hex | null;
  reset: () => void;
}

/**
 * Hook for submitting on-chain transactions via Signet.
 *
 * Drop-in replacement for wagmi's useWriteContract, but routes
 * through the ERC-4337 UserOperation flow via the Signet SDK.
 *
 * The hook handles React state; the SDK handles the pipeline.
 */
export function useSignetWrite(): UseSignetWriteReturn {
  const { account, claims, groupPublicKey } = useSignetAuth();
  const [status, setStatus] = useState<WriteStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setTxHash(null);
  }, []);

  const write = useCallback(
    async (params: {
      address: Address;
      abi: Abi;
      functionName: string;
      args?: unknown[];
      value?: bigint;
    }): Promise<Hex> => {
      if (!account) throw new Error("Not authenticated");
      if (!claims) throw new Error("No auth claims available");
      if (!groupPublicKey) throw new Error("No group public key available");
      if (!sessionKeyMaterial.keypair) throw new Error("No session keypair available");

      try {
        setStatus("building");

        // Encode the target contract call (app-specific)
        const callData = encodeFunctionData({
          abi: params.abi,
          functionName: params.functionName,
          args: params.args ?? [],
        } as Parameters<typeof encodeFunctionData>[0]);

        // Submit through the SDK pipeline
        const result = await submitUserOp(
          {
            rpcUrl: env.rpcUrl,
            chainId: env.chainId,
            entryPointAddress: env.entryPointAddress,
            bundlerProxyUrl: "/api/bundler",
            nodeProxyUrl: "/api/node/proxy",
            bootstrapGroup: env.bootstrapGroup,
            bootstrapNodes: env.bootstrapNodes,
            accountFactoryAddress: env.accountFactoryAddress,
            accountFactoryAbi: signetAccountFactory.abi,
            usePaymaster: env.usePaymaster,
          },
          {
            account,
            groupPublicKey,
            dest: params.address,
            value: params.value,
            callData,
            sessionKeypair: sessionKeyMaterial.keypair,
            claims,
            onStatus: setStatus,
          }
        );

        setTxHash(result.transactionHash);
        setStatus("success");
        return result.transactionHash;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setStatus("error");
        throw error;
      }
    },
    [account, claims, groupPublicKey]
  );

  return { write, status, error, txHash, reset };
}
