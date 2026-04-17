"use client";

import { useState, useCallback } from "react";
import {
  type Address,
  type Hex,
  encodeFunctionData,
  createPublicClient,
  http,
  concat,
  type Abi,
} from "viem";
import { useSignetAuth } from "./useSignetAuth";
import { sessionKeyMaterial } from "@/providers/signetAuth";
import { buildUserOp, getUserOpHash } from "@/lib/userOp";
import { sendUserOp, getUserOpReceipt, estimateUserOpGas } from "@/lib/bundler";
import { signSignRequest } from "@/lib/signet-sdk/request";
import { signetAccountFactory } from "@/config/contracts";
import { getActiveChain } from "@/config/chains";
import { env } from "@/config/env";

type WriteStatus = "idle" | "building" | "estimating" | "signing" | "submitting" | "confirming" | "success" | "error";

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

      try {
        // 1. Encode the target contract call
        setStatus("building");
        const callData = encodeFunctionData({
          abi: params.abi,
          functionName: params.functionName,
          args: params.args ?? [],
        } as Parameters<typeof encodeFunctionData>[0]);

        // 2. Check if account is deployed; if not, build initCode
        let initCode: Hex = "0x";
        const client = createPublicClient({
          chain: getActiveChain(),
          transport: http(env.rpcUrl),
        });

        // Fetch nonce from EntryPoint
        const nonce = await client.readContract({
          address: env.entryPointAddress,
          abi: [{
            name: "getNonce",
            type: "function",
            inputs: [
              { name: "sender", type: "address" },
              { name: "key", type: "uint192" },
            ],
            outputs: [{ type: "uint256" }],
            stateMutability: "view",
          }],
          functionName: "getNonce",
          args: [account, 0n],
        }) as bigint;

        const code = await client.getCode({ address: account });
        if (!code || code === "0x") {
          if (!groupPublicKey) throw new Error("No group public key available for account deployment");
          const factoryCallData = encodeFunctionData({
            abi: signetAccountFactory.abi,
            functionName: "createAccount",
            args: [env.entryPointAddress, groupPublicKey, 0n],
          } as Parameters<typeof encodeFunctionData>[0]);
          initCode = concat([signetAccountFactory.address, factoryCallData]);
        }

        const userOp = buildUserOp({
          sender: account,
          nonce,
          initCode,
          dest: params.address,
          value: params.value,
          callData,
        });

        // 2b. Estimate gas via bundler (pre-flight validation)
        setStatus("estimating");
        const gasEstimate = await estimateUserOpGas(userOp);
        userOp.accountGasLimits =
          `0x${BigInt(gasEstimate.verificationGasLimit).toString(16).padStart(32, "0")}${BigInt(gasEstimate.callGasLimit).toString(16).padStart(32, "0")}` as Hex;
        userOp.preVerificationGas = BigInt(gasEstimate.preVerificationGas);

        // 3. Sign via bootstrap group
        setStatus("signing");
        if (!claims) throw new Error("No auth claims available");
        if (!sessionKeyMaterial.keypair) throw new Error("No session keypair available");

        const opHash = getUserOpHash(userOp, env.entryPointAddress, env.chainId);
        const messageHash = new Uint8Array(
          (opHash.slice(2).match(/.{2}/g) ?? []).map((b) => parseInt(b, 16))
        );

        const signReq = await signSignRequest(
          sessionKeyMaterial.keypair,
          claims,
          env.bootstrapGroup,
          messageHash,
        );

        // Send to first bootstrap node via proxy
        const signRes = await fetch("/api/node/proxy", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-node-url": env.bootstrapNodes[0],
            "x-node-path": "/v1/sign",
          },
          body: JSON.stringify(signReq),
        });

        if (!signRes.ok) {
          const body = await signRes.text();
          throw new Error(`Threshold signing failed: ${signRes.status} — ${body}`);
        }

        const { ethereum_signature } = await signRes.json();
        userOp.signature = ethereum_signature as Hex;

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
