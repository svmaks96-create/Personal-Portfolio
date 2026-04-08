# Story 5.1: Excel Template Download & File Upload with Validation

Status: done

## Story

As a user,
I want to download an Excel template, fill it with my transaction history, and upload it for automated validation,
So that I can import my data with confidence that errors are caught before anything enters the system.

## Acceptance Criteria

1. **Given** I navigate to the Import page **When** I look at Step 1 (Upload) **Then** I see a "Download Template" link/button and a file upload area with drag-and-drop zone and file picker **And** the upload area accepts `.xlsx` files only (UX-DR10 Step 1)

2. **Given** I click "Download Template" **When** the download completes **Then** I receive an Excel file (`template.xlsx`) with columns: Date, Ticker, Action, Quantity, Gross Amount, Fees, Portfolio, Currency **And** the template includes column headers with the expected format documented (FR20)

3. **Given** I upload a completed Excel file (via drag-and-drop or file picker) **When** the file is submitted **Then** the file is uploaded as FormData to the `validateImport` Server Action **And** the server parses the file using ExcelJS (server-side only) **And** every row is validated with Zod for: required fields present, correct data types, valid action type (buy/sell/dividend/fee) (FR21, FR22)

4. **Given** the validation processes rows **When** applying validation rules **Then** rows are processed in chronological order by date before applying sell-more-than-held checks (FR28) **And** negative values for quantity and gross amount are rejected on buy, sell, and fee transactions **And** negative amounts are permitted only for dividend action types (representing withholding tax) (FR29)

5. **Given** the validation completes **When** the Server Action returns results **Then** each row has a status: valid, error, or duplicate **And** the import wizard advances to Step 2 (Validation) if errors exist, or Step 3 (Duplicates) if no errors but duplicates exist, or Step 4 (Confirm) if all rows are clean

## Tasks / Subtasks

