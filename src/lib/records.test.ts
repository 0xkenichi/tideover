import { describe, expect, it } from "vitest";
import { planSpending } from "./money";
import { decode, describe as describeRecord, encode } from "./records";
import type { MemoryRecord, PayerModel } from "./types";

const payer = `0x${"ab".repeat(32)}`;

describe("memory records", () => {
  const graded: MemoryRecord = {
    type: "graded",
    id: "g:0xabababab:digest1",
    at: "2026-07-11T10:11:00.000Z",
    payer,
    digest: "digest1",
    expected: "2026-07-09",
    actual: "2026-07-11",
    errorDays: 2,
    promised: "2026-07-01",
    promiseErrorDays: 10,
    backtest: false,
  };

  it("round-trips through the text written to Walrus", () => {
    const text = encode(graded);
    expect(text.startsWith("Tideover memory. ")).toBe(true);
    expect(decode(text)).toEqual(graded);
  });

  it("reads like a sentence", () => {
    expect(describeRecord(graded, () => "Northstar DAO")).toBe(
      "Northstar DAO paid on Sat 11 Jul. Tideover expected Thu 9 Jul: off by 2 days. " +
        "Going by the promise (1 Jul) would have been off by 10 days.",
    );
  });

  it("ignores memories that aren't Tideover's", () => {
    expect(decode("User prefers dark mode.")).toBeNull();
    expect(decode("[tideover:v1] {not json")).toBeNull();
    expect(decode('[tideover:v1] {"type":"other","id":"x","at":"y"}')).toBeNull();
  });
});

describe("planSpending", () => {
  const regular: PayerModel = {
    address: payer,
    ignored: false,
    paydays: [],
    total: 0,
    lateness: [],
    status: "regular",
    forecast: {
      payer,
      expected: "2026-07-09",
      earliest: "2026-07-06",
      latest: "2026-07-12",
      amount: 600,
      basis: "promise",
      samples: 1,
    },
  };

  it("plans to the late end of the next payment window", () => {
    const plan = planSpending({
      today: "2026-06-25",
      balanceUsd: 500,
      ngnPerUsd: 1500,
      costs: [
        { id: "rent", name: "Rent savings", amountNgn: 120_000, day: 1 },
        { id: "mum", name: "Mum's upkeep", amountNgn: 50_000, day: 28 },
        { id: "later", name: "Due after the window", amountNgn: 99_000, day: 20 },
      ],
      payers: [regular],
    });
    expect(plan.until).toBe("2026-07-12");
    expect(plan.days).toBe(17);
    expect(plan.costsDue.map((c) => c.cost.id)).toEqual(["mum", "rent"]);
    expect(plan.costsDueNgn).toBe(170_000);
    expect(plan.freeUsd).toBeCloseTo(500 - 170_000 / 1500);
    expect(plan.perDayNgn).toBeCloseTo(((500 - 170_000 / 1500) / 17) * 1500);
  });

  it("sets overdue payments aside instead of counting on them", () => {
    const plan = planSpending({ today: "2026-07-20", balanceUsd: 100, ngnPerUsd: 1500, costs: [], payers: [regular] });
    expect(plan.overdue).toHaveLength(1);
    expect(plan.nextMoney).toBeUndefined();
    expect(plan.days).toBe(30);
  });
});
