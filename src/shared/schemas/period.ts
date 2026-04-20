import { z } from "zod";

export const PERIODS = ["1W", "1M", "YTD", "1Y", "ITD"] as const;

export type Period = (typeof PERIODS)[number];

export const periodSchema = z.enum(PERIODS);
