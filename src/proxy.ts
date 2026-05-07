import { clerkMiddleware } from "@clerk/nextjs/server";

// Clerk session management for /demo/x402/* routes.
// All other routes pass through unchanged.
export default clerkMiddleware();

export const config = {
  matcher: ["/demo/x402(.*)", "/clerk-sync-keyless(.*)"],
};
