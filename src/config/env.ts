import { type Address } from "viem";

export const env = {
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545",
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337"),
  factoryAddress: (process.env.NEXT_PUBLIC_FACTORY_ADDRESS ?? "0x") as Address,
  entryPointAddress: (process.env.NEXT_PUBLIC_ENTRYPOINT_ADDRESS ?? "0x") as Address,
  bundlerUrl: process.env.NEXT_PUBLIC_BUNDLER_URL ?? "http://127.0.0.1:4337",
  bootstrapGroup: (process.env.NEXT_PUBLIC_BOOTSTRAP_GROUP ?? "0x") as Address,
  bootstrapNodes: (process.env.NEXT_PUBLIC_BOOTSTRAP_NODES ?? "")
    .split(",")
    .filter(Boolean),
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
} as const;
