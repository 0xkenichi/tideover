// Sample mode: five months of simulated payments for Ada, a fictional product
// designer in Lagos, so anyone can watch Tideover learn in a minute. The
// payments are made up and labelled as such in the app. The memories Tideover
// writes about them are real Walrus Memory writes.

import { daysBetween, lagosDay } from "./dates";
import type { Cost, Payment } from "./types";

/** Made-up addresses. They all start 0x5a301e ("sample") so they're easy to spot. */
function sampleAddress(tag: string): string {
  return `0x${"5a301e".padEnd(64 - tag.length, "0")}${tag}`;
}

export const SAMPLE_PAYERS = {
  dao: sampleAddress("da0"),
  studio: sampleAddress("57d10"),
  bounty: sampleAddress("b0b7"),
  exchange: sampleAddress("ec5"),
} as const;

/** Names the walkthrough suggests. Tideover only knows them once you teach it. */
export const SAMPLE_HINTS: Record<string, { name: string; promiseDay?: number; notIncome?: boolean; note: string }> = {
  [SAMPLE_PAYERS.dao]: {
    name: "Northstar DAO",
    promiseDay: 1,
    note: "Ada's monthly contributor stipend. The DAO says it pays on the 1st.",
  },
  [SAMPLE_PAYERS.studio]: {
    name: "Pixel & Co",
    note: "A design retainer, paid every two weeks.",
  },
  [SAMPLE_PAYERS.bounty]: {
    name: "Hackathon bounty",
    notIncome: true,
    note: "A one-off prize. Not something to plan around.",
  },
  [SAMPLE_PAYERS.exchange]: {
    name: "My exchange account",
    notIncome: true,
    note: "Ada moving her own money in from an exchange.",
  },
};

export const SAMPLE_COSTS: Omit<Cost, "id">[] = [
  { name: "Rent savings", amountNgn: 120_000, day: 1 },
  { name: "Data and power", amountNgn: 45_000, day: 5 },
  { name: "Mum's upkeep", amountNgn: 50_000, day: 28 },
];

function pay(from: string, day: string, amount: number, n: number, coin: Payment["coin"] = "USDC"): Payment {
  return { digest: `sample-${day}-${n}`, from, amount, coin, at: `${day}T10:${String(10 + n).padStart(2, "0")}:00.000Z` };
}

export const SAMPLE_PAYMENTS: Payment[] = [
  // Northstar DAO: promises the 1st, usually pays 7 to 11 days late.
  pay(SAMPLE_PAYERS.dao, "2026-06-09", 600, 1),
  pay(SAMPLE_PAYERS.dao, "2026-07-11", 600, 1),
  pay(SAMPLE_PAYERS.dao, "2026-08-08", 600, 1),
  pay(SAMPLE_PAYERS.dao, "2026-09-10", 600, 1),
  pay(SAMPLE_PAYERS.dao, "2026-10-09", 600, 1),
  // Pixel & Co: every two weeks, give or take a day. One payday arrives split in two.
  pay(SAMPLE_PAYERS.studio, "2026-06-05", 250, 2),
  pay(SAMPLE_PAYERS.studio, "2026-06-19", 250, 2),
  pay(SAMPLE_PAYERS.studio, "2026-07-03", 250, 2),
  pay(SAMPLE_PAYERS.studio, "2026-07-17", 250, 2),
  pay(SAMPLE_PAYERS.studio, "2026-08-01", 250, 2),
  pay(SAMPLE_PAYERS.studio, "2026-08-14", 150, 2),
  pay(SAMPLE_PAYERS.studio, "2026-08-15", 100, 3),
  pay(SAMPLE_PAYERS.studio, "2026-08-28", 250, 2),
  pay(SAMPLE_PAYERS.studio, "2026-09-11", 250, 2),
  pay(SAMPLE_PAYERS.studio, "2026-09-26", 250, 2),
  pay(SAMPLE_PAYERS.studio, "2026-10-09", 250, 2),
  pay(SAMPLE_PAYERS.studio, "2026-10-23", 250, 2),
  // A one-off bounty and a transfer from Ada's own exchange account.
  pay(SAMPLE_PAYERS.bounty, "2026-08-20", 180, 4),
  pay(SAMPLE_PAYERS.exchange, "2026-09-03", 400, 5, "USDT"),
];

/** The simulated "today" for each month of the walkthrough. */
export const SAMPLE_STEPS = ["2026-06-25", "2026-07-25", "2026-08-25", "2026-09-25", "2026-10-25"];

const OPENING_BALANCE = 150;
const DAILY_SPEND = 40;
const START = "2026-06-01";

/** End of the simulated day, so that day's payments are visible. */
export function sampleNow(step: number): string {
  return `${SAMPLE_STEPS[step]}T20:00:00.000Z`;
}

/** Ada's simulated stablecoin balance on a given day: money in, minus steady spending. */
export function sampleBalance(now: string): number {
  const today = lagosDay(now);
  const received = SAMPLE_PAYMENTS.filter((p) => lagosDay(p.at) <= today).reduce((a, p) => a + p.amount, 0);
  return Math.max(0, OPENING_BALANCE + received - DAILY_SPEND * daysBetween(START, today));
}

/** A short random ID for a fresh sample run, so each walkthrough starts with an empty memory. */
export function newSampleRunId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return `sample-${Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 10)}`;
}
