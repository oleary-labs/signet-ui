import Link from "next/link";
import { NodeGrid } from "@/components/marketplace/NodeGrid";

export default function MarketplacePage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      {/* Hero */}
      <div className="mb-16 max-w-3xl">
        <h1 className="text-4xl font-bold tracking-tight text-primary-900 sm:text-5xl">
          Share the trust. Keep the control.
        </h1>
        <p className="mt-4 text-lg text-neutral-500">
          Add social login key management to your application. Browse trusted
          signing providers, assemble your group, and deploy in minutes.
        </p>
        <div className="mt-8 flex gap-4">
          <Link
            href="/groups/new"
            className="rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 transition-colors"
          >
            Create a Trust Group
          </Link>
          <a
            href="#providers"
            className="rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-semibold text-primary-700 hover:border-accent-400 hover:text-accent-600 transition-colors"
          >
            Browse Providers
          </a>
        </div>
      </div>

      {/* Provider list */}
      <section id="providers">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-primary-900">
            Trust Providers
          </h2>
          <span className="text-sm text-neutral-400">
            {/* Count will fill in from client */}
          </span>
        </div>
        <NodeGrid />
      </section>
    </div>
  );
}
