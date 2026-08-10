import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be yyyy-MM-dd");

/** A user-defined scenario window for the replay panel. */
export const riskScenarioSchema = z
  .object({
    label: z.string().trim().min(1, "Give the window a name").max(60),
    from: isoDate,
    to: isoDate,
  })
  .refine((s) => s.from < s.to, {
    message: "The window must start before it ends",
  });

export type RiskScenarioInput = z.infer<typeof riskScenarioSchema>;
