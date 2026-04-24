# Signet Console — Implementation Status

## Done

### Infrastructure
- [x] Next.js project with TypeScript, Tailwind, App Router
- [x] wagmi + viem + TanStack Query installed and configured
- [x] Contract ABIs extracted from Foundry artifacts (SignetFactory, SignetGroup, SignetAccount)
- [x] Chain config supporting Anvil devnet, Sepolia, Base Sepolia
- [x] Environment variable config with `.env.local.example`
- [x] wagmi provider (read-only, no wallet connectors)
- [x] TanStack Query client
- [x] Clean production build

### Pages & routing
- [x] Root layout with Providers and Header
- [x] `/` — marketplace landing page with hero and provider grid
- [x] `/dashboard` — auth-gated group management dashboard
- [x] `/groups/new` — 4-step creation wizard (threshold → nodes → review → deploy)
- [x] `/groups/[address]` — group detail page with stat cards

### Components
- [x] `Header` — nav bar with sign in/out button
- [x] `NodeCard` — provider card with branding, status badges (open/permissioned, online/offline), registration date, address
- [x] `NodeGrid` — grid layout with loading skeletons and error/empty states

### Hooks
- [x] `useSignetAuth` — consumer hook for auth context
- [x] `useSignetWrite` — full state machine (idle → building → signing → submitting → confirming → success/error)
- [x] `useFactory` — on-chain reads: `useRegisteredNodes`, `useNodeOnChain`, `useNodeGroups`, `useGroupDetails`
- [x] `useNodeApi` — node HTTP API: `useNodeHealth`, `useNodeInfo`, `useNodeKeys`

### Libraries
- [x] `nodeApi.ts` — typed client for all node HTTP endpoints (health, info, keys, auth, keygen, sign)
- [x] `bundler.ts` — JSON-RPC client for signet-min-bundler (sendUserOp, getUserOpReceipt)
- [x] `userOp.ts` — PackedUserOperation type and `buildUserOp` helper
- [x] `nodeRegistry.ts` — off-chain metadata loader with caching
- [x] `public/node-registry.json` — empty registry file, ready to populate

---

## TODO

### Critical path — auth flow
Implemented across `providers/signetAuth.tsx`, `hooks/useSignetWrite.ts`, `lib/signet-sdk/*`, `lib/userOp.ts`, `lib/bundler.ts`.

- [x] **OAuth integration** — Google OAuth PKCE via `signet-sdk/oauth.ts`
- [x] **Session key generation** — ephemeral secp256k1 keypair via `signet-sdk/session.ts`; in-memory only (`sessionKeyMaterial`)
- [x] **Bootstrap group auth** — ZK-proof-of-JWT + session pubkey posted to each bootstrap node (`signet-sdk/bootstrap.ts`)
- [x] **SignetAccount resolution** — counterfactual address via `SignetAccountFactory.getAddress(entryPoint, groupPublicKey, 0)`; first write deploys via `initCode`
- [x] **`getUserOpHash`** — EntryPoint v0.7 packed hash in `lib/userOp.ts`
- [x] **Threshold signing in `useSignetWrite`** — session-signed `/v1/sign` to a bootstrap node; 65-byte FROST Schnorr sig attached to `userOp.signature`
- [x] **Paymaster sponsorship (ERC-7677)** — opt-in `pm_getPaymasterStubData` / `pm_getPaymasterData`, gated by `NEXT_PUBLIC_USE_PAYMASTER`, packed into `paymasterAndData` by `applyPaymasterSponsorship`
- [x] **UserOp nonce** — fetched from `EntryPoint.getNonce(sender, 0)` in `useSignetWrite`
- [x] **Gas estimation** — `eth_estimateUserOperationGas` called pre-sign; paymaster stub attached first so estimate includes paymaster verification
- [x] **Session re-auth** — `reauthenticate()` in auth provider; `adminRequest` retries on "session not found"

### Group creation flow
- [x] **Deploy step** — Wizard deploy step calls `SignetFactory.createGroup` via `useSignetWrite`. Includes invite code whitelist flow.
- [x] **Transaction progress UI** — Real-time status: building → sponsoring → estimating → signing → submitting → confirming → success/error. Retry on failure.
- [x] **Initial auth key** — User's bootstrap group public key added as initial Schnorr auth key during deploy.
- [ ] **Standalone application key generation** — Generate a separate secp256k1 keypair during deploy with a "save your key" show-once UX (currently only the bootstrap group key is added).
- [ ] **Post-deploy keygen trigger** — After on-chain confirmation, trigger DKG by calling `/v1/keygen` on one of the group's nodes.

### Marketplace enhancements
- [x] **Off-chain metadata integration** — `loadNodeRegistry()` wired up; `getNodeMetadata()` used for branding/description on NodeCard.
- [ ] **Per-node on-chain data** — NodeCard still hardcodes `isOpen` and `registeredAt` instead of calling `useNodeOnChain(address)`.
- [ ] **Node group count** — `useNodeGroups()` hook exists but isn't called or displayed on NodeCard.
- [ ] **Filter and sort** — No filter/sort controls on NodeGrid.

### Dashboard
- [x] **List user's groups** — `useAllGroups()` multicall fetches `manager()` for each group; filters by account.
- [x] **Link to group detail** — GroupCard links to `/groups/[address]`.
- [x] **Group summary cards** — Shows address, threshold (t-of-n), active node count, operational status. Missing: pending operation count.

### Group detail page
- [x] **OAuth issuer section** — `AddIssuerSection` renders `getIssuers()` with add/remove forms and queue/execute actions.
- [x] **Auth key section** — `AuthKeysSection` renders `getAuthKeys()`, supports key generation with private key display and removal.
- [x] **Invite node action** — `InviteNodeDialog` modal queries registered nodes, filters existing members, shows health status.
- [x] **Node health indicators** — `useNodeHealth()` fetches from apiUrl; green/amber/red dots on active/pending/removed nodes.
- [ ] **Time-lock queue** — `PendingOperationsSection` covers pending node removals with countdowns, but does not yet unify issuer/auth key pending operations.

### Infrastructure
- [x] **Dockerfile + standalone output** — Multi-stage Docker build for Railway deployment.
- [x] **Loading states** — Skeleton loaders (animate-pulse) on group detail, dashboard GroupCardSkeleton, deploy step status labels.
- [ ] **Google Fonts** — Still using fallback system fonts; Inter/JetBrains Mono not loaded.
- [ ] **Error boundaries** — No React error boundaries; errors only caught in hook state.
- [ ] **Mobile responsiveness** — Basic max-width containers but limited responsive breakpoints.

### Future (from design doc open questions)
- [ ] Decentralized node metadata (IPFS, ENS, or on-chain registry)
- [ ] Multi-account management
- [ ] OAuth issuer setup in creation wizard
- [ ] Node reputation metrics (uptime, response time, signing success rate)
- [ ] "Bring your own key" option for application key provisioning
