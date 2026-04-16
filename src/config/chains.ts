import { defineChain } from "viem";
import { foundry, sepolia, baseSepolia } from "viem/chains";
import { env } from "./env";

/**
 * Local Anvil devnet — matches signet-protocol/devnet/start.sh
 */
const anvil = defineChain({
  ...foundry,
  rpcUrls: {
    default: { http: [env.rpcUrl] },
  },
});

/**
 * Supported chains, keyed by chain ID.
 */
export const supportedChains = {
  [foundry.id]: anvil,
  [sepolia.id]: sepolia,
  [baseSepolia.id]: baseSepolia,
} as const;

/**
 * The active chain, derived from environment config.
 */
export function getActiveChain() {
  const chain = Object.values(supportedChains).find(
    (c) => c.id === env.chainId
  );
  if (!chain) {
    throw new Error(
      `Unsupported chain ID: ${env.chainId}. Supported: ${Object.keys(supportedChains).join(", ")}`
    );
  }
  return chain;
}
