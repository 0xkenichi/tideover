// The learning loop. Given the payments seen on chain, what the user taught,
// and what Tideover already remembers, it rebuilds its picture of each payer,
// grades the forecasts it made earlier, notes what it learned, and makes fresh
// forecasts. Every new record it returns is meant to be written to Walrus Memory.
//
// This file is pure: no network, no clock. That keeps it easy to test.

import {
  addDays,
  dayNumber,
  daysBetween,
  dueDateFor,
  lagosDay,
  nextDueDate,
} from "./dates";
import type {
  Cost,
  Forecast,
  MemoryRecord,
  Payday,
  PayerModel,
  Payment,
  Teaching,
} from "./types";

/** Payments from one payer this close together count as one payday (a split payment). */
const MERGE_WINDOW_DAYS = 2;
/** Cadence-only forecasts need this many paydays before Tideover trusts the rhythm. */
const MIN_PAYDAYS_FOR_CADENCE = 3;
/** Intervals that vary more than this (coefficient of variation) are not a rhythm. */
const MAX_CADENCE_VARIATION = 0.35;
/** Uncertainty, in days, when a promise-based forecast rests on a single payday. */
const SINGLE_SAMPLE_SPREAD = 3;
/** History older than this is used for learning but not written to memory as a backtest. */
const BACKTEST_JOURNAL_DAYS = 120;

export interface Teachings {
  names: Map<string, string>;
  promises: Map<string, number>;
  ignored: Set<string>;
  costs: Cost[];
}

export interface LearnInput {
  payments: Payment[];
  remembered: MemoryRecord[];
  /** ISO timestamp for "now" (the simulated date in sample mode). */
  now: string;
  /** When false, Tideover acts as if it had no memory at all. */
  useMemory?: boolean;
}

export interface LearnOutput {
  payers: PayerModel[];
  teachings: Teachings;
  /** Graded forecasts, oldest first: remembered ones plus any new ones. */
  graded: Extract<MemoryRecord, { type: "graded" }>[];
  /** Records to write to Walrus Memory. */
  newRecords: MemoryRecord[];
}

/** Resolve teachings: for each payer and kind, the most recent one wins. */
export function resolveTeachings(records: MemoryRecord[]): Teachings {
  const taught = records
    .filter((r): r is Extract<MemoryRecord, { type: "taught" }> => r.type === "taught")
    .sort((a, b) => a.at.localeCompare(b.at));

  const names = new Map<string, string>();
  const promises = new Map<string, number>();
  const ignored = new Set<string>();
  const costs = new Map<string, Cost>();

  for (const { teaching: t } of taught) {
    switch (t.kind) {
      case "name":
        if (t.name.trim()) names.set(t.payer, t.name.trim());
        else names.delete(t.payer);
        break;
      case "promise":
        if (t.day === null) promises.delete(t.payer);
        else promises.set(t.payer, t.day);
        break;
      case "not-income":
        if (t.value) ignored.add(t.payer);
        else ignored.delete(t.payer);
        break;
      case "cost":
        costs.set(t.id, { id: t.id, name: t.name, amountNgn: t.amountNgn, day: t.day });
        break;
      case "cost-removed":
        costs.delete(t.id);
        break;
    }
  }
  return { names, promises, ignored, costs: [...costs.values()] };
}

/** Group a payer's payments into paydays, merging split payments. */
export function toPaydays(payments: Payment[]): Payday[] {
  const sorted = [...payments].sort((a, b) => a.at.localeCompare(b.at));
  const paydays: Payday[] = [];
  for (const p of sorted) {
    const day = lagosDay(p.at);
    const last = paydays[paydays.length - 1];
    if (last && daysBetween(last.day, day) <= MERGE_WINDOW_DAYS) {
      last.amount += p.amount;
      last.digests.push(p.digest);
    } else {
      paydays.push({ day, amount: p.amount, digests: [p.digest] });
    }
  }
  return paydays;
}

export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (values.length - 1));
}

interface PayerStats {
  lateness: number[];
  typicalLateness?: number;
  cadenceDays?: number;
  forecast?: Forecast;
}

