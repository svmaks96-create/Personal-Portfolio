import { z } from "zod";

/**
 * A user-assigned cluster label. An empty name clears the stored label for
 * that member set.
 */
export const riskClusterNameSchema = z.object({
  name: z.string().trim().max(60, "Keep cluster names under 60 characters"),
  members: z.array(z.string().trim().min(1)).min(1),
});

export type RiskClusterNameInput = z.infer<typeof riskClusterNameSchema>;
