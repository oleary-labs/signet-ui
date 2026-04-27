/**
 * EIP-8141 Frame Transaction builder for Signet.
 *
 * Frame transactions (tx type 0x06) replace the ERC-4337 UserOp pipeline
 * with native account abstraction. A VERIFY frame runs the FROST Schnorr
 * verifier on-chain, and a SENDER frame executes the user's call.
 *
 * Wire format: 0x06 || rlp([chainId, nonce, sender, frames, maxPriorityFeePerGas,
 *              maxFeePerGas, maxFeePerBlobGas, blobVersionedHashes])
 *
 * sigHash: keccak256(0x06 || rlp(tx)) with VERIFY frame data elided (replaced
 *          with empty bytes before encoding).
 */

import {
  type Address,
  type Hex,
  concat,
  encodeFunctionData,
  keccak256,
  numberToHex,
  toRlp,
} from "viem";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** EIP-8141 transaction type prefix. */
const FRAME_TX_TYPE = 0x06;

/** Frame modes. */
export const FrameMode = {
  DEFAULT: 0,
  VERIFY: 1,
  SENDER: 2,
} as const;

/** APPROVE scope flags. */
export const ApproveScope = {
  PAYMENT: 0x01,
  EXECUTION: 0x02,
  BOTH: 0x03,
} as const;

/** Ethrex EIP-8141 testnet. */
export const ETHREX_CHAIN_ID = 1729n;
export const ETHREX_RPC_URL = "https://demo.eip-8141.ethrex.xyz/rpc";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Frame {
  mode: 0 | 1 | 2;
  target: Address;
  gasLimit: bigint;
  data: Hex;
}

export interface FrameTransaction {
  chainId: bigint;
  nonce: bigint;
  sender: Address;
  frames: Frame[];
  maxPriorityFeePerGas: bigint;
  maxFeePerGas: bigint;
  maxFeePerBlobGas: bigint;
  blobVersionedHashes: Hex[];
}

// ---------------------------------------------------------------------------
// SignetFrameAccount ABI (subset needed for encoding calldata)
// ---------------------------------------------------------------------------