/** What Tideover can say about a payer from these paydays alone. */
export function analysePayer(
  payer: string,
  paydays: Payday[],
  promiseDay: number | undefined,
): PayerStats {
  if (paydays.length === 0) return { lateness: [] };
  const recentAmounts = paydays.slice(-4).map((p) => p.amount);
  const amount = Math.round(median(recentAmounts) * 100) / 100;
  const last = paydays[paydays.length - 1];

  if (promiseDay !== undefined) {
    const dues = paydays.map((p) => dueDateFor(p.day, promiseDay));
    const lateness = paydays.map((p, i) => daysBetween(dues[i], p.day));
    const typical = Math.round(median(lateness));
    const spread =
      lateness.length < 2 ? SINGLE_SAMPLE_SPREAD : Math.max(1, Math.round(stdev(lateness)));
    const nextDue = nextDueDate(dues[dues.length - 1], promiseDay);
    const expected = addDays(nextDue, typical);
    return {
      lateness,
      typicalLateness: typical,
      forecast: {
        payer,
        expected,
        earliest: addDays(expected, -spread),
        latest: addDays(expected, spread),
        amount,
        promised: nextDue,
        basis: "promise",
        samples: paydays.length,
      },
    };
  }

  if (paydays.length < MIN_PAYDAYS_FOR_CADENCE) return { lateness: [] };
  const intervals = paydays.slice(1).map((p, i) => daysBetween(paydays[i].day, p.day));
  const cadence = median(intervals);
  const variation = stdev(intervals) / cadence;
  if (!(cadence > 0) || variation > MAX_CADENCE_VARIATION) return { lateness: [] };

  const cadenceDays = Math.round(cadence);
  const spread = Math.max(1, Math.round(stdev(intervals)));
  const expected = addDays(last.day, cadenceDays);
  return {
    lateness: [],
    cadenceDays,
    forecast: {
      payer,
      expected,
      earliest: addDays(expected, -spread),
      latest: addDays(expected, spread),
      amount,
      basis: "cadence",
      samples: paydays.length,
    },
  };
}

/** Stable record IDs, so the same fact is never written twice. */
export const recordId = {
  graded: (payer: string, digest: string) => `g:${payer.slice(0, 12)}:${digest}`,
  lesson: (payer: string, digest: string, kind: string) => `l:${payer.slice(0, 12)}:${digest}:${kind}`,
  forecast: (f: Forecast, madeOn: string) =>
    `f:${f.payer.slice(0, 12)}:${f.expected}:${f.basis}:${madeOn}`,
};

type Graded = Extract<MemoryRecord, { type: "graded" }>;
type Lesson = Extract<MemoryRecord, { type: "lesson" }>;
type ForecastRecord = Extract<MemoryRecord, { type: "forecast" }>;

function lessonsBetween(
  payer: string,
  digest: string,
  at: string,
  before: PayerStats,
  after: PayerStats,
  samples: number,
): Lesson[] {
  const make = (lesson: Lesson["lesson"]): Lesson => ({
    type: "lesson",
    id: recordId.lesson(payer, digest, lesson.kind),
    at,
    payer,
    digest,
    lesson,
  });
  if (!after.forecast) return [];
  if (!before.forecast) {
    return after.forecast.basis === "promise"
      ? [make({ kind: "regular-promise", lateness: after.typicalLateness ?? 0, samples })]
      : [make({ kind: "regular-cadence", cadenceDays: after.cadenceDays ?? 0, samples })];
  }
  if (
    before.typicalLateness !== undefined &&
    after.typicalLateness !== undefined &&
    before.typicalLateness !== after.typicalLateness
  ) {
    return [make({ kind: "lateness", from: before.typicalLateness, to: after.typicalLateness, samples })];
  }
  if (
    before.cadenceDays !== undefined &&
    after.cadenceDays !== undefined &&
    Math.abs(before.cadenceDays - after.cadenceDays) >= 2
  ) {
    return [make({ kind: "cadence", from: before.cadenceDays, to: after.cadenceDays, samples })];
  }
  return [];
}

/**
 * Run the learning loop.
 *
 * Walks every payday in time order. Before each one it looks for the forecast
 * Tideover made for that payer: first in memory (a real prediction made before
 * the money arrived), otherwise by reconstructing it from earlier history
 * (marked as a backtest). It grades that forecast, learns from the payday, and
 * records any lesson. Finally it makes a fresh forecast for every regular payer.
 */
