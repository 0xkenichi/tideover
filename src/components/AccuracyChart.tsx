import { formatShortDay } from "@/lib/dates";
import type { MemoryRecord } from "@/lib/types";

type Graded = Extract<MemoryRecord, { type: "graded" }>;

interface Props {
  graded: Graded[];
  nameOf: (payer: string) => string;
}

const HEIGHT = 150;
const BAR = 14;
const GAP = 22;
const TOP = 12;
const BOTTOM = 34;

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** "1 day", "0.7 days", "2 days" */
function daysOff(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return `${rounded.toLocaleString("en-US")} day${rounded === 1 ? "" : "s"}`;
}

/** Days off, per graded forecast: Tideover's forecast against simply trusting the promise. */
export function AccuracyChart({ graded, nameOf }: Props) {
  if (graded.length === 0) {
    return (
      <section className="card" aria-labelledby="accuracy-title">
        <h2 id="accuracy-title">How Tideover is improving</h2>
        <p className="empty">
          Each forecast is graded when the money lands, and the grade is kept in Walrus Memory. The first grades
          appear after the next payday.
        </p>
      </section>
    );
  }

  const errors = graded.map((g) => Math.abs(g.errorDays));
  const promiseErrors = graded.map((g) => (g.promiseErrorDays === undefined ? null : Math.abs(g.promiseErrorDays)));
  const max = Math.max(3, ...errors, ...promiseErrors.map((e) => e ?? 0));
  const scale = (HEIGHT - TOP - BOTTOM) / max;
  const width = graded.length * (BAR + GAP) + GAP;
  const baseline = HEIGHT - BOTTOM;

  const half = Math.min(3, Math.floor(graded.length / 2));
  const summary =
    half >= 1
      ? `Its first ${half === 1 ? "forecast was" : `${half} forecasts were`} off by ${daysOff(mean(errors.slice(0, half)))} on average; its latest ${half === 1 ? "was" : `${half} were`} off by ${daysOff(mean(errors.slice(-half)))}.`
      : `Its first forecast was off by ${daysOff(errors[0])}.`;
  const withPromise = graded.filter((g) => g.promiseErrorDays !== undefined);
  const promiseSummary =
    withPromise.length > 0
      ? ` Trusting the promise would have been off by ${daysOff(mean(withPromise.map((g) => Math.abs(g.promiseErrorDays!))))} on average.`
      : "";

  return (
    <section className="card" aria-labelledby="accuracy-title">
      <h2 id="accuracy-title">How Tideover is improving</h2>
      <p className="lede">
        {summary}
        {promiseSummary}
      </p>
      <div className="chart-scroll">
        <svg
          className="chart"
          viewBox={`0 0 ${Math.max(width, 280)} ${HEIGHT}`}
          width={Math.max(width, 280)}
          height={HEIGHT}
          role="img"
          aria-label="Days each forecast was off by, oldest first"
        >
          <defs>
            <pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="2" height="4" className="hatch-line" />
            </pattern>
          </defs>
          <line x1={0} x2={Math.max(width, 280)} y1={baseline} y2={baseline} className="axis" />
          {graded.map((g, i) => {
            const x = GAP + i * (BAR + GAP);
            const h = Math.max(2, errors[i] * scale);
            const promise = promiseErrors[i];
            return (
              <g key={g.id}>
                <title>
                  {`${nameOf(g.payer)}, ${formatShortDay(g.actual)}: Tideover off by ${errors[i]} days${promise !== null ? `, promise off by ${promise}` : ""}${g.backtest ? " (checked against history)" : ""}`}
                </title>
                <rect
                  x={x}
                  y={baseline - h}
                  width={BAR}
                  height={h}
                  rx={3}
                  className={g.backtest ? "bar bar-backtest" : "bar"}
                  fill={g.backtest ? "url(#hatch)" : undefined}
                />
                {promise !== null ? (
                  <circle cx={x + BAR / 2} cy={baseline - promise * scale} r={4.5} className="promise-dot" />
                ) : null}
                <text x={x + BAR / 2} y={baseline + 14} className="tick" textAnchor="middle">
                  {formatShortDay(g.actual).split(" ")[0]}
                </text>
                <text x={x + BAR / 2} y={baseline + 26} className="tick tick-month" textAnchor="middle">
                  {formatShortDay(g.actual).split(" ")[1]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="legend">
        <li>
          <span className="swatch swatch-bar" /> Days Tideover’s forecast was off
        </li>
        {withPromise.length > 0 ? (
          <li>
            <span className="swatch swatch-dot" /> Days the promise was off
          </li>
        ) : null}
        {graded.some((g) => g.backtest) ? (
          <li>
            <span className="swatch swatch-hatch" /> Checked against history (before Tideover was watching)
          </li>
        ) : null}
      </ul>
    </section>
  );
}
