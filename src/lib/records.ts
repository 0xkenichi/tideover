// How records travel to and from Walrus Memory. Each memory is a plain English
// sentence (so semantic recall and humans can read it) followed by a tagged JSON
// copy of the record (so Tideover can rebuild its state exactly).

import { formatDay, formatShortDay, ordinal } from "./dates";
import { dayCount as days, dollars, naira } from "./format";
import type { MemoryRecord, Teaching } from "./types";

const TAG = "[tideover:v1]";

export function shortAddress(address: string): string {
  return address.length > 14 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
}

export type NameOf = (payer: string) => string;

export const plainName: NameOf = (payer) => shortAddress(payer);

function describeTeaching(t: Teaching, nameOf: NameOf): string {
  switch (t.kind) {
    case "name":
      return t.name
        ? `You named ${shortAddress(t.payer)} "${t.name}".`
        : `You cleared the name for ${shortAddress(t.payer)}.`;
    case "promise":
      return t.day === null
        ? `You said ${nameOf(t.payer)} has no promised pay day.`
        : `You said ${nameOf(t.payer)} promises to pay on the ${ordinal(t.day)} of each month.`;
    case "not-income":
      return t.value
        ? `You said money from ${nameOf(t.payer)} isn't regular income.`
        : `You said money from ${nameOf(t.payer)} is regular income again.`;
    case "cost":
      return `You pay ${t.name}, ${naira(t.amountNgn)}, on the ${ordinal(t.day)} of each month.`;
    case "cost-removed":
      return `You removed a monthly cost.`;
  }
}

/** One readable sentence for a record. */
export function describe(record: MemoryRecord, nameOf: NameOf = plainName): string {
  switch (record.type) {
    case "taught":
      return describeTeaching(record.teaching, nameOf);
    case "forecast": {
      const f = record.forecast;
      const window =
        f.earliest === f.latest
          ? ""
          : ` (between ${formatShortDay(f.earliest)} and ${formatShortDay(f.latest)})`;
      const promise = f.promised ? ` They promise ${formatShortDay(f.promised)}.` : "";
      return `Expects about ${dollars(f.amount)} from ${nameOf(f.payer)} on ${formatDay(f.expected)}${window}.${promise}`;
    }
    case "graded": {
      const verdict = record.errorDays === 0 ? "spot on" : `off by ${days(record.errorDays)}`;
      const promise =
        record.promised && record.promiseErrorDays !== undefined
          ? ` Going by the promise (${formatShortDay(record.promised)}) would have been off by ${days(record.promiseErrorDays)}.`
          : "";
      const how = record.backtest ? "Checked against history: " : "";
      return `${how}${nameOf(record.payer)} paid on ${formatDay(record.actual)}. Tideover expected ${formatDay(record.expected)}: ${verdict}.${promise}`;
    }
    case "lesson": {
      const l = record.lesson;
      const who = nameOf(record.payer);
      switch (l.kind) {
        case "regular-promise":
          return `Learned: ${who} pays about ${days(l.lateness)} after the promised day (from ${l.samples} payday${l.samples === 1 ? "" : "s"}).`;
        case "regular-cadence":
          return `Learned: ${who} pays about every ${days(l.cadenceDays)} (from ${l.samples} paydays).`;
        case "lateness":
          return `Learned: ${who} now usually pays ${days(l.to)} after the promised day, not ${l.from} (from ${l.samples} paydays).`;
        case "cadence":
          return `Learned: ${who} now pays about every ${days(l.to)}, not every ${l.from} (from ${l.samples} paydays).`;
      }
    }
  }
}

/** The text written to Walrus Memory. */
export function encode(record: MemoryRecord): string {
  return `Tideover memory. ${describe(record)}\n${TAG} ${JSON.stringify(record)}`;
}

const TYPES = new Set(["taught", "forecast", "graded", "lesson"]);

/** Read a record back from memory text. Returns null for anything that isn't ours. */
export function decode(text: string): MemoryRecord | null {
  const at = text.lastIndexOf(TAG);
  if (at < 0) return null;
  try {
    const value = JSON.parse(text.slice(at + TAG.length).trim());
    if (
      value &&
      typeof value === "object" &&
      TYPES.has(value.type) &&
      typeof value.id === "string" &&
      typeof value.at === "string"
    ) {
      return value as MemoryRecord;
    }
  } catch {
    // Not a Tideover record.
  }
  return null;
}
