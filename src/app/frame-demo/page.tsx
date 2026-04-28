"use client";

import { useState } from "react";
import { type Address, type Hex, hexToBytes } from "viem";
import { useSignetAuth } from "@/hooks/useSignetAuth";
import { sessionKeyMaterial } from "@/providers/signetAuth";
import { env } from "@/config/env";
import { signSignRequest } from "@/lib/signet-sdk/request";
import {
  type FrameTransaction,
  ETHREX_CHAIN_ID,
  ETHREX_RPC_URL,
  FrameMode,
  buildVerifyFrame,
  buildSenderFrame,
  computeSigHash,
  encodeVerifyData,
  encodeFrameTransaction,
  fetchFrameTxNonce,
  fetchGasFees,
  sendFrameTransaction,
  waitForReceipt,
} from "@/lib/signet-sdk/frameTx";

// ---------------------------------------------------------------------------
// Config — hardcoded for ethrex EIP-8141 testnet (chain 1729)
// ---------------------------------------------------------------------------

const FRAME_ACCOUNT: Address = "0xf8F3FEa1BB0fE201cE3c913C7Eef31f0DB14bCD4";

// ---------------------------------------------------------------------------
// Status labels
// ---------------------------------------------------------------------------

type DemoStatus =
  | "idle"
  | "building"
  | "signing"
  | "submitting"
  | "confirming"
  | "success"
  | "error";

