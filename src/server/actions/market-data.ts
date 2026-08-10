"use server";

import { revalidatePath } from "next/cache";
import { differenceInDays, format, parseISO } from "date-fns";
import { db } from "@/server/db";
import {
  transactions,
  etfHoldings,
  tickerVariants,
  tickerProfiles,
  tickerFundamentals,
  tickerDividends,
} from "@/server/db/schema";
import { upsertMarketDataRows } from "@/server/db/market-data-writer";
import {
  fetchStockPrices,
  fetchFxRates,
  fetchCompanyProfile,
  fetchEtfHoldings,
  fetchExchangeVariants,
  fetchTickerProfileFull,
  fetchRatiosTtm,
  fetchKeyMetricsTtm,
  fetchForwardEps,
  fetchPriceTargetConsensus,
  fetchRatingSnapshot,
  fetchDividendHistory,
  BENCHMARK_TICKERS,
} from "@/server/services/fmp";
import {
  RISK_PROXY_TICKERS,
  RISK_HISTORY_START,
} from "@/server/services/risk/constants";
import {
  getEarliestTransactionDate,
  getCurrentlyHeldTickers,
  OPTION_MARK_SUFFIX,
} from "@/server/queries/market-data";
import { optionMarkSchema } from "@/shared/schemas/option-mark";
import {
  getEtfHoldingsFetchedAtMap,
  getVariantsFetchedAtMap,
} from "@/server/queries/etf-holdings";
import {
  getTickerProfilesMap,
  getTickerProfileFetchedAtMap,
} from "@/server/queries/ticker-profiles";
import { getTickerFundamentalsFetchedAtMap } from "@/server/queries/ticker-fundamentals";
import { eq, notInArray } from "drizzle-orm";
import type { ActionResult } from "@/server/types/action-result";
import type {
  RefreshResult,
  BackfillResult,
  FmpEodQuote,
} from "@/server/types/market-data";

/**
 * Refresh stock prices for all unique tickers in the transactions table plus
 * benchmark ETFs (SPY, QQQ). Writes every daily row returned by FMP — older
 * dates are preserved in `market_data` so TWRR can chain through them.
 */
export async function refreshPrices(): Promise<ActionResult<RefreshResult>> {
  try {
    // 1. Get unique stock tickers from transactions, union benchmarks
    // (option rows are marked manually, never priced via FMP)
    const rows = db
      .select({ ticker: transactions.ticker })
      .from(transactions)
      .where(eq(transactions.instrument, "stock"))
      .all();
    const heldTickers = new Set(rows.map((r) => r.ticker));
    const allTickers = [
      ...new Set([...heldTickers, ...BENCHMARK_TICKERS, ...RISK_PROXY_TICKERS]),
    ];

    if (allTickers.length === 0) {
      return { success: true, data: { updated: 0, skipped: 0 } };
    }

    // 2. Fetch closing prices via FMP EOD light endpoint (default 7-day window).
    const quotes = await fetchStockPrices(allTickers);

    if (quotes.length === 0) {
      return {
        success: false,
        error: "Unable to fetch stock prices. Please try again.",
      };
    }

    // 3. Write every (symbol, date) returned, upserting on conflict.
    const fetchedAt = new Date().toISOString();
    const symbolsTouched = upsertMarketDataRows(quotes, "stock_price", fetchedAt);

    revalidatePath("/", "layout");

    return {
      success: true,
      data: { updated: symbolsTouched, skipped: allTickers.length - symbolsTouched },
    };
  } catch (error) {
    console.error("refreshPrices failed:", error);
    return {
      success: false,
      error: "Unable to fetch stock prices. Please try again.",
    };
  }
}

/**
 * Refresh FX rates for all unique non-USD currencies in the transactions table.
 * Writes every daily row returned by FMP — older dates are preserved so TWRR
 * can value historical positions in USD.
 */
