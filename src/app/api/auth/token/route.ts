import { NextRequest } from "next/server";

/**
 * Server-side token exchange for Google OAuth PKCE flow.
 *
 * The client sends the authorization code and PKCE verifier;
 * we add the client_secret (server-only) and exchange with Google.
 * This keeps the secret out of the browser.
 */
export async function POST(request: NextRequest) {
  const { code, code_verifier, redirect_uri } = await request.json();

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return Response.json(
      { error: "Google OAuth not configured" },
      { status: 500 }
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    code_verifier,
    grant_type: "authorization_code",
    redirect_uri,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const tokens = await res.json();

  if (tokens.error) {
    return Response.json(
      { error: tokens.error, error_description: tokens.error_description },
      { status: 400 }
    );
  }

  return Response.json({
    id_token: tokens.id_token,
    access_token: tokens.access_token,
  });
}
