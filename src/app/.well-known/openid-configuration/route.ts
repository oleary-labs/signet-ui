import { NextRequest } from "next/server";

/**
 * OIDC Discovery endpoint.
 *
 * The server prover fetches {iss}/.well-known/openid-configuration to find
 * the JWKS URI. Better Auth serves JWKS at /api/auth/jwks but doesn't
 * expose a standard OIDC discovery document. This route bridges the gap.
 */
export function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;

  return Response.json({
    issuer: origin,
    jwks_uri: `${origin}/api/auth/jwks`,
    authorization_endpoint: `${origin}/api/auth/sign-in`,
    token_endpoint: `${origin}/api/auth/token`,
    userinfo_endpoint: `${origin}/api/auth/session`,
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
  });
}
