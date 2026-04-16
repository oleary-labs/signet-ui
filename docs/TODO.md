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
These must be implemented for the app to be functional end-to-end.

- [ ] **OAuth integration** — Add OAuth provider (Google, etc.) flow in `SignetAuthProvider`. Need to pick an OAuth library and configure the redirect flow. The OAuth token is sent to the bootstrap group's nodes, not validated locally.
- [ ] **Session key generation** — Generate an ephemeral secp256k1 keypair on sign-in. Use `@noble/secp256k1` (already installed). Store the session private key in memory only (never persisted).
- [ ] **Bootstrap group auth** — POST the OAuth token + session public key to each bootstrap node's `/v1/auth` endpoint. All nodes need to register the session.
- [ ] **SignetAccount resolution** — After auth, determine the user's SignetAccount address. For new users, this requires deploying an account (UserOp with initCode). For returning users, derive the counterfactual address.
- [ ] **`getUserOpHash` implementation** — Full ERC-4337 hash computation: `keccak256(abi.encode(pack(userOp), entryPoint, chainId))`. Reference: the EntryPoint contract's `getUserOpHash` function. Currently throws "not implemented."
- [ ] **Threshold signing in `useSignetWrite`** — After building the UserOp and computing its hash, send the hash to bootstrap nodes via `/v1/sign`, collect the FROST signature, and attach it to `userOp.signature`.

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

### Node API nonce management
- [ ] **UserOp nonce** — Fetch the current nonce from the EntryPoint contract for the sender's SignetAccount. Currently hardcoded to `0n`.
- [ ] **Gas estimation** — Call the bundler's `eth_estimateUserOperationGas` before signing. Currently uses placeholder values.

### Infrastructure
- [ ] **Google Fonts** — Add Inter and JetBrains Mono font files locally (Google Fonts import was removed due to build issues in sandboxed env). Or use `next/font/google` once building in a network-enabled env.
- [ ] **Error boundaries** — Add React error boundaries around contract reads and node API calls.
- [ ] **Loading states** — The group detail page needs better loading UX for the multicall.
- [ ] **Mobile responsiveness** — The grid and wizard need mobile layout testing.

### Future (from design doc open questions)
- [ ] Paymaster for sponsored account creation gas
- [ ] Decentralized node metadata (IPFS, ENS, or on-chain registry)
- [ ] Multi-account management
- [ ] OAuth issuer setup in creation wizard
- [ ] Node reputation metrics (uptime, response time, signing success rate)
- [ ] "Bring your own key" option for application key provisioning
