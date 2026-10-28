import { describe, expect, it } from "vitest";
import { normaliseAddress, paymentsFrom, stablecoinBalance, type TransactionNode } from "./tatum";

// Shapes recorded from Tatum's Sui mainnet GraphQL gateway (addresses changed).
const me = `0x${"11".repeat(32)}`;
const client = `0x${"22".repeat(32)}`;
const USDC = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
const SUI = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";

function tx(digest: string, sender: string, changes: [string, string, string][], status = "SUCCESS"): TransactionNode {
  return {
    digest,
    sender: { address: sender },
    effects: {
      timestamp: "2026-10-09T09:15:02.118Z",
      status,
      balanceChanges: {
        nodes: changes.map(([owner, coinType, amount]) => ({ owner: { address: owner }, coinType: { repr: coinType }, amount })),
      },
    },
  };
}

describe("paymentsFrom", () => {
  it("finds stablecoin money that someone else sent in", () => {
    const nodes = [
      tx("paid", client, [
        [client, USDC, "-600000000"],
        [me, USDC, "600000000"],
        [client, SUI, "-1996880"],
      ]),
      tx("my-own-swap", me, [[me, USDC, "25000000"]]),
      tx("failed", client, [[me, USDC, "1000000"]], "FAILURE"),
      tx("gas-money", client, [[me, SUI, "500000000"]]),
      tx("to-someone-else", client, [[`0x${"33".repeat(32)}`, USDC, "9000000"]]),
    ];
    expect(paymentsFrom(me, nodes)).toEqual([
      { digest: "paid", from: client, amount: 600, coin: "USDC", at: "2026-10-09T09:15:02.118Z" },
    ]);
  });
});

describe("helpers", () => {
  it("adds up stablecoin balances only", () => {
    expect(
      stablecoinBalance([
        { coinType: { repr: USDC }, totalBalance: "4052215" },
        { coinType: { repr: SUI }, totalBalance: "50027746912" },
      ]),
    ).toBeCloseTo(4.052215);
  });

  it("normalises Sui addresses", () => {
    expect(normaliseAddress("0x2")).toBe(`0x${"0".repeat(63)}2`);
    expect(normaliseAddress(`  0X${"AB".repeat(32)} `)).toBe(`0x${"ab".repeat(32)}`);
    expect(normaliseAddress("not an address")).toBeNull();
  });
});
