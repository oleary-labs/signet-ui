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
  const res = await fetch("/api/bundler", {
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
  const res = await fetch("/api/bundler", {
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
    transactionHash: json.result.transactionHash,
    success: json.result.success,
  };
}

export interface GasEstimate {
  preVerificationGas: Hex;
  verificationGasLimit: Hex;
  callGasLimit: Hex;
}

/**
 * Estimate gas for a UserOperation via eth_estimateUserOperationGas.
 * Can be used to pre-flight the op before signing.
 */
export async function estimateUserOpGas(
  userOp: PackedUserOperation
): Promise<GasEstimate> {
  const res = await fetch("/api/bundler", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_estimateUserOperationGas",
      params: [serializeUserOp(userOp), env.entryPointAddress],
    }),
  });

  const json = await res.json();
  if (json.error) {
    throw new Error(`Gas estimation failed: ${json.error.message}`);
  }

  return json.result;
}

/**
 * Serialize a PackedUserOperation to the unpacked v0.7 RPC format
 * expected by signet-min-bundler.
 *
 * The bundler accepts separate gas fields (callGasLimit, verificationGasLimit,
 * maxFeePerGas, maxPriorityFeePerGas) and factory/factoryData instead of
 * packed accountGasLimits/gasFees/initCode.
 */
function serializeUserOp(userOp: PackedUserOperation) {
  // Unpack accountGasLimits: hi 128 bits = verificationGasLimit, lo 128 bits = callGasLimit
  const gasLimitsHex = userOp.accountGasLimits.slice(2).padStart(64, "0");
  const verificationGasLimit = `0x${BigInt("0x" + gasLimitsHex.slice(0, 32)).toString(16)}`;
  const callGasLimit = `0x${BigInt("0x" + gasLimitsHex.slice(32, 64)).toString(16)}`;

  // Unpack gasFees: hi 128 bits = maxPriorityFeePerGas, lo 128 bits = maxFeePerGas
  const gasFeesHex = (userOp.gasFees as string).slice(2).padStart(64, "0");
  const maxPriorityFeePerGas = `0x${BigInt("0x" + gasFeesHex.slice(0, 32)).toString(16)}`;
  const maxFeePerGas = `0x${BigInt("0x" + gasFeesHex.slice(32, 64)).toString(16)}`;

  // Unpack initCode: first 20 bytes = factory, rest = factoryData
  const initCodeHex = userOp.initCode.slice(2);
  const factory = initCodeHex.length >= 40 ? `0x${initCodeHex.slice(0, 40)}` : "";
  const factoryData = initCodeHex.length > 40 ? `0x${initCodeHex.slice(40)}` : "";

  // Unpack paymasterAndData: first 20 bytes = paymaster, rest = paymasterData
  const pmHex = userOp.paymasterAndData.slice(2);
  const paymaster = pmHex.length >= 40 ? `0x${pmHex.slice(0, 40)}` : "";
  const paymasterData = pmHex.length > 40 ? `0x${pmHex.slice(40)}` : "";

  return {
    sender: userOp.sender,
    nonce: `0x${userOp.nonce.toString(16)}`,
    factory,
    factoryData,
    callData: userOp.callData,
    callGasLimit,
    verificationGasLimit,
    preVerificationGas: `0x${userOp.preVerificationGas.toString(16)}`,
    maxFeePerGas,
    maxPriorityFeePerGas,
    paymaster,
    paymasterData,
    signature: userOp.signature,
  };
}