export async function refreshFxRates(): Promise<ActionResult<RefreshResult>> {
  try {
    // 1. Get unique non-USD currencies from transactions
    const rows = db.select({ currency: transactions.currency }).from(transactions).all();
    const allCurrencies = [...new Set(rows.map((r) => r.currency))].filter(
      (c) => c !== "USD"
    );

    if (allCurrencies.length === 0) {
      return { success: true, data: { updated: 0, skipped: 0 } };
    }

    // 2. Fetch closing FX rates via FMP EOD light endpoint (default 7-day window).
    const fxQuotes = await fetchFxRates(allCurrencies);

    if (fxQuotes.length === 0) {
      return {
        success: false,
        error: "Unable to fetch FX rates. Please try again.",
      };
    }

    // 3. Write every (symbol, date) returned.
    const fetchedAt = new Date().toISOString();
    const symbolsTouched = upsertMarketDataRows(fxQuotes, "fx_rate", fetchedAt);

    revalidatePath("/", "layout");

    return {
      success: true,
      data: { updated: symbolsTouched, skipped: allCurrencies.length - symbolsTouched },
    };
  } catch (error) {
    console.error("refreshFxRates failed:", error);
    return {
      success: false,
      error: "Unable to fetch FX rates. Please try again.",
    };
  }
}

const BACKFILL_CONCURRENCY = 10;

/**
 * Run an async fetcher across `items` with bounded concurrency.
 * Uses Promise.allSettled per chunk so a single failure doesn't drop the rest.
 * Failed items (rejection or empty result) are reported in `failed`.
 */
async function fetchInChunks<T extends string>(
  items: T[],
  fetcher: (item: T) => Promise<FmpEodQuote[]>,
  concurrency: number
): Promise<{ rows: FmpEodQuote[]; failed: T[] }> {
  const allRows: FmpEodQuote[] = [];
  const failed: T[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(chunk.map((item) => fetcher(item)));
    for (let j = 0; j < settled.length; j++) {
      const result = settled[j];
      const item = chunk[j];
      if (result.status === "fulfilled" && result.value.length > 0) {
        allRows.push(...result.value);
      } else {
        failed.push(item);
      }
    }
  }

  return { rows: allRows, failed };
}

/**
 * One-time-use backfill: fetches the full daily price history for every held
 * ticker, the benchmark ETFs (SPY, QQQ), and every non-USD FX pair, starting
 * from the earliest transaction date. Idempotent: re-running upserts the same
 * (symbol, date) rows. Required to power TWRR / benchmark comparison.
 */
export async function backfillHistory(): Promise<ActionResult<BackfillResult>> {
  try {
    const earliestDate = getEarliestTransactionDate();
    if (earliestDate === null) {
      return {
        success: false,
        error: "No transactions found. Import data before backfilling.",
      };
    }

    const txRows = db
      .select({
        ticker: transactions.ticker,
        currency: transactions.currency,
        instrument: transactions.instrument,
      })
      .from(transactions)
      .all();

    // Only stock tickers get FMP price history; FX pairs come from all rows
    // (non-USD option trades still need rates for cost conversion).
    const heldTickers = new Set(
      txRows.filter((r) => r.instrument === "stock").map((r) => r.ticker)
    );
    const tickerSymbols = [
      ...new Set([...heldTickers, ...BENCHMARK_TICKERS, ...RISK_PROXY_TICKERS]),
    ];
    const fxCurrencies = [...new Set(txRows.map((r) => r.currency))].filter(
      (c) => c !== "USD"
    );

    // Prices reach back to the risk-module floor (scenario replay needs
    // pre-ledger history); FX only needs to cover actual transactions.
    const priceFromDate =
      earliestDate < RISK_HISTORY_START ? earliestDate : RISK_HISTORY_START;

    const fetchedAt = new Date().toISOString();

    const stockResult = await fetchInChunks(
      tickerSymbols,
      (ticker) => fetchStockPrices([ticker], priceFromDate),
      BACKFILL_CONCURRENCY
    );

    const fxResult = await fetchInChunks(
      fxCurrencies,
      (currency) => fetchFxRates([currency], earliestDate),
      BACKFILL_CONCURRENCY
    );

    const stockRowsWritten = stockResult.rows.length;
    const fxRowsWritten = fxResult.rows.length;

    upsertMarketDataRows(stockResult.rows, "stock_price", fetchedAt);
    upsertMarketDataRows(fxResult.rows, "fx_rate", fetchedAt);

    revalidatePath("/", "layout");

    const symbolsAttempted = tickerSymbols.length + fxCurrencies.length;
    const symbolsFailed = [
      ...stockResult.failed,
      ...fxResult.failed.map((c) => `${c}USD`),
    ];
    const symbolsSucceeded = symbolsAttempted - symbolsFailed.length;

    return {
      success: true,
      data: {
        symbolsAttempted,
        symbolsSucceeded,
        symbolsFailed,
        rowsWritten: stockRowsWritten + fxRowsWritten,
        earliestDate,
      },
    };
  } catch (error) {
    console.error("backfillHistory failed:", error);
    return {
      success: false,
      error: "Backfill failed. Please try again.",
    };
  }
}

