// "How much can I spend until the money comes?" Tideover plans to the
// pessimistic end of the next payment window, because late is the usual case.

import { addDays, daysBetween, monthlyOccurrences } from "./dates";
import type { Cost, Forecast, PayerModel } from "./types";

/** Without any regular payer, plan a month ahead. */
const DEFAULT_HORIZON_DAYS = 30;

export interface CostDue {
  cost: Cost;
  day: string;
}

export interface SpendPlan {
  /** The last day the plan has to cover. */
  until: string;
  days: number;
  /** The payment the plan waits for, if Tideover expects one. */
  nextMoney?: Forecast;
  /** Forecasts whose window has already passed without payment. */
  overdue: Forecast[];
  costsDue: CostDue[];
  costsDueNgn: number;
  balanceUsd: number;
  /** Balance minus costs due before the next money, in dollars. */
  freeUsd: number;
  perDayUsd: number;
  perDayNgn: number;
}

export function planSpending(input: {
  today: string;
  balanceUsd: number;
  ngnPerUsd: number;
  costs: Cost[];
  payers: PayerModel[];
}): SpendPlan {
  const { today, balanceUsd, ngnPerUsd, costs, payers } = input;
  const forecasts = payers.flatMap((p) => (p.forecast && !p.ignored ? [p.forecast] : []));
  const overdue = forecasts.filter((f) => daysBetween(today, f.latest) < 0);
  const upcoming = forecasts
    .filter((f) => daysBetween(today, f.latest) >= 0)
    .sort((a, b) => a.latest.localeCompare(b.latest));
  const nextMoney = upcoming[0];
  const until = nextMoney ? nextMoney.latest : addDays(today, DEFAULT_HORIZON_DAYS);
  const days = Math.max(1, daysBetween(today, until));

  const costsDue = costs
    .flatMap((cost) =>
      // Costs due today still count: they haven't been paid yet.
      monthlyOccurrences(cost.day, addDays(today, -1), until).map((day) => ({ cost, day })),
    )
    .sort((a, b) => a.day.localeCompare(b.day));
  const costsDueNgn = costsDue.reduce((sum, c) => sum + c.cost.amountNgn, 0);
  const freeUsd = balanceUsd - costsDueNgn / ngnPerUsd;
  const perDayUsd = freeUsd / days;

  return {
    until,
    days,
    nextMoney,
    overdue,
    costsDue,
    costsDueNgn,
    balanceUsd,
    freeUsd,
    perDayUsd,
    perDayNgn: perDayUsd * ngnPerUsd,
  };
}
