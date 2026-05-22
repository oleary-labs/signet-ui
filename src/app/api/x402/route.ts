import { NextRequest } from "next/server";

/**
 * Server-side proxy for x402 API calls.
 *
 * The browser can't call external x402 APIs directly due to CORS.
 * This route forwards requests and preserves the payment headers.
 *
 * Headers:
 *   x-target-url: the full URL to proxy to
 *   x-target-method: HTTP method (default: POST)
 *   Payment-Signature: (optional) x402 payment payload, forwarded as-is
 */
export async function POST(request: NextRequest) {
  const targetUrl = request.headers.get("x-target-url");
  const targetMethod = request.headers.get("x-target-method") ?? "POST";

  if (!targetUrl) {
    return Response.json({ error: "Missing x-target-url header" }, { status: 400 });
  }

  try {
    const body = await request.text();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Forward payment header if present
    const paymentSig = request.headers.get("Payment-Signature");
    if (paymentSig) {
      headers["Payment-Signature"] = paymentSig;
    }

    const res = await fetch(targetUrl, {
      method: targetMethod,
      headers,
      body: targetMethod !== "GET" ? body : undefined,
    });

    // Build response, preserving x402 headers
    const responseHeaders: Record<string, string> = {
      "Content-Type": res.headers.get("content-type") ?? "application/json",
    };

    const paymentRequired = res.headers.get("payment-required");
    if (paymentRequired) {
      responseHeaders["payment-required"] = paymentRequired;
    }

    const paymentResponse = res.headers.get("payment-response");
    if (paymentResponse) {
      responseHeaders["payment-response"] = paymentResponse;
    }

    const data = await res.text();
    return new Response(data, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 502 });
  }
}
