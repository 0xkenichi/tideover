// Tideover's long-term memory lives in Walrus Memory on Sui mainnet. Each
// wallet gets its own namespace; every record is one encrypted memory stored
// as a Walrus blob, written through the Walrus Memory relayer.
// Server-side only: the delegate key never reaches the browser.

import { MemWal } from "@mysten-incubation/memwal";
import { decode, encode } from "@/lib/records";
import type { MemoryRecord, StoredMemory } from "@/lib/types";

const RELAYER_URL = process.env.MEMWAL_RELAYER_URL ?? "https://relayer.memory.walrus.xyz";
/** The relayer accepts at most 20 memories per bulk write. */
const BULK_LIMIT = 20;
const RECALL_LIMIT = 100;
/** Walrus uploads can take a while; stay inside the route's 120 s budget. */
const WRITE_TIMEOUT_MS = 100_000;

/** Namespaces are "tideover:<sui address>" or "tideover:sample-<run id>". */
const NAMESPACE = /^tideover:(0x[0-9a-f]{64}|sample-[a-z0-9]{6,16})$/;

export function isValidNamespace(namespace: string): boolean {
  return NAMESPACE.test(namespace);
}

export function memoryConfigured(): boolean {
  return Boolean(process.env.MEMWAL_KEY && process.env.MEMWAL_ACCOUNT_ID);
}

export function writesAllowed(): boolean {
  return memoryConfigured() && process.env.TIDEOVER_READ_ONLY !== "true";
}

let client: MemWal | null = null;

function memwal(): MemWal {
  if (!memoryConfigured()) throw new Error("Walrus Memory is not configured");
  client ??= MemWal.create({
    key: process.env.MEMWAL_KEY!,
    accountId: process.env.MEMWAL_ACCOUNT_ID!,
    serverUrl: RELAYER_URL,
    namespace: "tideover",
    recallTimeoutMs: 60_000,
  });
  return client;
}

// Every record's text starts with "Tideover memory." and names its type, so a
// few broad queries reach every record in a namespace.
const RECALL_QUERIES = [
  "Tideover memory: you said, you named, you pay each month",
  "Tideover memory: expects a payment, forecast",
  "Tideover memory: paid on, expected, off by days",
  "Tideover memory: learned, pays about, usually pays",
];

/** Everything Tideover remembers in a namespace, oldest first, one entry per record. */
export async function recallAll(namespace: string): Promise<StoredMemory[]> {
  const results = await Promise.all(
    RECALL_QUERIES.map((query) =>
      memwal().recall({ query, limit: RECALL_LIMIT, namespace }),
    ),
  );
  const byId = new Map<string, StoredMemory>();
  for (const { results: hits } of results) {
    for (const hit of hits) {
      const record = decode(hit.text);
      if (!record) continue;
      const existing = byId.get(record.id);
      const createdAt = hit.created_at ? String(hit.created_at) : undefined;
      if (!existing || (createdAt && existing.createdAt && createdAt < existing.createdAt)) {
        byId.set(record.id, { record, blobId: hit.blob_id, createdAt });
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.record.at.localeCompare(b.record.at));
}

export interface SaveResult {
  saved: StoredMemory[];
  failed: { id: string; error: string }[];
}

/** Write records to Walrus Memory and wait until each is stored as a blob. */
export async function saveAll(namespace: string, records: MemoryRecord[]): Promise<SaveResult> {
  const saved: StoredMemory[] = [];
  const failed: SaveResult["failed"] = [];
  for (let i = 0; i < records.length; i += BULK_LIMIT) {
    const chunk = records.slice(i, i + BULK_LIMIT);
    const { results } = await memwal().rememberBulkAndWait(
      chunk.map((record) => ({ text: encode(record), namespace })),
      { timeoutMs: WRITE_TIMEOUT_MS },
    );
    results.forEach((result, j) => {
      const record = chunk[j];
      if (result.status === "done" && result.blob_id) {
        saved.push({ record, blobId: result.blob_id, createdAt: new Date().toISOString() });
      } else {
        failed.push({ id: record.id, error: result.error ?? result.status });
      }
    });
  }
  return { saved, failed };
}

export async function memoryHealth(): Promise<{ ok: boolean; detail: string }> {
  if (!memoryConfigured()) return { ok: false, detail: "MEMWAL_KEY and MEMWAL_ACCOUNT_ID are not set" };
  try {
    const health = await memwal().health();
    const ok = /^(ok|healthy)$/i.test(health.status) && health.write_ready !== false;
    return { ok, detail: `${health.status}${health.write_ready === false ? " (writes not ready)" : ""}` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}
