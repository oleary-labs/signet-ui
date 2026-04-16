# Signet Console — Claude Code Context

@AGENTS.md

## What is this project?

Signet Console is the web UI for the Signet protocol — a threshold signing network using FROST (RFC 9591) on secp256k1. The Console serves as:

1. **A public marketplace** where application developers discover and evaluate threshold signing providers (nodes run by companies).
2. **A management dashboard** where developers create and operate signing groups.
3. **A dogfooding surface** — the Console itself authenticates users via Signet (ERC-4337 smart accounts signed by a bootstrap FROST group).

The target user is an **application developer** who wants to add social-login-based key management to their app. They browse providers, pick nodes, set a threshold, and deploy a signing group.

## Related repositories

The smart contracts and node code live in `../signet-protocol/`. Key paths:

- `../signet-protocol/contracts/contracts/SignetFactory.sol` — global node registry + group factory (UUPS upgradeable)
- `../signet-protocol/contracts/contracts/SignetGroup.sol` — per-group threshold config, membership, issuers, auth keys (BeaconProxy)
- `../signet-protocol/contracts/contracts/SignetAccount.sol` — ERC-4337 smart account validated by FROST Schnorr signatures
- `../signet-protocol/contracts/contracts/FROSTVerifier.sol` — on-chain FROST signature verification library
- `../signet-protocol/node/` — Go node binary with HTTP API (/v1/health, /v1/info, /v1/keys, /v1/auth, /v1/keygen, /v1/sign)
- `../signet-protocol/devnet/` — local devnet: deploys contracts, registers 3 nodes, creates a group
- `../signet-min-bundler/` — ERC-4337 bundler for submitting UserOperations

The contract ABIs in `src/lib/abi/` were extracted from `../signet-protocol/contracts/out/`. If contracts change, re-extract with:
```bash
cat ../signet-protocol/contracts/out/SignetFactory.sol/SignetFactory.json | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin)['abi'], indent=2))" > src/lib/abi/SignetFactory.abi.json
```

## Architecture decisions

### Auth model — NOT a normal wallet dApp
This is NOT a standard wagmi "connect wallet" app. Users authenticate via **social login (OAuth)**, which flows through Signet's bootstrap signing group. Their on-chain identity is a **SignetAccount** (ERC-4337 smart account), not an EOA.

- wagmi is used for **read-only contract calls** (useReadContract, useReadContracts) and chain configuration
- wagmi is NOT used for transaction signing
- All write operations go through: **construct UserOp → FROST threshold sign via bootstrap group → submit to bundler → EntryPoint executes**
- `useSignetWrite` replaces wagmi's `useWriteContract`
- `SignetAuthProvider` manages the OAuth → session key → SignetAccount lifecycle

### Bootstrap group
A Signet-managed signing group that exists before the Console launches. It:
- Powers social login auth for Console users
- Signs UserOperations on behalf of developers
- Its address and node endpoints are in env config (`NEXT_PUBLIC_BOOTSTRAP_GROUP`, `NEXT_PUBLIC_BOOTSTRAP_NODES`)

### Off-chain node metadata
On-chain NodeInfo has: pubkey, isOpen, registeredAt, operator. Rich metadata (company name, logo, description, website, API URL) lives in `public/node-registry.json`. Node operators submit PRs to update it.