const TICKER_PROFILE_STALENESS_DAYS = 30;
const ETF_HOLDINGS_STALENESS_DAYS = 7;

/**
 * Refresh company-name + isEtf metadata for all unique tickers in transactions.
 * Reads from the `ticker_profiles` table and only calls FMP /profile for tickers
 * whose cached profile is missing or older than TICKER_PROFILE_STALENESS_DAYS.
 * Names and ETF status change very rarely, so the staleness window is long.
 */
export async function refreshTickerProfiles(): Promise<ActionResult<RefreshResult>> {
  try {
    const rows = db
      .select({ ticker: transactions.ticker })
      .from(transactions)
      .where(eq(transactions.instrument, "stock"))
      .all();
    const allTickers = [...new Set(rows.map((r) => r.ticker))];

    if (allTickers.length === 0) {
      return { success: true, data: { updated: 0, skipped: 0 } };
    }

    const now = new Date();
    const fetchedAtMap = getTickerProfileFetchedAtMap(allTickers);

    const staleTickers = allTickers.filter((ticker) => {
      const fetchedAt = fetchedAtMap[ticker];
      if (!fetchedAt) return true;
      return differenceInDays(now, parseISO(fetchedAt)) >= TICKER_PROFILE_STALENESS_DAYS;
    });

    let skipped = allTickers.length - staleTickers.length;

    if (staleTickers.length === 0) {
      return { success: true, data: { updated: 0, skipped } };
    }

    const settled = await Promise.allSettled(
      staleTickers.map((ticker) => fetchCompanyProfile(ticker))
    );

    const successful: { ticker: string; name: string | null; isEtf: boolean }[] = [];
    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      if (result.status === "fulfilled" && result.value !== null) {
        successful.push({
          ticker: staleTickers[i],
          name: result.value.companyName,
          isEtf: result.value.isEtf,
        });
      } else {
        skipped++;
      }
    }

    if (successful.length > 0) {
      const fetchedAtStr = now.toISOString();
      db.transaction((tx) => {
        for (const profile of successful) {
          tx.delete(tickerProfiles).where(eq(tickerProfiles.ticker, profile.ticker)).run();
          tx.insert(tickerProfiles)
            .values({
              ticker: profile.ticker,
              name: profile.name,
              isEtf: profile.isEtf,
              fetchedAt: fetchedAtStr,
            })
            .run();
        }
      });
    }

    revalidatePath("/", "layout");

    return { success: true, data: { updated: successful.length, skipped } };
  } catch (error) {
    console.error("refreshTickerProfiles failed:", error);
    return {
      success: false,
      error: "Unable to fetch ticker profiles. Please try again.",
    };
  }
}

/**
 * Refresh ETF holdings for all ETF tickers in the transactions table.
 * Reads isEtf from the ticker_profiles table, then fetches holdings for
 * stale/missing ETFs. Holdings are considered stale after 7 days.
 */
