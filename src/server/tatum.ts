// Everything Tideover reads from the chain comes through Tatum:
//   - Sui mainnet via Tatum's Sui GraphQL gateway (Sui's JSON-RPC is deprecated)
//   - the dollar-to-naira rate via Tatum's Data API
// Server-side only: the API key never reaches the browser.

import type { Payment } from "@/lib/types";

const GRAPHQL_URL = process.env.TATUM_SUI_GRAPHQL_URL ?? "https://sui-mainnet.gateway.tatum.io/graphql";
const RATE_URL = "https://api.tatum.io/v4/data/rate/symbol";

/** Stablecoins Tideover counts as income, by Sui coin type. */
export const STABLECOINS: Record<string, { coin: Payment["coin"]; decimals: number }> = {
  "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC": {
    coin: "USDC",
    decimals: 6,
  },
  "0x375f70cf2ae4c00bf37117d0c85a2c71545e6ee05c4a5c7d282cd66a4504b068::usdt::USDT": {
    coin: "USDT",
    decimals: 6,
  },
};

const PAGE_SIZE = 50;
const MAX_PAGES = 4;

export class TatumError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

function headers(): HeadersInit {
  const key = process.env.TATUM_API_KEY;
  return { "content-type": "application/json", ...(key ? { "x-api-key": key } : {}) };
}

export async function suiGraphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new TatumError(body?.message ?? `Tatum Sui gateway answered ${res.status}`, res.status);
  }
  if (body?.errors?.length) throw new TatumError(body.errors[0].message);
  return body.data as T;
}

/** Normalise an address to the 0x + 64 hex form Sui uses. */
export function normaliseAddress(address: string): string | null {
  const hex = address.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{1,64}$/.test(hex)) return null;
  return `0x${hex.padStart(64, "0")}`;
}

const RESOLVE_NAME = /* GraphQL */ `
  query ResolveName($name: String!) {
    nameRecord(name: $name) {
      target { address }
    }
  }
`;

/** Accept a Sui address or a SuiNS name such as "ada.sui". */
export async function resolveWallet(input: string): Promise<string | null> {
  const trimmed = input.trim().toLowerCase();
  if (trimmed.endsWith(".sui") || trimmed.startsWith("@")) {
    const data = await suiGraphql<{ nameRecord: { target: { address: string } | null } | null }>(
      RESOLVE_NAME,
      { name: trimmed },
    );
    return data.nameRecord?.target?.address ?? null;
  }
  return normaliseAddress(trimmed);
}

interface BalanceChangeNode {
  owner: { address: string } | null;
  coinType: { repr: string };
  amount: string;
}

export interface TransactionNode {
  digest: string;
  sender: { address: string } | null;
  effects: {
    timestamp: string | null;
    status: string;
    balanceChanges: { nodes: BalanceChangeNode[] };
  } | null;
}

interface WalletPage {
  address: {
    defaultNameRecord: { domain: string } | null;
    balances: { nodes: { coinType: { repr: string }; totalBalance: string }[] };
    transactions: {
      pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
      nodes: TransactionNode[];
    };
  } | null;
}

const WALLET_PAGE = /* GraphQL */ `
  query WalletPage($address: SuiAddress!, $last: Int!, $before: String) {
    address(address: $address) {
      defaultNameRecord { domain }
      balances { nodes { coinType { repr } totalBalance } }
      transactions(last: $last, before: $before, relation: AFFECTED) {
        pageInfo { hasPreviousPage startCursor }
        nodes {
          digest
          sender { address }
          effects {
            timestamp
            status
            balanceChanges { nodes { owner { address } coinType { repr } amount } }
          }
        }
      }
    }
  }
`;

/**
 * Stablecoin payments into `address` from someone else, found in each
 * transaction's balance changes. Pure, so it can be tested on recorded data.
 */
