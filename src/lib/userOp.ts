import {
  type Address,
  type Hex,
  encodeFunctionData,
  encodeAbiParameters,
  keccak256,
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
  initCode?: Hex;
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
    initCode: params.initCode ?? "0x",
    callData: executeCallData,
    // Placeholder gas limits — will be estimated by the bundler
    accountGasLimits: "0x000000000000000000000000000f4240000000000000000000000000001e8480",
    preVerificationGas: 50000n,
    gasFees: "0x000000000000000000000000000000010000000000000000000000003b9aca00",
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
/**
 * Compute the UserOperation hash for signing.
 *
 * This matches the hash computed by EntryPoint v0.7 for packed UserOperations:
 *   keccak256(abi.encode(keccak256(packedFields), entryPoint, chainId))
 *
 * The inner hash covers all fields except signature:
 *   keccak256(abi.encode(sender, nonce, keccak256(initCode), keccak256(callData),
 *     accountGasLimits, preVerificationGas, gasFees, keccak256(paymasterAndData)))
 */
export function getUserOpHash(
  userOp: PackedUserOperation,
  entryPoint: Address,
  chainId: number
): Hex {
  const packedHash = keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "bytes32" },
      ],
      [
        userOp.sender,
        userOp.nonce,
        keccak256(userOp.initCode),
        keccak256(userOp.callData),
        userOp.accountGasLimits as Hex,
        userOp.preVerificationGas,
        userOp.gasFees as Hex,
        keccak256(userOp.paymasterAndData),
      ]
    )
  );

  return keccak256(
    encodeAbiParameters(
      [{ type: "bytes32" }, { type: "address" }, { type: "uint256" }],
      [packedHash, entryPoint, BigInt(chainId)]
    )
  );
}
