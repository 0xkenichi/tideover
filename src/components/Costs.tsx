"use client";

import { useState } from "react";
import { ordinal } from "@/lib/dates";
import { naira } from "@/lib/format";
import type { Cost, Teaching } from "@/lib/types";

interface Props {
  costs: Cost[];
  suggestions?: Omit<Cost, "id">[];
  teach: (teachings: Teaching[]) => void;
  disabled: boolean;
}

function newCostId(): string {
  return `c-${Math.random().toString(36).slice(2, 10)}`;
}

export function Costs({ costs, suggestions = [], teach, disabled }: Props) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [day, setDay] = useState("1");
  const amountNgn = Number(amount.replace(/[^\d.]/g, ""));
  const canAdd = name.trim().length > 0 && amountNgn > 0;
  const unused = suggestions.filter((s) => !costs.some((c) => c.name === s.name));

  const add = (cost: Omit<Cost, "id">) => teach([{ kind: "cost", id: newCostId(), ...cost }]);

  return (
    <section className="card" aria-labelledby="costs-title">
      <h2 id="costs-title">Monthly costs</h2>
      <p className="lede">What has to be paid every month, in naira. Tideover sets it aside before telling you what’s free.</p>
      {costs.length > 0 ? (
        <ul className="costs">
          {[...costs]
            .sort((a, b) => a.day - b.day)
            .map((c) => (
              <li key={c.id}>
                <span>{c.name}</span>
                <span className="muted">on the {ordinal(c.day)}</span>
                <span className="cost-amount">{naira(c.amountNgn)}</span>
                <button
                  type="button"
                  className="link"
                  disabled={disabled}
                  aria-label={`Remove ${c.name}`}
                  onClick={() => teach([{ kind: "cost-removed", id: c.id }])}
                >
                  Remove
                </button>
              </li>
            ))}
        </ul>
      ) : null}
      {unused.length > 0 ? (
        <div className="suggestions">
          {unused.map((s) => (
            <button key={s.name} type="button" className="chip-button" disabled={disabled} onClick={() => add(s)}>
              + {s.name}, {naira(s.amountNgn)} on the {ordinal(s.day)}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className="cost-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canAdd) return;
          add({ name: name.trim(), amountNgn, day: Number(day) });
          setName("");
          setAmount("");
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rent savings" aria-label="Cost name" maxLength={40} />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="₦ amount"
          aria-label="Amount in naira"
          inputMode="numeric"
        />
        <select value={day} onChange={(e) => setDay(e.target.value)} aria-label="Day of the month">
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              on the {ordinal(d)}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-small" disabled={disabled || !canAdd}>
          Add
        </button>
      </form>
    </section>
  );
}
