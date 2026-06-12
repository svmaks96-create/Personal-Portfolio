export interface ImportValidationRow {
  rowIndex: number;
  data: {
    date: string;
    ticker: string;
    action: string;
    instrument: string;
    quantity: number;
    grossAmount: number;
    fees: number;
    portfolio: string;
    currency: string;
  };
  status: "valid" | "error" | "duplicate";
  errors?: Array<{ field: string; message: string }>;
  duplicateOf?: {
    source: "existing" | "batch";
    existingId?: number;
    batchRowIndex?: number;
  };
}

export interface ImportSummary {
  total: number;
  valid: number;
  errors: number;
  duplicates: number;
}

export interface ImportValidationResult {
  rows: ImportValidationRow[];
  summary: ImportSummary;
}
