import { describe, expect, it } from "vitest";
import { dueDateFor, monthlyOccurrences } from "./dates";
import { analysePayer, learn, toPaydays } from "./engine";
import { SAMPLE_PAYERS, SAMPLE_PAYMENTS, sampleNow } from "./sample";
import type { MemoryRecord, Payment, Teaching } from "./types";

const { dao, studio, bounty } = SAMPLE_PAYERS;

function taught(teaching: Teaching, at: string): MemoryRecord {
  return { type: "taught", id: `t:${teaching.kind}:${at}`, at, teaching };
}

/** Drive the walkthrough the way the app does: learn, then remember what's new. */
function walk(steps: number, teach: (step: number, now: string) => MemoryRecord[] = () => []) {
  let memory: MemoryRecord[] = [];
  let last = learn({ payments: SAMPLE_PAYMENTS, remembered: memory, now: sampleNow(0) });
  for (let step = 0; step < steps; step++) {
    const now = sampleNow(step);
    memory = [...memory, ...teach(step, now)];
    last = learn({ payments: SAMPLE_PAYMENTS, remembered: memory, now });
    memory = [...memory, ...last.newRecords];
  }
  return { memory, last };
}

describe("dates", () => {
  it("matches late payments to the promised day they belong to", () => {
    expect(dueDateFor("2026-07-11", 1)).toBe("2026-07-01");
    expect(dueDateFor("2026-07-28", 1)).toBe("2026-08-01"); // early for August
    expect(dueDateFor("2026-06-09", 15)).toBe("2026-06-15"); // early for June 15
    expect(dueDateFor("2026-11-02", 31)).toBe("2026-10-31"); // short months clamp
  });

  it("lists monthly costs inside a window", () => {
    expect(monthlyOccurrences(1, "2026-06-25", "2026-08-02")).toEqual(["2026-07-01", "2026-08-01"]);
    expect(monthlyOccurrences(28, "2026-06-25", "2026-07-10")).toEqual(["2026-06-28"]);
  });
});

describe("paydays", () => {
  it("merges a split payment into one payday", () => {
    const studioPayments = SAMPLE_PAYMENTS.filter((p) => p.from === studio);
    const paydays = toPaydays(studioPayments);
    const split = paydays.find((p) => p.day === "2026-08-14");
    expect(split?.amount).toBe(250);
    expect(split?.digests).toHaveLength(2);
    expect(paydays).toHaveLength(11);
  });
});

describe("analysePayer", () => {
  const daoPaydays = toPaydays(SAMPLE_PAYMENTS.filter((p) => p.from === dao));

  it("learns how late a payer is against its promise", () => {
    const stats = analysePayer(dao, daoPaydays, 1);
    expect(stats.lateness).toEqual([8, 10, 7, 9, 8]);
    expect(stats.typicalLateness).toBe(8);
    expect(stats.forecast).toMatchObject({
      promised: "2026-11-01",
      expected: "2026-11-09",
      earliest: "2026-11-08",
      latest: "2026-11-10",
      amount: 600,
      basis: "promise",
    });
  });

  it("is unsure after a single payday", () => {
    const stats = analysePayer(dao, daoPaydays.slice(0, 1), 1);
    expect(stats.forecast?.expected).toBe("2026-07-09");
    expect(stats.forecast?.earliest).toBe("2026-07-06");
    expect(stats.forecast?.latest).toBe("2026-07-12");
  });

  it("finds a rhythm without a promise once it has three paydays", () => {
    const studioPaydays = toPaydays(SAMPLE_PAYMENTS.filter((p) => p.from === studio));
    expect(analysePayer(studio, studioPaydays.slice(0, 2), undefined).forecast).toBeUndefined();
    const stats = analysePayer(studio, studioPaydays, undefined);
    expect(stats.cadenceDays).toBe(14);
    expect(stats.forecast?.expected).toBe("2026-11-06");
  });

  it("refuses to see a rhythm in irregular payments", () => {
    const messy: Payment[] = ["2026-01-02", "2026-01-05", "2026-02-20", "2026-02-22", "2026-04-30"].map(
      (day, i) => ({ digest: `d${i}`, from: bounty, amount: 50, coin: "USDC", at: `${day}T09:00:00Z` }),
    );
    expect(analysePayer(bounty, toPaydays(messy), undefined).forecast).toBeUndefined();
  });
});