### Application key provisioning
During group creation, we generate a secp256k1 keypair client-side. The public key goes on-chain as an initial auth key (via `createGroup`'s `initialAuthKeys` param). The private key is shown once to the developer as their "application key." We never store it.

## Tech stack

- **Next.js** (App Router, TypeScript, Tailwind CSS)
- **wagmi + viem** — contract reads, chain config, ABI encoding
- **TanStack Query** — via wagmi for contract reads; standalone for node API calls
- **@noble/secp256k1** — client-side key generation for application keys

## Project structure

```
src/
├── app/                        # Next.js App Router pages
│   ├── layout.tsx              # Root layout (Providers + Header)
│   ├── page.tsx                # Marketplace landing (public, no auth)
│   ├── dashboard/page.tsx      # Authenticated group list
│   ├── groups/new/page.tsx     # 4-step creation wizard
│   └── groups/[address]/page.tsx  # Group detail + management
├── config/
│   ├── env.ts                  # Environment variables
│   ├── chains.ts               # Chain definitions
│   └── contracts.ts            # Contract address + ABI bindings
├── hooks/
│   ├── useSignetAuth.ts        # Auth state consumer (from context)
│   ├── useSignetWrite.ts       # UserOp build → sign → submit → confirm
│   ├── useFactory.ts           # On-chain reads (nodes, groups, group details)
│   └── useNodeApi.ts           # Node HTTP API queries
├── lib/
│   ├── abi/                    # Contract ABIs (from Foundry)
│   ├── bundler.ts              # signet-min-bundler JSON-RPC client
│   ├── nodeApi.ts              # Node HTTP API client class
│   ├── nodeRegistry.ts         # Off-chain metadata loader
│   └── userOp.ts               # ERC-4337 UserOperation construction
├── providers/
│   ├── index.tsx               # wagmi + react-query + SignetAuth composition
│   └── signetAuth.tsx          # Auth context provider (stubbed)
└── components/
    ├── layout/Header.tsx       # Nav bar + sign in/out
    └── marketplace/
        ├── NodeCard.tsx         # Provider card (branding, status badges)
        └── NodeGrid.tsx         # Grid of registered providers
```

## Key contract interactions

### SignetFactory (read)
- `getRegisteredNodes()` → `address[]` — all registered nodes
- `getNode(address)` → `NodeInfo` — pubkey, isOpen, registeredAt, operator
- `getNodeGroups(address)` → `address[]` — groups a node is in

### SignetFactory (write, via UserOp)
- `createGroup(address[] nodes, uint256 threshold, uint256 removalDelay, uint256 issuerAddDelay, uint256 issuerRemovalDelay, InitialIssuer[] initialIssuers, uint256 authKeyAddDelay, uint256 authKeyRemovalDelay, bytes[] initialAuthKeys)` — deploys a new SignetGroup

### SignetGroup (read)
- `threshold()`, `quorum()`, `manager()`, `isOperational()`
- `getActiveNodes()`, `getPendingNodes()`, `getPendingRemovals()`
- `getIssuers()`, `getAuthKeys()`
- `removalDelay()`, `issuerAddDelay()`, etc.

### SignetGroup (write, via UserOp)
- `inviteNode(address)`, `queueRemoval(address)`, `cancelRemoval(address)`, `executeRemoval(address)`
- `queueAddIssuer(...)`, `executeAddIssuer(...)`, `cancelAddIssuer(...)`, etc.
- `queueAddAuthKey(bytes)`, `executeAddAuthKey(bytes32)`, etc.
- `transferManager(address)`

## What's implemented vs. stubbed

See `docs/TODO.md` for a detailed tracker. The short version:

**Working:**
- Project scaffolding, build, all routes
- Contract ABIs extracted and wired
- wagmi provider with chain config
- Marketplace landing page with NodeGrid/NodeCard components
- Group creation wizard (4 steps: threshold → nodes → review → deploy)
- Group detail page with stat cards and membership list
- Dashboard page (auth-gated)
- Node API client (typed, all endpoints)
- Bundler client (sendUserOp, getUserOpReceipt)
- UserOp construction (buildUserOp)

**Stubbed / TODO:**
- `SignetAuthProvider` — OAuth flow, session key gen, bootstrap group auth (returns "not implemented")
- `useSignetWrite` — UserOp signing via bootstrap group (builds the op, but can't sign it yet)
- `getUserOpHash` — full ERC-4337 hash computation (throws "not implemented")
- `NodeGrid` → `NodeCardWithData` — doesn't yet fetch on-chain NodeInfo or off-chain metadata per node
- Dashboard — doesn't yet walk factory groups and filter by manager
- Group detail — OAuth issuer and auth key sections are placeholder text
- Time-lock queue (unified pending operations view) — placeholder
- Deploy step of wizard — not connected to real UserOp submission
- `node-registry.json` — empty, needs to be populated with real node metadata

## Build & dev

```bash
npm install
cp .env.local.example .env.local  # then fill in addresses
npm run dev                        # starts on localhost:3000
npm run build                      # production build
```

For local development with the devnet:
```bash
cd ../signet-protocol && devnet/start.sh   # starts Anvil + deploys contracts + runs 3 nodes
# Copy addresses from devnet output into .env.local
npm run dev
```

## Conventions

- All on-chain writes go through `useSignetWrite`, never `useWriteContract`
- Use `Address` type from viem for all Ethereum addresses
- Node API URLs come from the off-chain registry (`apiUrl` field) or env config for bootstrap nodes
- Time-locked operations have a queue → wait → execute pattern; the UI should show countdowns
- The word "threshold" in Signet means max corrupted nodes (quorum = threshold + 1). Be precise.
