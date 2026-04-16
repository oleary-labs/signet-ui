import {
  type Address,
  type Hex,
  encodeFunctionData,
  type EncodeFunctionDataParameters,
} from "viem";

/**
 * ERC-4337 PackedUserOperation.
 *
 * This is the format expected by the EntryPoint and validated
 * by SignetAccount.validateUserOp. The signature field carries
 * a 65-byte FROST Schnorr signature (Rx || z || v).
 */
export interface PackedUserOperation {
  sender: Address;
  nonce: bigint;
  initCode: Hex;
  callData: Hex;
  accountGasLimits: Hex;
  preVerificationGas: bigint;
  gasFees: Hex;
  paymasterAndData: Hex;
  signature: Hex;
}

/**
 * Build an unsigned UserOperation for a SignetAccount.execute call.
 *
 * The signature field is left empty (0x) — it will be filled by
 * the bootstrap group's threshold signing flow.
 */
export function buildUserOp(params: {
  sender: Address;
  nonce: bigint;
  dest: Address;
  value?: bigint;
  callData: Hex;
}): PackedUserOperation {
  // Encode the SignetAccount.execute(dest, value, data) call
  const executeCallData = encodeFunctionData({
    abi: [
      {
        name: "execute",
        type: "function",
        inputs: [
          { name: "dest", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
        outputs: [],
      },
    ],
    functionName: "execute",
    args: [params.dest, params.value ?? 0n, params.callData],
  });

  return {
    sender: params.sender,
    nonce: params.nonce,
    initCode: "0x",
    callData: executeCallData,
    // Placeholder gas limits — will be estimated by the bundler
    accountGasLimits: "0x00000000000000000000000000030d4000000000000000000000000000030d40",
    preVerificationGas: 50000n,
    gasFees: "0x00000000000000000000000000000001000000000000000000000000003b9aca00",
    paymasterAndData: "0x",
    signature: "0x",
  };
}

/**
 * Compute the UserOperation hash for signing.
 *
 * This matches the hash computed by the EntryPoint, which is what
 * SignetAccount.validateUserOp verifies the FROST signature against.
 */
export function getUserOpHash(
  userOp: PackedUserOperation,
  entryPoint: Address,
  chainId: number
): Hex {
  // TODO: implement full ERC-4337 hash computation
  // keccak256(abi.encode(pack(userOp), entryPoint, chainId))
  throw new Error("Not yet implemented — requires full packing logic");
}
