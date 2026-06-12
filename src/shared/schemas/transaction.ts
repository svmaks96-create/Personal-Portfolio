import { z } from "zod";

/** Shared field definitions reused by both transaction and import schemas */
export const transactionBaseFields = {
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format"),
  ticker: z
    .string()
    .min(1, "Ticker is required")
    .transform((v) => v.toUpperCase()),
  action: z.enum(["buy", "sell", "dividend", "fee"]),
  instrument: z.enum(["stock", "option"]).default("stock"),
  quantity: z.number().min(0, "Quantity cannot be negative"),
  grossAmount: z.number(),
  fees: z.number().min(0, "Fees cannot be negative"),
  portfolio: z.string().min(1, "Portfolio is required"),
  currency: z
    .string()
    .length(3, "Currency must be 3 letters")
    .transform((v) => v.toUpperCase()),
};

/** Shared refinements applied to both transaction and import schemas */
export function addTransactionRefinements<
  T extends z.ZodType<{
    action: string;
    instrument: string;
    grossAmount: number;
    quantity: number;
  }>,
>(schema: T) {
  return schema
    .refine((data) => data.action === "dividend" || data.grossAmount >= 0, {
      message: "Negative amount only allowed for dividends (withholding tax)",
      path: ["grossAmount"],
    })
    .refine(
      (data) => !["buy", "sell"].includes(data.action) || data.quantity > 0,
      { message: "Quantity must be greater than zero for buy/sell", path: ["quantity"] },
    )
    .refine(
      (data) => data.instrument !== "option" || ["buy", "sell"].includes(data.action),
      { message: "Options only support buy/sell actions", path: ["instrument"] },
    );
}

export const transactionSchema = addTransactionRefinements(
  z.object(transactionBaseFields),
);
