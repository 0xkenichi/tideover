/** A stablecoin payment that landed in the watched wallet. */
export interface Payment {
  /** Sui transaction digest (sample payments use a "sample-" prefix). */
  digest: string;
  /** Sender address: who paid. */
  from: string;
  /** Amount in dollars (USDC and USDT are counted 1:1). */
  amount: number;
  coin: "USDC" | "USDT";
  /** ISO timestamp from the checkpoint. */
  at: string;
}

/** Something the user told Tideover. The latest teaching for each key wins. */
export type Teaching =
  | { kind: "name"; payer: string; name: string }
  | { kind: "promise"; payer: string; day: number | null }
  | { kind: "not-income"; payer: string; value: boolean }
  | { kind: "cost"; id: string; name: string; amountNgn: number; day: number }
  | { kind: "cost-removed"; id: string };

/** Tideover's prediction of a payer's next payment, kept so it can be graded later. */
export interface Forecast {
  payer: string;
  /** Calendar days in Lagos time, YYYY-MM-DD. */
  expected: string;
  earliest: string;
  latest: string;
  amount: number;
  /** The day the payer promised, when the user taught one. */
  promised?: string;
  basis: "promise" | "cadence";
  /** How many paydays the forecast was based on. */
  samples: number;
}

/** The records Tideover keeps in Walrus Memory. */
export type MemoryRecord =
  | { type: "taught"; id: string; at: string; teaching: Teaching }
  | { type: "forecast"; id: string; at: string; forecast: Forecast }
  | {
      type: "graded";
      id: string;
      at: string;
      payer: string;
      digest: string;
      expected: string;
      actual: string;
      errorDays: number;
      promised?: string;
      promiseErrorDays?: number;
      /** True when the forecast was reconstructed from history rather than remembered. */
      backtest: boolean;
    }
  | {
      type: "lesson";
      id: string;
      at: string;
      payer: string;
      digest: string;
      lesson:
        | { kind: "regular-promise"; lateness: number; samples: number }
        | { kind: "regular-cadence"; cadenceDays: number; samples: number }
        | { kind: "lateness"; from: number; to: number; samples: number }
        | { kind: "cadence"; from: number; to: number; samples: number };
    };

/** A record as stored: the record plus where Walrus keeps it. */
export interface StoredMemory {
  record: MemoryRecord;
  /** Walrus blob ID, or null while the write is pending or when memory is off. */
  blobId: string | null;
  createdAt?: string;
}

export interface Cost {
  id: string;
  name: string;
  amountNgn: number;
  day: number;
}

export interface Payday {
  day: string;
  amount: number;
  digests: string[];
}

export interface PayerModel {
  address: string;
  name?: string;
  ignored: boolean;
  promiseDay?: number;
  paydays: Payday[];
  total: number;
  /** Days after the promised day, per payday (promise mode only). */
  lateness: number[];
  typicalLateness?: number;
  cadenceDays?: number;
  forecast?: Forecast;
  status: "regular" | "learning" | "ignored";
}
