/**
 * Off-chain node metadata registry.
 *
 * Loaded from a static JSON file. Node operators submit PRs
 * to update their branding. See docs/design.md §3.2.
 */

export interface NodeMetadata {
  name: string;
  description: string;
  website: string;
  logo: string;
  category?: string;
  apiUrl?: string;
}

export type NodeRegistry = Record<string, NodeMetadata>;

let cachedRegistry: NodeRegistry | null = null;

/**
 * Load the node metadata registry.
 * In production this is a static JSON file served from /public.
 */
export async function loadNodeRegistry(): Promise<NodeRegistry> {
  if (cachedRegistry) return cachedRegistry;

  const res = await fetch("/node-registry.json");
  if (!res.ok) {
    console.warn("Failed to load node registry, using empty registry");
    return {};
  }

  cachedRegistry = await res.json();
  return cachedRegistry!;
}

/**
 * Look up metadata for a specific node address.
 * Returns undefined if the node has no registered metadata.
 */
export function getNodeMetadata(
  registry: NodeRegistry,
  address: string
): NodeMetadata | undefined {
  // Normalize to lowercase for case-insensitive lookup
  const normalized = address.toLowerCase();
  for (const [key, value] of Object.entries(registry)) {
    if (key.toLowerCase() === normalized) return value;
  }
  return undefined;
}
