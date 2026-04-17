/**
 * Client for the Signet node HTTP API.
 *
 * Each node exposes a REST API for health checks, key listings,
 * session auth, keygen, and threshold signing.
 */

export interface NodeHealth {
  status: "ok" | "error";
}

export interface NodeInfo {
  peer_id: string;
  ethereum_address: string;
  addrs: string[];
  node_type: "public" | "permissioned";
}

export interface KeyInfo {
  group_id: string;
  key_id: string;
  ethereum_address: string;
  threshold: number;
  parties: string[];
}

export interface AuthRequest {
  group_id: string;
  session_pub: string;
  proof: string;
  proof_type: "zk" | "auth_key";
}

export interface SignRequest {
  group_id: string;
  key_id: string;
  message_hash: string;
  session_pub: string;
  request_sig: string;
  nonce: string;
  timestamp: number;
}

export interface KeygenRequest {
  group_id: string;
  session_pub: string;
  request_sig: string;
  nonce: string;
  timestamp: number;
}

export class NodeApiClient {
  constructor(private baseUrl: string) {}

  async health(): Promise<NodeHealth> {
    const res = await fetch(`${this.baseUrl}/v1/health`);
    return res.json();
  }

  async info(): Promise<NodeInfo> {
    const res = await fetch(`${this.baseUrl}/v1/info`);
    return res.json();
  }

  async keys(groupId?: string): Promise<KeyInfo[]> {
    const params = groupId ? `?group_id=${groupId}` : "";
    const res = await fetch(`${this.baseUrl}/v1/keys${params}`);
    return res.json();
  }

  async auth(request: AuthRequest): Promise<{ ok: boolean }> {
    const res = await fetch(`${this.baseUrl}/v1/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
    return res.json();
  }

  async keygen(request: KeygenRequest): Promise<{ key_id: string; ethereum_address: string }> {
    const res = await fetch(`${this.baseUrl}/v1/keygen`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw new Error(`Keygen failed: ${res.status}`);
    return res.json();
  }

  async sign(request: SignRequest): Promise<{ signature: string }> {
    const res = await fetch(`${this.baseUrl}/v1/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!res.ok) throw new Error(`Sign failed: ${res.status}`);
    return res.json();
  }
}
