import { z } from "zod";

export const transactionSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format"),
    ticker: z
      .string()
      .min(1, "Ticker is required")
      .transform((v) => v.toUpperCase()),
    action: z.enum(["buy", "sell", "dividend", "fee"]),
    quantity: z.number().min(0, "Quantity cannot be negative"),
    grossAmount: z.number(),
    fees: z.number().min(0, "Fees cannot be negative"),
    portfolio: z.string().min(1, "Portfolio is required"),
    currency: z
      .string()
      .length(3, "Currency must be 3 letters")
      .transform((v) => v.toUpperCase()),
  })
  .refine((data) => data.action === "dividend" || data.grossAmount >= 0, {
    message: "Negative amount only allowed for dividends (withholding tax)",
    path: ["grossAmount"],
  });
