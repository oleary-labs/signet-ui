/**
 * Auth key certificate session flow.
 *
 * Creates a node session using an ECDSA auth key certificate instead of
 * an OAuth/ZK proof. This enables keygen and signing without user login —
 * useful for backend services, AI agents, or any programmatic access.
 *
 * Flow:
 * 1. Sign a certificate binding an identity + session pub to the auth key
 * 2. POST /v1/auth with the certificate to establish a session
 * 3. Use the session key for subsequent keygen/sign requests (same as OAuth flow)
 *
 * The identity becomes the key namespace: keys are stored as "authkey:<identity>"
 * (or "authkey:<identity>:<suffix>" with key_suffix).
 */

import type { SessionKeypair } from "./types";
import { bytesToHex } from "./session";

export interface AuthKeyCertConfig {
  /** Base URL or proxy URL for the node */
  nodeUrl: string;
  /** If set, requests go through this proxy (for CORS) */
  proxyEndpoint?: string;
}

export interface AuthKeyCertResult {
  identity: string;
  expiresAt: number;
}

/**
 * Authenticate with a node using an auth key certificate.
 *
 * @param config - Node URL / proxy config
 * @param groupId - Group contract address
 * @param authPrivateKey - 32-byte ECDSA private key (matches an on-chain auth key)
 * @param identity - Logical identity string (e.g. "my-backend", "agent-1")
 * @param sessionKeypair - Ephemeral session keypair for subsequent requests
 * @param expiry - Certificate expiry (unix seconds). Default: 1 hour from now.
 */
export async function authenticateWithAuthKey(
  config: AuthKeyCertConfig,
  groupId: string,
  authPrivateKey: Uint8Array,
  identity: string,
  sessionKeypair: SessionKeypair,
  expiry?: number,
): Promise<AuthKeyCertResult> {
  const { getPublicKey, signAsync } = await import("@noble/secp256k1");

  const normalizedGroupId = groupId.toLowerCase();
  const certExpiry = expiry ?? Math.floor(Date.now() / 1000) + 3600;

  // Derive the auth key public key (with ECDSA prefix 0x00)
  const authPubBytes = getPublicKey(authPrivateKey, true);
  const authKeyPub = `0x00${bytesToHex(authPubBytes)}`;

  // Sign certificate: SHA256(identity + ":" + group_id + ":" + session_pub_hex + ":" + expiry_8BE)
  const certHash = await computeCertHash(
    identity,
    normalizedGroupId,
    sessionKeypair.publicKeyHex,
    certExpiry,
  );
  const certSig = await signAsync(certHash, authPrivateKey, {
    lowS: true,
    prehash: false,
  });
  const certSigHex = bytesToHex(new Uint8Array(certSig));

  // POST /v1/auth with certificate
  const url = config.proxyEndpoint ?? `${config.nodeUrl}/v1/auth`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.proxyEndpoint) {
    headers["x-node-url"] = config.nodeUrl;
    headers["x-node-path"] = "/v1/auth";
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      group_id: normalizedGroupId,
      session_pub: sessionKeypair.publicKeyHex,
      certificate: {
        identity,
        expiry: certExpiry,
        auth_key_pub: authKeyPub,
        signature: certSigHex,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Auth key auth failed: ${res.status} — ${body}`);
  }

  const data = await res.json();
  return {
    identity: data.identity ?? identity,
    expiresAt: data.expires_at ?? certExpiry,
  };
}

async function computeCertHash(
  identity: string,
  groupId: string,
  sessionPubHex: string,
  expiry: number,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const expiryBuf = new ArrayBuffer(8);
  new DataView(expiryBuf).setBigUint64(0, BigInt(expiry));

  const parts: Uint8Array[] = [
    enc.encode(identity),
    enc.encode(":"),
    enc.encode(groupId),
    enc.encode(":"),
    enc.encode(sessionPubHex),
    enc.encode(":"),
    new Uint8Array(expiryBuf),
  ];

  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    buf.set(p, offset);
    offset += p.length;
  }

  const digest = await crypto.subtle.digest("SHA-256", buf);
  return new Uint8Array(digest);
}
