/**
 * Signet SDK
 *
 * Framework-agnostic library for Signet protocol interactions:
 * - OAuth authentication (Google PKCE)
 * - Client-side ZK proof generation for JWT claims (noir + bb.js WASM)
 * - Bootstrap group session registration
 * - Session key management (secp256k1)
 */

export * from "./types";
export * from "./oauth";
export * from "./session";
export * from "./jwt";
export * from "./jwks";
export * from "./witness";
export * from "./proof";
export * from "./bootstrap";
export * from "./request";
export * from "./keygen";
export * from "./userop";
export * from "./admin";
export * from "./server-prover";
export { generateInputs, splitBigIntToChunks } from "./generate-inputs";
