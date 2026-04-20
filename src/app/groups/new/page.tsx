"use client";

import { useState, useEffect, useRef } from "react";
import { type Address, type Hex, concat, toHex } from "viem";
import { useSignetAuth } from "@/hooks/useSignetAuth";
import { useSignetWrite } from "@/hooks/useSignetWrite";
import { NodeGrid } from "@/components/marketplace/NodeGrid";
import { loadNodeRegistry, getNodeMetadata, type NodeRegistry } from "@/lib/nodeRegistry";
import { signetFactory } from "@/config/contracts";

type WizardStep = "threshold" | "nodes" | "review" | "deploy";

/**
 * Group creation wizard.
 *
 * Four steps:
 * 1. Set threshold (t) and group size (n) — t-of-n scheme
 * 2. Select nodes from the provider marketplace
 * 3. Review configuration and time-lock defaults
 * 4. Deploy and provision application key
 */
export default function CreateGroupPage() {
  const { isAuthenticated, signIn, status, groupPublicKey } = useSignetAuth();
  const { write, status: deployStatus, error: deployError, txHash, reset: resetDeploy } = useSignetWrite();
  const deployStarted = useRef(false);

  const [step, setStep] = useState<WizardStep>("threshold");
  const [groupSize, setGroupSize] = useState(3);
  const [threshold, setThreshold] = useState(Math.floor(3 / 2) + 1);
  const [selectedNodes, setSelectedNodes] = useState<Set<string>>(new Set());
  const [registry, setRegistry] = useState<NodeRegistry>({});

  useEffect(() => {
    loadNodeRegistry().then(setRegistry);
  }, []);

  const faultTolerance = groupSize - threshold;

  // Require auth to proceed
  if (!isAuthenticated) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-24 text-center">
        <h1 className="text-2xl font-bold text-primary-900">
          Create a Trust Group
        </h1>
        <p className="mt-4 text-neutral-500 max-w-md mx-auto">
          Sign in to create a trust group. You&apos;ll select trusted
          providers and configure your threshold.
        </p>
        <button
          onClick={signIn}
          disabled={status === "oauth"}
          className="mt-8 rounded-lg bg-accent-500 px-6 py-3 text-sm font-semibold text-white hover:bg-accent-600 transition-colors disabled:opacity-50"
        >
          {status === "oauth" ? "Signing in..." : "Sign In to Continue"}
        </button>
      </div>
    );
  }

  function toggleNode(address: Address) {
    setSelectedNodes((prev) => {
      const next = new Set(prev);
      const key = address.toLowerCase();
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      {/* Step indicator */}
      <div className="mb-12">
        <h1 className="text-2xl font-bold text-primary-900">
          Create a Trust Group
        </h1>
        <div className="mt-6 flex gap-2">
          {(["threshold", "nodes", "review", "deploy"] as WizardStep[]).map(
            (s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                    step === s
                      ? "bg-accent-500 text-white"
                      : i <
                        ["threshold", "nodes", "review", "deploy"].indexOf(step)
                      ? "bg-success-500/20 text-success-700"
                      : "bg-neutral-200 text-neutral-400"
                  }`}
                >
                  {i + 1}
                </div>
                <span
                  className={`text-sm ${
                    step === s ? "text-primary-900 font-medium" : "text-neutral-400"
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </span>
                {i < 3 && (
                  <div className="mx-2 h-px w-8 bg-neutral-300" />
                )}
              </div>
            )
          )}
        </div>
      </div>

      {/* Step 1: Threshold */}
      {step === "threshold" && (
        <div className="max-w-lg">
          <h2 className="text-lg font-semibold text-primary-900 mb-2">
            Configure your threshold
          </h2>
          <p className="text-sm text-neutral-500 mb-8">
            The threshold is the minimum number of nodes required to
            produce a valid signature. In a{" "}
            <span className="text-primary-900 font-mono">t</span>-of-
            <span className="text-primary-900 font-mono">n</span> scheme,{" "}
            <span className="font-medium text-primary-800">t</span> nodes
            must be available at any given time.
          </p>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-primary-800 mb-2">
                Group size (n)
              </label>
              <input
                type="range"
                min={1}
                max={7}
                value={groupSize}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setGroupSize(n);
                  setThreshold(Math.floor(n / 2) + 1);
                }}
                className="w-full accent-accent-500"
              />
              <div className="flex justify-between text-xs text-neutral-400 mt-1">
                <span>1</span>
                <span className="text-primary-900 font-medium">{groupSize} {groupSize === 1 ? "node" : "nodes"}</span>
                <span>7</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-primary-800 mb-2">
                Threshold (t)
              </label>
              <input
                type="range"
                min={1}
                max={groupSize}
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full accent-accent-500"
              />
              <div className="flex justify-between text-xs text-neutral-400 mt-1">
                <span>1</span>
                <span className="text-primary-900 font-medium">{threshold} of {groupSize} required</span>
                <span>{groupSize}</span>
              </div>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-neutral-500">Signing threshold</span>
                  <p className="text-primary-900 font-mono text-lg">{threshold} of {groupSize}</p>
                </div>
                <div>
                  <span className="text-neutral-500">Fault tolerance</span>
                  <p className="text-primary-900 font-mono text-lg">
                    {faultTolerance} {faultTolerance === 1 ? "node" : "nodes"}
                  </p>
                </div>
              </div>
            </div>

            {faultTolerance === 0 && (
              <p className="text-xs text-error-500">
                With t = n, every node must participate. If any node goes
                offline, signing is impossible. Consider a lower threshold
                for production use.
              </p>
            )}

            {threshold === 1 && groupSize > 1 && (
              <p className="text-xs text-accent-600">
                A threshold of 1 means any single node can sign alone.
                Consider a higher threshold for production use.
              </p>
            )}
          </div>

          <button
            onClick={() => setStep("nodes")}
            className="mt-8 rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 transition-colors"
          >
            Next: Select Providers
          </button>
        </div>
      )}

      {/* Step 2: Select nodes */}
      {step === "nodes" && (
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-primary-900">
                Select {groupSize} providers
              </h2>
              <p className="text-sm text-neutral-500 mt-1">
                {selectedNodes.size} of {groupSize} selected
              </p>
            </div>
          </div>

          <NodeGrid onSelect={toggleNode} selected={selectedNodes} />

          <div className="mt-8 flex gap-4">
            <button
              onClick={() => setStep("threshold")}
              className="rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-semibold text-primary-700 hover:border-neutral-400 transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setStep("review")}
              disabled={selectedNodes.size < groupSize}
              className="rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 transition-colors disabled:opacity-30"
            >
              Next: Review
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === "review" && (
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold text-primary-900 mb-6">
            Review your configuration
          </h2>

          <div className="space-y-4">
            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <h3 className="text-sm font-medium text-neutral-500 mb-2">
                Threshold
              </h3>
              <p className="text-primary-900">
                {threshold}-of-{groupSize} — at least {threshold} nodes must be available
              </p>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <h3 className="text-sm font-medium text-neutral-500 mb-2">
                Selected Providers
              </h3>
              <div className="space-y-2">
                {Array.from(selectedNodes).map((addr) => {
                  const meta = getNodeMetadata(registry, addr);
                  return (
                    <p key={addr} className="text-primary-900 text-sm">
                      <span className="font-medium">{meta?.name ?? "Unknown Provider"}</span>{" "}
                      <span className="font-mono text-neutral-400">
                        ({addr.slice(0, 6)}...{addr.slice(-4)})
                      </span>
                    </p>
                  );
                })}
              </div>
            </div>

            <div className="rounded-lg border border-neutral-200 bg-white p-4">
              <h3 className="text-sm font-medium text-neutral-500 mb-2">
                Application Key
              </h3>
              <p className="text-sm text-neutral-600">
                A new application key will be generated during deployment.
                You&apos;ll need to save it securely.
              </p>
            </div>

            {/* TODO: time-lock configuration */}
          </div>

          <div className="mt-8 flex gap-4">
            <button
              onClick={() => setStep("nodes")}
              className="rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-semibold text-primary-700 hover:border-neutral-400 transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setStep("deploy")}
              className="rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 transition-colors"
            >
              Deploy Group
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Deploy */}
      {step === "deploy" && (
        <DeployStep
          selectedNodes={selectedNodes}
          threshold={threshold}
          groupPublicKey={groupPublicKey}
          deployStatus={deployStatus}
          deployError={deployError}
          txHash={txHash}
          deployStarted={deployStarted}
          write={write}
          resetDeploy={resetDeploy}
          onBack={() => {
            resetDeploy();
            deployStarted.current = false;
            setStep("review");
          }}
        />
      )}
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  idle: "Preparing...",
  building: "Building transaction...",
  "sponsoring-stub": "Requesting sponsorship...",
  estimating: "Estimating gas...",
  sponsoring: "Finalizing sponsorship...",
  signing: "Requesting threshold signature...",
  submitting: "Submitting to bundler...",
  confirming: "Waiting for on-chain confirmation...",
  success: "Group deployed!",
  error: "Deployment failed",
};

function DeployStep({
  selectedNodes,
  threshold,
  groupPublicKey,
  deployStatus,
  deployError,
  txHash,
  deployStarted,
  write,
  resetDeploy,
  onBack,
}: {
  selectedNodes: Set<string>;
  threshold: number;
  groupPublicKey: Hex | null;
  deployStatus: string;
  deployError: Error | null;
  txHash: `0x${string}` | null;
  deployStarted: React.MutableRefObject<boolean>;
  write: ReturnType<typeof useSignetWrite>["write"];
  resetDeploy: () => void;
  onBack: () => void;
}) {
  const nodeAddrs = Array.from(selectedNodes) as Address[];
  const removalDelay = 86400n; // 1 day

  // Add user's group key as an initial auth key (Schnorr prefix 0x01)
  const initialAuthKeys: Hex[] = [];
  if (groupPublicKey) {
    initialAuthKeys.push(concat([toHex(1, { size: 1 }), groupPublicKey]));
  }

  useEffect(() => {
    if (deployStarted.current) return;
    deployStarted.current = true;

    write({
      address: signetFactory.address,
      abi: signetFactory.abi as Parameters<typeof write>[0]["abi"],
      functionName: "createGroup",
      args: [nodeAddrs, BigInt(threshold), removalDelay, [], initialAuthKeys],
    }).catch(() => {
      // error is captured in deployError state
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function retry() {
    resetDeploy();
    deployStarted.current = false;
  }

  return (
    <div className="max-w-lg mx-auto text-center">
      {deployStatus === "success" ? (
        <>
          <div className="mb-4 flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-500/20">
              <svg className="h-6 w-6 text-success-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
          </div>
          <h2 className="text-lg font-semibold text-primary-900 mb-2">
            Group deployed!
          </h2>
          {txHash && (
            <p className="text-sm text-neutral-500 font-mono mb-6">
              tx: {txHash.slice(0, 10)}...{txHash.slice(-8)}
            </p>
          )}
          <a
            href="/dashboard"
            className="inline-block rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 transition-colors"
          >
            Go to Dashboard
          </a>
        </>
      ) : deployStatus === "error" ? (
        <>
          <div className="mb-4 flex justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-error-500/20">
              <svg className="h-6 w-6 text-error-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          </div>
          <h2 className="text-lg font-semibold text-primary-900 mb-2">
            Deployment failed
          </h2>
          <p className="text-sm text-error-600 mb-6">
            {deployError?.message ?? "Unknown error"}
          </p>
          <div className="flex justify-center gap-4">
            <button
              onClick={onBack}
              className="rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-semibold text-primary-700 hover:border-neutral-400 transition-colors"
            >
              Back
            </button>
            <button
              onClick={retry}
              className="rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 transition-colors"
            >
              Retry
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-6 flex justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-300 border-t-accent-500" />
          </div>
          <h2 className="text-lg font-semibold text-primary-900 mb-2">
            Deploying your trust group
          </h2>
          <p className="text-sm text-neutral-500">
            {STATUS_LABELS[deployStatus] ?? "Processing..."}
          </p>
        </>
      )}
    </div>
  );
}
