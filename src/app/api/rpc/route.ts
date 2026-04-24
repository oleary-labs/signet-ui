import { NextRequest } from "next/server";

/**
 * Server-side proxy for JSON-RPC calls to the chain.
 *
 * Keeps the RPC API key (e.g. Alchemy) out of the browser.
 * The client sets NEXT_PUBLIC_RPC_URL=/api/rpc and wagmi
 * sends requests here; this route forwards them to RPC_URL.
 */
export async function POST(request: NextRequest) {
  const rpcUrl = process.env.RPC_URL;
  if (!rpcUrl) {
    return Response.json(
      { jsonrpc: "2.0", id: 1, error: { code: -32000, message: "RPC_URL not configured" } },
      { status: 500 },
    );
  }

  try {
    const body = await request.text();
    const res = await fetch(rpcUrl, {
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
      { status: 502 },
    );
  }
}
