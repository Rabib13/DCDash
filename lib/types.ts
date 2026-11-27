export type Stage =
  | "announced"
  | "proposed"
  | "in_review"
  | "approved"
  | "under_construction"
  | "built_not_energized"
  | "built"
  | "operating";

export type Source = {
  title: string;
  publisher: string;
  url: string;
  published?: string;
  accessed: string;
};

export type Fact = {
  value: string | number;
  /** The high end when a source gives a range, like 19 to 21. `value` holds the low end. */
  upTo?: number;
  /** Keys into the dataset's `sources` map. Every fact needs at least one. */
  sources: string[];
  /** Exact words from the source, when the value is a paraphrase or a number. */
  quote?: string;
  note?: string;
};

export type Site = {
  id: string;
  name: string;
  city: string;
  /** Null until a source gives an address. The map then shows the city center, marked approximate. */
  location: { lat: number | null; lon: number | null; precision: "address" | "city" };
  stage: Stage;
  /** Needs `ai_use`, or `capacity_mw` over 20. See scripts/check-data.mjs. */
  facts: Record<string, Fact>;
  documents?: SiteDocument[];
};

/** A public document about a site, such as a permit, filing or environmental report. */
export type SiteDocument = {
  title: string;
  kind: "permit" | "environmental_review" | "filing" | "other";
  url: string;
  sources: string[];
};

export type Operator = {
  /** Shown instead of jobs when the operator's job board can't be linked, e.g. it is down. */
  careersNote?: string;
  /** The operator's own careers page or job board. */
  careers?: { url: string; sources: string[] };
};

export type Dataset = {
  asOf: string;
  sources: Record<string, Source>;
  /** Keyed by the exact value of a site's `operator` fact. */
  operators: Record<string, Operator>;
  sites: Site[];
};

export type Confidence = "confirmed" | "reported" | "not_disclosed";
