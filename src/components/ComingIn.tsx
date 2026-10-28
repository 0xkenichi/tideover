import { daysBetween, formatDay, formatShortDay } from "@/lib/dates";
import { dayCount, dollars } from "@/lib/format";
import type { PayerModel } from "@/lib/types";

interface Props {
  payers: PayerModel[];
  today: string;
  nameOf: (payer: string) => string;
}

export function ComingIn({ payers, today, nameOf }: Props) {
  const regular = payers
    .filter((p) => p.forecast && !p.ignored)
    .sort((a, b) => a.forecast!.expected.localeCompare(b.forecast!.expected));

  return (
    <section className="card" aria-labelledby="coming-title">
      <h2 id="coming-title">Money coming in</h2>
      {regular.length === 0 ? (
        <p className="empty">
          Nothing to forecast yet. Tideover needs three paydays from the same sender, or a promised pay day you teach
          it.
        </p>
      ) : (
        <ul className="coming">
          {regular.map((p) => {
            const f = p.forecast!;
            const overdue = daysBetween(today, f.latest) < 0;
            return (
              <li key={p.address} className={overdue ? "is-overdue" : undefined}>
                <div className="coming-who">
                  <span className="coming-name">{nameOf(p.address)}</span>
                  <span className="coming-amount">{dollars(f.amount)}</span>
                </div>
                <div className="coming-when">
                  {overdue ? (
                    <strong className="late">Overdue: expected by {formatShortDay(f.latest)}</strong>
                  ) : (
                    <strong>Expected {formatDay(f.expected)}</strong>
                  )}
                  <span className="muted">
                    {" "}
                    · window {formatShortDay(f.earliest)}–{formatShortDay(f.latest)}
                  </span>
                </div>
                <div className="coming-basis">
                  {f.promised ? (
                    <>
                      <span className="promise">Promised {formatShortDay(f.promised)}</span> · they usually pay{" "}
                      {p.typicalLateness === 0
                        ? "on the day"
                        : `${dayCount(p.typicalLateness ?? 0)} ${(p.typicalLateness ?? 0) > 0 ? "late" : "early"}`}
                    </>
                  ) : (
                    <>Pays about every {dayCount(p.cadenceDays ?? 0)}</>
                  )}
                  <span className="muted">
                    {" "}
                    · learned from {f.samples} payday{f.samples === 1 ? "" : "s"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
