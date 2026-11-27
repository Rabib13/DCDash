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
};

export type Dataset = {
  asOf: string;
  sources: Record<string, Source>;
  sites: Site[];
};

export type Confidence = "confirmed" | "reported" | "not_disclosed";
