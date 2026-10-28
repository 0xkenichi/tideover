export function naira(amount: number): string {
  return `₦${Math.round(amount).toLocaleString("en-NG")}`;
}

export function dollars(amount: number): string {
  return `$${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function dayCount(n: number): string {
  const abs = Math.abs(n);
  return `${abs} day${abs === 1 ? "" : "s"}`;
}
