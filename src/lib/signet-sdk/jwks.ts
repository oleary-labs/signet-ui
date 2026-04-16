/**
 * Google JWKS (JSON Web Key Set) fetcher.
 *
 * Fetches Google's public RSA keys and extracts the modulus
 * needed for the ZK proof witness.
 */

import type { JWKSKey } from "./types";

const GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";

let cachedKeys: JWKSKey[] | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 3600_000; // 1 hour

/**
 * Fetch Google's current JWKS keys.
 */
export async function fetchGoogleJWKS(): Promise<JWKSKey[]> {
  if (cachedKeys && Date.now() < cacheExpiry) {
    return cachedKeys;
  }

  const res = await fetch(GOOGLE_JWKS_URI);
  if (!res.ok) {
    throw new Error(`Failed to fetch JWKS: ${res.status}`);
  }

  const data = await res.json();
  cachedKeys = data.keys as JWKSKey[];
  cacheExpiry = Date.now() + CACHE_TTL;
  return cachedKeys;
}

/**
 * Find the RSA key matching a JWT's kid.
 */
export async function getJWKSKeyForKid(kid: string): Promise<JWKSKey> {
  const keys = await fetchGoogleJWKS();
  const key = keys.find((k) => k.kid === kid);
  if (!key) {
    throw new Error(`No JWKS key found for kid: ${kid}`);
  }
  if (key.kty !== "RSA") {
    throw new Error(`Expected RSA key, got ${key.kty}`);
  }
  return key;
}

/**
 * Decode a base64url-encoded JWKS modulus to a BigInt.
 */
export function decodeModulus(base64url: string): bigint {
  const binary = atob(base64url.replace(/-/g, "+").replace(/_/g, "/"));
  let hex = "";
  for (let i = 0; i < binary.length; i++) {
    hex += binary.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return BigInt("0x" + hex);
}

/**
 * Decode a base64url-encoded JWKS modulus to raw bytes.
 */
export function decodeModulusBytes(base64url: string): Uint8Array {
  const binary = atob(base64url.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
