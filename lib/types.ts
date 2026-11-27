export type Stage =
  | "announced"
  | "proposed"
  | "in_review"
  | "approved"
  | "under_construction"
  | "built_not_energized"
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
  facts: Record<string, Fact> & { ai_use: Fact };
  documents?: SiteDocument[];
};

/** A public document about a site, such as a permit, filing or environmental report. */
export type SiteDocument = {
  title: string;
  kind: "permit" | "environmental_review" | "filing" | "other";
  url: string;
  sources: string[];
};

/** A job posting copied from the operator's own job board on the `checked` date. */
export type JobOpening = {
  title: string;
  location: string;
  team?: string;
  url: string;
};

export type Operator = {
  /** The operator's own careers page or job board. */
  careers?: { url: string; sources: string[] };
  /** Snapshot of openings read from the careers page. Always link out for the live list. */
  openings?: { checked: string; sources: string[]; items: JobOpening[] };
};

export type Dataset = {
  asOf: string;
  sources: Record<string, Source>;
  /** Keyed by the exact value of a site's `operator` fact. */
  operators: Record<string, Operator>;
  sites: Site[];
};

export type Confidence = "confirmed" | "reported" | "not_disclosed";
