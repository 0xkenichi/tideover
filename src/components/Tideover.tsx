"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDay, lagosDay } from "@/lib/dates";
import { learn } from "@/lib/engine";
import { planSpending } from "@/lib/money";
import { shortAddress } from "@/lib/records";
import {
  SAMPLE_COSTS,
  SAMPLE_HINTS,
  SAMPLE_PAYMENTS,
  SAMPLE_STEPS,
  newSampleRunId,
  sampleBalance,
  sampleNow,
} from "@/lib/sample";
import type { MemoryRecord, Payment, Teaching } from "@/lib/types";
import { AccuracyChart } from "./AccuracyChart";
import { ComingIn } from "./ComingIn";
import { Costs } from "./Costs";
import { MemoryTimeline } from "./MemoryTimeline";
import { Payers } from "./Payers";
import { SpendCard } from "./SpendCard";
import { useMemoryStore } from "./useMemoryStore";

interface Wallet {
  address: string;
  name: string | null;
  balanceUsd: number;
  payments: Payment[];
  payerNames: Record<string, string>;
  scanned: number;
  readAt: string;
}

interface Status {
  tatum: { keySet: boolean };
  memory: { configured: boolean; writable: boolean; healthy: boolean; detail: string };
}

interface Rate {
  ngnPerUsd: number;
  at: string;
  source: string;
}

type Mode =
  | { kind: "start" }
  | { kind: "live"; wallet: Wallet }
  | { kind: "sample"; run: string; step: number };

const SAVED_MODE_KEY = "tideover:last";

function saveMode(value: { kind: "live"; query: string } | { kind: "sample"; run: string; step: number } | null) {
  try {
    if (value) localStorage.setItem(SAVED_MODE_KEY, JSON.stringify(value));
    else localStorage.removeItem(SAVED_MODE_KEY);
  } catch {
    // Storage can be unavailable (private windows). Tideover works without it.
  }
}

