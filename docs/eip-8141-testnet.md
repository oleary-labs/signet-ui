# EIP-8141 testnet ABI guide (`demo.eip-8141.ethrex.xyz`)

This document describes the *exact* on-wire format and opcode semantics that
the public demo testnet currently accepts. It is **not** the same as the spec
described in `docs/eip-8141.md` or implemented at the tip of `eip-8141-1-demo`.
Several breaking changes have landed on the branch since the testnet was built,
and the live binary still uses the older calling conventions.

If you've been getting the "nonce never increments and there is no receipt"
symptom — your transaction is being rejected as `InvalidFrameTransaction`
during execution, almost certainly because something in the frame or contract
ABI doesn't match what this binary expects.

## Identifying the binary you're targeting

Confirm with `web3_clientVersion`:

```bash
curl -s -X POST -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"web3_clientVersion","params":[]}' \
  https://demo.eip-8141.ethrex.xyz/rpc
```

The current testnet returns:

```json
{"jsonrpc":"2.0","id":1,"result":"ethrex/v9.0.0-eip-8141-1-demo-7dc6a36fb258f4a75ea7c529fd37fa0154e5a2ca/x86_64-unknown-linux-gnu/rustc-v1.90.0"}
```

Everything below is anchored to commit **`7dc6a36fb`** on branch
`eip-8141-1-demo` (Mar 30 2026). To inspect any reference file at the
right revision use `git show 7dc6a36fb:<path>`.

## What changed *after* this binary

These commits all landed *after* `7dc6a36fb`. Avoid any documentation,
contract sample, or library function whose behaviour depends on them — it
won't run correctly here:

- `6d773c756` "Align with latest EIP-8141 spec: mode/flags split, FRAMEPARAM,
  scope bitmasks" — rewrote `Frame` from a 4-field tuple with a packed `mode:
  u32` into a 6-field tuple with separate `mode: u8` and `flags: u8`, renamed
  TXPARAM's per-frame params off to a brand new opcode `FRAMEPARAM = 0xB3`,
  reduced `TXPARAM` to a single argument, and **inverted the scope numbering
  to a bitmask convention** (`0x1 = PAYMENT`, `0x2 = EXECUTION`).
- `2daa474fa`, `9502bf5fb`, `cb483572b` — added a `value` field to frames.
- `04c2b3c04` — three consensus-critical bug fixes that aren't in the live
  binary; some edge cases work differently.
- `9d391e500` then reverted by `97a89a9b2`/`94f4c5185` — the Amsterdam
  fork-gate. The testnet predates the revert, so frame transactions still
  require Osaka/Amsterdam to be activated. The shipped kurtosis config sets
  `fulu_fork_epoch: 0`, which is sufficient.

For the purposes of this guide, treat anything that mentions `flags`,
`value`, `FRAMEPARAM (0xB3)`, scope-bitmask semantics, or 6-field frames as
"the future spec — not what's running."

## Transaction wire format

A frame transaction is a single byte `0x06` followed by an RLP list of eight
fields:

```
0x06 || rlp([
  chain_id,                  // u64
  nonce,                     // u64 — must match sender's account nonce
  sender,                    // 20-byte address (NOT recovered from a sig)
  frames,                    // list of frames (see below)
  max_priority_fee_per_gas,  // u64
  max_fee_per_gas,           // u64
  max_fee_per_blob_gas,      // U256
  blob_versioned_hashes,     // list of 32-byte hashes (usually empty)
])
```

There is no ECDSA signature. Authentication is performed entirely on-chain by
running the frames; the `sender` field is taken at face value, and the binary
specifically does **not** require it to be an EOA — a contract address is a
legal `sender`.

### Frame format

Each frame is a four-field RLP tuple:

```
rlp([mode, target, gas_limit, data])
```

- `mode` (u32) — see "mode bit layout" below.
- `target` (address or `null`) — `null` resolves to the transaction's sender
  at execution time. RLP-encode `null` as `0x80` (empty bytes), the same way
  CREATE-style transactions encode their `to` field.
- `gas_limit` (u64) — must fit in `i64` (i.e. ≤ `2**63 - 1`).
- `data` (bytes) — opaque payload. For VERIFY frames, the data is *elided*
  before the signature hash is computed (see "sig_hash" below).

### Mode bit layout

The `mode` field is a single 32-bit integer that packs three things:

```
bits  0..7   execution mode      (0 = DEFAULT, 1 = VERIFY, 2 = SENDER)
bits  8..9   allowed APPROVE scope
                  0  → unrestricted
                  1  → scope 1 only (sender)
                  2  → scope 2 only (payer)
                  3  → scope 3 only (sender + payer)