export async function refreshEtfHoldings(): Promise<ActionResult<RefreshResult>> {
  try {
    // 1. Operate on currently-held tickers only. Holdings/variants for closed
    // positions are never read by concentration/look-through, so we don't store them.
    const heldTickers = getCurrentlyHeldTickers();

    // 2. Split by ETF status from the cached ticker_profiles table. Tickers
    // missing from the cache are skipped — refreshTickerProfiles populates them.
    const profilesMap = getTickerProfilesMap();
    const etfTickers = heldTickers.filter((t) => profilesMap[t]?.isEtf === true);
    const stockTickers = heldTickers.filter((t) => profilesMap[t]?.isEtf === false);

    // 3. Drop rows for ETFs/tickers no longer held — keeps the DB lean.
    db.transaction((tx) => {
      if (etfTickers.length === 0) {
        tx.delete(etfHoldings).run();
      } else {
        tx.delete(etfHoldings)
          .where(notInArray(etfHoldings.etfSymbol, etfTickers))
          .run();
      }
      if (stockTickers.length === 0) {
        tx.delete(tickerVariants).run();
      } else {
        tx.delete(tickerVariants)
          .where(notInArray(tickerVariants.ticker, stockTickers))
          .run();
      }
    });

    const now = new Date();
    const fetchedAtStr = now.toISOString();
    let updated = 0;
    let skipped = 0;

    // 4. Variants: bulk staleness, parallel fetch, single batched transaction.
    const variantsFetchedAtMap = getVariantsFetchedAtMap(stockTickers);
    const staleStockTickers: string[] = [];
    for (const ticker of stockTickers) {
      const fetchedAt = variantsFetchedAtMap[ticker];
      if (!fetchedAt) {
        staleStockTickers.push(ticker);
        continue;
      }
      if (differenceInDays(now, parseISO(fetchedAt)) >= ETF_HOLDINGS_STALENESS_DAYS) {
        staleStockTickers.push(ticker);
      } else {
        skipped++;
      }
    }

    if (staleStockTickers.length > 0) {
      const variantResults = await Promise.allSettled(
        staleStockTickers.map((ticker) => fetchExchangeVariants(ticker))
      );

      const variantWrites: { ticker: string; variants: string[] }[] = [];
      for (let i = 0; i < variantResults.length; i++) {
        const result = variantResults[i];
        if (result.status !== "fulfilled") continue;
        if (result.value.length <= 1) continue; // Only the ticker itself, no variants
        variantWrites.push({
          ticker: staleStockTickers[i],
          variants: result.value.map((v) => v.symbol),
        });
      }

      if (variantWrites.length > 0) {
        db.transaction((tx) => {
          for (const write of variantWrites) {
            tx.delete(tickerVariants).where(eq(tickerVariants.ticker, write.ticker)).run();
            for (const variant of write.variants) {
              tx.insert(tickerVariants)
                .values({ ticker: write.ticker, variant, fetchedAt: fetchedAtStr })
                .onConflictDoNothing()
                .run();
            }
          }
        });
        updated += variantWrites.length;
      }
    }

    // 5. Holdings: bulk staleness, parallel fetch, single batched transaction.
    const holdingsFetchedAtMap = getEtfHoldingsFetchedAtMap(etfTickers);
    const staleEtfTickers: string[] = [];
    for (const etfSymbol of etfTickers) {
      const fetchedAt = holdingsFetchedAtMap[etfSymbol];
      if (!fetchedAt) {
        staleEtfTickers.push(etfSymbol);
        continue;
      }
      if (differenceInDays(now, parseISO(fetchedAt)) >= ETF_HOLDINGS_STALENESS_DAYS) {
        staleEtfTickers.push(etfSymbol);
      } else {
        skipped++;
      }
    }

    if (staleEtfTickers.length > 0) {
      const holdingsResults = await Promise.allSettled(
        staleEtfTickers.map((etfSymbol) => fetchEtfHoldings(etfSymbol))
      );

      const holdingsWrites: {
        etfSymbol: string;
        holdings: { asset: string; weightPercentage: number; name: string }[];
      }[] = [];
      for (let i = 0; i < holdingsResults.length; i++) {
        const result = holdingsResults[i];
        const etfSymbol = staleEtfTickers[i];
        if (result.status !== "fulfilled" || result.value.length === 0) {
          skipped++;
          continue;
        }
        holdingsWrites.push({
          etfSymbol,
          holdings: result.value.map((h) => ({
            asset: h.asset,
            weightPercentage: h.weightPercentage,
            name: h.name,
          })),
        });
      }

      if (holdingsWrites.length > 0) {
        db.transaction((tx) => {
          for (const write of holdingsWrites) {
            tx.delete(etfHoldings).where(eq(etfHoldings.etfSymbol, write.etfSymbol)).run();
            for (const holding of write.holdings) {
              tx.insert(etfHoldings)
                .values({
                  etfSymbol: write.etfSymbol,
                  asset: holding.asset,
                  weightPercentage: holding.weightPercentage,
                  name: holding.name,
                  fetchedAt: fetchedAtStr,
                })
                .run();
            }
          }
        });
        updated += holdingsWrites.length;
      }
    }

    revalidatePath("/", "layout");

    return {
      success: true,
      data: { updated, skipped },
    };
  } catch (error) {
    console.error("refreshEtfHoldings failed:", error);
    return {
      success: false,
      error: "Unable to fetch ETF holdings. Please try again.",
    };
  }
}

