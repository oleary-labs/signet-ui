"use client";

import { useState, useCallback } from "react";
import {
  type Address,
  type Hex,
  encodeFunctionData,
  type Abi,
} from "viem";
import { useSignetAuth } from "./useSignetAuth";
import { buildUserOp } from "@/lib/userOp";
import { sendUserOp, getUserOpReceipt } from "@/lib/bundler";

type WriteStatus = "idle" | "building" | "signing" | "submitting" | "confirming" | "success" | "error";

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
 * through the ERC-4337 UserOperation flow:
 *
 * 1. Encode the contract call
 * 2. Build a UserOperation wrapping it in SignetAccount.execute
 * 3. Send to bootstrap group nodes for FROST threshold signing
 * 4. Submit signed UserOp to the bundler
 * 5. Poll for on-chain confirmation
 */
export function useSignetWrite(): UseSignetWriteReturn {
  const { account } = useSignetAuth();
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

      try {
        // 1. Encode the target contract call
        setStatus("building");
        const callData = encodeFunctionData({
          abi: params.abi,
          functionName: params.functionName,
          args: params.args ?? [],
        } as Parameters<typeof encodeFunctionData>[0]);

        // 2. Build the UserOperation
        const userOp = buildUserOp({
          sender: account,
          nonce: 0n, // TODO: fetch from EntryPoint
          dest: params.address,
          value: params.value,
          callData,
        });

        // 3. Sign via bootstrap group
        setStatus("signing");
        // TODO: implement threshold signing flow
        // - compute userOpHash
        // - send to bootstrap nodes via /v1/sign
        // - collect threshold signature
        // - attach to userOp.signature

        // 4. Submit to bundler
        setStatus("submitting");
        const { userOpHash } = await sendUserOp(userOp);

        // 5. Poll for receipt
        setStatus("confirming");
        let receipt = null;
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          receipt = await getUserOpReceipt(userOpHash);
          if (receipt) break;
        }

        if (!receipt) throw new Error("Transaction confirmation timed out");
        if (!receipt.success) throw new Error("UserOperation reverted on-chain");

        setTxHash(receipt.transactionHash);
        setStatus("success");
        return receipt.transactionHash;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setStatus("error");
        throw error;
      }
    },
    [account]
  );

  return { write, status, error, txHash, reset };
}