bit   10     atomic batch flag   (only valid with execution mode = SENDER)
bits 11..31  reserved (zero)
```

Important: bits 8-9 are checked with **exact equality** against the scope
argument passed to APPROVE, not a bitmask subset. A VERIFY frame whose mode
field has bits 8-9 set to `0b11` will *only* accept `APPROVE(scope = 3)`; it
will reject scope-1 and scope-2 calls with `InvalidOpcode`. If you want a
frame to accept any scope, leave bits 8-9 zero (allowed_scope = unrestricted).

Three concrete mode values you'll use most:

```
0x0001   VERIFY, allowed scope unrestricted
0x0301   VERIFY, allowed scope = 3 only           (mode | (3 << 8))
0x0002   SENDER, allowed scope unrestricted, no atomic-batch
0x0402   SENDER, atomic batch (must be followed by another SENDER frame)
```

### Signature hash (`sig_hash`)

Several opcodes (notably `TXPARAM(0x08, 0)`) read the transaction's
`sig_hash`. It is computed as:

```
sig_hash = keccak256(0x06 || rlp([
  chain_id, nonce, sender, frames_with_verify_data_elided,
  max_priority_fee_per_gas, max_fee_per_gas, max_fee_per_blob_gas,
  blob_versioned_hashes,
]))
```

"`frames_with_verify_data_elided`" means: for each frame whose execution mode
is VERIFY, replace its `data` field with empty bytes before hashing. Every
other field of every frame stays in the hash. This lets a VERIFY frame's
`data` carry the signature material itself without making the hash depend on
its own value.

## Validity rules

The binary rejects the transaction up front (no nonce bump, no receipt) if any
of these hold:

- `sender == 0x0…0`.
- `frames.len() == 0` or `frames.len() > 1000` (this is the older max — the
  64-frame cap was a later commit).
- Any frame's execution mode (low 8 bits) is ≥ 3 (reserved).
- A VERIFY frame has `mode bits 8..9 == 0` (it must permit some scope).
- Atomic-batch flag is set on a frame that isn't SENDER, or on the last frame
  of the transaction, or whose successor isn't SENDER.
- `frame.gas_limit` exceeds `2**63 - 1`, or the cumulative frame gas limits do.
- `nonce` doesn't match the sender's current account nonce.
- `max_priority_fee_per_gas > max_fee_per_gas`.
- `max_fee_per_gas < base_fee_per_gas` of the block.

After execution, the binary will *also* reject the transaction (still no
receipt, still no nonce bump) if:

- Any VERIFY frame returned without calling APPROVE.
- A SENDER frame was reached while `sender_approved == false`.
- After all frames executed, `payer_approved == false`.

That last condition is the most common cause of silent failure: the
transaction looks like it was accepted by the mempool, the frames run, and
yet you see no receipt because no frame ever called `APPROVE` with a scope
that sets the `payer_approved` flag.

## Opcode reference

There are exactly four EIP-8141 opcodes available in this binary. Anything
that documentation or contract source you've found mentions called
`FRAMEPARAM` (`0xB3`), or any reference to `TXPARAMSIZE`/`TXPARAMCOPY` as
opcodes — those don't exist on this binary.

### `APPROVE` (0xAA)

Pops three 32-byte words from the stack: `[offset, length, scope]`, with
`offset` on top. Equivalently, push order in bytecode is `scope` first,
`length` second, `offset` last:

```
PUSH1 <scope>      ; bottom of the three-tuple
PUSH1 <length>
PUSH1 <offset>     ; top of the three-tuple
APPROVE            ; 0xAA
```

Behaviour by `scope`:

| scope | name | preconditions | side effects |
|---|---|---|---|
| `0x1` | sender approval | `frame_target == tx.sender`, `!sender_approved` | sets `sender_approved = true` |
| `0x2` | payer approval | `sender_approved == true`, `!payer_approved` | bumps `tx.sender`'s nonce, deducts `max_tx_cost` from the executing contract, sets `payer_approved = true`, records `payer_address = frame_target` |
| `0x3` | combined | `frame_target == tx.sender`, neither flag set | both of the above in one shot |
| any other | invalid | — | `InvalidOpcode` (frame fails) |

Where `max_tx_cost = max_fee_per_gas * total_gas_limit + len(blob_hashes) *
131072 * max_fee_per_blob_gas`.

The frame's executing contract (i.e. `vm.current_call_frame.to`) must equal
the frame's resolved target, otherwise APPROVE returns `RevertOpcode` and the
frame fails. Memory `[offset .. offset + length]` is copied to the frame's
output as if a RETURN had been emitted, then the frame halts. Gas cost is the
RETURN gas model — memory expansion only.

### `TXPARAM` (0xB0)

Pops two 32-byte words: `[param_id, index]`, with `param_id` on top. Pushes
the requested parameter as a single 32-byte word.

Push order in bytecode is `index` first, `param_id` last:

```
PUSH1 <index>
PUSH1 <param_id>
TXPARAM            ; 0xB0
; result on top of stack
```

The Yul-equivalent helper is `verbatim_2i_1o(hex"B0", paramId, index)`.
**Do not use `verbatim_1i_1o(hex"B0", paramId)`** — that is the post-update
calling convention and it will leave the stack one slot short of what Yul's
allocator believes, silently corrupting everything that follows.

Parameter table:

| param_id | index ignored? | meaning |
|---|---|---|
| `0x00` | yes | tx_type = `0x06` |
| `0x01` | yes | `nonce` |
| `0x02` | yes | `sender` (right-aligned in 32 bytes) |
| `0x03` | yes | `max_priority_fee_per_gas` |
| `0x04` | yes | `max_fee_per_gas` |
| `0x05` | yes | `max_fee_per_blob_gas` |
| `0x06` | yes | `max_tx_cost` (full formula above) |
| `0x07` | yes | `len(blob_versioned_hashes)` |
| `0x08` | yes | `sig_hash` |
| `0x09` | yes | `len(frames)` |
| `0x10` | yes | current frame index |
| `0x11` | no | `frames[index].target` (or `tx.sender` if null) |
| `0x12` | no | `frames[index].gas_limit` |
| `0x13` | no | `frames[index].mode` low 8 bits |
| `0x14` | no | `len(frames[index].data)` (zero for VERIFY frames) |
| `0x15` | no | `frames[index].status` (only valid for *past* frames; current/future → `InvalidOpcode`) |

Any unrecognised `param_id` halts the frame with `InvalidOpcode`.

### `FRAMEDATALOAD` (0xB1)

Pops `[offset, frame_index]` (`offset` on top). Pushes one 32-byte word read
from `frames[frame_index].data` at the given byte offset, zero-padded if the
read runs past the end.

For a VERIFY frame the result is always zero — its `data` is elided from
hashing and is not visible to opcodes.

### `FRAMEDATACOPY` (0xB2)

Pops `[memOffset, dataOffset, length, frame_index]` (`memOffset` on top).
Copies `length` bytes from `frames[frame_index].data` starting at
`dataOffset` into memory at `memOffset`. Behaves like CALLDATACOPY for gas
accounting (3 + 3 × ⌈length/32⌉ + memory expansion). Reads past the end
zero-fill. VERIFY frames produce all zeros.

## Default code for accounts with no deployed code

When a frame's resolved target has no deployed code (and is not an EIP-7702
delegator at this commit), the binary runs built-in default code based on the
frame's execution mode.

VERIFY default code expects the frame's `data` to begin with a one-byte
signature type:

- `0x00` (secp256k1): the next 65 bytes are `[v(1), r(32), s(32)]`.
- `0x01` (P256): the next 128 bytes are `[r(32), s(32), qx(32), qy(32)]`.

For secp256k1 it calls `ecrecover` against `sig_hash`; for P256 it calls the
P256VERIFY precompile. The recovered/derived address must equal the frame's
resolved target. **Note:** the post-update P256 domain separator
(`keccak(0x01 || qx || qy)`) and the secp256k1 high-`s` rejection are *not*
in this binary — only the raw recovered-address check.

If verification passes, default VERIFY code calls `APPROVE` with the scope
specified by `mode bits 8..9` and halts. If `mode bits 8..9 == 0` it cannot
APPROVE (no scope to use), so the frame fails — VERIFY frames *must* set
those bits.

SENDER default code interprets `frame.data` as RLP `[[target, value, data],
…]` and runs each entry as a sub-call from `tx.sender`, with EIP-150 63/64
gas forwarding and full backup/revert on failure.

## Code recipes

### Single-frame self-approving contract

The smallest frame transaction that produces a receipt: one VERIFY frame
whose target is a contract deployed at `tx.sender`, with bytecode that just
calls `APPROVE(0, 0, 3)`.

Bytecode:

```
60 03   PUSH1 0x03   ; scope = 3 (sender + payer)
60 00   PUSH1 0x00   ; length
60 00   PUSH1 0x00   ; offset
AA      APPROVE
```

Frame:

```
mode      = 0x0001            ; VERIFY, allowed_scope = 0 (unrestricted)
target    = null              ; resolves to tx.sender
gas_limit = 100_000
data      = (empty)
```

Setting `mode = 0x0301` (VERIFY, allowed_scope = 3) is also fine here because
the bytecode passes scope = 3 exactly. Any other allowed_scope value (1 or 2)
would reject this APPROVE.

### Reading `sig_hash` in a contract

Yul:

```yul
let sigHash := verbatim_2i_1o(hex"B0", 0x08, 0)
```

Raw bytecode equivalent:

```
60 00   PUSH1 0x00   ; index (ignored for param 0x08, but TXPARAM still pops 2)
60 08   PUSH1 0x08   ; param_id = sig_hash
B0      TXPARAM
; sigHash is now on top of stack
```

Solidity helper, suitable for `--via-ir`:

```solidity
library FrameOps {
    function txParamLoad(uint256 paramId, uint256 index)
        internal view returns (uint256 result)
    {
        assembly { result := verbatim_2i_1o(hex"B0", paramId, index) }
    }
    function approve(uint256 offset, uint256 length, uint256 scope) internal {
        assembly { verbatim_3i_0o(hex"AA", offset, length, scope) }
    }
}
```

These match `demos/eip8141/contracts/lib/FrameOps.sol` at SHA `7dc6a36fb`
verbatim. Copy that file into your project rather than the version on the
branch tip.

### Sponsored ("sender + sponsor pays") two-frame pattern

Two VERIFY frames followed by a SENDER frame that does the actual work:

```
frame[0]: mode=0x0101, target=tx.sender,       gas_limit=N, data=<sender sig>
          → execution=VERIFY, allowed_scope=1 (sender approval only)

