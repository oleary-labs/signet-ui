# Signet Console

Web UI for the [Signet protocol](../signet-protocol/) — a marketplace for threshold signing providers and a management dashboard for signing groups.

## What it does

Signet Console lets application developers:

1. **Browse** trusted signing providers (companies running FROST threshold signing nodes)
2. **Create** signing groups by selecting providers and setting a threshold
3. **Manage** group membership, OAuth issuers, authorization keys, and time-locked operations
4. **Authenticate via Signet itself** — social login backed by ERC-4337 smart accounts and FROST threshold signing

See [docs/design.md](docs/design.md) for the full design document.

## Quick start

```bash
npm install
cp .env.local.example .env.local
```

Edit `.env.local` with your contract addresses and RPC URL, then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### With the local devnet

```bash
# Terminal 1: start the devnet (deploys contracts, registers nodes, creates a group)
cd ../signet-protocol
devnet/start.sh

# Copy the factory address and other values from devnet output into .env.local

# Terminal 2: start the UI
npm run dev
```

## Environment variables

| Variable | Description | Default |
|---|---|---|
| `NEXT_PUBLIC_RPC_URL` | JSON-RPC endpoint | `http://127.0.0.1:8545` |
| `NEXT_PUBLIC_CHAIN_ID` | Target chain ID | `31337` (Anvil) |
| `NEXT_PUBLIC_GROUP_FACTORY_ADDRESS` | SignetFactory proxy address | — |
| `NEXT_PUBLIC_ENTRYPOINT_ADDRESS` | ERC-4337 EntryPoint address | — |
| `NEXT_PUBLIC_BUNDLER_URL` | signet-min-bundler endpoint | `http://127.0.0.1:4337` |
| `NEXT_PUBLIC_BOOTSTRAP_GROUP` | Bootstrap signing group address | — |
| `NEXT_PUBLIC_BOOTSTRAP_NODES` | Comma-separated node API URLs | — |

## Architecture

This is **not a standard wallet dApp**. Users don't connect MetaMask. Instead:

- Users authenticate via **social login** (OAuth), which flows through Signet's bootstrap signing group
- Their on-chain identity is a **SignetAccount** (ERC-4337 smart account)
- All on-chain writes are **UserOperations** signed by the bootstrap group's FROST threshold signing and submitted through the bundler
- wagmi is used for **read-only** contract interaction only

See [CLAUDE.md](CLAUDE.md) for detailed architecture notes and the full project structure.

## Project structure

```
src/
├── app/                           # Pages (Next.js App Router)
│   ├── page.tsx                   # Marketplace landing
│   ├── dashboard/                 # Authenticated group list
│   ├── groups/new/                # Creation wizard
│   └── groups/[address]/          # Group detail + management
├── config/                        # Chain, contract, and env config
├── hooks/                         # React hooks (auth, writes, reads, node API)
├── lib/                           # Core libraries (ABIs, bundler, node API, UserOps)
├── providers/                     # wagmi + react-query + Signet auth
└── components/                    # UI components
```

## Current status

The scaffolding is complete and building. The auth flow (OAuth → session key → bootstrap group signing → SignetAccount) is stubbed and needs implementation. See [docs/TODO.md](docs/TODO.md) for what's done and what's next.
