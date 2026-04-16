# Signet Console — Design Document

*A Marketplace for Threshold Signing Providers*

Version 0.1 · Draft · April 2026 · Signet / O'Leary Labs

---

## 1. Overview

Signet Console is the primary user interface for the Signet protocol. It serves two roles: a public marketplace where application developers discover and evaluate threshold signing providers, and a management dashboard where they create and operate signing groups for their applications.

The target user is an application developer who wants to add social-login-based key management to a new or existing app. They should be able to arrive at the Console, understand the value proposition, browse available providers, and walk away with a fully operational signing group in minutes.

### 1.1 Design Principles

- **Trust is the product.** The UI should help developers make informed decisions about which signing providers to select, emphasizing reputation, transparency, and reliability.
- **Progressive disclosure.** No wallet connection required to browse. Authentication is required only when the developer is ready to create a group.
- **Dogfooding.** The Console itself authenticates users via Signet (ERC-4337 smart accounts and FROST threshold signing). The developer experiences the product before they build with it.
- **Operational from day one.** When a developer finishes the creation flow, they should have a working system, including a provisioned application key for immediate API access.

### 1.2 Scope

This document covers the initial release of Signet Console. The primary features are:

- Public marketplace for browsing signing providers (nodes)
- Group creation wizard with threshold selection and node picking
- Automatic application key provisioning during group creation
- Management dashboard for existing groups (membership, issuers, auth keys, time-locked operations)
- Integration with node HTTP API for health and key status
- Authentication via Signet (ERC-4337 UserOperations through the bootstrap group)

---

## 2. System Context

The Console interacts with several components of the Signet ecosystem:

| Component | Role | Integration |
|---|---|---|
| SignetFactory (contract) | Global node registry and group factory | Read node list, create groups, query group membership |
| SignetGroup (contract) | Per-group membership and configuration | Manage nodes, issuers, auth keys; monitor time-locked queues |
| SignetAccount (contract) | ERC-4337 smart account for the developer | Submit UserOperations for all on-chain actions |
| Node HTTP API | Individual node status and operations | Health checks, key listings, keygen triggers |
| signet-min-bundler | ERC-4337 bundler | Submit UserOperations to the EntryPoint |
| Bootstrap Group | Signet's own signing group | Authenticate Console users via social login + FROST signing |
| Node Metadata Registry | Off-chain JSON file | Display provider branding: name, logo, description, website |

---

## 3. The Marketplace Experience

The landing page is a public marketplace. No authentication is required. Its purpose is twofold: communicate what Signet is and why it matters, and let developers evaluate the available signing providers.

### 3.1 Marketplace Layout

The page should feel like a curated provider directory. Each registered node is presented as a card showing its operator branding, status, and key metrics. The mental model is analogous to a blockchain validator listing or a cloud provider marketplace.

Each provider card displays:

- Company name and logo
- Short description of the operator
- Link to company website
- On-chain data: registration date, number of active groups, open/permissioned status
- Node address (truncated, copyable)

Developers can filter and sort providers by status, group count, or registration age. The goal is to help them build confidence before committing to a selection.

### 3.2 Node Metadata Registry

On-chain NodeInfo contains the public key, open status, registration timestamp, and operator address. Rich metadata (branding, descriptions) is stored off-chain in a JSON registry file maintained in the repository.

#### 3.2.1 Registry Format

The registry is a JSON file mapping node Ethereum addresses to metadata objects:

```json
{
  "0xABC...123": {
    "name": "Acme Security",
    "description": "Enterprise-grade threshold signing...",
    "website": "https://acme-security.com",
    "logo": "https://acme-security.com/logo.png",
    "category": "enterprise"
  }
}
```

This approach prioritizes iteration speed. Node operators can submit PRs to update their metadata. The registry can be migrated to a decentralized solution (IPFS pointers, ENS text records, or a dedicated registry contract) once the schema stabilizes.

### 3.3 Call to Action

The marketplace includes a prominent call to action: *Create a Signing Group*. This transitions the developer from browsing into the authenticated creation flow described in Section 5.

---

