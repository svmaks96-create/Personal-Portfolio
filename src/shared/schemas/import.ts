import { z } from "zod";

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

export const importRowSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format"),
    ticker: z
      .string()
      .min(1, "Ticker is required")
      .transform((v) => v.toUpperCase()),
    action: z.enum(["buy", "sell", "dividend", "fee"]),
    quantity: z.number().min(0, "Quantity cannot be negative"),
    grossAmount: z.number(),
    fees: z.number().min(0, "Fees cannot be negative").default(0),
    portfolio: z.string().min(1, "Portfolio is required"),
    currency: z
      .string()
      .length(3, "Currency must be 3 letters")
      .transform((v) => v.toUpperCase()),
  })
  .refine((data) => data.action === "dividend" || data.grossAmount >= 0, {
    message: "Negative amount only allowed for dividends (withholding tax)",
    path: ["grossAmount"],
  })
  .refine(
    (data) => !["buy", "sell"].includes(data.action) || data.quantity > 0,
    { message: "Quantity must be greater than zero for buy/sell", path: ["quantity"] },
  );
