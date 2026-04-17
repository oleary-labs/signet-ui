import { NextRequest } from "next/server";

/**
 * Server-side proxy for Signet node API calls.
 *
 * The browser can't call nodes directly due to CORS.
 * This route forwards requests server-side.
 *
 * Headers:
 *   x-node-url: base URL of the node (e.g. http://localhost:8080)
 *   x-node-path: API path (e.g. /v1/auth, /v1/keygen, /v1/sign)
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const nodeUrl = request.headers.get("x-node-url");
  const nodePath = request.headers.get("x-node-path") ?? "/v1/auth";

  if (!nodeUrl) {
    return Response.json({ error: "Missing x-node-url header" }, { status: 400 });
  }

  try {
    const target = `${nodeUrl}${nodePath}`;
    const res = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.text();

    return new Response(data, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 502 });
  }
}
