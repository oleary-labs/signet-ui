# Signet Console — Claude Code Context

@AGENTS.md

## What is this project?

Signet Console is the web UI for the Signet protocol — a threshold signing network using FROST (RFC 9591) on secp256k1. The Console serves as:

1. **A public marketplace** where application developers discover and evaluate threshold signing providers (nodes run by companies).
2. **A management dashboard** where developers create and operate signing groups.
3. **A dogfooding surface** — the Console itself authenticates users via Signet (ERC-4337 smart accounts signed by a bootstrap FROST group).

The target user is an **application developer** who wants to add social-login-based key management to their app. They browse providers, pick nodes, set a threshold, and deploy a signing group.

## Architectural layering — what's Signet, what's the AA bridge, what's this repo

Keep these three layers separate when reasoning about the code. Conflating them produces bad abstractions.

**1. Signet is a chain-agnostic threshold signer.** Its output is one signature per request, produced by FROST (RFC 9591) across a quorum of nodes. Today it emits FROST-Schnorr over secp256k1 (fits EVM); FROST-Ed25519 for Solana is on the roadmap. The signer itself knows nothing about EVM, ERC-4337, UserOperations, or paymasters. Code in `src/lib/` that talks to nodes over HTTP (`nodeApi.ts`) lives at this layer.

**2. The AA bridge is a settlement workaround, not part of Signet.** EVM lacks a native Schnorr precompile, so Schnorr signatures can only reach the chain through account abstraction. We use ERC-4337 because it works today, but it's one option among many — Alchemy, Safe, Biconomy, or a custom validator would all be valid substrates for the same signer. [EIP-8141 "Frame Transaction"](https://eips.ethereum.org/EIPS/eip-8141) (draft, 2026-01-29) proposes a native protocol-level off-ramp from ECDSA that would obviate bundlers, UserOps, and paymasters for accounts that adopt it. Assume this layer will change. Code in `src/lib/userOp.ts`, `src/lib/bundler.ts`, and the paymaster handling in `src/hooks/useSignetWrite.ts` lives at this layer.

**3. This repo uses the reference AA stack (`signet-wallet` + `signet-min-bundler`).** Opinionated, minimal, written in-house so we don't have to depend on third parties while the protocol matures. Works end-to-end, validates the architecture, not intended as the canonical way to build on Signet. When writing docs, skill material, or code comments that explain "how Signet works," be careful not to imply that ERC-4337 / SignetAccount / SignetPaymaster are load-bearing parts of Signet itself — they're just what this Console happens to use.

The `signet-ui` codebase inevitably mixes all three layers because the Console needs signatures to become transactions to work. That's fine for the app; it's not fine for documentation.

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
- All write operations go through: **construct UserOp → (optional) paymaster sponsorship via ERC-7677 → FROST threshold sign via bootstrap group → submit to bundler → EntryPoint executes**
- `useSignetWrite` replaces wagmi's `useWriteContract`
- `SignetAuthProvider` manages the OAuth → session key → SignetAccount lifecycle

### Write flow ordering (matters — see useSignetWrite.ts)
The UserOp is constructed, optionally paymaster-sponsored, then FROST-signed. The ordering is strict because two signatures cover overlapping fields:

1. `buildUserOp` — unsigned op with placeholder gas
2. (if `usePaymaster`) `pm_getPaymasterStubData` → attach stub `paymasterAndData` (so gas estimation accounts for paymaster verification)
3. `eth_estimateUserOperationGas` → overwrite `accountGasLimits`, `preVerificationGas`
4. (if `usePaymaster`) `pm_getPaymasterData` → replace stub with real signed blob (paymaster signs over finalized gas fields)
5. `getUserOpHash` → hash covers `paymasterAndData` (so must be final)
6. FROST threshold sign via bootstrap group → fill `signature`
7. `eth_sendUserOperation` → bundler submits to EntryPoint

**Reordering footguns**: changing gas after step 4 invalidates the paymaster signature; changing `paymasterAndData` after step 6 invalidates the FROST signature.

### Paymaster packing quirk
signet-min-bundler's `FromRPC` concatenates `paymaster` + `paymasterData` directly into `paymasterAndData` — it does NOT re-insert the packed gas limits between them. But the on-chain paymaster `getHash` reads `paymasterAndData[20:52]` as `(verificationGasLimit ‖ postOpGasLimit)`. So `applyPaymasterSponsorship` in `lib/bundler.ts` produces `[paymaster:20][verifGas:16][postOpGas:16][paymasterData:rest]` and the `paymasterData` field sent to the bundler already includes the packed gas limits. Do not try to "simplify" this without also updating the bundler's wire format.

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

**Recently implemented** (was stubbed):
- `SignetAuthProvider` — full OAuth → session key → ZK proof of JWT → bootstrap registration → keygen → counterfactual SignetAccount address flow
- `useSignetWrite` — full build → (paymaster) → estimate → (paymaster) → FROST sign → submit → confirm pipeline
- `getUserOpHash` — EntryPoint v0.7 packed hash
- `useSignetWrite` paymaster wiring — ERC-7677 stub/real sponsorship, opt-in via `NEXT_PUBLIC_USE_PAYMASTER`

**Stubbed / TODO:**
- `NodeGrid` → `NodeCardWithData` — doesn't yet fetch on-chain NodeInfo or off-chain metadata per node
- Dashboard — doesn't yet walk factory groups and filter by manager
- Group detail — OAuth issuer and auth key sections are placeholder text
- Time-lock queue (unified pending operations view) — placeholder
- Deploy step of wizard — not connected to real UserOp submission
- `node-registry.json` — empty, needs to be populated with real node metadata

## Build & dev

This repo uses `bun` as the package manager and runner. `npm` also works but `bun` is the convention.

```bash
bun install
cp .env.local.example .env.local  # then fill in addresses
bun dev                           # starts on localhost:3000
bun run build                     # production build
```

For local development with the devnet, see `docs/devnet-e2e.md` for the full end-to-end walkthrough (protocol devnet + bundler + paymaster + UI). Short version:

```bash
cd ../signet-protocol && devnet/start.sh --no-kms --auth   # Anvil + contracts + 3 nodes + bootstrap group
cd ../signet-min-bundler && scripts/devnet-setup.sh         # paymaster + bundler config
# Then start the bundler, copy addresses into signet-ui/.env.local, and:
bun dev
```

## Conventions

- All on-chain writes go through `useSignetWrite`, never `useWriteContract`
- Use `Address` type from viem for all Ethereum addresses
- Node API URLs come from the off-chain registry (`apiUrl` field) or env config for bootstrap nodes
- Time-locked operations have a queue → wait → execute pattern; the UI should show countdowns
- The word "threshold" in Signet means the minimum number of nodes required to produce a valid signature (the standard FROST meaning). Quorum = threshold. Be precise.