export function learn({ payments, remembered, now, useMemory = true }: LearnInput): LearnOutput {
  const memory = useMemory ? remembered : [];
  const teachings = resolveTeachings(memory);
  const today = lagosDay(now);
  const known = new Set(memory.map((r) => r.id));
  const rememberedForecasts = memory
    .filter((r): r is ForecastRecord => r.type === "forecast")
    .sort((a, b) => a.at.localeCompare(b.at));
  const rememberedGrades = memory.filter((r): r is Graded => r.type === "graded");

  const visible = payments.filter((p) => Date.parse(p.at) <= Date.parse(now));
  const byPayer = new Map<string, Payment[]>();
  for (const p of visible) byPayer.set(p.from, [...(byPayer.get(p.from) ?? []), p]);

  const journalFrom = addDays(today, -BACKTEST_JOURNAL_DAYS);
  const newRecords: MemoryRecord[] = [];
  const graded: Graded[] = [...rememberedGrades];
  const payers: PayerModel[] = [];

  for (const [payer, list] of byPayer) {
    const paydays = toPaydays(list);
    const ignored = teachings.ignored.has(payer);
    const promiseDay = teachings.promises.get(payer);
    const total = paydays.reduce((a, p) => a + p.amount, 0);

    if (ignored) {
      payers.push({
        address: payer,
        name: teachings.names.get(payer),
        ignored: true,
        promiseDay,
        paydays,
        total,
        lateness: [],
        status: "ignored",
      });
      continue;
    }

    let stats: PayerStats = { lateness: [] };
    for (let i = 0; i < paydays.length; i++) {
      const payday = paydays[i];
      const digest = payday.digests[0];
      const paidAt = list.find((p) => p.digest === digest)?.at ?? `${payday.day}T12:00:00Z`;
      const previousDay = i > 0 ? paydays[i - 1].day : undefined;

      // The prediction Tideover held when this money arrived.
      const fromMemory = [...rememberedForecasts]
        .reverse()
        .find(
          (r) =>
            r.forecast.payer === payer &&
            Date.parse(r.at) < Date.parse(paidAt) &&
            (!previousDay || lagosDay(r.at) >= previousDay),
        );
      const held = fromMemory?.forecast ?? stats.forecast;
      const gradeId = recordId.graded(payer, digest);
      const inJournalWindow = dayNumber(payday.day) >= dayNumber(journalFrom);

      if (held && !known.has(gradeId) && (fromMemory || inJournalWindow)) {
        const promised = promiseDay !== undefined ? dueDateFor(payday.day, promiseDay) : undefined;
        const record: Graded = {
          type: "graded",
          id: gradeId,
          at: paidAt,
          payer,
          digest,
          expected: held.expected,
          actual: payday.day,
          errorDays: daysBetween(held.expected, payday.day),
          ...(promised
            ? { promised, promiseErrorDays: daysBetween(promised, payday.day) }
            : {}),
          backtest: !fromMemory,
        };
        graded.push(record);
        newRecords.push(record);
        known.add(gradeId);
      }

      const next = analysePayer(payer, paydays.slice(0, i + 1), promiseDay);
      if (inJournalWindow) {
        for (const lesson of lessonsBetween(payer, digest, paidAt, stats, next, i + 1)) {
          if (!known.has(lesson.id)) {
            newRecords.push(lesson);
            known.add(lesson.id);
          }
        }
      }
      stats = next;
    }

    // A fresh forecast, remembered once per prediction so it can be graded later.
    const forecast = stats.forecast;
    if (forecast) {
      const lastDay = paydays[paydays.length - 1].day;
      const alreadyHeld = rememberedForecasts.some(
        (r) =>
          r.forecast.payer === payer &&
          r.forecast.expected === forecast.expected &&
          r.forecast.basis === forecast.basis &&
          lagosDay(r.at) >= lastDay,
      );
      const id = recordId.forecast(forecast, today);
      if (!alreadyHeld && !known.has(id)) {
        newRecords.push({ type: "forecast", id, at: now, forecast });
        known.add(id);
      }
    }

    payers.push({
      address: payer,
      name: teachings.names.get(payer),
      ignored: false,
      promiseDay,
      paydays,
      total,
      lateness: stats.lateness,
      typicalLateness: stats.typicalLateness,
      cadenceDays: stats.cadenceDays,
      forecast,
      status: forecast ? "regular" : "learning",
    });
  }

  payers.sort((a, b) => b.total - a.total);
  graded.sort((a, b) => a.actual.localeCompare(b.actual));
  // Without memory there is no track record to show and nothing to save.
  return useMemory
    ? { payers, teachings, graded, newRecords }
    : { payers, teachings, graded: [], newRecords: [] };
}
