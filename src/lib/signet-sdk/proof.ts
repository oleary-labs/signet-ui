/**
 * Client-side ZK proof generation for JWT authentication.
 *
 * Runs entirely in the browser:
 * 1. Parse JWT + fetch JWKS → build circuit witness
 * 2. @noir-lang/noir_js → generate ACIR witness from compiled circuit
 * 3. @aztec/bb.js → generate UltraHonk proof via WASM
 *
 * Expected time: ~2-7 seconds in a modern browser.
 */

import { Noir } from "@noir-lang/noir_js";
import { UltraHonkBackend } from "@aztec/bb.js";
import { decodeIdToken } from "./oauth";
import { getJWKSKeyForKid, decodeModulusBytes } from "./jwks";
import { buildFullWitness } from "./witness";
import { hexToBytes } from "./session";
import type { IdTokenClaims } from "./types";

/** Proof generation result. */
export interface ProofResult {
  proof: Uint8Array;
  publicInputs: string[];
  claims: IdTokenClaims;
}

// Compiled circuit artifact — loaded once, cached.
let circuitPromise: Promise<object> | null = null;

function loadCircuit(): Promise<object> {
  if (!circuitPromise) {
    circuitPromise = fetch("/circuits/jwt_auth.json").then((res) => {
      if (!res.ok) {
        throw new Error(
          `Failed to load circuit artifact: ${res.status}. ` +
            "Run 'npm run circuit:rebuild' to compile and copy the circuit."
        );
      }
      return res.json();
    });
  }
  return circuitPromise;
}

/**
 * Generate a ZK proof that a JWT is valid — entirely client-side.
 *
 * @param jwt — raw JWT string (header.payload.signature)
 * @param sessionPubHex — 33-byte compressed secp256k1 session public key (hex)
 * @returns proof bytes, public inputs, and decoded claims
 */
export async function generateJWTProof(
  jwt: string,
  sessionPubHex: string
): Promise<ProofResult> {
  // 1. Parse JWT and decode claims
  const parts = jwt.split(".");
  const headerB64 = parts[0];
  const header = JSON.parse(
    atob(headerB64.replace(/-/g, "+").replace(/_/g, "/"))
  );
  const claims = decodeIdToken(jwt);

  // 2. Fetch the RSA key from Google's JWKS
  const jwksKey = await getJWKSKeyForKid(header.kid);
  const jsonWebKey: JsonWebKey = {
    kty: jwksKey.kty,
    n: jwksKey.n,
    e: jwksKey.e,
    alg: jwksKey.alg,
  };

  // 3. Build full circuit witness
  const sessionPubBytes = Array.from(hexToBytes(sessionPubHex));
  const witness = await buildFullWitness(jwt, jsonWebKey, claims, sessionPubBytes);

  // 4. Load compiled circuit and generate ACIR witness
  const circuit = await loadCircuit();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const noir = new Noir(circuit as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { witness: acirWitness } = await noir.execute(witness as any);

  // 5. Generate UltraHonk proof via bb.js WASM
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const backend = new UltraHonkBackend((circuit as any).bytecode);
  const proofData = await backend.generateProof(acirWitness);

  await backend.destroy();

  return {
    proof: proofData.proof,
    publicInputs: proofData.publicInputs,
    claims,
  };
}

/**
 * Get the RSA modulus bytes for a JWT (for the node auth request).
 */
export async function getJWTModulusBytes(jwt: string): Promise<Uint8Array> {
  const parts = jwt.split(".");
  const header = JSON.parse(
    atob(parts[0].replace(/-/g, "+").replace(/_/g, "/"))
  );
  const jwksKey = await getJWKSKeyForKid(header.kid);
  return decodeModulusBytes(jwksKey.n);
}
