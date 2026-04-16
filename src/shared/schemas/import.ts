import { z } from "zod";
import { transactionBaseFields, addTransactionRefinements } from "./transaction";

/** Maps lowercase Excel column headers to DB field names */
export const COLUMN_MAP: Record<string, string> = {
  date: "date",
  ticker: "ticker",
  action: "action",
  quantity: "quantity",
  "gross amount": "grossAmount",
  fees: "fees",
  portfolio: "portfolio",
  currency: "currency",
};

export const REQUIRED_COLUMNS = Object.keys(COLUMN_MAP);

export const importRowSchema = addTransactionRefinements(
  z.object({
    ...transactionBaseFields,
    grossAmount: z.number().refine((v) => !Number.isNaN(v), "Gross amount must be a valid number"),
    fees: z.number().min(0, "Fees cannot be negative").default(0),
  }),
);
