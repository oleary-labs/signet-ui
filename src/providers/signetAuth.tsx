"use client";

import {
  createContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { type Address, type Hex, createPublicClient, http } from "viem";
import { getActiveChain } from "@/config/chains";
import { signetAccountFactory } from "@/config/contracts";
import {
  startGoogleOAuth,
  decodeIdToken,
  generateSessionKeypair,
  generateJWTProof,
  getJWTModulusBytes,
  authenticateWithBootstrap,
  type IdTokenClaims,
  type SessionKeypair,
} from "@/lib/signet-sdk";
import { keygen } from "@/lib/signet-sdk/keygen";
import { env } from "@/config/env";

/**
 * Auth status with granular stages for UI feedback.
 *
 * The flow progresses: idle → oauth → session-key → proving → registering → authenticated
 * Each stage maps to a user-visible message.
 */
export type AuthStatus =
  | "idle"
  | "oauth"           // redirecting to Google
  | "session-key"     // generating ephemeral keypair
  | "proving"         // generating ZK proof (2-7s, the headline moment)
  | "registering"     // posting proof to bootstrap nodes
  | "keygen"          // ensuring key shard exists
  | "authenticated"
  | "error";

export interface SignetAuthState {
  status: AuthStatus;
  isAuthenticated: boolean;
  account: Address | null;
  groupPublicKey: Hex | null;
  idToken: string | null;
  claims: IdTokenClaims | null;
  sessionPub: string | null;
  error: Error | null;
  signIn: () => Promise<void>;
  signOut: () => void;
}

export const SignetAuthContext = createContext<SignetAuthState | null>(null);

export function SignetAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("idle");
  const [account, setAccount] = useState<Address | null>(null);
  const [groupPublicKey, setGroupPublicKey] = useState<Hex | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [claims, setClaims] = useState<IdTokenClaims | null>(null);
  const [sessionPub, setSessionPub] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const processToken = useCallback(async () => {
    const jwt = sessionStorage.getItem("signet_id_token");
    if (!jwt) return;

    try {
      // Decode JWT claims
      setStatus("session-key");
      const decoded = decodeIdToken(jwt);

      if (decoded.exp * 1000 < Date.now()) {
        sessionStorage.removeItem("signet_id_token");
        throw new Error("ID token has expired. Please sign in again.");
      }

      setIdToken(jwt);
      setClaims(decoded);

      // Generate ephemeral session keypair
      const keypair = await generateSessionKeypair();
      setSessionPub(keypair.publicKeyHex);
      sessionKeyMaterial.keypair = keypair;

      // Generate ZK proof of the JWT (client-side via WASM, ~2-7s)
      setStatus("proving");
      const { proof } = await generateJWTProof(jwt, keypair.publicKeyHex);

      // Authenticate with bootstrap nodes (if configured)
      if (env.bootstrapNodes.length > 0 && env.bootstrapGroup !== "0x") {
        setStatus("registering");
        const modulusBytes = await getJWTModulusBytes(jwt);
        await authenticateWithBootstrap(
          {
            groupId: env.bootstrapGroup,
            nodeUrls: env.bootstrapNodes,
            proxyEndpoint: "/api/node/proxy",
          },
          proof,
          keypair.publicKeyHex,
          decoded,
          modulusBytes
        );

        // Ensure a key shard exists for this identity
        setStatus("keygen");
        const keygenResult = await keygen(
          {
            groupId: env.bootstrapGroup,
            nodeUrls: env.bootstrapNodes,
            proxyEndpoint: "/api/node/proxy",
          },
          keypair,
          decoded
        );
        if (keygenResult.alreadyExisted) {
          console.log("[signet-auth] key already exists:", keygenResult.keyId);
        } else {
          console.log("[signet-auth] key created:", keygenResult.keyId, keygenResult.ethereumAddress);
        }

        // Derive the counterfactual SignetAccount address from the account factory
        const gpk = keygenResult.groupPublicKey as Hex;
        setGroupPublicKey(gpk);
        sessionStorage.setItem("signet_group_public_key", gpk);

        const client = createPublicClient({
          chain: getActiveChain(),
          transport: http(env.rpcUrl),
        });
        const counterfactualAddr = await client.readContract({
          address: signetAccountFactory.address,
          abi: signetAccountFactory.abi,
          functionName: "getAddress",
          args: [env.entryPointAddress, gpk, 0n],
        });
        setAccount(counterfactualAddr as Address);
        console.log("[signet-auth] counterfactual account:", counterfactualAddr);
      } else {
        // No bootstrap nodes — fall back to hash-based address
        const subHash = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(`${decoded.iss}:${decoded.sub}`)
        );
        const hashHex = Array.from(new Uint8Array(subHash))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        setAccount(`0x${hashHex.slice(0, 40)}` as Address);
      }

      setStatus("authenticated");
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.error("[signet-auth] failed at stage:", status, e.message, err);
      setError(e);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    processToken();
  }, [processToken]);

  const signIn = useCallback(async () => {
    try {
      setStatus("oauth");
      setError(null);
      await startGoogleOAuth({ clientId: env.googleClientId });
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      setError(e);
      setStatus("error");
    }
  }, []);

  const signOut = useCallback(() => {
    setAccount(null);
    setGroupPublicKey(null);
    setIdToken(null);
    setClaims(null);
    setSessionPub(null);
    setStatus("idle");
    setError(null);
    sessionStorage.removeItem("signet_id_token");
    sessionStorage.removeItem("signet_group_public_key");
    sessionKeyMaterial.keypair = null;
  }, []);

  return (
    <SignetAuthContext.Provider
      value={{
        status,
        isAuthenticated: status === "authenticated",
        account,
        groupPublicKey,
        idToken,
        claims,
        sessionPub,
        error,
        signIn,
        signOut,
      }}
    >
      {children}
    </SignetAuthContext.Provider>
  );
}

export const sessionKeyMaterial: {
  keypair: SessionKeypair | null;
} = {
  keypair: null,
};