export function paymentsFrom(address: string, nodes: TransactionNode[]): Payment[] {
  const payments: Payment[] = [];
  for (const tx of nodes) {
    const sender = tx.sender?.address;
    if (!sender || sender === address) continue;
    if (!tx.effects || tx.effects.status !== "SUCCESS" || !tx.effects.timestamp) continue;
    for (const change of tx.effects.balanceChanges.nodes) {
      const coin = STABLECOINS[change.coinType.repr];
      if (!coin || change.owner?.address !== address) continue;
      const raw = BigInt(change.amount);
      if (raw <= BigInt(0)) continue;
      payments.push({
        digest: tx.digest,
        from: sender,
        amount: Number(raw) / 10 ** coin.decimals,
        coin: coin.coin,
        at: tx.effects.timestamp,
      });
    }
  }
  return payments.sort((a, b) => a.at.localeCompare(b.at));
}

export function stablecoinBalance(nodes: { coinType: { repr: string }; totalBalance: string }[]): number {
  return nodes.reduce((sum, b) => {
    const coin = STABLECOINS[b.coinType.repr];
    return coin ? sum + Number(BigInt(b.totalBalance)) / 10 ** coin.decimals : sum;
  }, 0);
}

export interface WalletSnapshot {
  address: string;
  name: string | null;
  balanceUsd: number;
  payments: Payment[];
  /** SuiNS names of the people who paid, where they have one. */
  payerNames: Record<string, string>;
  /** How many recent transactions were scanned. */
  scanned: number;
}

const PAYER_NAMES = /* GraphQL */ `
  query PayerNames($keys: [AddressKey!]!) {
    multiGetAddresses(keys: $keys) {
      address
      defaultNameRecord { domain }
    }
  }
`;

async function payerNames(addresses: string[]): Promise<Record<string, string>> {
  if (addresses.length === 0) return {};
  const data = await suiGraphql<{
    multiGetAddresses: ({ address: string; defaultNameRecord: { domain: string } | null } | null)[];
  }>(PAYER_NAMES, { keys: addresses.slice(0, 50).map((address) => ({ address })) });
  const names: Record<string, string> = {};
  for (const a of data.multiGetAddresses) {
    if (a?.defaultNameRecord?.domain) names[a.address] = a.defaultNameRecord.domain;
  }
  return names;
}

/** Read a wallet's stablecoin balance and incoming payments through Tatum. */
export async function readWallet(address: string): Promise<WalletSnapshot> {
  const nodes: TransactionNode[] = [];
  let before: string | null = null;
  let name: string | null = null;
  let balanceUsd = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const data: WalletPage = await suiGraphql<WalletPage>(WALLET_PAGE, {
      address,
      last: PAGE_SIZE,
      before,
    });
    if (!data.address) break;
    if (page === 0) {
      name = data.address.defaultNameRecord?.domain ?? null;
      balanceUsd = stablecoinBalance(data.address.balances.nodes);
    }
    nodes.push(...data.address.transactions.nodes);
    const info = data.address.transactions.pageInfo;
    if (!info.hasPreviousPage || !info.startCursor) break;
    before = info.startCursor;
  }

  const payments = paymentsFrom(address, nodes);
  const senders = [...new Set(payments.map((p) => p.from))];
  const names = await payerNames(senders).catch(() => ({}));
  return { address, name, balanceUsd, payments, payerNames: names, scanned: nodes.length };
}

export interface Rate {
  ngnPerUsd: number;
  at: string;
  source: string;
}

/** Naira per US dollar, priced as USDC, from Tatum's Data API. */
export async function readRate(): Promise<Rate> {
  const key = process.env.TATUM_API_KEY;
  if (!key) throw new TatumError("TATUM_API_KEY is not set", 401);
  const res = await fetch(`${RATE_URL}?symbol=USDC&basePair=NGN`, {
    headers: { "x-api-key": key },
    next: { revalidate: 900 },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.value) {
    throw new TatumError(body?.message ?? `Tatum rate API answered ${res.status}`, res.status);
  }
  return {
    ngnPerUsd: Number(body.value),
    at: new Date(Number(body.timestamp) || Date.now()).toISOString(),
    source: `Tatum Data API${body.source ? ` (${body.source})` : ""}`,
  };
}
