"use client";

import { useEffect, useState } from "react";
import { env } from "@/config/env";
import { formatEther } from "viem";

interface Check {
  name: string;
  status: "pending" | "ok" | "error";
  detail?: string;
}

async function rpcCall(url: string, method: string, params: unknown[] = []) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return res.json();
}

async function proxyRpc(method: string, params: unknown[] = []) {
  return rpcCall(env.rpcUrl, method, params);
}

async function proxyBundler(method: string, params: unknown[] = []) {
  const res = await fetch("/api/bundler", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return res.json();
}

async function proxyNode(nodeUrl: string, path: string) {
  const res = await fetch("/api/node/proxy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-node-url": nodeUrl,
      "x-node-path": path,
      "x-node-method": "GET",
    },
    body: JSON.stringify({}),
  });
  return res.json();
}

export default function StatusPage() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [running, setRunning] = useState(false);
  const [bundlerEoa, setBundlerEoa] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  function update(name: string, status: Check["status"], detail?: string) {
    setChecks((prev) => {
      const idx = prev.findIndex((c) => c.name === name);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { name, status, detail };
        return next;
      }
      return [...prev, { name, status, detail }];
    });
  }

  async function runChecks() {
    setChecks([]);
    setRunning(true);

    // Chain RPC
    const rpcName = "Chain RPC";
    update(rpcName, "pending");
    try {
      const chain = await proxyRpc("eth_chainId");
      if (chain.error) throw new Error(chain.error.message);
      const blockNum = await proxyRpc("eth_blockNumber");
      if (blockNum.error) throw new Error(blockNum.error.message);
      update(rpcName, "ok", `Chain ${parseInt(chain.result, 16)}, block ${parseInt(blockNum.result, 16).toLocaleString()}`);
    } catch (e) {
      update(rpcName, "error", e instanceof Error ? e.message : String(e));
    }

    // Bundler
    const bundlerName = "Bundler";
    update(bundlerName, "pending");
    try {
      const ep = await proxyBundler("eth_supportedEntryPoints");
      if (ep.error) throw new Error(ep.error.message);
      const chainId = await proxyBundler("eth_chainId");
      if (chainId.error) throw new Error(chainId.error.message);
      const entryPoints = (ep.result as string[]).map((a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`).join(", ");
      update(bundlerName, "ok", `Chain ${parseInt(chainId.result, 16)}, EntryPoints: ${entryPoints}`);
    } catch (e) {
      update(bundlerName, "error", e instanceof Error ? e.message : String(e));
    }

    // Paymaster deposit + bundler EOA balance
    if (env.usePaymaster && env.paymasterAddress !== "0x") {
      const pmName = "Paymaster Deposit";
      update(pmName, "pending");
      try {
        const result = await proxyRpc("eth_call", [{
          to: env.entryPointAddress,
          data: `0x70a08231000000000000000000000000${env.paymasterAddress.slice(2).toLowerCase()}`,
        }, "latest"]);
        if (result.error) throw new Error(result.error.message);
        const balance = BigInt(result.result);
        const ethBalance = formatEther(balance);
        const status = balance > 0n ? "ok" : "error";
        update(pmName, status, `${parseFloat(ethBalance).toFixed(4)} ETH in EntryPoint`);
      } catch (e) {
        update(pmName, "error", e instanceof Error ? e.message : String(e));
      }

      // Bundler EOA — read verifyingSigner() from paymaster, then check its balance
      const bundlerName2 = "Bundler EOA";
      update(bundlerName2, "pending");
      try {
        // verifyingSigner() selector = 0x23d9ac9b
        const signerResult = await proxyRpc("eth_call", [{
          to: env.paymasterAddress,
          data: "0x23d9ac9b",
        }, "latest"]);
        if (signerResult.error) throw new Error(signerResult.error.message);
        const signerAddr = `0x${signerResult.result.slice(26)}` as string;
        setBundlerEoa(signerAddr);
        const balResult = await proxyRpc("eth_getBalance", [signerAddr, "latest"]);
        if (balResult.error) throw new Error(balResult.error.message);
        const bal = BigInt(balResult.result);
        const ethBal = formatEther(bal);
        const status = bal > 10000000000000000n ? "ok" : "error"; // warn below 0.01 ETH
        update(bundlerName2, status, `${signerAddr.slice(0, 6)}...${signerAddr.slice(-4)}: ${parseFloat(ethBal).toFixed(4)} ETH`);
      } catch (e) {
        update(bundlerName2, "error", e instanceof Error ? e.message : String(e));
      }
    }

    // Bootstrap nodes
    for (const nodeUrl of env.bootstrapNodes) {
      const label = nodeUrl.replace(/^https?:\/\//, "").replace(/:8080$/, "");
      const nodeName = `Node ${label}`;
      update(nodeName, "pending");
      try {
        const health = await proxyNode(nodeUrl, "/v1/health");
        if (health.error) throw new Error(health.error);
        update(nodeName, "ok", health.status ?? "healthy");
      } catch (e) {
        update(nodeName, "error", e instanceof Error ? e.message : String(e));
      }
    }

    setRunning(false);
  }

  useEffect(() => {
    runChecks();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-primary-900">System Status</h1>
        <button
          onClick={runChecks}
          disabled={running}
          className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-primary-700 hover:border-neutral-400 transition-colors disabled:opacity-50"
        >
          {running ? "Checking..." : "Refresh"}
        </button>
      </div>

      <div className="space-y-3">
        {checks.map((check) => (
          <div
            key={check.name}
            className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <div
                className={`h-2.5 w-2.5 rounded-full ${
                  check.status === "ok"
                    ? "bg-success-500"
                    : check.status === "error"
                    ? "bg-error-500"
                    : "bg-neutral-300 animate-pulse"
                }`}
              />
              <span className="text-sm font-medium text-primary-900">
                {check.name}
              </span>
            </div>
            {check.detail && (
              <span
                className={`text-xs font-mono ${
                  check.status === "error" ? "text-error-600" : "text-neutral-500"
                }`}
              >
                {check.detail}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-lg border border-neutral-200 bg-white p-4">
        <h2 className="text-sm font-medium text-neutral-500 mb-3">Configuration</h2>
        <dl className="space-y-2 text-xs font-mono">
          <ConfigRow label="Chain ID" value={String(env.chainId)} copied={copied} onCopy={setCopied} />
          <ConfigRow label="Factory" value={env.groupFactoryAddress} copied={copied} onCopy={setCopied} />
          <ConfigRow label="AccountFactory" value={env.accountFactoryAddress} copied={copied} onCopy={setCopied} />
          <ConfigRow label="EntryPoint" value={env.entryPointAddress} copied={copied} onCopy={setCopied} />
          <ConfigRow label="Paymaster" value={env.usePaymaster ? env.paymasterAddress : "disabled"} copied={copied} onCopy={setCopied} />
          <ConfigRow label="Bundler EOA" value={bundlerEoa ?? "..."} copied={copied} onCopy={setCopied} />
          <ConfigRow label="Bootstrap Group" value={env.bootstrapGroup} copied={copied} onCopy={setCopied} />
          <ConfigRow label="Server Prover" value={env.useServerProver ? "enabled" : "disabled"} copied={copied} onCopy={setCopied} />
        </dl>
      </div>
    </div>
  );
}

function ConfigRow({ label, value, copied, onCopy }: {
  label: string;
  value: string;
  copied: string | null;
  onCopy: (v: string | null) => void;
}) {
  const isAddress = value.startsWith("0x") && value.length >= 40;

  function copy() {
    navigator.clipboard.writeText(value);
    onCopy(label);
    setTimeout(() => onCopy(null), 1500);
  }

  return (
    <div className="flex justify-between items-center">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="flex items-center gap-1.5">
        <span className="text-primary-900">{value}</span>
        {isAddress && (
          <button
            onClick={copy}
            className="text-neutral-400 hover:text-neutral-600 transition-colors"
            title="Copy"
          >
            {copied === label ? (
              <svg className="h-3.5 w-3.5 text-success-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
              </svg>
            )}
          </button>
        )}
      </dd>
    </div>
  );
}