frame[1]: mode=0x0201, target=<sponsor addr>,   gas_limit=N, data=<sponsor sig>
          → execution=VERIFY, allowed_scope=2 (payer approval only)

frame[2]: mode=0x0002, target=tx.sender,        gas_limit=N, data=<calldata>
          → execution=SENDER, no APPROVE allowed (allowed_scope=0)
```

The sender contract's bytecode must call `APPROVE(0, 0, 1)`. The sponsor
contract's bytecode must verify whatever it cares about (e.g. a balance) and
then call `APPROVE(0, 0, 2)`. By the time frame[2] runs, both flags are set
and the SENDER frame can proceed.

### Combined "verify and pay" single-frame pattern

If you want a single-frame transaction where the sender contract is also the
payer, use scope 3:

```
frame[0]: mode=0x0301, target=tx.sender, gas_limit=N, data=<sig>
          → execution=VERIFY, allowed_scope=3 (combined required)
```

Contract bytecode calls `APPROVE(0, 0, 3)`. Both flags are set in one shot
and `tx.sender` is also the payer.

## Common pitfalls

The two failures most likely to bite you on this testnet, in order:

1. **TXPARAM called with one push instead of two.** Anything that uses
   `verbatim_1i_1o(hex"B0", …)` or the equivalent in raw bytecode is wrong
   for this binary. The handler pops two slots; if you only pushed one, you
   either get a `StackUnderflow` or you consume an unrelated stack slot as
   `index`. The latter case can *appear* to read the right `sig_hash` (because
   tx-level params ignore the index) while leaving Yul's stack tracker off by
   one — which silently corrupts a `MSTORE` two operations later. The
   symptom is "frame halts, no APPROVE called, no receipt."
2. **APPROVE scope numbered with the post-update bitmask convention.** If
   you're calling `APPROVE(0, 0, 1)` expecting "PAYMENT" semantics, you'll
   actually trigger the *sender* approval path on this binary, which requires
   `frame_target == tx.sender`. The intent / numbering mismatch usually shows
   up as `RevertOpcode` from the `frame_target != tx.sender` guard.

Other less common ones:

- Sending a six-field frame (the future format with separate `flags` and
  `value`) — fails RLP decode before any execution; the JSON-RPC layer should
  surface a parse error.
- Setting bits 8-9 of `mode` to `0b11` (allowed_scope = 3) and then having
  the contract call `APPROVE(0, 0, 1)`. Exact-equality check rejects scope 1
  even though "1 is a subset of 3" under the future bitmask rules.
- VERIFY frame with `mode bits 8..9 == 0` — statically rejected; you must
  declare *some* allowed scope (or set `allowed_scope = 0` and let the
  contract pick at runtime — but that's *also* legal here since "0 means
  unrestricted").
- Per-frame param via `FRAMEPARAM (0xB3)` — that opcode doesn't exist here.
  Use `TXPARAM` with param IDs `0x10..0x15` instead.

## Verifying you're hitting the right binary

Cheap probes that confirm the testnet is still on `7dc6a36fb`:

```bash
# Branch + commit identifier
curl -s -X POST -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"web3_clientVersion","params":[]}' \
  https://demo.eip-8141.ethrex.xyz/rpc