## 4. Authentication and Transaction Architecture

The Console authenticates developers using Signet itself. This is both a product decision (dogfooding) and a practical one: all on-chain operations are submitted as ERC-4337 UserOperations, which means the developer's identity is a SignetAccount, not an EOA.

### 4.1 The Bootstrap Group

A prerequisite for the Console is the existence of a bootstrap signing group, created and managed by the Signet team. This group:

- Is created manually before the Console launches
- Powers the social login flow for Console users
- Signs UserOperations on behalf of developers during group creation and management
- Serves as a live demonstration of the Signet system in action

The bootstrap group's address and its associated node endpoints are configured in the Console's environment.

### 4.2 Authentication Flow

When a developer clicks "Sign In," the following sequence occurs:

1. The Console initiates an OAuth flow with a supported social login provider (e.g., Google).
2. On successful OAuth, the Console generates an ephemeral session keypair client-side.
3. The OAuth token and session public key are sent to the bootstrap group's nodes via the `/v1/auth` endpoint.
4. The nodes verify the token (via ZK proof or direct validation) and register the session key.
5. The developer's SignetAccount is either located (if they've logged in before) or created (first login).
6. Subsequent on-chain operations are signed by the bootstrap group using the session key for authorization.

From the developer's perspective, this is a standard social login. They never see seed phrases, private keys, or wallet popups.

### 4.3 Transaction Submission

Every on-chain action in the Console (creating a group, inviting a node, queuing a removal, etc.) follows this path:

1. The Console constructs a UserOperation targeting the appropriate contract function.
2. The UserOperation is sent to the bootstrap group's nodes for threshold signing via the `/v1/sign` endpoint.
3. The signed UserOperation is submitted to signet-min-bundler.
4. The bundler submits it to the ERC-4337 EntryPoint contract on-chain.

This replaces the typical wagmi `writeContract` flow. The Console needs a UserOperation construction layer that handles nonce management, gas estimation, and the specific packing format expected by `SignetAccount.validateUserOp`.

### 4.4 Implications for the Tech Stack

While we use Next.js and wagmi, the wallet connection model is non-standard. wagmi is used primarily for its contract read utilities (`useReadContract`, multicall) and chain configuration, not for transaction signing. A custom hook layer will wrap the UserOperation construction and bundler submission flow, presenting a similar API surface to wagmi's `useWriteContract` but routing through Signet instead of an injected wallet provider.

---

## 5. Developer Journey: Group Creation

The group creation flow is the core experience of the Console. It should feel guided, opinionated where appropriate, and result in a fully operational signing group.

### 5.1 Step 1: Set Threshold

The developer selects their desired threshold (t) and group size (n). The UI should:

- Default to a sensible starting point (e.g., 2-of-3)
- Explain the tradeoff: higher thresholds increase security but require more nodes to be online for signing
- Display the *quorum* (t + 1) prominently, since that's the number of nodes that must participate in every signing operation
- Warn if the selected configuration is unusual (e.g., 1-of-n, or t close to n)

### 5.2 Step 2: Select Nodes

The node selection interface draws from the marketplace view but is filtered and contextualized for the creation flow:

- Only nodes with `isOpen = true` are shown by default (they auto-accept invitations)
- Permissioned nodes can be shown with a note that they require manual approval
- Selected nodes appear in a "your group" panel, visually distinct from the browse list
- The UI enforces that the developer selects at least n nodes
- Provider cards in this context may show additional data relevant to selection: geographic region, uptime history (if available), number of other groups they participate in

### 5.3 Step 3: Review and Configure

Before deployment, the developer reviews their configuration:

- Threshold and quorum summary
- Selected nodes with their branding
- Time-lock defaults (removalDelay, issuerAddDelay, issuerRemovalDelay, authKeyAddDelay, authKeyRemovalDelay) with explanations and the ability to customize
- OAuth issuer configuration (optional at this stage; can be configured post-creation)

### 5.4 Step 4: Deploy and Provision

On confirmation, the Console executes a sequence of operations:

