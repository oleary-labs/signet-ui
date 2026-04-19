import { NextRequest } from "next/server";

/**
 * Server-side proxy for Signet node API calls.
 *
 * The browser can't call nodes directly due to CORS.
 * This route forwards requests server-side.
 *
 * Headers:
 *   x-node-url: base URL of the node (e.g. http://localhost:8080)
 *   x-node-path: API path (e.g. /v1/auth, /v1/keygen, /v1/sign, /v1/health)
 *   x-node-method: HTTP method to use (default: POST)
 */
export async function POST(request: NextRequest) {
  const nodeUrl = request.headers.get("x-node-url");
  const nodePath = request.headers.get("x-node-path") ?? "/v1/auth";
  const nodeMethod = request.headers.get("x-node-method") ?? "POST";

  if (!nodeUrl) {
    return Response.json({ error: "Missing x-node-url header" }, { status: 400 });
  }

  try {
    const target = `${nodeUrl}${nodePath}`;
    const fetchOpts: RequestInit = { method: nodeMethod };
    if (nodeMethod === "POST") {
      const body = await request.json();
      fetchOpts.headers = { "Content-Type": "application/json" };
      fetchOpts.body = JSON.stringify(body);
    }
    const res = await fetch(target, fetchOpts);

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