const TICKER_FUNDAMENTALS_STALENESS_DAYS = 7;
// Each ticker fans out to ~6 FMP calls. The Ultimate plan allows 3,000
// calls/min and this refresh covers ~60–80 names worst case (~500 calls
// total) — nowhere near the per-minute cap, so run wide.
const FUNDAMENTALS_CONCURRENCY = 16;

/**
 * Run an async mapper across `items` with bounded concurrency. Generic over the
 * result type (unlike `fetchInChunks`, which is hard-typed to FmpEodQuote[]).
 * Returns settled results so one failure doesn't drop the rest of a chunk.
 */
async function mapInChunks<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(chunk.map((item) => fn(item)));
    results.push(...settled);
  }
  return results;
}

/**
 * Refresh company fundamentals (profile, TTM ratios, forward EPS, analyst
 * targets/ratings, dividend schedule) for currently-held STOCK tickers, used by
 * the position detail page's research panels. Staleness-gated on
 * `ticker_fundamentals.fetchedAt` (7 days). Must run AFTER refreshTickerProfiles
 * so the ETF flag is known — ETFs skip EPS/PE/analyst (non-applicable).
 */
export async function refreshTickerFundamentals(): Promise<ActionResult<RefreshResult>> {
  try {
    // All stock tickers ever transacted — including CLOSED positions, whose
    // detail pages still surface fundamentals (unlike ETF holdings, which are
    // only read for currently-held names). Mirrors refreshTickerProfiles.
    const rows = db
      .select({ ticker: transactions.ticker })
      .from(transactions)
      .where(eq(transactions.instrument, "stock"))
      .all();
    const allTickers = [...new Set(rows.map((r) => r.ticker))];
    if (allTickers.length === 0) {
      return { success: true, data: { updated: 0, skipped: 0 } };
    }

    const profilesMap = getTickerProfilesMap();
    const now = new Date();
    const fetchedAtMap = getTickerFundamentalsFetchedAtMap(allTickers);

    const staleTickers = allTickers.filter((ticker) => {
      const fetchedAt = fetchedAtMap[ticker];
      if (!fetchedAt) return true;
      return (
        differenceInDays(now, parseISO(fetchedAt)) >=
        TICKER_FUNDAMENTALS_STALENESS_DAYS
      );
    });

    if (staleTickers.length === 0) {
      return { success: true, data: { updated: 0, skipped: allTickers.length } };
    }

    const todayIso = format(now, "yyyy-MM-dd");
    const fetchedAtStr = now.toISOString();

    const settled = await mapInChunks(
      staleTickers,
      async (ticker) => {
        const isEtf = profilesMap[ticker]?.isEtf === true;
        const skipped = { ok: true as const, data: null };
        // ETFs have no meaningful EPS/PE/analyst coverage — skip those calls.
        // Fundamentals refresh treats transport failure like absent data (the
        // ok:false → null collapse below) — staleness retry covers it later.
        const [profile, ratiosR, keyMetricsR, fwdEpsR, target, rating, dividends] =
          await Promise.all([
            fetchTickerProfileFull(ticker),
            isEtf ? skipped : fetchRatiosTtm(ticker),
            isEtf ? skipped : fetchKeyMetricsTtm(ticker),
            isEtf ? skipped : fetchForwardEps(ticker, todayIso),
            isEtf ? Promise.resolve(null) : fetchPriceTargetConsensus(ticker),
            isEtf ? Promise.resolve(null) : fetchRatingSnapshot(ticker),
            fetchDividendHistory(ticker),
          ]);
        const ratios = ratiosR.ok ? ratiosR.data : null;
        const roeTtm = keyMetricsR.ok ? (keyMetricsR.data?.roeTtm ?? null) : null;
        const fwdEps = fwdEpsR.ok ? fwdEpsR.data : null;

        // Nothing usable → signal failure so the existing row isn't wiped.
        if (profile === null && ratios === null && dividends.length === 0) {
          return { ticker, ok: false as const };
        }

        const price = profile?.price ?? null;
        const fwdPe =
          price !== null && price > 0 && fwdEps !== null && fwdEps.ntmEpsAvg > 0
            ? price / fwdEps.ntmEpsAvg
            : null;
        // ETFs skip ratios-ttm; derive their yield from the trailing dividend
        // and profile price (fraction, matching divYieldTtm semantics).
        const divYieldTtm =
          ratios?.divYieldTtm ??
          (price !== null && price > 0 && profile?.lastDividend != null
            ? profile.lastDividend / price
            : null);

        const fundamentalsRow = {
          ticker,
          exchange: profile?.exchange ?? null,
          exchangeFullName: profile?.exchangeFullName ?? null,
          sector: profile?.sector ?? null,
          industry: profile?.industry ?? null,
          country: profile?.country ?? null,
          ceo: profile?.ceo ?? null,
          employees: profile?.employees ?? null,
          ipoDate: profile?.ipoDate ?? null,
          description: profile?.description ?? null,
          website: profile?.website ?? null,
          currency: profile?.currency ?? null,
          price,
          marketCap: profile?.marketCap ?? null,
          beta: profile?.beta ?? null,
          range52wLow: profile?.range52wLow ?? null,
          range52wHigh: profile?.range52wHigh ?? null,
          lastDividend: profile?.lastDividend ?? null,
          peTtm: ratios?.peTtm ?? null,
          epsTtm: ratios?.epsTtm ?? null,
          fwdPe,
          divYieldTtm,
          psTtm: ratios?.psTtm ?? null,
          pbTtm: ratios?.pbTtm ?? null,
          pfcfTtm: ratios?.pfcfTtm ?? null,
          evEbitdaTtm: ratios?.evEbitdaTtm ?? null,
          netMarginTtm: ratios?.netMarginTtm ?? null,
          roeTtm,
          debtToEquityTtm: ratios?.debtToEquityTtm ?? null,
          priceTargetHigh: target?.targetHigh ?? null,
          priceTargetLow: target?.targetLow ?? null,
          priceTargetMedian: target?.targetMedian ?? null,
          priceTargetConsensus: target?.targetConsensus ?? null,
          analystRating: rating?.rating ?? null,
          analystScore: rating?.overallScore ?? null,
          fetchedAt: fetchedAtStr,
        };

        const dividendRows = dividends.map((d) => ({
          ticker,
          exDate: d.exDate,
          paymentDate: d.paymentDate,
          dividend: d.dividend,
          yield: d.yield,
          frequency: d.frequency,
          fetchedAt: fetchedAtStr,
        }));

        return { ticker, ok: true as const, fundamentalsRow, dividendRows };
      },
      FUNDAMENTALS_CONCURRENCY
    );

    const writes = settled.flatMap((s) =>
      s.status === "fulfilled" && s.value.ok ? [s.value] : [],
    );

    if (writes.length > 0) {
      db.transaction((tx) => {
        for (const w of writes) {
          tx.delete(tickerFundamentals)
            .where(eq(tickerFundamentals.ticker, w.ticker))
            .run();
          tx.insert(tickerFundamentals).values(w.fundamentalsRow).run();

          tx.delete(tickerDividends)
            .where(eq(tickerDividends.ticker, w.ticker))
            .run();
          for (const row of w.dividendRows) {
            tx.insert(tickerDividends).values(row).run();
          }
        }
      });
    }

    revalidatePath("/", "layout");

    return {
      success: true,
      data: {
        updated: writes.length,
        skipped: allTickers.length - writes.length,
      },
    };
  } catch (error) {
    console.error("refreshTickerFundamentals failed:", error);
    return {
      success: false,
      error: "Unable to fetch ticker fundamentals. Please try again.",
    };
  }
}

/**
 * Set the current total USD value (mark) of an open option position.
 * Stored as a dated `market_data` row (symbol "<TICKER>:OPT", type
 * "option_mark"). Position valuation uses the latest mark only when it
 * postdates the last option trade on the underlying; older marks are
 * ignored and the position is carried at cost.
 */
export async function setOptionMark(
  ticker: string,
  value: number
): Promise<ActionResult> {
  const parsed = optionMarkSchema.safeParse({ ticker, value });
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid mark",
    };
  }

  try {
    const today = format(new Date(), "yyyy-MM-dd");
    upsertMarketDataRows(
      [
        {
          symbol: `${parsed.data.ticker}${OPTION_MARK_SUFFIX}`,
          date: today,
          price: parsed.data.value,
          volume: 0,
        },
      ],
      "option_mark",
      new Date().toISOString()
    );

    revalidatePath("/", "layout");

    return { success: true, data: undefined };
  } catch (error) {
    console.error("setOptionMark failed:", error);
    return {
      success: false,
      error: "Failed to save option mark. Please try again.",
    };
  }
}