1. **Create the group.** A UserOperation calling `SignetFactory.createGroup` with the selected nodes, threshold, time-lock parameters, and an initial application key (see Section 6).
2. **Wait for confirmation.** The UI shows transaction progress and on-chain confirmation.
3. **Display the application key.** Once confirmed, the developer is shown their application key (private key) with clear instructions to save it securely. This is the "save your key" moment.
4. **Show next steps.** API integration guide, links to SDK documentation, and a path to configure OAuth issuers if desired.

If any selected nodes are permissioned (`isOpen = false`), the group is created with those nodes in a pending state. The UI should clearly indicate which nodes are active vs. awaiting acceptance.

---

## 6. Application Key Provisioning

An application key is a secp256k1 keypair that authorizes API requests to the signing group's nodes. Without it, the developer has no way to authenticate keygen or sign requests. Provisioning it during group creation ensures the system is immediately usable.

### 6.1 Generation Flow

1. The Console generates a secp256k1 keypair client-side (in the browser) during the deploy step.
2. The public key (compressed, 33 bytes) is included in the `createGroup` call as an initial auth key via the `initialAuthKeys` parameter.
3. The private key is displayed to the developer exactly once, with a strong prompt to copy and store it securely.
4. The Console never stores or transmits the private key.

### 6.2 UX Considerations

This is a sensitive moment in the flow. The private key is the developer's credential for accessing their signing group. The UI should:

- Use visual emphasis (distinct card, warning colors) to communicate importance
- Provide a one-click copy button
- Require an explicit acknowledgment ("I've saved my application key") before proceeding
- Never refer to this as a "private key" or "seed phrase" in user-facing copy; "application key" or "API key" is more appropriate for the developer audience

### 6.3 Future: Bring Your Own Key

A future iteration should also support developers pasting in an existing public key, skipping the generation step. This accommodates teams that manage their own key infrastructure. The UI can offer this as an advanced option during the review step.

---

## 7. Management Dashboard

Authenticated developers land on a dashboard showing all groups where their connected SignetAccount is the manager. This is determined by walking the group list from the factory contract and checking the `manager()` address on each group.

### 7.1 Group Overview

Each group card shows:

- Group address and any user-assigned label
- Threshold / quorum and current active node count
- Operational status (is the group operational, i.e., `activeNodes >= quorum`?)
- Count of pending operations (removals, issuer changes, auth key changes)

### 7.2 Group Detail View

Drilling into a group reveals the full management interface, organized into sections:

#### 7.2.1 Membership