const STATUS_LABELS: Record<DemoStatus, string> = {
  idle: "Ready",
  building: "Building frame transaction...",
  signing: "Requesting FROST threshold signature...",
  submitting: "Submitting to ethrex...",
  confirming: "Waiting for confirmation...",
  success: "Transaction confirmed!",
  error: "Transaction failed",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FrameDemoPage() {
  const { isAuthenticated, signIn, status: authStatus, claims } = useSignetAuth();

  const [dest, setDest] = useState("");
  const [amount, setAmount] = useState("");
  const [calldata, setCalldata] = useState("");

  const [status, setStatus] = useState<DemoStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [frameTxJson, setFrameTxJson] = useState<string | null>(null);
  const [sigHash, setSigHash] = useState<Hex | null>(null);

  async function execute() {
    if (!claims || !sessionKeyMaterial.keypair) {
      setError("Not authenticated");
      return;
    }

    setStatus("building");
    setError(null);
    setTxHash(null);
    setFrameTxJson(null);
    setSigHash(null);

    try {
      // Build the frame transaction
      const targetAddr = (dest || FRAME_ACCOUNT) as Address;
      const value = amount ? BigInt(Math.floor(parseFloat(amount) * 1e18)) : 0n;
      const innerCalldata = (calldata || "0x") as Hex;

      const [nonce, gasFees] = await Promise.all([
        fetchFrameTxNonce(ETHREX_RPC_URL, FRAME_ACCOUNT),
        fetchGasFees(ETHREX_RPC_URL),
      ]);

      const verifyFrame = buildVerifyFrame(FRAME_ACCOUNT);
      const senderFrame = buildSenderFrame(
        FRAME_ACCOUNT,
        targetAddr,
        value,
        innerCalldata,
      );

      const tx: FrameTransaction = {
        chainId: ETHREX_CHAIN_ID,
        nonce,
        sender: FRAME_ACCOUNT,
        frames: [verifyFrame, senderFrame],
        maxPriorityFeePerGas: gasFees.maxPriorityFeePerGas,
        maxFeePerGas: gasFees.maxFeePerGas,
        maxFeePerBlobGas: 0n,
        blobVersionedHashes: [],
      };

      // Compute sigHash (VERIFY data elided)
      const hash = computeSigHash(tx);
      setSigHash(hash);

      // FROST threshold sign via bootstrap group
      setStatus("signing");
      const messageHash = hexToBytes(hash);
      const signReq = await signSignRequest(
        sessionKeyMaterial.keypair,
        claims,
        env.bootstrapGroup,
        messageHash,
      );

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
        throw new Error(`FROST signing failed: ${signRes.status} — ${body}`);
      }

      const { ethereum_signature } = await signRes.json();

      // Pack the signature into the VERIFY frame
      tx.frames[0].data = encodeVerifyData(ethereum_signature as Hex);

      // Show the full frame tx structure
      setFrameTxJson(JSON.stringify({
        chainId: tx.chainId.toString(),
        nonce: tx.nonce.toString(),
        sender: tx.sender,
        frames: tx.frames.map((f) => ({
          mode: f.mode === FrameMode.VERIFY ? "VERIFY" : f.mode === FrameMode.SENDER ? "SENDER" : "DEFAULT",
          target: f.target,
          gasLimit: f.gasLimit.toString(),
          dataLength: (f.data.length - 2) / 2 + " bytes",
        })),
        maxFeePerGas: tx.maxFeePerGas.toString(),
      }, null, 2));

      // Encode and submit
      setStatus("submitting");
      const rawTx = encodeFrameTransaction(tx);
      const hash2 = await sendFrameTransaction(ETHREX_RPC_URL, rawTx);
      setTxHash(hash2);

      // Wait for receipt
      setStatus("confirming");
      const receipt = await waitForReceipt(ETHREX_RPC_URL, hash2);
      if (receipt.status === "0x1") {
        setStatus("success");
      } else {
        throw new Error("Transaction reverted on-chain");
      }
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function reset() {
    setStatus("idle");
    setError(null);
    setTxHash(null);
    setFrameTxJson(null);
    setSigHash(null);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-primary-900">
          EIP-8141 Frame Transaction Demo
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          FROST threshold signing with native frame transactions on ethrex
          (chain 1729). No bundler, no EntryPoint, no paymaster.
        </p>
        <div className="mt-3 flex gap-2 text-xs font-mono text-neutral-400">
          <span>Chain: 1729</span>
          <span>·</span>
          <span>Account: {FRAME_ACCOUNT.slice(0, 8)}...{FRAME_ACCOUNT.slice(-6)}</span>
        </div>
      </div>

      {/* Auth */}
      {!isAuthenticated ? (
        <div className="rounded-lg border border-neutral-200 bg-white p-6 text-center">
          <p className="text-sm text-neutral-500 mb-4">
            Sign in to send a frame transaction signed by the Signet bootstrap group.
          </p>
          <button
            onClick={signIn}
            disabled={authStatus === "oauth"}
            className="rounded-lg bg-accent-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 transition-colors disabled:opacity-50"
          >
            {authStatus === "oauth" ? "Signing in..." : "Sign In with Google"}
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Inputs */}
          <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-4">
            <h2 className="text-sm font-medium text-neutral-500">Transaction</h2>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">
                Destination (default: self)
              </label>
              <input
                type="text"
                value={dest}
                onChange={(e) => setDest(e.target.value)}
                placeholder={FRAME_ACCOUNT}
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-mono text-primary-900 placeholder-neutral-300 focus:border-accent-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">
                Value (ETH)
              </label>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-mono text-primary-900 placeholder-neutral-300 focus:border-accent-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">
                Calldata (hex, optional)
              </label>
              <input
                type="text"
                value={calldata}
                onChange={(e) => setCalldata(e.target.value)}
                placeholder="0x"
                className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm font-mono text-primary-900 placeholder-neutral-300 focus:border-accent-500 focus:outline-none"
              />
            </div>

            <button
              onClick={execute}
              disabled={status !== "idle" && status !== "success" && status !== "error"}
              className="w-full rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 transition-colors disabled:opacity-30"
            >
              Send Frame Transaction
            </button>
          </div>

          {/* Status */}
          {status !== "idle" && (
            <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-3">
              <div className="flex items-center gap-3">
                {status === "success" ? (
                  <div className="h-2.5 w-2.5 rounded-full bg-success-500" />
                ) : status === "error" ? (
                  <div className="h-2.5 w-2.5 rounded-full bg-error-500" />
                ) : (
                  <div className="h-2.5 w-2.5 rounded-full bg-accent-500 animate-pulse" />
                )}
                <span className="text-sm font-medium text-primary-900">
                  {STATUS_LABELS[status]}
                </span>
              </div>

              {error && (
                <p className="text-xs text-error-600 font-mono break-all">{error}</p>
              )}

              {sigHash && (
                <div>
                  <span className="text-xs text-neutral-400">sigHash: </span>
                  <span className="text-xs font-mono text-primary-900 break-all">
                    {sigHash}
                  </span>
                </div>
              )}

              {txHash && (
                <div>
                  <span className="text-xs text-neutral-400">tx: </span>
                  <span className="text-xs font-mono text-primary-900 break-all">
                    {txHash}
                  </span>
                </div>
              )}

              {(status === "success" || status === "error") && (
                <button
                  onClick={reset}
                  className="text-xs text-accent-600 hover:text-accent-700"
                >
                  Reset
                </button>
              )}
            </div>
          )}

          {/* Frame TX structure */}
          {frameTxJson && (
            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <h2 className="text-sm font-medium text-neutral-500 mb-2">
                Frame Transaction
              </h2>
              <pre className="text-xs font-mono text-primary-900 overflow-x-auto whitespace-pre-wrap">
                {frameTxJson}
              </pre>
            </div>
          )}

          {/* Architecture diagram */}
          <div className="rounded-lg border border-neutral-200 bg-white p-4">
            <h2 className="text-sm font-medium text-neutral-500 mb-3">How it works</h2>
            <div className="text-xs text-neutral-600 space-y-2 font-mono">
              <p>1. Build frame tx: VERIFY + SENDER frames</p>
              <p>2. Compute sigHash (VERIFY data elided)</p>
              <p>3. FROST sign sigHash via Sepolia bootstrap group</p>
              <p>4. Pack signature into VERIFY frame data</p>
              <p>5. RLP encode as type-06 tx, submit to ethrex</p>
              <p className="text-neutral-400 mt-2">
                No bundler · No EntryPoint · No paymaster
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
