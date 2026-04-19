import { NextRequest } from "next/server";
import { env } from "@/config/env";

/**
 * Server-side proxy for bundler calls.
 *
 * The browser can't call the bundler directly due to CORS.
 * This route forwards requests server-side.
 *
 * By default, forwards to the bundler root (JSON-RPC).
 * Set the x-bundler-path header to forward to a sub-path
 * (e.g. /v1/prove for server-side ZK proving).
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const path = request.headers.get("x-bundler-path") ?? "";
  const target = `${env.bundlerUrl}${path}`;

  try {
    const res = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const data = await res.text();

    return new Response(data, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json(
      { jsonrpc: "2.0", id: 1, error: { code: -32000, message } },
      { status: 502 }
    );
  }
}
