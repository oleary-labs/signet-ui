"use client";

import { useState, useCallback } from "react";
import { type Address, type Hex, encodeFunctionData, type Abi } from "viem";
import { useSignetAuth } from "./useSignetAuth";
import { sessionKeyMaterial } from "@/providers/signetAuth";
import { submitUserOp, type UserOpStatus } from "@/lib/signet-sdk/userop";
import { signetAccountFactory } from "@/config/contracts";
import { env } from "@/config/env";

type WriteStatus = "idle" | UserOpStatus | "needs-invite-code" | "success" | "error";

interface WriteParams {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: unknown[];
  value?: bigint;
}

interface UseSignetWriteReturn {
  write: (params: WriteParams) => Promise<Hex>;
  status: WriteStatus;
  error: Error | null;
  txHash: Hex | null;
  needsInviteCode: boolean;
  submitInviteCode: (code: string) => void;
  reset: () => void;
}

const NOT_WHITELISTED_RE = /not whitelisted/i;

/**
 * Hook for submitting on-chain transactions via Signet.
 *
 * Drop-in replacement for wagmi's useWriteContract, but routes
 * through the ERC-4337 UserOperation flow via the Signet SDK.
 *
 * If the paymaster rejects the sender as "not whitelisted", the hook
 * transitions to status "needs-invite-code". The caller should render
 * an invite code input and call submitInviteCode(code), which retries
 * the operation with the code in the ERC-7677 context.
 */
export function useSignetWrite(): UseSignetWriteReturn {
  const { account, claims, groupPublicKey } = useSignetAuth();
  const [status, setStatus] = useState<WriteStatus>("idle");
  const [error, setError] = useState<Error | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [pendingParams, setPendingParams] = useState<WriteParams | null>(null);
  const [inviteCodeResolve, setInviteCodeResolve] = useState<((code: string) => void) | null>(null);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setTxHash(null);
    setPendingParams(null);
    setInviteCodeResolve(null);
  }, []);

  const submitInviteCode = useCallback((code: string) => {
    if (inviteCodeResolve) {
      inviteCodeResolve(code);
      setInviteCodeResolve(null);
    }
  }, [inviteCodeResolve]);

  const executeWrite = useCallback(
    async (params: WriteParams, inviteCode?: string): Promise<Hex> => {
      if (!account) throw new Error("Not authenticated");
      if (!claims) throw new Error("No auth claims available");
      if (!groupPublicKey) throw new Error("No group public key available");
      if (!sessionKeyMaterial.keypair) throw new Error("No session keypair available");

      setStatus("building");

      const callData = encodeFunctionData({
        abi: params.abi,
        functionName: params.functionName,
        args: params.args ?? [],
      } as Parameters<typeof encodeFunctionData>[0]);

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
          paymasterContext: inviteCode ? { invite_code: inviteCode } : undefined,
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
    },
    [account, claims, groupPublicKey]
  );

  const write = useCallback(
    async (params: WriteParams): Promise<Hex> => {
      try {
        return await executeWrite(params);
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err));

        // If the paymaster rejected because sender isn't whitelisted,
        // pause and ask for an invite code, then retry automatically.
        if (NOT_WHITELISTED_RE.test(e.message) && env.usePaymaster) {
          setPendingParams(params);
          setStatus("needs-invite-code");

          const code = await new Promise<string>((resolve) => {
            setInviteCodeResolve(() => resolve);
          });

          // Retry the full pipeline with the invite code in the ERC-7677 context.
          // On success the sender is whitelisted — future calls work without it.
          try {
            return await executeWrite(params, code);
          } catch (retryErr) {
            const retryError = retryErr instanceof Error ? retryErr : new Error(String(retryErr));
            setError(retryError);
            setStatus("error");
            throw retryError;
          }
        }

        setError(e);
        setStatus("error");
        throw e;
      }
    },
    [executeWrite]
  );

  return {
    write,
    status,
    error,
    txHash,
    needsInviteCode: status === "needs-invite-code",
    submitInviteCode,
    reset,
  };
}
