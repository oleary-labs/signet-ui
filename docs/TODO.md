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

### Group creation flow
- [ ] **Deploy step** — Connect the wizard's deploy step to real UserOp submission. Call `SignetFactory.createGroup` via `useSignetWrite`.
- [ ] **Application key generation** — Generate a secp256k1 keypair during deploy. Include the compressed public key in `initialAuthKeys`. Display the private key with a "save your key" UX.
- [ ] **Post-deploy keygen trigger** — After on-chain confirmation, trigger DKG by calling `/v1/keygen` on one of the group's nodes.
- [ ] **Transaction progress UI** — Show real-time status during deploy: building → signing → submitting → confirming → done.

### Marketplace enhancements
- [ ] **Per-node on-chain data** — `NodeCardWithData` should call `useNodeOnChain(address)` to fetch the real NodeInfo (isOpen, registeredAt, operator), not placeholders.
- [ ] **Off-chain metadata integration** — Load `node-registry.json` and pass metadata to `NodeCard` components. Wire up the `nodeRegistry.ts` loader.
- [ ] **Node group count** — Call `getNodeGroups(address)` and display the count on each card.
- [ ] **Filter and sort** — Add controls above the grid: filter by open/permissioned, sort by registration date or group count.

### Dashboard
- [ ] **List user's groups** — Walk all groups from factory (no enumeration function exists — may need to query `GroupCreated` events or add a factory view function). Filter by `manager() === account`.
- [ ] **Group summary cards** — Each card shows: address, threshold/quorum, active node count, operational status, pending operation count.
- [ ] **Link to group detail** — Each card links to `/groups/[address]`.

### Group detail page
- [ ] **OAuth issuer section** — Render active issuers from `getIssuers()`. Add queue/execute/cancel actions.
- [ ] **Auth key section** — Render active keys from `getAuthKeys()`. Add queue/execute/cancel actions.
- [ ] **Time-lock queue** — Unified view of all pending operations: pending removals (`getPendingRemovals()`), pending issuer additions/removals, pending auth key additions/removals. Show countdown timers and execute buttons.
- [ ] **Invite node action** — Form to invite a new node by address.
- [ ] **Node health indicators** — Show health status on each node in the membership list (requires API URL from registry).

### Infrastructure
- [ ] **Google Fonts** — Add Inter and JetBrains Mono font files locally (Google Fonts import was removed due to build issues in sandboxed env). Or use `next/font/google` once building in a network-enabled env.
- [ ] **Error boundaries** — Add React error boundaries around contract reads and node API calls.
- [ ] **Loading states** — The group detail page needs better loading UX for the multicall.
- [ ] **Mobile responsiveness** — The grid and wizard need mobile layout testing.

### Future (from design doc open questions)
- [ ] Decentralized node metadata (IPFS, ENS, or on-chain registry)
- [ ] Multi-account management
- [ ] OAuth issuer setup in creation wizard
- [ ] Node reputation metrics (uptime, response time, signing success rate)
- [ ] "Bring your own key" option for application key provisioning