- [x] Task 1: Create Excel template file (AC: #2)
  - [x] 1.1 Create `scripts/` directory (does not exist yet) and `scripts/generate-template.ts` using ExcelJS
  - [x] 1.2 Generate `public/template.xlsx` with correct columns, format hints, and data validations
  - [x] 1.3 Add `generate:template` script to package.json, run it, commit the generated template

- [x] Task 2: Create import validation schema and types (AC: #3, #4)
  - [x] 2.1 Create `src/shared/schemas/import.ts` with `importRowSchema` (reuses transactionSchema field rules)
  - [x] 2.2 Create `src/server/types/import.ts` with `ImportValidationRow`, `ImportValidationResult`, `ImportSummary` types

- [x] Task 3: Create `validateImport` Server Action (AC: #3, #4, #5)
  - [x] 3.1 Create `src/server/actions/import.ts` with `validateImport(formData: FormData)`
  - [x] 3.2 Parse Excel file with ExcelJS, map column headers to DB field names
  - [x] 3.3 Per-row Zod validation with the import schema
  - [x] 3.4 Sort rows chronologically, run sell-more-than-held checks with running position tracking
  - [x] 3.5 Duplicate detection against existing DB transactions and within batch
  - [x] 3.6 Return `ActionResult<ImportValidationResult>` with per-row statuses

- [x] Task 4: Create ImportWizard client component (AC: #1, #5)
  - [x] 4.1 Create `src/components/domain/import-wizard.tsx` with `useReducer`
  - [x] 4.2 Implement Step 1 UI: download template button + drag-and-drop upload zone + file picker
  - [x] 4.3 Implement file upload handler calling `validateImport` server action
  - [x] 4.4 Implement wizard step routing based on validation results
  - [x] 4.5 Render placeholder content for Steps 2, 3, 4 (implemented in stories 5.2, 5.3)

- [x] Task 5: Update import page (AC: #1)
  - [x] 5.1 Replace placeholder in `src/app/import/page.tsx` with ImportWizard

- [x] Task 6: Write tests (AC: all)
  - [x] 6.1 Create `src/shared/schemas/import.test.ts` — import row schema validation tests
  - [x] 6.2 Create `src/server/actions/import.test.ts` — validateImport action tests

- [x] Task 7: Lint and test (AC: all)
  - [x] 7.1 Run `npm run lint` — zero errors
  - [x] 7.2 Run `npm run test:run` — all tests pass (existing + new)

## Dev Notes

### Architecture & Data Flow

This story introduces the **import read path** — a server action that validates data without writing to DB. Unlike standard write-path actions (which return `ActionResult<void>` and rely on revalidation for fresh data), `validateImport` returns rich validation results directly because no mutation occurs yet. `commitImport` (Story 5.3) follows the standard write pattern.

```
IMPORT VALIDATION PATH:
User selects file → ImportWizard (client) creates FormData
  → validateImport Server Action (no 'use server' DB write)
  → ExcelJS parse → Column mapping → Per-row Zod validation
  → Chronological sort → Sell-more-than-held checks
  → Duplicate detection (vs DB + within batch)
  → Return ActionResult<ImportValidationResult>
  → ImportWizard routes to correct step based on results
```

Key distinction: `validateImport` does NOT call `revalidatePath` — it's a validation-only action. `commitImport` (Story 5.3) calls `revalidatePath('/', 'layout')` after writing.

### Column Name Mapping (CRITICAL)

The data model was refactored from price-per-share to gross amount (commit `0d14974`). The original PRD FR20 says "price" but the DB field is `grossAmount`. The Excel template must use "Gross Amount" as the column header.

| Template Column | DB Field | Type | Notes |
|----------------|----------|------|-------|
| Date | `date` | text | YYYY-MM-DD |
| Ticker | `ticker` | text | Uppercased by Zod |
| Action | `action` | text | buy/sell/dividend/fee |
| Quantity | `quantity` | real | Shares or units |
| Gross Amount | `grossAmount` | real | Total transaction amount (NOT per-share price) |
| Fees | `fees` | real | Default 0 |
| Portfolio | `portfolio` | text | Broker/account name |
| Currency | `currency` | text | 3-letter code, uppercased |

The parser must map "Gross Amount" → `grossAmount` (handle space in column name). Case-insensitive header matching is recommended for robustness.

**Drizzle column mapping note**: In the DB schema, `grossAmount` is defined as `real("gross_amount")` — camelCase in TypeScript, snake_case in the database. Drizzle handles this mapping automatically. When inserting rows (Story 5.3's `commitImport`), use the camelCase field names in `.values({})` objects.

### Excel Template (`public/template.xlsx`)

Create a generation script `scripts/generate-template.ts` using ExcelJS (already installed: `^4.4.0`):

```typescript
import ExcelJS from "exceljs";

const workbook = new ExcelJS.Workbook();
const sheet = workbook.addWorksheet("Transactions");

sheet.columns = [
  { header: "Date", key: "date", width: 14 },
  { header: "Ticker", key: "ticker", width: 12 },
  { header: "Action", key: "action", width: 12 },
  { header: "Quantity", key: "quantity", width: 12 },
  { header: "Gross Amount", key: "grossAmount", width: 16 },
  { header: "Fees", key: "fees", width: 10 },
  { header: "Portfolio", key: "portfolio", width: 22 },
  { header: "Currency", key: "currency", width: 10 },
];

// Style header row
const headerRow = sheet.getRow(1);
headerRow.font = { bold: true };
headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F4F5" } };

// Data validation for Action column
sheet.getColumn("action").eachCell({ includeEmpty: false }, (cell, rowNumber) => {
  if (rowNumber > 1) {
    cell.dataValidation = {
      type: "list",
      formulae: ['"buy,sell,dividend,fee"'],
      showErrorMessage: true,
      errorTitle: "Invalid Action",
      error: "Must be buy, sell, dividend, or fee",
    };
  }
});

// Add a comment/note row or freeze panes for UX
sheet.views = [{ state: "frozen", ySplit: 1 }];

await workbook.xlsx.writeFile("public/template.xlsx");
```

Add to `package.json`:
```json
"generate:template": "tsx scripts/generate-template.ts"
```

Run once to create the file, then commit `public/template.xlsx`. The download link is simply `<a href="/template.xlsx" download>`.

### Import Validation Schema (`src/shared/schemas/import.ts`)

Reuse field-level rules from the existing `transactionSchema` in `src/shared/schemas/transaction.ts`. The import schema validates a single parsed row:

```typescript
import { z } from "zod";

// Column header to DB field mapping
export const COLUMN_MAP: Record<string, string> = {
  "date": "date",
  "ticker": "ticker",
  "action": "action",
  "quantity": "quantity",
  "gross amount": "grossAmount",
  "fees": "fees",
  "portfolio": "portfolio",
  "currency": "currency",
};

export const importRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format"),
  ticker: z.string().min(1, "Ticker is required").transform(v => v.toUpperCase()),
  action: z.enum(["buy", "sell", "dividend", "fee"]),
  quantity: z.number().min(0, "Quantity cannot be negative"),
  grossAmount: z.number(),
  fees: z.number().min(0, "Fees cannot be negative").default(0),
  portfolio: z.string().min(1, "Portfolio is required"),
  currency: z.string().length(3, "Currency must be 3 letters").transform(v => v.toUpperCase()),
}).refine(
  (data) => data.action === "dividend" || data.grossAmount >= 0,
  { message: "Negative amount only allowed for dividends (withholding tax)", path: ["grossAmount"] }
).refine(
  (data) => !["buy", "sell"].includes(data.action) || data.quantity > 0,
  { message: "Quantity must be greater than 0 for buy/sell", path: ["quantity"] }
);
```

This mirrors the existing `transactionSchema` rules exactly — both enforce FR29 cross-field refinements. The import schema adds `.default(0)` on fees since the user may leave it blank in Excel.

### Import Types (`src/server/types/import.ts`)

```typescript
export interface ImportValidationRow {
  rowIndex: number;                       // 1-based Excel row number
  data: {                                 // parsed values (pre-transform)
    date: string;
    ticker: string;
    action: string;
    quantity: number;
    grossAmount: number;
    fees: number;
    portfolio: string;
    currency: string;
  };
  status: "valid" | "error" | "duplicate";
  errors?: Array<{ field: string; message: string }>;  // for status "error"
  duplicateOf?: {                          // for status "duplicate"
    source: "existing" | "batch";          // duplicate of DB row or earlier row in batch
    existingId?: number;                   // DB transaction ID if source is "existing"
    batchRowIndex?: number;                // batch row index if source is "batch"
  };
}

export interface ImportSummary {
  total: number;
  valid: number;
  errors: number;
  duplicates: number;
}

export interface ImportValidationResult {
  rows: ImportValidationRow[];
  summary: ImportSummary;
}
```

### `validateImport` Server Action (`src/server/actions/import.ts`)

```
"use server"

export async function validateImport(
  formData: FormData
): Promise<ActionResult<ImportValidationResult>>
```

**Implementation steps:**

1. **Extract file from FormData:**
   ```typescript
   const file = formData.get("file");
   if (!file || !(file instanceof File)) return { success: false, error: "No file provided" };
   if (!file.name.endsWith(".xlsx")) return { success: false, error: "Only .xlsx files are supported" };
   ```

2. **Parse with ExcelJS:**
   ```typescript
   const buffer = Buffer.from(await file.arrayBuffer());
   const workbook = new ExcelJS.Workbook();
   await workbook.xlsx.load(buffer);
   const sheet = workbook.getWorksheet(1);
   if (!sheet || sheet.rowCount < 2) return { success: false, error: "File is empty or has no data rows" };
   ```

3. **Map column headers (row 1):**
   - Read header row, lowercase and trim each header
   - Look up each header in `COLUMN_MAP`
   - Validate all 8 required columns are present
   - If missing columns, return `{ success: false, error: "Missing columns: ..." }`

4. **Parse data rows (row 2+):**
   - For each row, extract cell values by mapped column index
   - Handle ExcelJS cell types: dates may come as Date objects (convert with `format(cell, 'yyyy-MM-dd')` from date-fns), numbers as numbers, strings as strings
   - Empty rows (all cells blank) should be skipped silently
   - Coerce types: quantity/grossAmount/fees to number, action to lowercase

5. **Per-row Zod validation:**
   - Run `importRowSchema.safeParse(rowData)` on each row
   - On failure: mark row status "error", extract field-specific error messages from Zod issues

6. **Sell-more-than-held checks (FR28):**
   - Sort all valid rows by date (ascending) for chronological processing
   - Load existing positions from DB: query `transactions` grouped by (ticker, portfolio) to get current share counts
   - Build a running position map: `Map<string, Decimal>` keyed by `${ticker}:${portfolio}`
   - For each row in date order:
     - If buy: add quantity to position
     - If sell: check if position has enough shares; if not, mark row as error with message "Cannot sell more than held (have X, selling Y)"
     - If sell passes: subtract quantity from position
   - Use `decimal.js` for all share arithmetic (server-side)

7. **Duplicate detection (FR25):**
   - Match criteria: date + ticker + action + quantity + grossAmount + portfolio (6 fields)
   - Check against existing DB transactions: query all transactions, build a Set of match keys
   - Check within batch: track seen keys, flag later duplicates
   - For duplicate rows: mark status "duplicate" with `duplicateOf` info

8. **Build and return results:**
   ```typescript
   return {
     success: true,
     data: {
       rows: validationRows,
       summary: { total, valid, errors: errorCount, duplicates: duplicateCount },
     },
   };
   ```

**Important**: This action does NOT call `revalidatePath` — no DB writes happen here.

**Important**: Do NOT throw — catch all errors and return descriptive `ActionResult`.

### ImportWizard Component (`src/components/domain/import-wizard.tsx`)

`'use client'` component using `useReducer` per architecture spec.

**State shape (from architecture):**
```typescript
type ImportWizardState = {
  step: 1 | 2 | 3 | 4;
  file: File | null;
  fileName: string | null;
  parsedRows: ImportValidationRow[];
  validationErrors: ImportValidationRow[];  // rows where status === "error"
  duplicates: ImportValidationRow[];        // rows where status === "duplicate"
  confirmedRows: ImportValidationRow[];     // rows to import (managed in 5.3)
  isProcessing: boolean;
  uploadError: string | null;
};
```

**Reducer actions:**
```typescript
type ImportAction =
  | { type: "SET_FILE"; file: File }
  | { type: "SET_PROCESSING"; isProcessing: boolean }
  | { type: "SET_UPLOAD_ERROR"; error: string }
  | { type: "SET_VALIDATION_RESULTS"; result: ImportValidationResult }
  | { type: "GO_TO_STEP"; step: 1 | 2 | 3 | 4 }
  | { type: "RESET" };
```

**Step 1 UI (Upload):**
```
┌──────────────────────────────────────────────────┐
│  Import Transactions                              │
│                                                   │
│  Step 1 of 4: Upload File                        │
│  ─────────────────────────                       │
│                                                   │
│  [Download Template]  (secondary button, <a>)    │
│                                                   │
│  ┌─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┐  │
│  │                                            │  │
│  │  📄 Drag and drop your .xlsx file here    │  │
│  │     or click to browse                     │  │
│  │                                            │  │
│  └─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┘  │
│                                                   │
│  (upload error message here if any)              │
│                                                   │
└──────────────────────────────────────────────────┘
```

- Download template: `<Button variant="secondary" asChild><a href="/template.xlsx" download>Download Template</a></Button>`
- Drop zone: `<div>` with `onDragOver`, `onDragEnter`, `onDragLeave`, `onDrop` handlers
- File picker: hidden `<input type="file" accept=".xlsx">` triggered by drop zone click
- Visual states: default (dashed border `zinc-200`), drag-over (dashed border `zinc-900`, `zinc-50` bg), processing (disabled + "Validating..." text)
- On file select: dispatch `SET_FILE`, `SET_PROCESSING(true)`, call `validateImport`, dispatch `SET_VALIDATION_RESULTS`, auto-advance step

**Step routing logic (after validation results received):**
```typescript
function getNextStep(result: ImportValidationResult): 1 | 2 | 3 | 4 {
  if (result.summary.errors > 0) return 2;       // has errors → validation step
  if (result.summary.duplicates > 0) return 3;    // no errors, has dupes → duplicate step
  return 4;                                        // all clean → confirm step
}
```

**Steps 2, 3, 4 — placeholder rendering for this story:**
- Step 2: `<p>[N] rows need attention — inline correction coming in Story 5.2</p>` + summary of errors
- Step 3: `<p>[N] potential duplicates — review coming in Story 5.3</p>` + summary of duplicates
- Step 4: `<p>[N] transactions ready to import — commit coming in Story 5.3</p>`
- Each placeholder step should show a "Back to Upload" button that dispatches `RESET`

### Import Page Update (`src/app/import/page.tsx`)

Replace the placeholder with a thin Server Component orchestrator:

```typescript
export default function ImportPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-zinc-900">Import Transactions</h2>
      <ImportWizard />
    </div>
  );
}
```

The page is a Server Component. `ImportWizard` is the sole `'use client'` child — it manages all client-side state internally.

### Existing Patterns to Follow

**Server Action pattern** — `src/server/actions/transactions.ts`:
- `"use server"` directive
- Import `ActionResult` from `@/server/types/action-result`
- Try-catch wrapper, never throws
- Return `ActionResult<T>`

**Transaction validation** — `src/shared/schemas/transaction.ts`:
- Uses Zod 4 (`"zod": "^4.3.6"`)
- `z.string().regex()` for date, `.min(1)` for required strings
- `.transform(v => v.toUpperCase())` for ticker/currency
- `.refine()` for cross-field rules (FR29)

**DB access for duplicate detection** — `src/server/queries/transactions.ts`:
- Uses `db.select().from(transactions).where(...)` pattern
- Drizzle imports: `import { db } from "@/server/db"`, `import { transactions } from "@/server/db/schema"`
- Operators: `import { eq, and } from "drizzle-orm"`

**DB schema** — `src/server/db/schema.ts`:
- Transaction columns: id, date, ticker, action, quantity, grossAmount, fees, portfolio, currency
- Indexes: `transactions_ticker_portfolio_idx`, `transactions_date_idx`

**ActionResult type** — `src/server/types/action-result.ts`:
```typescript
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> };
```

No changes needed — `validateImport` uses `ActionResult<ImportValidationResult>`.

### ExcelJS Parsing Notes

**ExcelJS version:** `^4.4.0` (already installed)

Key parsing considerations:
- Dates in Excel may arrive as JavaScript `Date` objects or formatted strings depending on cell format. Handle both: if `Date` object, convert with `format(date, 'yyyy-MM-dd')` from date-fns. If string, pass through to Zod validation.
- Numbers may arrive as strings if formatted — coerce with `Number()` before Zod validation.
- Empty cells return `undefined` or `null` from ExcelJS — handle gracefully.
- Trim all string values.
- Row iteration: `sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => { ... })`. Skip row 1 (headers).
- Cell access: `row.getCell(columnIndex).value` — where columnIndex is 1-based.

**FormData in Server Action:**
```typescript
export async function validateImport(formData: FormData): Promise<ActionResult<ImportValidationResult>> {
  const file = formData.get("file");
  // file is File in browser, but in Next.js Server Action it arrives as a File-like object
  // Use: Buffer.from(await (file as File).arrayBuffer())
}
```

### Duplicate Detection Logic

**Match key:** Composite of 6 fields: `${date}|${ticker}|${action}|${quantity}|${grossAmount}|${portfolio}`

**Against existing DB:**
```typescript
const existingTransactions = db.select({
  id: transactions.id,
  date: transactions.date,
  ticker: transactions.ticker,
  action: transactions.action,
  quantity: transactions.quantity,
  grossAmount: transactions.grossAmount,
  portfolio: transactions.portfolio,
}).from(transactions).all();

const existingKeys = new Map<string, number>(); // key → transaction ID
for (const tx of existingTransactions) {
  const key = `${tx.date}|${tx.ticker}|${tx.action}|${tx.quantity}|${tx.grossAmount}|${tx.portfolio}`;
  existingKeys.set(key, tx.id);
}
```

**Within batch:**
```typescript
const batchKeys = new Map<string, number>(); // key → first occurrence row index
```

Check existing first, then batch. First occurrence in batch is valid; subsequent occurrences are duplicates.

### Sell-More-Than-Held Validation (FR28, FR41)

This is a cross-row validation that requires chronological processing:

1. Query current positions from DB (shares held per ticker+portfolio)
2. Sort import rows by date ascending
3. For each row in order, update a running position map
4. If a sell row's quantity exceeds held shares, mark as error

```typescript
import Decimal from "decimal.js";

// Start from existing positions
const positionMap = new Map<string, Decimal>();
const existingPositions = db.select({
  ticker: transactions.ticker,
  portfolio: transactions.portfolio,
  action: transactions.action,
  quantity: transactions.quantity,
}).from(transactions).all();

// Build initial positions from DB
for (const tx of existingPositions) {
  const key = `${tx.ticker}:${tx.portfolio}`;
  const current = positionMap.get(key) ?? new Decimal(0);
  if (tx.action === "buy") positionMap.set(key, current.plus(tx.quantity));
  if (tx.action === "sell") positionMap.set(key, current.minus(tx.quantity));
}

// Check import rows in date order
const sortedValidRows = validRows.sort((a, b) => a.data.date.localeCompare(b.data.date));
for (const row of sortedValidRows) {
  if (row.status !== "valid") continue;
  const key = `${row.data.ticker}:${row.data.portfolio}`;
  const held = positionMap.get(key) ?? new Decimal(0);

  if (row.data.action === "sell") {
    if (new Decimal(row.data.quantity).greaterThan(held)) {
      row.status = "error";
      row.errors = [{ field: "quantity", message: `Cannot sell more than held (have ${held.toNumber()}, selling ${row.data.quantity})` }];
      continue;
    }
    positionMap.set(key, held.minus(row.data.quantity));
  } else if (row.data.action === "buy") {
    positionMap.set(key, held.plus(row.data.quantity));
  }
}
```

**Important**: Use `decimal.js` for share arithmetic — this is server-side code.

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `scripts/generate-template.ts` | Create | Script to generate Excel template |
| `public/template.xlsx` | Create | Generated Excel template (committed) |
| `src/shared/schemas/import.ts` | Create | Import row Zod schema + column mapping |
| `src/server/types/import.ts` | Create | ImportValidationRow, ImportValidationResult, ImportSummary |
| `src/server/actions/import.ts` | Create | `validateImport` server action |
| `src/components/domain/import-wizard.tsx` | Create | Import wizard client component |
| `src/app/import/page.tsx` | Modify | Replace placeholder with ImportWizard |
| `src/shared/schemas/import.test.ts` | Create | Import schema tests |
| `src/server/actions/import.test.ts` | Create | validateImport action tests |
| `package.json` | Modify | Add `generate:template` script |

### Testing Strategy

**Import schema tests** (`src/shared/schemas/import.test.ts`):
- Valid row passes
- Missing required fields fail (date, ticker, action, quantity, grossAmount, portfolio, currency)
- Invalid date format fails
- Invalid action value fails
- Negative quantity fails
- Negative fees fails
- Negative grossAmount on buy/sell/fee fails (FR29)
- Negative grossAmount on dividend passes (FR29)
- Zero quantity on buy/sell fails, on dividend/fee passes
- Ticker uppercased by transform
- Currency uppercased, length validated
- Missing fees defaults to 0

**validateImport action tests** (`src/server/actions/import.test.ts`):
- No file → error result
- Non-xlsx file → error result
- Empty file (no data rows) → error result
- Missing required columns → error result with column names
- Valid rows all pass → `summary.valid === total`
- Mixed valid/error rows → correct status per row
- Negative grossAmount on buy → row error (FR29)
- Sell exceeding held shares → row error (FR28)
- Duplicate against existing → row marked "duplicate" with `duplicateOf.source === "existing"`
- Duplicate within batch → second occurrence marked "duplicate" with `duplicateOf.source === "batch"`
- Excel dates parsed correctly (Date object → YYYY-MM-DD string)
- Column header case-insensitivity

**Mock patterns:**
```typescript
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// Mock db for duplicate detection queries
vi.mock("@/server/db", () => ({ db: mockDb }));
```

For ExcelJS mocking in tests, create minimal workbook fixtures programmatically rather than reading real files.

### Anti-Patterns to Avoid

- DO NOT import `decimal.js` in client components — all share arithmetic is in the server action
- DO NOT call `revalidatePath` in `validateImport` — no DB writes happen
- DO NOT create API route files — use Server Actions
- DO NOT parse Excel on the client — ExcelJS runs server-side only
- DO NOT store validation results in the database — they live in ImportWizard client state
- DO NOT implement inline error correction UI — that is Story 5.2
- DO NOT implement duplicate review/override UI — that is Story 5.3
- DO NOT implement `commitImport` action — that is Story 5.3
- DO NOT create barrel files (index.ts re-exports)
- DO NOT use `new Date()` — use date-fns for any date conversion
- DO NOT use toast/modal for upload errors — inline error message in the wizard
- DO NOT duplicate Zod field rules from transactionSchema — if fields are identical, reference the same validators or document why they differ
- DO NOT add "Add Transaction" or delete functionality — those are Epic 6
- DO NOT import from `src/server/` in the ImportWizard client component (except server action imports which Next.js handles)

### Previous Story Intelligence (Story 4.2)

Key learnings from Story 4.2 that apply:

- **`transactionSchema` in `src/shared/schemas/transaction.ts` is the reference** — the import schema should match its field rules exactly. Any divergence risks validating import rows differently than edit validation.
- **`ActionResult<T>` with `fieldErrors` is established** — `validateImport` uses the same pattern but returns richer per-row data via the generic `T`.
- **Server Action pattern is proven** — `"use server"`, try-catch, never throw, return ActionResult. Follow `src/server/actions/transactions.ts` exactly.
- **Transaction model uses `grossAmount` not `price`** — refactored in commit `0d14974`. All code, schemas, and the Excel template must use `grossAmount`.
- **Zod version is 4.x** (`"zod": "^4.3.6"`). Import as `import { z } from "zod"`.
- **`useRef` for handling blur/keyboard conflicts** — Story 4.2 learned this the hard way with `handledByKeyboard` ref in EditableCell. The ImportWizard is simpler (no inline editing in this story) but keep this pattern in mind for Story 5.2.
- **DB access pattern** — `db.select().from(transactions).where(eq(...)).all()` for reading, `db.insert(transactions).values(...)` for writing (used in 5.3).

### Git Intelligence

Recent commit patterns:
```
fc99eb6 fix: code review fixes for story 4.2 — onBlur double-save, Tab navigation, field validation, error state
5c18591 fix: remove currency sign from transaction amounts, add note about respective currencies
e2930eb feat: story 4.2 — inline transaction editing with recomputation
8025217 fix: code review fixes for story 4.1 — decimal.js, portfolio selector, sort stability, dash display
0d14974 refactor: switch transaction model from price-per-share to gross amount
```

Commit conventions: `feat: story X.X — description` for new stories, `fix: code review fixes for story X.X — details` for review fixes.

### Project Structure Notes

- All new files follow `kebab-case` naming
- Server action file goes in `src/server/actions/` alongside `transactions.ts` and `market-data.ts`
- Types file goes in `src/server/types/` alongside `action-result.ts`, `positions.ts`, `market-data.ts`
- Zod schema goes in `src/shared/schemas/` alongside `transaction.ts`
- Client component goes in `src/components/domain/` alongside existing components
- Script goes in `scripts/` (new top-level directory — check it doesn't conflict)
- No changes to DB schema (transactions table unchanged)
- No new Shadcn components likely needed beyond existing Button, Input — but check if a file upload/dropzone component exists

### Performance Considerations

- **NFR: Import validation for 1400+ rows completes within 5 seconds.** ExcelJS parsing is fast. Per-row Zod validation is fast. The sell-more-than-held check iterates rows once (O(n)). Duplicate detection uses a Map lookup (O(1) per row). Total should be well under 5s.
- **Memory**: 1400 rows × ~8 fields = ~11,200 values. Trivial for memory. But avoid loading the entire `market_data` table — only `transactions` needed for validation.
- **DB query optimization**: Fetch all existing transactions once for both position computation and duplicate detection. One query, not per-row queries.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 5, Story 5.1 AC lines 736-770]
- [Source: _bmad-output/planning-artifacts/architecture.md — ActionResult type, Server Action template, FormData upload, ImportWizard useReducer state shape]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — UX-DR10 import wizard steps, button hierarchy, feedback patterns, import flow]
- [Source: _bmad-output/planning-artifacts/prd.md — FR20-FR29, FR41, NFR import validation 5s]
- [Source: src/server/actions/transactions.ts — Server Action pattern reference]
- [Source: src/server/actions/market-data.ts — DB transaction pattern, ActionResult with data]
- [Source: src/shared/schemas/transaction.ts — Existing Zod schema with FR29 refinements]
- [Source: src/server/types/action-result.ts — ActionResult type]
- [Source: src/server/db/schema.ts — Transaction table schema with grossAmount column]
- [Source: src/server/queries/transactions.ts — DB query patterns, TransactionRow interface]
- [Source: src/app/import/page.tsx — Current placeholder to replace]
- [Source: src/app/layout.tsx — Navigation tabs, Import tab already configured]
- [Source: _bmad-output/implementation-artifacts/4-2-inline-transaction-editing-with-recomputation.md — Previous story learnings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Fixed ESLint error: ref access inside useReducer callback → switched to useState + ref in event handlers
- Fixed unused variable `mappedFields` in import action

### Completion Notes List

- Task 1: Created `scripts/generate-template.ts` using ExcelJS with styled headers, Action column data validation, frozen header row. Generated `public/template.xlsx`. Added `generate:template` npm script.
- Task 2: Created `importRowSchema` in `src/shared/schemas/import.ts` matching transactionSchema field rules exactly (FR29 refinements). Created `ImportValidationRow`, `ImportValidationResult`, `ImportSummary` types in `src/server/types/import.ts`.
- Task 3: Created `validateImport` server action with: ExcelJS parsing, case-insensitive column header mapping, per-row Zod validation, chronological sell-more-than-held checks using decimal.js, duplicate detection against DB and within batch. Returns `ActionResult<ImportValidationResult>`. No revalidatePath (validation-only).
- Task 4: Created `ImportWizard` client component with `useReducer` state management. Step 1 has download template link, drag-and-drop upload zone, file picker. Auto-advances to step 2/3/4 based on validation results. Placeholder content for steps 2-4 with "Back to Upload" reset.
- Task 5: Replaced import page placeholder with ImportWizard component.
- Task 6: Created 26 import schema tests and 14 validateImport action tests covering all ACs.
- Task 7: Lint passes (0 errors), all 187 tests pass across 14 test files.

### Review Findings

- [x] [Review][Patch] Download Template uses bare `<a>` instead of `<Button variant="secondary" asChild>` wrapping `<a>` — spec violation [src/components/domain/import-wizard.tsx] — FIXED
- [x] [Review][Patch] `handleFile` missing try/catch — unhandled server action rejection leaves UI stuck on "Validating..." [src/components/domain/import-wizard.tsx] — FIXED
- [x] [Review][Patch] ExcelJS special cell types (formula, error, hyperlink) not handled — cells with formulas return `{ formula, result }`, errors return `{ error }`, hyperlinks return `{ text, hyperlink }`, all produce NaN or `[object Object]` [src/server/actions/import.ts] — FIXED
- [x] [Review][Patch] NaN `grossAmount` on dividends passes Zod validation — `z.number()` accepts NaN, refine short-circuits on `action === "dividend"`, need explicit NaN guard [src/shared/schemas/import.ts] — FIXED
- [x] [Review][Defer] Date regex accepts invalid calendar dates (e.g. `2024-02-31`) — pre-existing pattern shared with `transactionSchema`, fix both schemas together
- [x] [Review][Defer] `rawData as ImportValidationRow["data"]` cast unsafe on error rows — error rows may have `undefined` numeric fields, relevant when Story 5.2 implements inline correction UI
- [x] [Review][Defer] Sell-more-than-held validates against current position, not historical chronological state — spec design decision, import of historical sells before existing buys passes validation
- [x] [Review][Defer] Stale validation between validate and commit — between validation and commit (Story 5.3), DB state could change; commit step should re-validate

### Change Log

- 2026-04-08: Story 5.1 implementation complete — Excel template, import validation schema/types, validateImport server action, ImportWizard client component, import page update, tests

### File List

- scripts/generate-template.ts (created)
- public/template.xlsx (created)
- src/shared/schemas/import.ts (created)
- src/server/types/import.ts (created)
- src/server/actions/import.ts (created)
- src/components/domain/import-wizard.tsx (created)
- src/app/import/page.tsx (modified)
- src/shared/schemas/import.test.ts (created)
- src/server/actions/import.test.ts (created)
- package.json (modified)
