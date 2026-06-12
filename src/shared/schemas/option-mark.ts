import { z } from "zod";

/** Input for setting the current total USD value of an open option position */
export const optionMarkSchema = z.object({
  ticker: z
    .string()
    .min(1, "Ticker is required")
    .transform((v) => v.toUpperCase()),
  value: z.number().positive("Mark must be a positive value"),
});