const SIGNET_FRAME_ACCOUNT_ABI = [
  {
    name: "verifyAndApprove",
    type: "function",
    inputs: [{ name: "signature", type: "bytes" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "verifyOnly",
    type: "function",
    inputs: [{ name: "signature", type: "bytes" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    name: "execute",
    type: "function",
    inputs: [
      { name: "dest", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

// ---------------------------------------------------------------------------
// Frame helpers
// ---------------------------------------------------------------------------

/**
 * Build a VERIFY frame that calls verifyAndApprove (scope=3: sender + payer).
 * The data field is initially empty — it's filled after sigHash computation
 * with the encoded verifyAndApprove(signature) calldata.
 */
export function buildVerifyFrame(
  accountAddress: Address,
  gasLimit = 200_000n,
): Frame {
  return {
    mode: FrameMode.VERIFY,
    target: accountAddress,
    gasLimit,
    data: "0x", // placeholder — filled with encoded verifyAndApprove(sig) after signing
  };
}

/**
 * Build a SENDER frame that calls execute(dest, value, calldata) on the account.
 */
export function buildSenderFrame(
  accountAddress: Address,
  dest: Address,
  value: bigint,
  callData: Hex,
  gasLimit = 200_000n,
): Frame {
  const data = encodeFunctionData({
    abi: SIGNET_FRAME_ACCOUNT_ABI,
    functionName: "execute",
    args: [dest, value, callData],
  });
  return {
    mode: FrameMode.SENDER,
    target: accountAddress,
    gasLimit,
    data,
  };
}

/**
 * Encode the FROST signature into verifyAndApprove calldata for a VERIFY frame.
 */
export function encodeVerifyData(frostSignature: Hex): Hex {
  return encodeFunctionData({
    abi: SIGNET_FRAME_ACCOUNT_ABI,
    functionName: "verifyAndApprove",
    args: [frostSignature],
  });
}

// ---------------------------------------------------------------------------
// RLP encoding
// ---------------------------------------------------------------------------

/**
 * RLP-encode a frame transaction (without the 0x06 type prefix).
 *
 * Frame RLP: [mode, target, gasLimit, data]
 * Tx RLP: [chainId, nonce, sender, [frame, ...], maxPriorityFeePerGas,
 *          maxFeePerGas, maxFeePerBlobGas, blobVersionedHashes]
 */
function rlpEncodeFrameTxInner(tx: FrameTransaction): Hex {
  const frames = tx.frames.map((f) => [
    f.mode === 0 ? "0x" : numberToHex(f.mode),
    f.target,
    numberToHex(f.gasLimit),
    f.data,
  ]);

  return toRlp([
    numberToHex(tx.chainId),
    tx.nonce === 0n ? "0x" : numberToHex(tx.nonce),
    tx.sender,
    frames,
    numberToHex(tx.maxPriorityFeePerGas),
    numberToHex(tx.maxFeePerGas),
    tx.maxFeePerBlobGas === 0n ? "0x" : numberToHex(tx.maxFeePerBlobGas),
    tx.blobVersionedHashes,
  ]);
}

/**
 * Full wire encoding: 0x06 || rlp(tx)
 */
export function encodeFrameTransaction(tx: FrameTransaction): Hex {
  const rlpPayload = rlpEncodeFrameTxInner(tx);
  return concat(["0x06", rlpPayload]);
}

// ---------------------------------------------------------------------------
// sigHash computation
// ---------------------------------------------------------------------------

/**
 * Compute the EIP-8141 signature hash.
 *
 * sigHash = keccak256(0x06 || rlp(tx_with_verify_data_elided))
 *
 * VERIFY frames (mode=1) have their `data` field replaced with empty bytes
 * before encoding, because the data field contains the signature itself.
 */
export function computeSigHash(tx: FrameTransaction): Hex {
  const elided: FrameTransaction = {
    ...tx,
    frames: tx.frames.map((f) =>
      f.mode === FrameMode.VERIFY ? { ...f, data: "0x" as Hex } : f,
    ),
  };
  return keccak256(encodeFrameTransaction(elided));
}

// ---------------------------------------------------------------------------
// Chain interaction
// ---------------------------------------------------------------------------

async function rpcCall(rpcUrl: string, method: string, params: unknown[] = []) {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(`${method}: ${json.error.message}`);
  }
  return json.result;
}

/** Fetch the nonce for a sender on the ethrex chain. */
export async function fetchFrameTxNonce(
  rpcUrl: string,
  sender: Address,
): Promise<bigint> {
  const result = await rpcCall(rpcUrl, "eth_getTransactionCount", [sender, "latest"]);
  return BigInt(result);
}

/** Fetch current gas fees. */
export async function fetchGasFees(
  rpcUrl: string,
): Promise<{ maxPriorityFeePerGas: bigint; maxFeePerGas: bigint }> {
  const [baseFee, priorityFee] = await Promise.all([
    rpcCall(rpcUrl, "eth_gasPrice"),
    rpcCall(rpcUrl, "eth_maxPriorityFeePerGas").catch(() => "0x3b9aca00"), // 1 gwei fallback
  ]);
  const base = BigInt(baseFee);
  const priority = BigInt(priorityFee);
  return {
    maxPriorityFeePerGas: priority,
    maxFeePerGas: base + priority,
  };
}

/**
 * Submit a signed frame transaction via eth_sendRawTransaction.
 * Returns the transaction hash.
 */
export async function sendFrameTransaction(
  rpcUrl: string,
  signedTx: Hex,
): Promise<Hex> {
  return rpcCall(rpcUrl, "eth_sendRawTransaction", [signedTx]) as Promise<Hex>;
}

/**
 * Poll for a transaction receipt.
 */
export async function waitForReceipt(
  rpcUrl: string,
  txHash: Hex,
  maxAttempts = 60,
  intervalMs = 2000,
): Promise<{ transactionHash: Hex; status: Hex }> {
  for (let i = 0; i < maxAttempts; i++) {
    const receipt = await rpcCall(rpcUrl, "eth_getTransactionReceipt", [txHash]);
    if (receipt) {
      return {
        transactionHash: receipt.transactionHash,
        status: receipt.status,
      };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error("Transaction receipt not found after polling");
}
