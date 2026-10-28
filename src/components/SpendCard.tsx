import { formatDay, formatShortDay } from "@/lib/dates";
import { dayCount, dollars, naira } from "@/lib/format";
import type { SpendPlan } from "@/lib/money";

interface Props {
  plan: SpendPlan;
  ngnPerUsd: number | null;
  nameOf: (payer: string) => string;
  /** True when naira costs couldn't be converted because the rate is unavailable. */
  costsSkipped?: boolean;
}

export function SpendCard({ plan, ngnPerUsd, nameOf, costsSkipped }: Props) {
  const money = (usd: number) => (ngnPerUsd ? naira(usd * ngnPerUsd) : dollars(usd));
  const short = plan.freeUsd < 0;
  const next = plan.nextMoney;

  return (
    <section className="card spend" aria-labelledby="spend-title">
      <p className="eyebrow" id="spend-title">
        Safe to spend
      </p>
      {short ? (
        <p className="big short">
          Short by {money(-plan.freeUsd)}
          <span className="big-unit"> before {formatDay(plan.until)}</span>
        </p>
      ) : (
        <p className="big">
          {money(plan.perDayUsd)}
          <span className="big-unit"> a day</span>
        </p>
      )}
      <p className="spend-until">
        {ngnPerUsd && !short ? `${dollars(Math.round(plan.perDayUsd * 100) / 100)} a day · ` : ""}
        until {formatDay(plan.until)} ({dayCount(plan.days)})
      </p>
      <p className="spend-why">
        {next ? (
          <>
            Tideover plans to the late end of <strong>{nameOf(next.payer)}</strong>’s usual window (
            {formatShortDay(next.earliest)}–{formatShortDay(next.latest)})
            {next.promised
              ? `, not the promised ${formatShortDay(next.promised)}, because that's when their money really lands.`
              : ", so a slightly late payment doesn't leave you short."}
          </>
        ) : (
          <>Tideover hasn’t learned a regular payer yet, so this plans a month ahead.</>
        )}
      </p>
      <dl className="breakdown">
        <div>
          <dt>Stablecoin balance</dt>
          <dd>
            {dollars(Math.round(plan.balanceUsd * 100) / 100)}
            {ngnPerUsd ? <span className="muted"> · {naira(plan.balanceUsd * ngnPerUsd)}</span> : null}
          </dd>
        </div>
        <div>
          <dt>Costs due before then</dt>
          <dd>
            {costsSkipped ? (
              <span className="muted">Not counted (no naira rate)</span>
            ) : plan.costsDue.length === 0 ? (
              <span className="muted">None in this window</span>
            ) : (
              <>
                −{ngnPerUsd ? naira(plan.costsDueNgn) : dollars(plan.costsDueNgn)}
                <span className="muted">
                  {" "}
                  · {plan.costsDue.map((c) => `${c.cost.name} ${formatShortDay(c.day)}`).join(", ")}
                </span>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>Free to spend</dt>
          <dd>
            {money(plan.freeUsd)} <span className="muted">over {dayCount(plan.days)}</span>
          </dd>
        </div>
      </dl>
      {costsSkipped ? (
        <p className="overdue-note">
          The naira rate from Tatum isn’t available right now, so your naira costs aren’t set aside here.
        </p>
      ) : null}
      {plan.overdue.length > 0 ? (
        <p className="overdue-note">
          Not counted: {plan.overdue.map((f) => nameOf(f.payer)).join(", ")} {plan.overdue.length === 1 ? "is" : "are"}{" "}
          overdue. Tideover won’t plan around money that hasn’t come.
        </p>
      ) : null}
    </section>
  );
}