- Active nodes with provider branding
- Pending invitations (nodes that haven't yet accepted)
- Pending removals with countdown timers showing time remaining until the removal can be executed
- Actions: invite a node, queue a removal, cancel a pending removal, execute a ready removal

#### 7.2.2 OAuth Issuers

- Active issuers with their allowed client IDs
- Pending additions and removals with countdown timers
- Actions: queue add/remove, cancel pending, execute ready operations

#### 7.2.3 Authorization Keys

- Active auth keys (displayed as truncated hashes with copy functionality)
- Pending additions and removals with countdown timers
- Actions: queue add/remove, cancel pending, execute ready operations

#### 7.2.4 Time-Lock Queue

A unified view of all pending time-locked operations across membership, issuers, and auth keys. Each item shows the operation type, target, time remaining, and an execute button that activates when the delay has elapsed. This is important because time-locked operations are permissionless to execute once the delay passes; having them in a single view lets the manager (or anyone) efficiently execute ready operations.

---

## 8. Node API Integration

Beyond on-chain data, the Console integrates with individual node HTTP APIs to provide operational visibility.

### 8.1 Endpoints Used

| Endpoint | Purpose | Context |
|---|---|---|
| `GET /v1/health` | Node liveness check | Status indicators on provider cards and group detail |
| `GET /v1/info` | Node identity (peer ID, address, type) | Enriches on-chain data with network identity |
| `GET /v1/keys` | Key shards held by a node | Shows which keys a group has generated; confirms keygen success |
| `POST /v1/auth` | Register session key | Part of the authentication flow (Section 4.2) |
| `POST /v1/keygen` | Initiate distributed key generation | Triggered after group creation or key rotation |
| `POST /v1/sign` | Threshold signing | Signs UserOperations for Console transactions |

### 8.2 Node Discovery

The Console needs to know the HTTP API endpoint for each node. This is not stored on-chain (the contract stores libp2p pubkeys, not HTTP URLs). Node API endpoints will be included in the off-chain metadata registry alongside branding information. For the bootstrap group, endpoints are hardcoded in environment configuration.

---

## 9. Technical Architecture

### 9.1 Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js (App Router) | Server components for public pages; client components for interactive flows |
| Chain interaction | wagmi + viem | Read-only contract calls; chain config and multicall |
| UserOp layer | Custom (viem-based) | Constructs, signs (via Signet), and submits UserOperations |
| Bundler client | Custom REST client | Submits signed UserOps to signet-min-bundler |
| Styling | Tailwind CSS | Utility-first; consistent with modern dApp conventions |
| State | TanStack Query (via wagmi) | Contract reads cached and auto-refreshed; node API calls managed separately |
| Chain config | Environment-driven | RPC URL, factory address, bundler URL, bootstrap group config; switchable between devnet and testnets |

### 9.2 Key Abstractions

#### 9.2.1 useSignetAuth

A React hook (or context provider) managing the authentication lifecycle: OAuth initiation, session key management, SignetAccount lookup/creation, and session state. Components consume this to determine whether the user is authenticated and to access their SignetAccount address.

#### 9.2.2 useSignetWrite

A replacement for wagmi's `useWriteContract` that routes through the Signet signing and bundler flow. Accepts the same contract/function/args interface but internally constructs a UserOperation, sends it to the bootstrap group for signing, submits it to the bundler, and tracks confirmation. Returns the same pending/success/error state pattern developers expect from wagmi.

#### 9.2.3 Contract ABIs

Generated from the Foundry build artifacts in `signet-protocol/contracts/out/`. These are imported as TypeScript constants and used by both wagmi read hooks and the UserOperation construction layer.

### 9.3 Chain Configuration

The Console supports switching between networks via environment variables:

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_RPC_URL` | JSON-RPC endpoint (Anvil for devnet, Alchemy/Infura for testnets) |
| `NEXT_PUBLIC_CHAIN_ID` | Target chain ID |
| `NEXT_PUBLIC_FACTORY_ADDRESS` | Deployed SignetFactory proxy address |
| `NEXT_PUBLIC_BUNDLER_URL` | signet-min-bundler endpoint |
| `NEXT_PUBLIC_ENTRYPOINT_ADDRESS` | ERC-4337 EntryPoint address |
| `NEXT_PUBLIC_BOOTSTRAP_GROUP` | Bootstrap group contract address |
| `NEXT_PUBLIC_BOOTSTRAP_NODES` | Comma-separated node API endpoints for the bootstrap group |

---

## 10. Open Questions

1. **Account creation gas.** Who pays gas for the developer's first SignetAccount deployment? Options: Signet sponsors it via a paymaster, or the developer funds a pre-computed address. A paymaster is more consistent with the frictionless onboarding goal.
2. **Node API endpoint discovery.** The off-chain JSON registry works for now, but long-term we may want nodes to register their HTTP endpoints on-chain or via a discovery protocol. Worth considering the migration path.
3. **Multi-group management.** Should the Console support a developer managing groups owned by different SignetAccounts (e.g., personal and company accounts)? For now, one account per session is simpler.
4. **Keygen trigger.** After group creation, the group exists on-chain but has no generated key. Should the Console automatically trigger keygen via the node API, or leave that to the developer? Automatic is more consistent with the "operational from day one" principle.
5. **OAuth issuer setup in wizard.** Should the creation wizard include OAuth issuer configuration, or is that a post-creation step? Including it makes the setup more complete but adds complexity to an already multi-step flow.
6. **Node reputation/metrics.** The marketplace would benefit from quantitative reputation data (uptime, response time, signing success rate). Where does this data come from? An off-chain monitoring service is the most likely answer, but it's out of scope for the initial release.