# Chain id and genesis hash
curl -s -X POST -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
  https://demo.eip-8141.ethrex.xyz/rpc

curl -s -X POST -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["0x0",false]}' \
  https://demo.eip-8141.ethrex.xyz/rpc
```

The expected `chainId` for this deployment is `0x6c1` (1729).

If the SHA in `web3_clientVersion` ever changes, check the commits between
the old SHA and the new one — anything in the list under "What changed
*after* this binary" above may now apply, and this guide will need updates.

## Reference: testnet-equivalent demo source

The Yul demos sitting in the same tree as the testnet binary are the most
reliable copy-paste material. Pull them at the testnet's SHA:

```bash
git show 7dc6a36fb:demos/eip8141/contracts/yul/WebAuthnP256Account.yul
git show 7dc6a36fb:demos/eip8141/contracts/yul/UnifiedAccount.yul
git show 7dc6a36fb:demos/eip8141/contracts/yul/EphemeralKeyAccount.yul
git show 7dc6a36fb:demos/eip8141/contracts/yul/GasSponsor.yul
git show 7dc6a36fb:demos/eip8141/contracts/lib/FrameOps.sol
```

All four Yul accounts use `verbatim_2i_1o(hex"B0", paramId, index)` for
`TXPARAM` and `verbatim_3i_0o(hex"AA", offset, length, scope)` for `APPROVE`,
with scope numbering 1 = sender, 2 = payer, 3 = both. If your contract source
matches that style, you're aligned with the testnet binary; if it uses
`verbatim_1i_1o` or `FRAMEPARAM`, you've copied from the future spec.