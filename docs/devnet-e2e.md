# Devnet end-to-end walkthrough

Running the Signet Console UI end-to-end locally against a fresh devnet, with sponsored UserOperations via a SignetPaymaster.

## What this document is (and isn't)

This is a runbook for **one specific path** through the Signet stack: the EVM + ERC-4337 reference setup, using our own `signet-wallet` smart account and `signet-min-bundler`. It exists because we dog-food the stack while building `signet-ui`, and because writing things down keeps us from rediscovering the ordering each time.

It is **not** a definition of what "using Signet" means. It's one concrete instantiation of three layers that are deliberately separable.

## The three layers, kept separate

**1. Signet — the signer.** Signet is a chain-agnostic threshold signer. It runs FROST (RFC 9591) across a quorum of nodes and produces one signature per request. Today it emits FROST-Schnorr over secp256k1, which fits EVM. FROST-Ed25519 for Solana is on the roadmap. Nothing about Signet itself is EVM-specific; the signer doesn't know or care what gets done with the signature once it leaves the network.

**2. Settlement — how the signature reaches a chain.** This layer is in flux. On EVM today, Schnorr isn't verifiable by native precompiles, so we need an account-abstraction bridge. ERC-4337 is the mechanism we use *right now*, but it's explicitly a workaround for missing native primitives. [EIP-8141 "Frame Transaction"](https://eips.ethereum.org/EIPS/eip-8141) (draft, 2026-01-29) proposes a native off-ramp from ECDSA via a new `FRAME_TX_TYPE` and `APPROVE` opcode, which would let accounts self-define their verification logic without bundlers, UserOps, or paymasters. If and when that lands, large chunks of this walkthrough become obsolete. Solana needs no such bridge — native Ed25519 verification makes Signet a drop-in signer. The settlement layer is whichever mechanism a given chain provides; assume it will change.

**3. Reference stack — `signet-wallet` + `signet-min-bundler`.** An opinionated, minimal reference AA stack we wrote so we don't have to pull in Alchemy, Safe, Biconomy, etc. while experimenting. It validates the end-to-end architecture and keeps the dev loop short. It is **not required** to build on Signet — any AA setup capable of verifying a FROST-Schnorr signature works. Treat this stack as a dated artifact of "what worked in 2026-Q2," not as The Signet Way.

## How to read the rest of this doc

Everything below is layer 2 + layer 3 specific. It's the runbook for the EVM/ERC-4337/reference-stack path. The Phase-by-Phase structure tracks the order you actually run the scripts. "What we captured" at the end of each phase is raw material for skill extraction. Footguns are called out inline.

If you came here looking for "how do I use Signet with [some other chain / some other AA stack / some future EIP-8141 account]," this isn't that doc yet. The signer half (layer 1) transfers; the rest doesn't.

---

## Repos involved

The end-to-end stack spans four sibling repositories:

- `signet-protocol` — Anvil, `SignetFactory`, beacon, group impl, `signetd` nodes. Also orchestrates deployment of `SignetAccountFactory` from `signet-wallet`.
- `signet-wallet` — `SignetAccountFactory`, `FROSTValidator`. Must exist at `../signet-wallet` relative to `signet-protocol`.
- `signet-min-bundler` — ERC-4337 bundler, ERC-7677 paymaster RPCs, `VerifyingPaymaster` deployment.
- `signet-ui` — this repo. Consumes addresses from the above.

Assumed checkout layout:

```
oleary-labs/
├── signet-protocol/
├── signet-wallet/
├── signet-min-bundler/
└── signet-ui/
```

## Ports

| Service | Port |
|---------|------|
| Anvil RPC | 8545 |
| signetd node 1 HTTP | 8080 |
| signetd node 2 HTTP | 8081 |
| signetd node 3 HTTP | 8082 |
| signetd node 1 libp2p | 9000 |
| signetd node 2 libp2p | 9001 |
| signetd node 3 libp2p | 9002 |
| Bundler JSON-RPC | 4337 |
| Next.js dev server | 3000 |

---

## Phase 0 — Clean slate

Stop anything that might be running from a previous session and wipe persistent state so we're truly starting from zero.

```
# In signet-protocol/
devnet/stop.sh     # tears down anvil + nodes via PIDs in devnet/.pids
devnet/clean.sh    # wipes data/node{1,2,3}/, logs, devnet/.env, configs

# In signet-min-bundler/
# Kill the bundler daemon if still running
# Wipe .devnet/ so the setup script starts fresh
rm -rf .devnet

# In signet-ui/
# Kill the Next.js dev server (Ctrl+C in the terminal running it)
```

> **Note:** clean.sh must run AFTER stop.sh — otherwise there are live processes holding file handles on data dirs.

**What we captured:** Nothing notable. All scripts ran cleanly, no interesting state to retain.

---

## Phase 1 — Start the protocol devnet

`devnet/start.sh` takes two flags that matter for end-to-end UI testing:

| Flag | Effect |
|------|--------|
| `--no-kms` | Nodes use in-process Go TSS instead of the external Rust `kms-frost` binary. Required locally if `kms-frost` can't run (e.g., signature/hardened-runtime issues on macOS). |
| `--auth` | Seeds the group with Google as a trusted OAuth issuer. Required for the UI's ZK-proof-of-JWT auth flow to work; without it, the group has no auth policy. |

For the UI walkthrough we want both:

```
cd signet-protocol
devnet/start.sh --no-kms --auth
```

> **Footgun — GOOGLE_CLIENT_ID must match.** With `--auth`, the script defaults `GOOGLE_CLIENT_ID` to a hardcoded value. If the UI's `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is different, ZK proofs won't verify against the group's issuer list. Export `GOOGLE_CLIENT_ID=<your-client-id>` before running if you're using your own OAuth app.

What this does (high level):

1. Builds `signetd` and `devnet-init` from source (plus `kms-frost` if KMS enabled).
2. Generates three secp256k1 node keys (persistent in `data/node{1,2,3}/node.key`).
3. Starts Anvil on :8545 with 1-second block times.
4. Deploys `SignetFactory` (UUPS proxy + beacon + group impl).
5. **If `../signet-wallet` exists:** deploys `SignetAccountFactory` + `FROSTValidator`.
6. Funds each node's ETH address, then calls `registerNode(pubkey, isOpen=true)` from each.
7. Calls `createGroup([node1,node2,node3], threshold=2, removalDelay=86400, issuers=<Google if --auth>)` — this is the **bootstrap group** the UI uses for auth.
8. Writes `devnet/.env` with all addresses.
9. (If KMS enabled) Starts `kms-frost` per node and waits for sockets.
10. Starts `signetd` on each port and waits for HTTP health.

> **Footgun — signet-wallet path.** If `signet-wallet` isn't at `../signet-wallet`, the script silently sets `ACCOUNT_FACTORY=""` and continues. The UI's auth flow needs this address to compute the counterfactual SignetAccount — without it, you'll see a successful OAuth → proof flow but no account address ever resolves.

> **Footgun — KMS on macOS.** The Rust `kms-frost` binary can be killed immediately with SIGKILL on macOS (hardened runtime / codesigning). If you see `kms1 socket did not appear` and `Killed: 9` in the output, restart with `--no-kms`. The Go TSS path is functionally equivalent for devnet purposes.

> **Footgun — partial state after failure.** If `start.sh` dies mid-run (e.g., KMS failure), Anvil may still be running even though the script exited. Before re-running, tear down: `devnet/stop.sh` (idempotent, won't error if nothing to stop), `pkill -f "^anvil"`, `pkill -f kms-frost`, then `devnet/clean.sh`.

**What we captured:**

Clean run with `devnet/start.sh --no-kms --auth` produced:

| Role | Address |
|------|---------|
| SignetFactory (proxy) | `0x381BAdd883b943FF4b5563C9b5c356cDCC418dF8` |
| UpgradeableBeacon | `0xa329Cc52dfEf10d516F9621DBebD6C93047f97A7` |
| SignetGroup impl | `0x5Ece1d4071d803FBF9af878567fec6BbBab34F78` |
| SignetAccountFactory | `0x76a99F15A2F7E99Fc951497a36198a7F1d2ec450` |
| FROSTValidator | `0x17C03Be1aD71bb4bf5cDB52Db17Ad0bc6715f5B2` |
| Bootstrap group (threshold=2, n=3) | `0xd1b13819dd51a88309b80f88630c3c2090ce7b33` |

Nodes:

| Node | libp2p peer ID | Ethereum address | API | p2p |
|------|----------------|------------------|-----|-----|
| node1 | `16Uiu2HAmKPb2dX8eyvfrod5DL77N2j2ieSsHAVo1Ha2PHidXJpS7` | `0x4639cddb8ca860753d826fe978b84d3aa4f773a3` | :8080 | :9000 |
| node2 | `16Uiu2HAmT4ippVR9Y2oLWfuG7PWg1uqGiBgVvZq2DH595s1V6Dzd` | `0x751b9c2e734262aa66eabffdb0ba80071abb4348` | :8081 | :9001 |
| node3 | `16Uiu2HAmGuxVC57aZJMaHnERRJzLz6ewoMVSDm8y2M8XbXbdAo6F` | `0x0265a447d98ba35dfd56c8d99404535a8a855d92` | :8082 | :9002 |

Group issuer config: `https://accounts.google.com` with client_id `203385367894-0uhir5bt81bsg1gcflfg6tdt1m3eeo0s.apps.googleusercontent.com` (script default — the UI's `NEXT_PUBLIC_GOOGLE_CLIENT_ID` must match this exactly or ZK proofs won't verify). KMS disabled; nodes running in-process Go TSS.

Observations for skill material:

- Group is **2-of-3**: every signing request needs two nodes cooperating on FROST rounds. Single-node failure is tolerated; two-node failure halts signing. This is the intended devnet configuration regardless of `--auth`.
- The summary block prints `AcctFactory` and `Validator` only because `../signet-wallet` was present. If they're missing from the output, the UI's account resolution will silently no-op — the right thing to check first is this summary, not the UI logs.
- All three nodes came up with HTTP health passing on first try with `--no-kms`. No retries needed.

> **Footgun — stale README in signet-protocol/devnet.** That README still documents `threshold=1, nodes=3`, which is a historical artifact: an older version of the group contract had the threshold parameter's semantics reversed relative to the Go side, and the two bugs cancelled. The actual current behavior is 2-of-3. Trust the `start.sh` summary output, not the README.

---

## Phase 2 — Bundler setup and start

The bundler setup depends on Anvil being up (phase 1 must have completed first).

```
cd signet-min-bundler
TESTNET_RPC=https://... scripts/devnet-setup.sh    # first time only
```

What this does:

1. Checks Anvil at :8545 is responding.
2. Checks EntryPoint v0.7 at `0x0000000071727De22E5E9d8BAf0edAc6f37da032`. If missing, copies the runtime bytecode from the configured testnet using `anvil_setCode`. Also copies `SenderCreator` at `0xEFC2c1444eBCC4Db75e7613d20C6a62fF67A167C` (EntryPoint v0.7's constructor normally deploys this; `anvil_setCode` skips constructors, so we have to copy both).
3. Generates a bundler keystore under `.devnet/keystore.json` and funds the bundler address with 100 ETH from Anvil account 0.
4. Deploys `VerifyingPaymaster` with the bundler address as the verifying signer.
5. Deposits 100 ETH on the EntryPoint for the paymaster to cover sponsored gas.
6. Writes `.devnet/bundler.toml` with `allowedPaymasters = [<new paymaster>]`.

> **Footgun — TESTNET_RPC naming.** The variable name suggests it must be a testnet, but the script just does `cast code $ENTRYPOINT_V07 --rpc-url $TESTNET_RPC` to pull runtime bytecode. Any EVM chain with EntryPoint v0.7 at the canonical address `0x0000000071727De22E5E9d8BAf0edAc6f37da032` works — mainnet, Sepolia, Base, Arbitrum, Optimism, Polygon, etc. A public mainnet RPC like `https://eth.llamarpc.com` is keyless and reliable for a one-time bytecode pull. If `cast code` returns `0x` on your chosen RPC, pick a different chain.

> **Footgun — TESTNET_RPC needed on every cycle.** `TESTNET_RPC` is only needed the first time — subsequent runs find the bytecode already deployed and skip the copy. But if Anvil restarts (which happens every `devnet/start.sh` run, since Anvil is ephemeral), the EntryPoint bytecode is gone again, and re-running `devnet-setup.sh` without `TESTNET_RPC` will fail with "Cannot continue without EntryPoint v0.7". So for every fresh protocol-devnet cycle, `TESTNET_RPC` is effectively required.

Then start the bundler daemon:

```
BUNDLER_KEYSTORE_PASSWORD=devnet-insecure BUNDLER_DEV=1 \
  go run ./cmd/bundler --config .devnet/bundler.toml
# or: make devnet
```

> **Footgun — Foundry 1.5.x broke `forge create` in three ways at once.** The script's paymaster deploy silently died, and because forge's stderr was redirected to `/dev/null`, you had to re-run the command by hand to see the real error. All three of these must be fixed together:
>
> 1. `forge create` now requires `--broadcast` to actually send the tx. Without it, the call is a dry-run that exits 0 with no `deployedTo` in the JSON output, and the script's downstream `python3 json.load` fails silently.
> 2. `--constructor-args` is variadic and greedy: it consumes every subsequent token as a constructor arg, including other `--flag` tokens. In 1.5.x the parser no longer short-circuits on `--`-prefixed tokens. **It must be the last flag on the command line.**
> 3. With `--root contracts`, paths resolve relative to `contracts/`. The script passes `lib/account-abstraction/...`, but the submodule is checked out at the repo root's `lib/`, not inside `contracts/lib/`. The correct path is `../lib/account-abstraction/contracts/samples/VerifyingPaymaster.sol:VerifyingPaymaster`.
>
> Patched in `scripts/devnet-setup.sh` — look for the long comment block above `forge create`. The `2>/dev/null` is kept but the comment explicitly tells the next person to strip it when debugging.

**What we captured:**

| Role | Address |
|------|---------|
| Bundler EOA (funded with 100 ETH from Anvil #0) | `0x017a898c9157411a2e9d00cb2092d32ce3b36703` |
| VerifyingPaymaster | `0x610178dA211FEF7D417bC0e6FeD39F05609AD788` |
| EntryPoint v0.7 (copied bytecode from mainnet) | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| SenderCreator (copied alongside EntryPoint) | `0xEFC2c1444eBCC4Db75e7613d20C6a62fF67A167C` |

Paymaster deposit on EntryPoint: 100 ETH (confirmed via `getDepositInfo`).
Bundler is the VerifyingPaymaster's `verifyingSigner` — every ERC-7677 `pm_getPaymasterData` response is signed by this key.

Observations for skill material:

- `devnet-setup.sh` is **not idempotent against a fresh Anvil**. Every time the protocol devnet restarts, Anvil is wiped, so EntryPoint bytecode disappears. `TESTNET_RPC` is effectively mandatory on every run, not just the first.
- The paymaster allowlist in `bundler.toml` is the only place the paymaster address is durably wired in — `signet-min-bundler/internal/validator/allowlist.go` rejects ops whose paymaster isn't in this list (`checkPaymaster`). If you redeploy the paymaster, `bundler.toml` must be rewritten.
- Setup scripts that swallow stderr (`forge create ... 2>/dev/null`) on happy paths become pure obstacle on failure paths. Worth calling out as an anti-pattern in skill material.

---

## Phase 3 — Configure signet-ui

Populate `signet-ui/.env.local` with addresses from phases 1 and 2:

```bash
# From signet-protocol/devnet/.env:
NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_GROUP_FACTORY_ADDRESS=<FACTORY from devnet/.env>
NEXT_PUBLIC_ACCOUNT_FACTORY_ADDRESS=<ACCOUNT_FACTORY from devnet/.env>
NEXT_PUBLIC_BOOTSTRAP_GROUP=<GROUP_ADDRESS from devnet/.env>
NEXT_PUBLIC_BOOTSTRAP_NODES=http://127.0.0.1:8080,http://127.0.0.1:8081,http://127.0.0.1:8082

# From signet-min-bundler/.devnet/:
NEXT_PUBLIC_BUNDLER_URL=http://127.0.0.1:4337
NEXT_PUBLIC_ENTRYPOINT_ADDRESS=0x0000000071727De22E5E9d8BAf0edAc6f37da032
NEXT_PUBLIC_USE_PAYMASTER=true
NEXT_PUBLIC_PAYMASTER_ADDRESS=<PAYMASTER_ADDR from .devnet/paymaster.addr>

# Google OAuth (from console.cloud.google.com, redirect URI localhost:3000/auth/callback):
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<OAuth client ID>
GOOGLE_CLIENT_SECRET=<OAuth client secret>
```

> **Footgun:** `NEXT_PUBLIC_USE_PAYMASTER=true` is effectively mandatory against `signet-min-bundler`, because the bundler's validator rejects any op with `paymasterAndData` shorter than 20 bytes ("paymaster required"). The flag exists for future bundlers that accept unsponsored ops, but is not actually optional here.

**What we captured:**

Final `.env.local` for this session:

```ini
NEXT_PUBLIC_RPC_URL=http://localhost:8545
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_GROUP_FACTORY_ADDRESS=0x381BAdd883b943FF4b5563C9b5c356cDCC418dF8
NEXT_PUBLIC_ENTRYPOINT_ADDRESS=0x0000000071727De22E5E9d8BAf0edAc6f37da032
NEXT_PUBLIC_ACCOUNT_FACTORY_ADDRESS=0x76a99F15A2F7E99Fc951497a36198a7F1d2ec450
NEXT_PUBLIC_BUNDLER_URL=http://127.0.0.1:4337
NEXT_PUBLIC_USE_PAYMASTER=true
NEXT_PUBLIC_PAYMASTER_ADDRESS=0x610178dA211FEF7D417bC0e6FeD39F05609AD788
NEXT_PUBLIC_BOOTSTRAP_GROUP=0xd1b13819dd51a88309b80f88630c3c2090ce7b33
NEXT_PUBLIC_BOOTSTRAP_NODES=http://localhost:8080,http://localhost:8081,http://localhost:8082
NEXT_PUBLIC_GOOGLE_CLIENT_ID=203385367894-0uhir5bt81bsg1gcflfg6tdt1m3eeo0s.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
```

Observations for skill material:

- **Address churn across runs.** `FACTORY_ADDRESS` and `BOOTSTRAP_GROUP` changed from the prior `.env.local`; `ACCOUNT_FACTORY_ADDRESS` happened to be identical. Anvil's deterministic CREATE nonces mean some addresses may stay stable across fresh starts while others (anything involving proxy deploys or event-captured addresses) churn. Rule of thumb: always repopulate `.env.local` from the fresh devnet `.env` — don't assume anything is stable.
- **All three bootstrap nodes.** The prior `.env.local` only listed node1. The UI's auth flow POSTs the JWT proof to every node in the list; pointing at only one works but loses the redundancy `/v1/auth` is designed for, and causes confusing timeouts if that one node is slow.
- **`USE_PAYMASTER=true` is not optional** against `signet-min-bundler` — the bundler's `checkPaymaster` rejects unsponsored ops outright. The flag exists for forward compatibility with other bundlers.

---

## Phase 4 — Start the UI and test auth

```
cd signet-ui
bun dev
# open http://localhost:3000
```

> This repo prefers `bun` over `npm`. `npm run dev` works too but `bun dev` is the convention.

Click "Sign in" → Google OAuth. The `SignetAuthProvider` walks through these stages, surfaced via `AuthStatus`:

| Stage | What happens | Typical duration |
|-------|-------------|------------------|
| `oauth` | Redirect to Google's consent screen | user-paced |
| `session-key` | Browser generates ephemeral secp256k1 keypair | <100ms |
| `proving` | Client-side ZK proof of the JWT (noir + bb.js WASM) | 2–7s |
| `registering` | POST proof + session pubkey to each bootstrap node `/v1/auth` | ~1s |
| `keygen` | Coordinate DKG to generate key shard for this identity (or find existing) | first time ~5s, subsequent <500ms |
| `authenticated` | Counterfactual SignetAccount address resolved | done |

**What we captured:**

Full auth flow completed end-to-end after the stale-signetd fix (see Failure Modes). Final resolved values:

| Value | Example |
|-------|---------|
| Identity (OIDC `iss:sub`) | `https://accounts.google.com:114810956681671373980` |
| FROST group public key → ETH address | `0xd0c10a9a298d31eef6cec0fef3bef581c03e1107` |
| Counterfactual SignetAccount | `0x05D39d756B4075fA0BFCab09eD12FfE016c96822` |

Observations for skill material:

- `key created` logs the `(issuer, sub)` identity pair plus the derived ETH address of the FROST group public key. That ETH address is **not** the user's SignetAccount — it's the address you'd get if you used the group pubkey as an EOA. It serves as a stable identifier of the key material itself.
- The counterfactual SignetAccount is computed deterministically from `(entryPoint, groupPublicKey, salt=0)` via `SignetAccountFactory.getAddress`. The contract doesn't exist on-chain yet — the first UserOp submission will deploy it via `initCode`.
- OAuth → authenticated was single-digit seconds end to end after the proving WASM had been warmed up. Cold-start proving is the long tail.

---

## Phase 5 — Test a write with paymaster

Easiest write path: go to the group creation wizard (`/groups/new`), fill in threshold + nodes, and execute the deploy step. This calls `SignetFactory.createGroup(...)` through `useSignetWrite`.

The hook walks through these stages, surfaced via `UserOpStatus`:

| Stage | What happens |
|-------|-------------|
| `building` | Encode calldata, fetch nonce from EntryPoint, build unsigned UserOp (with `initCode` if account not yet deployed) |
| `sponsoring-stub` | `pm_getPaymasterStubData` — stub `paymasterAndData` attached so gas estimation accounts for paymaster verification |
| `estimating` | `eth_estimateUserOperationGas` — lock in `accountGasLimits` + `preVerificationGas` |
| `sponsoring` | `pm_getPaymasterData` — real signed paymaster blob replaces stub (paymaster signs over finalized gas) |
| `signing` | FROST threshold sign the UserOp hash via bootstrap node `/v1/sign` |
| `submitting` | `eth_sendUserOperation` to bundler |
| `confirming` | Poll `eth_getUserOperationReceipt` until mined |

> **Footgun:** the stage ordering is interlocking. Gas fields are read by the paymaster hash; `paymasterAndData` is read by the EntryPoint hash. Reordering any step produces AA34 signature errors with no useful on-chain message. See `CLAUDE.md` → "Write flow ordering".

**First-write special case:** the UserOp includes `initCode` that deploys the SignetAccount via `SignetAccountFactory.createAccount(entryPoint, groupPublicKey, salt=0)`. The account doesn't exist on-chain until this tx mines, but its address is counterfactually known.

**Verification (outside the UI):**

```bash
source ../signet-protocol/devnet/.env

# Account should now have code
cast code <account_address> --rpc-url $RPC_URL

# Group contract should be registered with factory
cast call $FACTORY_ADDRESS "getGroups()(address[])" --rpc-url $RPC_URL

# Paymaster deposit should have decreased
cast call 0x0000000071727De22E5E9d8BAf0edAc6f37da032 "getDepositInfo(address)" <paymaster> --rpc-url $RPC_URL
```

**What we captured:**

First-write flow succeeded end-to-end after the SignetPaymaster fix (see Failure Modes). First-write includes `initCode` that deploys the SignetAccount, so gas is higher than a steady-state call.

| Field | Value |
|-------|-------|
| UserOp hash | `0x4178f0efa0fa42823f53634a497c6fada2fdd5d4e432ee01886f0f18a7418fbb` |
| Sender (SignetAccount) | `0x05D39d756B4075fA0BFCab09eD12FfE016c96822` |
| Bundle tx | `0x631d2fabd982afcda4445217cf27b093b65b84c913739fab92c313f98e818b89` |
| Confirmed at block | 986 |
| Gas cost | 13,384,128 wei |

Observations for skill material:

- **All seven `UserOpStatus` stages fired in order** (`building` → `sponsoring-stub` → `estimating` → `sponsoring` → `signing` → `submitting` → `confirming`). The interlocking-signature ordering that CLAUDE.md documents held.
- **`confirming` → `op confirmed` took ~3 seconds** on devnet Anvil with 1-second block times. Most of that is the bundler's polling interval, not chain latency.
- **Bundler logged the op at sender `0x05D39d...` even though the account didn't exist yet.** EntryPoint computes the counterfactual sender from `initCode` before deploying it; the whole flow talks about the sender by its counterfactual address throughout, only materialized in this tx.

---

## Failure modes observed

### Auth flow returns 401 "untrusted issuer: https://accounts.google.com" from all nodes

**What we saw:** UI sign-in walked through OAuth → proving, then `registering` stage failed with every bootstrap node returning:

```
401 {"error":"proof verification failed: untrusted issuer: https://accounts.google.com"}
```

Confusing because (a) `--auth` had just seeded Google as a trusted issuer, and (b) `cast call $GROUP_ADDRESS "getIssuers()"` confirmed `https://accounts.google.com` was stored on-chain against the group.

**Root cause:** `signetd` loads group issuers into an in-memory map at startup via `chain.go::buildGroupInfo()`. Stale `signetd` processes from a previous devnet run were still holding :8080/:8081/:8082, so the new `signetd` from `devnet/start.sh` failed to bind (log showed `listen tcp :8080: bind: address already in use`) and exited silently — but the *stale* processes were happily answering requests, with an issuer map that didn't include the current group.

`devnet/stop.sh` only kills PIDs it recorded in `devnet/.pids`. Processes orphaned by a crashed prior run (or killed terminals) aren't tracked and survive `stop.sh` + `clean.sh`. `start.sh` then launches new nodes that collide with the old ones, and both the start script and the stale nodes silently wedge.

**How to fix (before next `start.sh`):**

```
lsof -i :8080 -i :8081 -i :8082   # find stale signetd PIDs
kill -9 <pids>
pkill -9 -f '^anvil'              # anvil orphans too
cd signet-protocol
devnet/stop.sh
devnet/clean.sh
devnet/start.sh --no-kms --auth
```

**How to detect early:** always `grep -i 'bind' devnet/node*.log` after `start.sh`. Any `bind: address already in use` means the node you think is running isn't the one answering requests.

**Skill material:** two lessons. First, "script succeeded" doesn't mean "the process you intended is running" — verify port ownership, not just exit codes. Second, port-orphaning is a chronic devnet problem; `stop.sh` should `pkill -f signetd` or, better, `signetd` should refuse to start if the port is already bound and surface that clearly to the orchestrating script.

### Write flow returns "pm_getPaymasterData failed: shouldSponsor call failed: execution reverted"

**What we saw:** UI write stage `sponsoring` failed with that error. `sponsoring-stub` had succeeded, so paymaster wiring wasn't totally broken — only the *real* sponsorship call.

**Root cause:** `devnet-setup.sh` deploys the stock `lib/account-abstraction/.../VerifyingPaymaster.sol`, but `signet-min-bundler/internal/paymaster/paymaster.go` calls `shouldSponsor(PackedUserOperation)` on the paymaster contract during ERC-7677 `pm_getPaymasterData`. Stock `VerifyingPaymaster` doesn't have that function, so the `eth_call` reverts.

The correct paymaster is `signet-min-bundler/contracts/src/SignetPaymaster.sol`, which wraps VerifyingPaymaster's logic but adds `shouldSponsor` and an `_isAllowedTarget` check (restricts sponsored calls to the factory, factory-deployed groups, or self-calls). It takes **three** constructor args (not two): `IEntryPoint, verifyingSigner, ISignetFactory`. The factory arg has to be the `signet-protocol` `SignetFactory` proxy address — which the bundler devnet script currently has no way to know.

**How to fix (manual this session):**

```
cd signet-min-bundler

# Deploy with the 3-arg constructor; factory arg comes from signet-protocol/devnet/.env
forge create --rpc-url http://localhost:8545 --root contracts --broadcast \
  --private-key <anvil_funder_key> \
  src/SignetPaymaster.sol:SignetPaymaster \
  --constructor-args \
    0x0000000071727De22E5E9d8BAf0edAc6f37da032 \
    <bundler_EOA> \
    <FACTORY_ADDRESS_from_signet-protocol_devnet>

# Deposit ETH on EntryPoint for the new paymaster
cast send 0x0000000071727De22E5E9d8BAf0edAc6f37da032 "depositTo(address)" <new_paymaster> \
  --value 100ether --private-key <anvil_funder_key> --rpc-url http://localhost:8545

# Update .devnet/bundler.toml allowedPaymasters to the new address
# Update signet-ui/.env.local NEXT_PUBLIC_PAYMASTER_ADDRESS to the new address
```

**How to fix (script patch, pending):** `devnet-setup.sh` should source `../signet-protocol/devnet/.env` to pick up `FACTORY_ADDRESS`, then deploy `src/SignetPaymaster.sol:SignetPaymaster` with three constructor args. Task #15 in the session task list.

**Skill material:** the split-repo architecture creates a real coordination problem — one repo owns the factory, another owns the paymaster that depends on it, and there's no single source of truth for their addresses. Skills that describe "how to stand up a Signet devnet" need to be explicit that bundler setup is a second phase after protocol setup, and that certain values flow across repo boundaries.

---

## Open questions

_(populated as we go)_
