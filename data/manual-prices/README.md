# Manual UAE Price Backfill

FMP doesn't cover several UAE tickers in this portfolio (DTC, TALABAT, ALEFEDT,
ALPHADATA, NMDCENR) and uses a different symbol format for the two it does
(`PARKIN.AE`, `SPINNEYS.AE`). Rather than special-case the symbol mapping, we
ingest manual prices for all seven UAE tickers from the closing brokerage
statements.

All seven positions are closed (net shares = 0), so this is a one-time backfill.

## Files

- `uae-prices-template.csv` — generated template, one row per `(ticker, UAE
  trading day)` for each ticker's holding period. `price_usd` column blank for
  you to fill.
- `uae-prices.csv` — your filled-in copy. Drop it here when ready.

## Filling the template

- **Symbol** stays as the existing DB ticker (`DFM:PARKIN`, `ADX:ALEFEDT`,
  etc.) — don't rename.
- **Date** is in `yyyy-MM-dd`. UAE markets trade Sun–Thu, so weekends (Fri/Sat)
  are not in the template.
- **price_usd** is the closing price **converted to USD**. AED is pegged at
  3.6725 to 1 USD (since 1997), so `price_usd = price_aed / 3.6725`. Your
  brokerage statements may already show USD — if so, use that directly.
- Leave rows blank if you don't have data — the TWRR engine forward-fills from
  the most recent populated row, so weekly closes are sufficient (just slightly
  blockier on the chart).

## Importing

Once filled, save as `uae-prices.csv` in this folder and run:

```bash
npm run import:manual-prices
```

The script (to be added) will upsert into `market_data` with `type =
"stock_price"` and trigger a dashboard revalidation. After that, TWRR will
include these positions in the chart.

## Row counts (for reference)

| Ticker          | First tx     | Last tx      | Rows |
| --------------- | ------------ | ------------ | ---- |
| DFM:DTC         | 2023-11-21   | 2025-11-26   | 527  |
| DFM:PARKIN      | 2024-03-05   | 2025-11-26   | 452  |
| DFM:SPINNEYS    | 2024-04-23   | 2025-11-26   | 417  |
| DFM:TALABAT     | 2024-11-19   | 2025-11-26   | 267  |
| ADX:ALPHADATA   | 2025-02-20   | 2025-11-26   | 200  |
| ADX:NMDCENR     | 2024-08-30   | 2025-02-28   | 130  |
| ADX:ALEFEDT     | 2024-05-28   | 2024-11-14   | 123  |
| **Total**       |              |              | **2,116** |