describe("learn", () => {
  it("knows nothing useful in the first month without teaching", () => {
    const out = learn({ payments: SAMPLE_PAYMENTS, remembered: [], now: sampleNow(0) });
    expect(out.payers.map((p) => p.status)).toEqual(["learning", "learning"]);
    expect(out.newRecords).toEqual([]);
  });

  it("forecasts as soon as it's taught a promise, and remembers the forecast", () => {
    const now = sampleNow(0);
    const memory = [taught({ kind: "promise", payer: dao, day: 1 }, now)];
    const out = learn({ payments: SAMPLE_PAYMENTS, remembered: memory, now });
    const kinds = out.newRecords.map((r) => r.type);
    expect(kinds).toEqual(["lesson", "forecast"]);
    const forecast = out.newRecords.find((r) => r.type === "forecast");
    expect(forecast?.type === "forecast" && forecast.forecast.expected).toBe("2026-07-09");
  });

  it("grades its remembered forecast when the money lands", () => {
    const { memory } = walk(2, (step, now) =>
      step === 0 ? [taught({ kind: "promise", payer: dao, day: 1 }, now)] : [],
    );
    const grade = memory.find((r) => r.type === "graded" && r.payer === dao);
    expect(grade).toMatchObject({
      expected: "2026-07-09",
      actual: "2026-07-11",
      errorDays: 2,
      promised: "2026-07-01",
      promiseErrorDays: 10,
      backtest: false,
    });
  });

  it("gets closer than the promise as the months go by", () => {
    const { last } = walk(5, (step, now) =>
      step === 0 ? [taught({ kind: "promise", payer: dao, day: 1 }, now)] : [],
    );
    const daoGrades = last.graded.filter((g) => g.payer === dao);
    expect(daoGrades.map((g) => g.errorDays)).toEqual([2, -2, 1, -1]);
    expect(daoGrades.map((g) => g.promiseErrorDays)).toEqual([10, 7, 9, 8]);
    for (const g of daoGrades) {
      expect(Math.abs(g.errorDays)).toBeLessThan(Math.abs(g.promiseErrorDays ?? 0));
    }
    expect(daoGrades.every((g) => !g.backtest)).toBe(true);
  });

  it("never writes the same memory twice", () => {
    const { memory } = walk(5, (step, now) =>
      step === 0 ? [taught({ kind: "promise", payer: dao, day: 1 }, now)] : [],
    );
    const again = learn({ payments: SAMPLE_PAYMENTS, remembered: memory, now: sampleNow(4) });
    expect(again.newRecords).toEqual([]);
    expect(new Set(memory.map((r) => r.id)).size).toBe(memory.length);
  });

  it("checks itself against history the first time it sees a wallet", () => {
    const out = learn({ payments: SAMPLE_PAYMENTS, remembered: [], now: sampleNow(4) });
    const grades = out.newRecords.filter((r) => r.type === "graded");
    expect(grades.length).toBeGreaterThan(0);
    expect(grades.every((g) => g.type === "graded" && g.backtest)).toBe(true);
  });

  it("forgets names, promises and track record when memory is off", () => {
    const now = sampleNow(4);
    const { memory } = walk(5, (step, at) =>
      step === 0
        ? [
            taught({ kind: "name", payer: dao, name: "Northstar DAO" }, at),
            taught({ kind: "promise", payer: dao, day: 1 }, at),
            taught({ kind: "not-income", payer: bounty, value: true }, at),
          ]
        : [],
    );
    const withMemory = learn({ payments: SAMPLE_PAYMENTS, remembered: memory, now });
    const without = learn({ payments: SAMPLE_PAYMENTS, remembered: memory, now, useMemory: false });

    expect(withMemory.payers.find((p) => p.address === dao)?.name).toBe("Northstar DAO");
    expect(without.payers.find((p) => p.address === dao)?.name).toBeUndefined();
    expect(withMemory.payers.find((p) => p.address === bounty)?.status).toBe("ignored");
    expect(without.payers.find((p) => p.address === bounty)?.status).toBe("learning");
    expect(withMemory.graded.length).toBeGreaterThan(0);
    expect(without.graded).toEqual([]);
    expect(without.newRecords).toEqual([]);
  });

  it("lets the latest teaching win", () => {
    const memory = [
      taught({ kind: "promise", payer: dao, day: 1 }, "2026-06-25T10:00:00Z"),
      taught({ kind: "promise", payer: dao, day: null }, "2026-06-26T10:00:00Z"),
    ];
    const out = learn({ payments: SAMPLE_PAYMENTS, remembered: memory, now: sampleNow(1) });
    expect(out.payers.find((p) => p.address === dao)?.promiseDay).toBeUndefined();
  });
});
