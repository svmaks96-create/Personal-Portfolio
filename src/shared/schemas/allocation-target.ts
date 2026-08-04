import { z } from "zod";
import { POLICY_BUCKETS } from "@/shared/policy";

export const ALLOCATION_KINDS = ["ticker", "cash"] as const;
export type AllocationKind = (typeof ALLOCATION_KINDS)[number];

// The select cell sends "none" for unassigned; missing means untouched.
const normalizeBucket = (v: unknown) =>
  v === undefined || v === "" || v === "none" ? null : v;

const tickerAllocationSchema = z.object({
  kind: z.literal("ticker"),
  name: z
    .string()
    .min(1, "Ticker is required")
    .transform((v) => v.toUpperCase()),
  bucket: z.preprocess(normalizeBucket, z.enum(POLICY_BUCKETS).nullable()),
  targetWeight: z
    .number()
    .min(0, "Target weight cannot be negative")
    .max(100, "Target weight cannot exceed 100"),
  cashAmountUsd: z
    .null()
    .refine((v) => v === null, "Cash amount is only valid for cash rows"),
});

const cashAllocationSchema = z.object({
  kind: z.literal("cash"),
  name: z.string().min(1, "Label is required"),
  bucket: z.preprocess(
    normalizeBucket,
    z.null().refine((v) => v === null, "Bucket is only valid for ticker rows"),
  ),
  targetWeight: z
    .number()
    .min(0, "Target weight cannot be negative")
    .max(100, "Target weight cannot exceed 100"),
  cashAmountUsd: z
    .number()
    .min(0, "Cash amount cannot be negative"),
});

export const allocationTargetSchema = z.discriminatedUnion("kind", [
  tickerAllocationSchema,
  cashAllocationSchema,
]);

export type AllocationTargetInput = z.infer<typeof allocationTargetSchema>;

export const UPDATABLE_FIELDS = [
  "name",
  "bucket",
  "targetWeight",
  "cashAmountUsd",
] as const;
export type UpdatableField = (typeof UPDATABLE_FIELDS)[number];

export const cashTargetWeightSchema = z
  .number()
  .min(0, "Target weight cannot be negative")
  .max(100, "Target weight cannot exceed 100");
