"use client";

import { useState } from "react";
import { ordinal } from "@/lib/dates";
import { dayCount, dollars } from "@/lib/format";
import { shortAddress } from "@/lib/records";
import type { PayerModel, Teaching } from "@/lib/types";

export interface Hint {
  name: string;
  promiseDay?: number;
  notIncome?: boolean;
  note: string;
}

interface Props {
  payers: PayerModel[];
  nameOf: (payer: string) => string;
  suinsNames: Record<string, string>;
  hints?: Record<string, Hint>;
  teach: (teachings: Teaching[]) => void;
  disabled: boolean;
}

function learnedLine(p: PayerModel): string {
  if (p.ignored) return "Not counted as income.";
  if (p.forecast?.basis === "promise") {
    const late = p.typicalLateness ?? 0;
    return `Promises the ${ordinal(p.promiseDay!)}, usually pays ${late === 0 ? "on the day" : `${dayCount(late)} ${late > 0 ? "late" : "early"}`}.`;
  }
  if (p.forecast) return `Pays about every ${dayCount(p.cadenceDays ?? 0)}.`;
  return p.paydays.length >= 3
    ? "No steady rhythm yet. Teach a promised day to get a forecast."
    : `Still learning: ${p.paydays.length} payday${p.paydays.length === 1 ? "" : "s"} seen.`;
}

function hintPending(p: PayerModel, hint: Hint): boolean {
  return (
    p.name !== hint.name ||
    (hint.promiseDay !== undefined && p.promiseDay !== hint.promiseDay) ||
    (hint.notIncome === true && !p.ignored)
  );
}

function hintTeachings(p: PayerModel, hint: Hint): Teaching[] {
  const out: Teaching[] = [];
  if (p.name !== hint.name) out.push({ kind: "name", payer: p.address, name: hint.name });
  if (hint.promiseDay !== undefined && p.promiseDay !== hint.promiseDay) {
    out.push({ kind: "promise", payer: p.address, day: hint.promiseDay });
  }
  if (hint.notIncome && !p.ignored) out.push({ kind: "not-income", payer: p.address, value: true });
  return out;
}

function PayerRow({ p, nameOf, suinsName, hint, teach, disabled }: {
  p: PayerModel;
  nameOf: (payer: string) => string;
  suinsName?: string;
  hint?: Hint;
  teach: (teachings: Teaching[]) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;

  return (
    <li className={`payer status-${p.status}`}>
      <div className="payer-head">
        {editing ? (
          <form
            className="rename"
            onSubmit={(e) => {
              e.preventDefault();
              teach([{ kind: "name", payer: p.address, name: draft.trim() }]);
              setDraft(null);
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Who is this?"
              aria-label="Payer name"
              maxLength={40}
            />
            <button type="submit" className="btn btn-small">
              Save
            </button>
            <button type="button" className="btn btn-small btn-ghost" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </form>
        ) : (
          <>
            <span className="payer-name">{nameOf(p.address)}</span>
            <button
              type="button"
              className="link"
              disabled={disabled}
              onClick={() => setDraft(p.name ?? "")}
            >
              {p.name ? "Rename" : "Name"}
            </button>
          </>
        )}
        <span className={`chip chip-${p.status}`}>
          {p.status === "regular" ? "Regular" : p.status === "ignored" ? "Not income" : "Learning"}
        </span>
      </div>
      <p className="payer-meta">
        <span className="mono">{shortAddress(p.address)}</span>
        {suinsName ? <> · {suinsName}</> : null} · {p.paydays.length} payday{p.paydays.length === 1 ? "" : "s"} ·{" "}
        {dollars(Math.round(p.total * 100) / 100)} received
      </p>
      <p className="payer-learned">{learnedLine(p)}</p>
      <div className="payer-controls">
        <label>
          Promised pay day{" "}
          <select
            value={p.promiseDay ?? ""}
            disabled={disabled || p.ignored}
            onChange={(e) =>
              teach([
                { kind: "promise", payer: p.address, day: e.target.value === "" ? null : Number(e.target.value) },
              ])
            }
          >
            <option value="">None</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {ordinal(d)} of the month
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={p.ignored}
            disabled={disabled}
            onChange={(e) => teach([{ kind: "not-income", payer: p.address, value: e.target.checked }])}
          />
          Not regular income
        </label>
      </div>
      {hint && hintPending(p, hint) ? (
        <div className="hint">
          <span>
            <strong>Ada’s note:</strong> {hint.note}
          </span>
          <button
            type="button"
            className="btn btn-small"
            disabled={disabled}
            onClick={() => teach(hintTeachings(p, hint))}
          >
            Teach Tideover
          </button>
        </div>
      ) : null}
    </li>
  );
}

export function Payers({ payers, nameOf, suinsNames, hints, teach, disabled }: Props) {
  return (
    <section className="card" aria-labelledby="payers-title">
      <h2 id="payers-title">Who pays you</h2>
      <p className="lede">
        Tideover groups incoming USDC and USDT by sender. Tell it who they are and what they promise. Everything you
        teach is kept in Walrus Memory.
      </p>
      {payers.length === 0 ? (
        <p className="empty">No stablecoin payments found in this wallet’s recent history.</p>
      ) : (
        <ul className="payers">
          {payers.map((p) => (
            <PayerRow
              key={p.address}
              p={p}
              nameOf={nameOf}
              suinsName={suinsNames[p.address]}
              hint={hints?.[p.address]}
              teach={teach}
              disabled={disabled}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
