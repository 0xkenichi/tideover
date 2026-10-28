"use client";

import { useState } from "react";
import { formatShortDay, lagosDay } from "@/lib/dates";
import { describe } from "@/lib/records";
import type { Entry } from "./useMemoryStore";

interface Props {
  entries: Entry[];
  nameOf: (payer: string) => string;
  saving: number;
  error: string | null;
  onRetry: () => void;
  memoryOn: boolean;
}

const LABELS = {
  taught: "You taught",
  forecast: "Forecast",
  graded: "Checked",
  lesson: "Learned",
} as const;

const SHOWN = 10;

function walrusLink(blobId: string): string {
  return `https://walruscan.com/mainnet/blob/${blobId}`;
}

export function MemoryTimeline({ entries, nameOf, saving, error, onRetry, memoryOn }: Props) {
  const [showAll, setShowAll] = useState(false);
  const sorted = [...entries].sort(
    (a, b) => b.record.at.localeCompare(a.record.at) || (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
  );
  const onWalrus = entries.filter((e) => e.state === "stored").length;
  const visible = showAll ? sorted : sorted.slice(0, SHOWN);

  return (
    <section className="card memory" aria-labelledby="memory-title">
      <div className="card-head">
        <h2 id="memory-title">What Tideover remembers</h2>
        <span className="muted">
          {entries.length} memories · {onWalrus} on Walrus mainnet
          {saving > 0 ? ` · saving ${saving}…` : ""}
        </span>
      </div>
      {!memoryOn ? (
        <p className="empty">Memory is switched off, so Tideover is acting as if none of this existed.</p>
      ) : null}
      {error ? (
        <p className="error-note">
          {error}{" "}
          <button type="button" className="link" onClick={onRetry}>
            Try again
          </button>
        </p>
      ) : null}
      {entries.length === 0 ? (
        <p className="empty">Nothing yet. Teach Tideover something, or wait for its first forecast.</p>
      ) : (
        <ol className={`timeline${memoryOn ? "" : " is-off"}`}>
          {visible.map((e) => (
            <li key={e.record.id} className={`t-${e.record.type}`}>
              <span className={`tag tag-${e.record.type}`}>{LABELS[e.record.type]}</span>
              <p className="t-text">{describe(e.record, nameOf)}</p>
              <p className="t-meta">
                <span>{formatShortDay(lagosDay(e.record.at))}</span>
                {e.state === "stored" && e.blobId ? (
                  <a href={walrusLink(e.blobId)} target="_blank" rel="noreferrer" className="mono">
                    Walrus blob {e.blobId.slice(0, 6)}…{e.blobId.slice(-4)}
                  </a>
                ) : e.state === "saving" ? (
                  <span className="saving">Saving to Walrus…</span>
                ) : e.state === "failed" ? (
                  <span className="late">Not saved</span>
                ) : (
                  <span className="muted">Not saved (Walrus Memory isn’t set up)</span>
                )}
              </p>
            </li>
          ))}
        </ol>
      )}
      {sorted.length > SHOWN ? (
        <button type="button" className="link" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show fewer" : `Show all ${sorted.length}`}
        </button>
      ) : null}
    </section>
  );
}
