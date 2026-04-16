import { type Hex } from "viem";
import { env } from "@/config/env";
import { type PackedUserOperation } from "./userOp";

/**
 * Client for signet-min-bundler.
 *
 * Submits signed UserOperations to the bundler, which forwards
 * them to the ERC-4337 EntryPoint on-chain.
 */

export interface BundlerSendResult {
  userOpHash: Hex;
}

export interface UserOpReceipt {
  userOpHash: Hex;
  transactionHash: Hex;
  success: boolean;
}

/**
 * Send a signed UserOperation to the bundler via eth_sendUserOperation.
 */
export async function sendUserOp(
  userOp: PackedUserOperation
): Promise<BundlerSendResult> {
  const res = await fetch(env.bundlerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_sendUserOperation",
      params: [serializeUserOp(userOp), env.entryPointAddress],
    }),
  });

  const json = await res.json();
  if (json.error) {
    throw new Error(`Bundler error: ${json.error.message}`);
  }

  return { userOpHash: json.result };
}

/**
 * Poll for a UserOperation receipt.
 */
export async function getUserOpReceipt(
  userOpHash: Hex
): Promise<UserOpReceipt | null> {
  const res = await fetch(env.bundlerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getUserOperationReceipt",
      params: [userOpHash],
    }),
  });

  const json = await res.json();
  if (json.error) {
    throw new Error(`Bundler error: ${json.error.message}`);
  }

  if (!json.result) return null;

  return {
    userOpHash: json.result.userOpHash,
    transactionHash: json.result.receipt.transactionHash,
    success: json.result.success,
  };
}

/**
 * Serialize a UserOperation for JSON-RPC transport.
 */
function serializeUserOp(userOp: PackedUserOperation) {
  return {
    sender: userOp.sender,
    nonce: `0x${userOp.nonce.toString(16)}`,
    initCode: userOp.initCode,
    callData: userOp.callData,
    accountGasLimits: userOp.accountGasLimits,
    preVerificationGas: `0x${userOp.preVerificationGas.toString(16)}`,
    gasFees: userOp.gasFees,
    paymasterAndData: userOp.paymasterAndData,
    signature: userOp.signature,
  };
}
