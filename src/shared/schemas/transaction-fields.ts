export const FIELD_COLUMNS = [
  "date",
  "ticker",
  "action",
  "instrument",
  "quantity",
  "grossAmount",
  "fees",
  "portfolio",
  "currency",
] as const;

export type FieldKey = (typeof FIELD_COLUMNS)[number];

export const COLUMN_LABELS: Record<FieldKey, string> = {
  date: "Date",
  ticker: "Ticker",
  action: "Action",
  instrument: "Instrument",
  quantity: "Quantity",
  grossAmount: "Gross Amount",
  fees: "Fees",
  portfolio: "Portfolio",
  currency: "Currency",
};

export const ACTION_OPTIONS = ["buy", "sell", "dividend", "fee"] as const;

export const INSTRUMENT_OPTIONS = ["stock", "option"] as const;
