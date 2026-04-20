import { type Address } from "viem";

export const env = {
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545",
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? "31337"),
  groupFactoryAddress: (process.env.NEXT_PUBLIC_GROUP_FACTORY_ADDRESS ?? "0x") as Address,
  accountFactoryAddress: (process.env.NEXT_PUBLIC_ACCOUNT_FACTORY_ADDRESS ?? "0x") as Address,
  entryPointAddress: (process.env.NEXT_PUBLIC_ENTRYPOINT_ADDRESS ?? "0x") as Address,
  bundlerUrl: process.env.NEXT_PUBLIC_BUNDLER_URL ?? "http://127.0.0.1:4337",
  bootstrapGroup: (process.env.NEXT_PUBLIC_BOOTSTRAP_GROUP ?? "0x") as Address,
  bootstrapNodes: (process.env.NEXT_PUBLIC_BOOTSTRAP_NODES ?? "")
    .split(",")
    .filter(Boolean),
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "",
  // Paymaster sponsorship (ERC-7677). When usePaymaster is false, UserOps
  // are sent without paymaster fields — the SignetAccount must fund its own
  // gas. This is useful on local devnet where no paymaster is deployed.
  paymasterAddress: (process.env.NEXT_PUBLIC_PAYMASTER_ADDRESS ?? "0x") as Address,
  usePaymaster: process.env.NEXT_PUBLIC_USE_PAYMASTER === "true",
  // Server-side ZK proving. When true, the auth flow delegates proof
  // generation to the bundler's /v1/prove endpoint (~2-3s) instead of
  // running it client-side via WASM (~2-7s). Requires the bundler to
  // have circuitDir configured.
  useServerProver: process.env.NEXT_PUBLIC_USE_SERVER_PROVER === "true",
} as const;
