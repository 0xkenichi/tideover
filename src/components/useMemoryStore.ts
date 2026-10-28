"use client";

// Keeps the browser's copy of what Tideover remembers in sync with Walrus
// Memory: recall everything for a namespace, then write new records in small
// batches and track each one until the relayer confirms its blob.

import { useCallback, useEffect, useRef, useState } from "react";
import type { MemoryRecord } from "@/lib/types";

export type EntryState = "stored" | "saving" | "failed" | "local";

export interface Entry {
  record: MemoryRecord;
  blobId: string | null;
  state: EntryState;
  createdAt?: string;
}

interface StoredMemoryJson {
  record: MemoryRecord;
  blobId: string | null;
  createdAt?: string;
}

const FLUSH_DELAY_MS = 600;

export function useMemoryStore(namespace: string | null, writable: boolean) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(0);
  const queue = useRef<MemoryRecord[]>([]);
  const known = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const namespaceRef = useRef(namespace);

  const update = useCallback((ids: Set<string>, change: (e: Entry) => Entry) => {
    setEntries((list) => list.map((e) => (ids.has(e.record.id) ? change(e) : e)));
  }, []);

  const flush = useCallback(async () => {
    const ns = namespaceRef.current;
    const batch = queue.current.splice(0, queue.current.length);
    if (!ns || batch.length === 0) return;
    setSaving((n) => n + batch.length);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ns, records: batch }),
      });
      const body = await res.json();
      if (namespaceRef.current !== ns) return;
      if (!res.ok) throw new Error(body?.error ?? `Saving failed (${res.status})`);
      const saved = new Map<string, StoredMemoryJson>(
        (body.saved as StoredMemoryJson[]).map((s) => [s.record.id, s]),
      );
      const failed = new Set<string>((body.failed as { id: string }[]).map((f) => f.id));
      update(new Set(saved.keys()), (e) => ({
        ...e,
        state: "stored",
        blobId: saved.get(e.record.id)?.blobId ?? null,
        createdAt: saved.get(e.record.id)?.createdAt,
      }));
      update(failed, (e) => ({ ...e, state: "failed" }));
      if (failed.size > 0) setError(`${failed.size} memories couldn't be saved to Walrus.`);
    } catch (err) {
      if (namespaceRef.current !== ns) return;
      update(new Set(batch.map((r) => r.id)), (e) => ({ ...e, state: "failed" }));
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving((n) => Math.max(0, n - batch.length));
    }
  }, [update]);

  // Recall everything for this namespace whenever it changes.
  useEffect(() => {
    namespaceRef.current = namespace;
    queue.current = [];
    known.current = new Set();
    setEntries([]);
    setError(null);
    setReady(false);
    if (!namespace) return;

    let cancelled = false;
    fetch(`/api/memory?ns=${encodeURIComponent(namespace)}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error ?? `Recall failed (${res.status})`);
        return body.memories as StoredMemoryJson[];
      })
      .then((memories) => {
        if (cancelled) return;
        for (const m of memories) known.current.add(m.record.id);
        setEntries(memories.map((m) => ({ ...m, state: "stored" })));
        setReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [namespace]);

  /** Add records. They're kept locally at once and written to Walrus shortly after. */
  const add = useCallback(
    (records: MemoryRecord[]) => {
      const fresh = records.filter((r) => !known.current.has(r.id));
      if (fresh.length === 0) return;
      for (const r of fresh) known.current.add(r.id);
      const state: EntryState = writable ? "saving" : "local";
      setEntries((list) => [...list, ...fresh.map((record) => ({ record, blobId: null, state }))]);
      if (!writable) return;
      queue.current.push(...fresh);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, FLUSH_DELAY_MS);
    },
    [flush, writable],
  );

  /** Try failed writes again. */
  const retry = useCallback(() => {
    const failed = entries.filter((e) => e.state === "failed");
    if (failed.length === 0) return;
    setError(null);
    queue.current.push(...failed.map((e) => e.record));
    update(new Set(failed.map((e) => e.record.id)), (e) => ({ ...e, state: "saving" }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, FLUSH_DELAY_MS);
  }, [entries, flush, update]);

  return { entries, ready, error, saving, add, retry };
}
