"use client";

import { type ReactNode } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { foundry, sepolia, baseSepolia } from "viem/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { env } from "@/config/env";
import { getActiveChain } from "@/config/chains";
import { SignetAuthProvider } from "./signetAuth";

const activeChain = getActiveChain();
const otherChains = [foundry, sepolia, baseSepolia].filter(c => c.id !== activeChain.id);

const wagmiConfig = createConfig({
  chains: [activeChain, ...otherChains] as [typeof activeChain, ...(typeof otherChains)],
  transports: {
    [foundry.id]: http(env.rpcUrl),
    [sepolia.id]: http(env.rpcUrl),
    [baseSepolia.id]: http(env.rpcUrl),
  },
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: true,
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SignetAuthProvider>{children}</SignetAuthProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