function loadMode(): { kind: "live"; query: string } | { kind: "sample"; run: string; step: number } | null {
  try {
    const raw = localStorage.getItem(SAVED_MODE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function Tideover() {
  const [mode, setMode] = useState<Mode>({ kind: "start" });
  const [status, setStatus] = useState<Status | null>(null);
  const [rate, setRate] = useState<Rate | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [memoryOn, setMemoryOn] = useState(true);
  const lastTaughtAt = useRef(0);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus(null));
    fetch("/api/rate")
      .then((r) => r.json())
      .then((body) => setRate(body.rate ?? null))
      .catch(() => setRate(null));
  }, []);

  const openWallet = useCallback(async (input: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/wallet?q=${encodeURIComponent(input)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Something went wrong (${res.status})`);
      setMode({ kind: "live", wallet: { ...body, readAt: new Date().toISOString() } });
      saveMode({ kind: "live", query: input });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const openSample = useCallback((run: string, step: number) => {
    setLoadError(null);
    setMode({ kind: "sample", run, step });
    saveMode({ kind: "sample", run, step });
  }, []);

  // Pick up where the visitor left off.
  useEffect(() => {
    const saved = loadMode();
    if (saved?.kind === "sample") openSample(saved.run, Math.min(saved.step, SAMPLE_STEPS.length - 1));
    else if (saved?.kind === "live") {
      setQuery(saved.query);
      void openWallet(saved.query);
    }
  }, [openSample, openWallet]);

  const namespace =
    mode.kind === "live" ? `tideover:${mode.wallet.address}` : mode.kind === "sample" ? `tideover:${mode.run}` : null;
  const writable = Boolean(status?.memory.writable);
  const store = useMemoryStore(namespace, writable);

  const now = useMemo(
    () => (mode.kind === "sample" ? sampleNow(mode.step) : mode.kind === "live" ? mode.wallet.readAt : new Date().toISOString()),
    [mode],
  );
  const today = lagosDay(now);
  const payments = mode.kind === "live" ? mode.wallet.payments : mode.kind === "sample" ? SAMPLE_PAYMENTS : [];
  const remembered = useMemo(() => store.entries.map((e) => e.record), [store.entries]);

  const model = useMemo(
    () => learn({ payments, remembered, now, useMemory: memoryOn }),
    [payments, remembered, now, memoryOn],
  );

  // Write whatever Tideover just learned, once the existing memories are loaded.
  const { add } = store;
  useEffect(() => {
    if (mode.kind !== "start" && store.ready && memoryOn && model.newRecords.length > 0) add(model.newRecords);
  }, [mode.kind, store.ready, memoryOn, model.newRecords, add]);

  const teach = useCallback(
    (teachings: Teaching[]) => {
      // Teachings must stay in order, so each gets a strictly later timestamp.
      const records: MemoryRecord[] = teachings.map((teaching) => {
        const at = Math.max(Date.parse(now), lastTaughtAt.current + 1);
        lastTaughtAt.current = at;
        const iso = new Date(at).toISOString();
        const key = "payer" in teaching ? teaching.payer.slice(0, 12) : teaching.id;
        return { type: "taught", id: `t:${teaching.kind}:${key}:${iso}`, at: iso, teaching };
      });
      add(records);
    },
    [add, now],
  );

  const suinsNames = mode.kind === "live" ? mode.wallet.payerNames : {};
  const names = model.teachings.names;
  const nameOf = useCallback(
    (payer: string) => names.get(payer) ?? suinsNames[payer] ?? shortAddress(payer),
    [names, suinsNames],
  );

  const balanceUsd = mode.kind === "live" ? mode.wallet.balanceUsd : mode.kind === "sample" ? sampleBalance(now) : 0;
  const plan = planSpending({
    today,
    balanceUsd,
    ngnPerUsd: rate?.ngnPerUsd ?? 1,
    // Naira costs can't be set aside without a rate to convert them.
    costs: rate ? model.teachings.costs : [],
    payers: model.payers,
  });

  if (mode.kind === "start") {
    return (
      <StartScreen
        query={query}
        setQuery={setQuery}
        loading={loading}
        error={loadError}
        onWallet={openWallet}
        onSample={() => openSample(newSampleRunId(), 0)}
        status={status}
      />
    );
  }

  const busy = !store.ready;
  return (
    <main className="shell">
      <TopBar status={status} rate={rate} onHome={() => { saveMode(null); setMode({ kind: "start" }); }} />

      {mode.kind === "sample" ? (
        <div className="banner sample-banner">
          <div>
            <strong>Sample: Ada, a product designer in Lagos.</strong> Her payments are simulated.{" "}
            {writable
              ? "The memories Tideover writes about them are real Walrus mainnet writes."
              : "Walrus Memory isn't set up here, so what Tideover learns lasts only until you reload."}
          </div>
          <div className="stepper">
            <span>
              Month {mode.step + 1} of {SAMPLE_STEPS.length} · <strong>{formatDay(today)} 2026</strong>
            </span>
            <button
              type="button"
              className="btn"
              disabled={mode.step >= SAMPLE_STEPS.length - 1 || busy}
              onClick={() => openSample(mode.run, mode.step + 1)}
            >
              Next month →
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => openSample(newSampleRunId(), 0)}>
              Start over
            </button>
          </div>
        </div>
      ) : (
        <div className="banner">
          <div>
            Watching <strong>{mode.wallet.name ?? shortAddress(mode.wallet.address)}</strong> on Sui mainnet, read
            through Tatum ({mode.wallet.scanned} recent transactions, {mode.wallet.payments.length} stablecoin
            payments).
          </div>
          <button type="button" className="btn btn-ghost" disabled={loading} onClick={() => openWallet(mode.wallet.address)}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      )}

      <div className="memory-switch">
        <label className="switch">
          <input type="checkbox" checked={memoryOn} onChange={(e) => setMemoryOn(e.target.checked)} />
          <span className="switch-track" aria-hidden="true" />
          <span>
            Walrus Memory <strong>{memoryOn ? "on" : "off"}</strong>
          </span>
        </label>
        <span className="muted">
          {memoryOn
            ? "Turn it off to see what Tideover would tell you if it forgot everything."
            : "Without memory: no names, no promises, no costs, no track record."}
        </span>
      </div>

      {busy ? (
        <p className="loading">Recalling what Tideover remembers from Walrus Memory…</p>
      ) : (
        <div className={`grid${memoryOn ? "" : " forgetful"}`}>
          <div className="col">
            <SpendCard
              plan={plan}
              ngnPerUsd={rate?.ngnPerUsd ?? null}
              nameOf={nameOf}
              costsSkipped={!rate && model.teachings.costs.length > 0}
            />
            <ComingIn payers={model.payers} today={today} nameOf={nameOf} />
            <AccuracyChart graded={model.graded} nameOf={nameOf} />
          </div>
          <div className="col">
            <Payers
              payers={model.payers}
              nameOf={nameOf}
              suinsNames={suinsNames}
              hints={mode.kind === "sample" ? SAMPLE_HINTS : undefined}
              teach={teach}
              disabled={!memoryOn}
            />
            <Costs
              costs={model.teachings.costs}
              suggestions={mode.kind === "sample" ? SAMPLE_COSTS : undefined}
              teach={teach}
              disabled={!memoryOn}
            />
            <MemoryTimeline
              entries={store.entries}
              nameOf={nameOf}
              saving={store.saving}
              error={store.error}
              onRetry={store.retry}
              memoryOn={memoryOn}
            />
          </div>
        </div>
      )}
      <Footer />
    </main>
  );
}

function TopBar({ status, rate, onHome }: { status: Status | null; rate: Rate | null; onHome?: () => void }) {
  const memory = status?.memory;
  return (
    <header className="topbar">
      <button type="button" className="brand" onClick={onHome} disabled={!onHome}>
        <Logo /> Tideover
      </button>
      <div className="services">
        <span className={`dot ${status?.tatum.keySet ? "ok" : "warn"}`}>
          Tatum {status?.tatum.keySet ? "" : "(no key: slow)"}
        </span>
        <span className={`dot ${memory?.writable ? "ok" : memory?.configured ? "warn" : "off"}`}>
          Walrus Memory{" "}
          {memory?.writable ? "mainnet" : memory?.configured ? "(read-only)" : "(not set up: nothing is saved)"}
        </span>
        {rate ? (
          <span className="dot ok" title={`${rate.source}, ${new Date(rate.at).toUTCString()}`}>
            $1 = ₦{Math.round(rate.ngnPerUsd).toLocaleString("en-NG")}
          </span>
        ) : null}
      </div>
    </header>
  );
}

function StartScreen(props: {
  query: string;
  setQuery: (q: string) => void;
  loading: boolean;
  error: string | null;
  onWallet: (q: string) => void;
  onSample: () => void;
  status: Status | null;
}) {
  return (
    <main className="shell start">
      <TopBar status={props.status} rate={null} />
      <section className="hero">
        <p className="eyebrow">For people paid in stablecoins, at irregular times</p>
        <h1>Know what you can spend, even when pay comes late.</h1>
        <p className="hero-sub">
          Tideover watches your Sui wallet through Tatum, learns when each payer <em>really</em> pays you, and keeps
          what it learns in Walrus Memory. Every month its forecasts get sharper, and they follow you to any device.
        </p>
        <form
          className="watch"
          onSubmit={(e) => {
            e.preventDefault();
            if (props.query.trim()) props.onWallet(props.query.trim());
          }}
        >
          <input
            value={props.query}
            onChange={(e) => props.setQuery(e.target.value)}
            placeholder="Your Sui address or name.sui"
            aria-label="Sui address or SuiNS name"
            spellCheck={false}
            autoComplete="off"
          />
          <button type="submit" className="btn btn-primary" disabled={props.loading || !props.query.trim()}>
            {props.loading ? "Reading through Tatum…" : "Watch this wallet"}
          </button>
        </form>
        {props.error ? <p className="error-note">{props.error}</p> : null}
        <p className="or">
          Or{" "}
          <button type="button" className="link strong" onClick={props.onSample}>
            watch Tideover learn five months of a Lagos designer’s pay →
          </button>
        </p>
        <ul className="how">
          <li>
            <strong>Reads, never moves, money.</strong> Tideover only reads public chain data. No wallet connection,
            no keys.
          </li>
          <li>
            <strong>Learns from you and from the chain.</strong> Name your payers and their promised pay day; it
            works out how late they really are.
          </li>
          <li>
            <strong>Grades itself.</strong> Each forecast is remembered, then checked when the money lands.
          </li>
        </ul>
      </section>
      <Footer />
    </main>
  );
}

function Footer() {
  return (
    <footer className="footer">
      Built for the Tatum × Walrus “Total Recall” hackathon. Chain data from Tatum’s Sui gateway and Data API;
      memory on Walrus mainnet. Not financial advice.
    </footer>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" className="logo-ring" />
      <path d="M4 14c2.5-2.5 5.5-2.5 8 0s5.5 2.5 8 0" className="logo-wave" />
      <path d="M6 10c2-1.8 4-1.8 6 0s4 1.8 6 0" className="logo-wave logo-wave-2" />
    </svg>
  );
}
