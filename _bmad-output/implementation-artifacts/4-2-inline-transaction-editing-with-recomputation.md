# Story 4.2: Inline Transaction Editing with Recomputation

Status: review

## Story

As a user,
I want to edit any transaction field directly in the table and see all affected values recalculate immediately,
So that I can correct errors without leaving context and trust that the fix is applied everywhere.

## Acceptance Criteria

1. **Given** the transactions table is displayed **When** I click on a cell (e.g., the Gross Amount cell of a transaction) **Then** the cell becomes an input field with the current value selected **And** the cell border changes to `zinc-900` to indicate edit mode (FR15, UX-DR8)

2. **Given** I am editing a cell **When** I press Enter or Tab **Then** the value is saved via the `updateTransaction` Server Action **And** the Server Action validates the input with Zod **And** `revalidatePath('/', 'layout')` is called **And** the cell exits edit mode and shows the updated value **And** a brief subtle highlight appears on the cell to confirm the change (UX-DR8)

3. **Given** I am editing a cell **When** I press Escape **Then** the edit is cancelled **And** the cell reverts to its original value **And** no Server Action is called (UX-DR8)

4. **Given** a transaction is successfully edited **When** the page re-renders after revalidation **Then** all affected positions (active and closed) reflect the updated computation **And** dashboard aggregate metrics reflect the change **And** the update is visible without manual page refresh (FR19)

5. **Given** I edit a transaction with an invalid value (e.g., empty required field, negative gross amount on a buy) **When** the `updateTransaction` Server Action validates the input **Then** it returns `ActionResult` with `success: false` and field-specific error message **And** the error is displayed inline below the affected cell in red text **And** the error persists until the value is corrected (UX-DR20)

6. **Given** I edit a currency field from USD to GBP on a transaction **When** the save triggers recomputation **Then** cost basis, market value, and P&L for the affected position recalculate using the appropriate FX rates **And** the updated values propagate to the positions table and dashboard

7. **Given** the `updateTransaction` Server Action is implemented **When** I examine the code **Then** it follows the Server Action template: Zod validation -> Drizzle mutation -> `revalidatePath('/', 'layout')` -> return `ActionResult` **And** the action never throws — Zod errors map to `fieldErrors`, infrastructure errors are caught and returned as descriptive messages

## Tasks / Subtasks

- [x] Task 1: Extend ActionResult type to support field-specific errors (AC: #5, #7)
  - [x] 1.1 Add optional `fieldErrors?: Record<string, string>` to the failure case of `ActionResult<T>`

- [x] Task 2: Create transaction validation schema (AC: #5, #7)
  - [x] 2.1 Create `src/shared/schemas/transaction.ts` with Zod schema for a complete transaction row
  - [x] 2.2 Include per-field validation (date format, required strings, non-negative numbers)
  - [x] 2.3 Add cross-field refinement: negative grossAmount only allowed for dividend action (FR29)
  - [x] 2.4 Add cross-field refinement: negative quantity rejected on buy/sell/fee (FR29)

- [x] Task 3: Create `updateTransaction` Server Action (AC: #2, #4, #5, #6, #7)
  - [x] 3.1 Create `src/server/actions/transactions.ts` with `updateTransaction(id, field, value)` function
  - [x] 3.2 Load existing transaction row from DB, merge new field value
  - [x] 3.3 Validate merged row with Zod schema; map Zod errors to `fieldErrors`
  - [x] 3.4 Update single field via Drizzle `update().set().where()`
  - [x] 3.5 Call `revalidatePath('/', 'layout')` on success
  - [x] 3.6 Never throw — catch all errors, return descriptive `ActionResult`
  - [x] 3.7 Write unit tests for the server action (valid update, validation failure, non-existent ID)

- [x] Task 4: Create `EditableCell` client component (AC: #1, #2, #3, #5)
  - [x] 4.1 Create `src/components/domain/editable-cell.tsx`
  - [x] 4.2 Display mode: shows formatted `display` value; on click enters edit mode
  - [x] 4.3 Edit mode: renders input with raw `value` selected, border `zinc-900`
  - [x] 4.4 Keyboard handling: Enter saves + exits, Tab saves + moves to next editable cell, Escape cancels
  - [x] 4.5 Use `<select>` for `action` field (buy/sell/dividend/fee), `<input type="date">` for date, text inputs for others
  - [x] 4.6 Error display: red text below cell when save fails, persists until corrected
  - [x] 4.7 Save highlight: brief green/zinc tint animation on cell after successful save (CSS transition)

- [x] Task 5: Create `TransactionsTable` client component (AC: #1, #2, #3)
  - [x] 5.1 Create `src/components/domain/transactions-table.tsx` — dedicated editable table for transactions
  - [x] 5.2 Manage editing state: `editingCell: { rowId, field } | null`
  - [x] 5.3 Manage error state: `cellError: { rowId, field, message } | null`
  - [x] 5.4 Manage highlight state: `highlightedCells: Set<string>` with auto-clear timeout
  - [x] 5.5 Use TanStack Table internally with sorting (reuse sorting pattern from PositionsTable)
  - [x] 5.6 Pass editing callbacks to cells via TanStack Table `meta`

- [x] Task 6: Update column definitions for edit support (AC: #1)
  - [x] 6.1 Update `src/components/domain/transactions-columns.tsx` to accept edit context
  - [x] 6.2 Mark editable columns via `meta.editable` (all except `netAmount`, `netAvgPrice` which are computed)
  - [x] 6.3 Cell renderers use `EditableCell` for editable columns, plain display for computed columns

- [x] Task 7: Update transactions page (AC: #4)
  - [x] 7.1 Replace `PositionsTable` with `TransactionsTable` in `src/app/transactions/page.tsx`
  - [x] 7.2 Ensure all existing functionality preserved (sorting, filtering, empty states, ControlsBar)

- [x] Task 8: Lint and test (AC: all)
  - [x] 8.1 Run `npm run lint` — zero errors
  - [x] 8.2 Run `npm run test:run` — all tests pass (existing + new)

## Dev Notes

### Architecture & Data Flow

This story adds the first **write path** to the transactions table. Data flow:

```
WRITE: Click cell -> EditableCell (client) -> updateTransaction Server Action
         -> Zod validation -> Drizzle update -> revalidatePath('/', 'layout')
         -> ActionResult returned to client
         -> Server Component re-renders with fresh computed data
```

Key architectural principle: **Server Actions never return computed data.** The `updateTransaction` action returns `ActionResult<void>` (success/failure). Fresh data arrives via Server Component re-render after `revalidatePath`. The recomputation cascade (positions, aggregates, dashboard) happens automatically because positions are computed on read.

### Existing Patterns to Follow

**Server Action pattern** — Follow `src/server/actions/market-data.ts`:
- `"use server"` directive
- Import `revalidatePath` from `next/cache`
- Import `ActionResult` from `@/server/types/action-result`
- Try-catch wrapper, never throws
- Return `ActionResult<T>`
- `revalidatePath('/', 'layout')` after successful mutation

**Table pattern** — `src/components/domain/positions-table.tsx` uses:
- TanStack Table with `useReactTable`, `getCoreRowModel`, `getSortedRowModel`
- `SortingState` via `useState`
- Header click sorting with chevron indicators
- `cn()` for conditional class composition
- `table-fixed` layout, 40px row height (`h-10`)
- Shadcn `Table`, `TableHeader`, `TableRow`, `TableHead`, `TableBody`, `TableCell`

**Column definitions** — `src/components/domain/transactions-columns.tsx`:
- `accessorFn` extracts `.value` for sorting; `cell` renders `.display`
- `NumericCell` wraps numeric values in `tabular-nums`
- `meta: { align: "center" as const }` for column alignment
- `sortUndefined: "last"` for nullable fields

### ActionResult Extension

Current type in `src/server/types/action-result.ts`:
```typescript
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };
```

Extend failure case (backward compatible):
```typescript
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> };
```

Architecture spec includes `fieldErrors` for per-field validation display. This change is backward compatible — existing actions that don't return `fieldErrors` still work.

### Zod Validation Schema

Create `src/shared/schemas/transaction.ts`. This is the **first file in `src/shared/schemas/`** — the directory exists but is currently empty. This schema is safe for client import (no server dependencies).

**Zod version: 4.x** (`"zod": "^4.3.6"`). Import as `import { z } from "zod"`.

The schema validates a **complete transaction row** (all fields together) to enable cross-field validation:

```typescript
import { z } from "zod";

export const transactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD format"),
  ticker: z.string().min(1, "Ticker is required").transform(v => v.toUpperCase()),
  action: z.enum(["buy", "sell", "dividend", "fee"]),
  quantity: z.number().min(0, "Quantity cannot be negative"),
  grossAmount: z.number(),
  fees: z.number().min(0, "Fees cannot be negative"),
  portfolio: z.string().min(1, "Portfolio is required"),
  currency: z.string().length(3, "Currency must be 3 letters").transform(v => v.toUpperCase()),
}).refine(
  (data) => data.action === "dividend" || data.grossAmount >= 0,
  { message: "Negative amount only allowed for dividends (withholding tax)", path: ["grossAmount"] }
);
```

**FR29 enforcement**: Negative `grossAmount` rejected for buy/sell/fee. Negative allowed only for dividend (withholding tax). Negative `quantity` rejected on all actions via `.min(0)`. Negative `fees` rejected via `.min(0)`.

### Server Action Implementation

`src/server/actions/transactions.ts` — new file alongside existing `market-data.ts`.

```typescript
"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { transactions } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { transactionSchema } from "@/shared/schemas/transaction";
import type { ActionResult } from "@/server/types/action-result";

const EDITABLE_FIELDS = ["date", "ticker", "action", "quantity", "grossAmount", "fees", "portfolio", "currency"] as const;
type EditableField = typeof EDITABLE_FIELDS[number];

export async function updateTransaction(
  id: number,
  field: EditableField,
  value: string | number,
): Promise<ActionResult> {
  try {
    // 1. Load existing row
    const existing = db.select().from(transactions).where(eq(transactions.id, id)).get();
    if (!existing) {
      return { success: false, error: "Transaction not found" };
    }

    // 2. Merge new value
    const merged = { ...existing, [field]: value };

    // 3. Validate full row
    const result = transactionSchema.safeParse(merged);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join(".");
        fieldErrors[path] = issue.message;
      }
      return { success: false, error: fieldErrors[field] ?? "Validation failed", fieldErrors };
    }

    // 4. Update single field in DB
    db.update(transactions).set({ [field]: result.data[field] }).where(eq(transactions.id, id)).run();

    // 5. Revalidate
    revalidatePath("/", "layout");

    return { success: true, data: undefined };
  } catch (error) {
    console.error("updateTransaction failed:", error);
    return { success: false, error: "Failed to update transaction. Please try again." };
  }
}
```

**Important**: The `set({ [field]: result.data[field] })` uses the **Zod-transformed value** (e.g., uppercased ticker/currency). The Drizzle column name mapping (`grossAmount` -> `gross_amount`) is handled by Drizzle ORM automatically via the schema.

**FR41 (sell validation)**: Edits that create negative positions are **allowed** — the computation service flags `hasInvalidState` and the positions table shows amber background. The server action does NOT reject edits causing negative positions; only import/manual-add reject upfront.

### EditableCell Component

Create `src/components/domain/editable-cell.tsx` — a `"use client"` component.

**Props:**
- `transactionId: number` — DB row ID
- `field: string` — column field name
- `rawValue: string | number` — raw value for the input
- `displayValue: string` — formatted display string
- `isEditing: boolean` — controlled by parent TransactionsTable
- `error: string | null` — validation error from last save attempt
- `isHighlighted: boolean` — true briefly after successful save
- `inputType: "text" | "number" | "date" | "select"` — determines input element
- `selectOptions?: string[]` — options for select inputs (action field)
- `onStartEdit: () => void` — called on cell click
- `onSave: (value: string | number) => void` — called on Enter/Tab
- `onCancel: () => void` — called on Escape
- `onTabToNext: () => void` — called on Tab to advance to next editable cell

**Behavior:**
1. **Display mode**: Renders the `displayValue` as text. On click calls `onStartEdit`.
2. **Edit mode**: Renders `<input>` (or `<select>` for action) with raw value. Input gets `autoFocus` and `select()` on mount via `useEffect` ref. Border style: `ring-1 ring-zinc-900`. Background: white.
3. **Enter**: Calls `onSave(parsedValue)`. For number fields, parse string to number.
4. **Tab**: Calls `onSave(parsedValue)` then `onTabToNext()`. Use `e.preventDefault()` to prevent default tab behavior.
5. **Escape**: Calls `onCancel()`. No server action.
6. **Error state**: Red text below the input: `<span className="text-red-500 text-xs">{error}</span>`.
7. **Highlight state**: Cell background briefly transitions from `bg-green-50` to transparent using CSS `transition-colors duration-700`.

**Do NOT call the server action directly from EditableCell.** The parent TransactionsTable handles the server action call and manages state.

### TransactionsTable Component

Create `src/components/domain/transactions-table.tsx` — replaces `PositionsTable` usage on the transactions page.

This is a `"use client"` component that:
1. Receives `data: TransactionRow[]` as props
2. Creates a TanStack Table instance with the transactions column definitions
3. Manages all editing state internally
4. Calls `updateTransaction` server action directly (imported from `@/server/actions/transactions`)

**State:**
```typescript
const [editingCell, setEditingCell] = useState<{ rowId: number; field: string } | null>(null);
const [cellError, setCellError] = useState<{ rowId: number; field: string; message: string } | null>(null);
const [highlightedCells, setHighlightedCells] = useState<Set<string>>(new Set());
const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);
```

**Save flow:**
```typescript
async function handleSave(rowId: number, field: string, value: string | number) {
  const result = await updateTransaction(rowId, field, value);
  if (result.success) {
    setEditingCell(null);
    setCellError(null);
    // Add highlight
    const key = `${rowId}-${field}`;
    setHighlightedCells(prev => new Set(prev).add(key));
    setTimeout(() => setHighlightedCells(prev => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    }), 700);
  } else {
    setCellError({ rowId, field, message: result.error });
  }
}
```

**Tab-to-next flow:** Define editable column order: `["date", "ticker", "action", "quantity", "grossAmount", "fees", "portfolio", "currency"]`. On Tab from the last editable column in a row, exit edit mode (do not wrap to next row — matches typical table editing UX).

**Sorting**: Reuse the exact same sorting pattern from PositionsTable (SortingState, header click handlers, chevron indicators). Copy the header rendering logic.

**Row styling**: Match PositionsTable — `h-10 border-b border-zinc-100`, alternate hover.

### Column Definitions Update

Update `src/components/domain/transactions-columns.tsx`:

1. Convert from a static `transactionsColumns` array to a function that takes editing context:
```typescript
export function getTransactionsColumns(
  editingCell: { rowId: number; field: string } | null,
  cellError: { rowId: number; field: string; message: string } | null,
  highlightedCells: Set<string>,
  onStartEdit: (rowId: number, field: string) => void,
  onSave: (rowId: number, field: string, value: string | number) => void,
  onCancel: () => void,
  onTabToNext: (rowId: number, field: string) => void,
): ColumnDef<TransactionRow>[]
```

2. Each editable column's `cell` renderer uses `EditableCell`:
```typescript
cell: ({ row }) => (
  <EditableCell
    transactionId={row.original.id}
    field="grossAmount"
    rawValue={row.original.grossAmount.value ?? 0}
    displayValue={row.original.grossAmount.display}
    isEditing={editingCell?.rowId === row.original.id && editingCell?.field === "grossAmount"}
    error={cellError?.rowId === row.original.id && cellError?.field === "grossAmount" ? cellError.message : null}
    isHighlighted={highlightedCells.has(`${row.original.id}-grossAmount`)}
    inputType="number"
    onStartEdit={() => onStartEdit(row.original.id, "grossAmount")}
    onSave={(v) => onSave(row.original.id, "grossAmount", v)}
    onCancel={onCancel}
    onTabToNext={() => onTabToNext(row.original.id, "grossAmount")}
  />
)
```

3. Computed columns (`netAmount`, `netAvgPrice`) remain read-only — no `EditableCell`, just the existing `NumericCell` display.

4. `NumericCell` component should move to a shared location or be duplicated (currently defined locally in the file — keep as-is since it's small).

### Editable Column Configuration

| Column | Field | Input Type | Raw Value Source | Notes |
|--------|-------|-----------|-----------------|-------|
| Date | `date` | `date` | `row.date.value` (ISO string) | Native date picker |
| Ticker | `ticker` | `text` | `row.ticker` | Uppercased by Zod transform |
| Action | `action` | `select` | `row.action` | Options: buy, sell, dividend, fee |
| Quantity | `quantity` | `number` | `row.quantity.value` | Show 0 for dividend/fee rows when editing |
| Gross Amount | `grossAmount` | `number` | `row.grossAmount.value` | Negative allowed only for dividend |
| Fees | `fees` | `number` | `row.fees.value` | Always non-negative |
| Portfolio | `portfolio` | `text` | `row.portfolio` | Free text |
| Currency | `currency` | `text` | `row.currency` | 3-letter code, uppercased |
| Net Amount | — | — | — | **Computed, not editable** |
| Net Avg Price | — | — | — | **Computed, not editable** |

**Null handling for editable cells**: When `quantity.value` or `grossAmount.value` or `fees.value` is `null` (displayed as dash for dividend/fee), the edit input should show `0` and allow the user to enter a value. The dash display is a UI convention, not a data constraint.

### Transactions Page Update

`src/app/transactions/page.tsx` — minimal change:
1. Replace `import { PositionsTable }` with `import { TransactionsTable }`
2. Replace `<PositionsTable data={rows} columns={transactionsColumns} ...>` with `<TransactionsTable data={rows} />`
3. The `TransactionsTable` handles its own column definitions internally (since they depend on editing state)
4. Keep `ControlsBar`, `ActiveFilters`, empty state logic unchanged

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/server/types/action-result.ts` | Modify | Add `fieldErrors` to failure case |
| `src/shared/schemas/transaction.ts` | Create | Zod validation schema for transactions |
| `src/server/actions/transactions.ts` | Create | `updateTransaction` server action |
| `src/components/domain/editable-cell.tsx` | Create | Inline edit cell component |
| `src/components/domain/transactions-table.tsx` | Create | Dedicated editable table for transactions |
| `src/components/domain/transactions-columns.tsx` | Modify | Convert to function with edit context, use EditableCell |
| `src/app/transactions/page.tsx` | Modify | Switch from PositionsTable to TransactionsTable |
| `src/server/actions/transactions.test.ts` | Create | Tests for updateTransaction action |
| `src/shared/schemas/transaction.test.ts` | Create | Tests for Zod validation schema |

### Testing Strategy

**Server action tests** (`src/server/actions/transactions.test.ts`):
Follow pattern from `src/server/queries/transactions.test.ts` — mock `db`, test:
- Valid update returns `{ success: true }`
- Non-existent ID returns `{ success: false, error: "Transaction not found" }`
- Invalid value returns `{ success: false, fieldErrors: { ... } }`
- Negative grossAmount on buy rejected (FR29)
- Negative grossAmount on dividend allowed (FR29)
- `revalidatePath` called on success, not called on failure

**Validation schema tests** (`src/shared/schemas/transaction.test.ts`):
- Valid transaction passes
- Missing required fields fail
- Invalid date format fails
- Negative quantity fails
- Negative fees fails
- Negative grossAmount on buy fails, on dividend passes (FR29)
- Ticker uppercased by transform
- Currency uppercased by transform, length validated

**Note**: Mock `revalidatePath` from `next/cache` in action tests:
```typescript
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
```

### Anti-Patterns to Avoid

- DO NOT import `decimal.js` in client components — it's server-only. The `updateTransaction` server action validates numbers as plain `number` type.
- DO NOT return computed data from the server action — return `ActionResult<void>`. Fresh data arrives via revalidation.
- DO NOT reject edits that create negative positions — FR41 says flag visually, don't block. Only import/manual-add reject upfront.
- DO NOT use modals for edit confirmation or errors — UX spec says inline, no modals for non-destructive feedback.
- DO NOT create API route files — use Server Actions only.
- DO NOT use `useSearchParams()` in the page — use `searchParams` prop (existing pattern).
- DO NOT add row selection checkboxes — that is Story 6.2.
- DO NOT add "Add Transaction" button/row — that is Story 6.1.
- DO NOT add delete functionality — that is Story 6.2.
- DO NOT create barrel files (index.ts re-exports).
- DO NOT add toast notifications — cell-level feedback only (highlight on success, inline error on failure).
- DO NOT format numbers in components — formatting happens in the query. The EditableCell shows raw values in edit mode and formatted values in display mode.

### Previous Story Intelligence (Story 4.1)

Key learnings from Story 4.1 review that apply here:
- **`{ value, display }` pattern is established** — all numeric fields have raw value + formatted display. EditableCell uses `value` for the input, `display` for presentation.
- **`computeNetAmount` uses decimal.js** — already implemented in `src/server/queries/transactions.ts`. After editing grossAmount/fees/action, the query recomputes netAmount and netAvgPrice automatically on next render.
- **PositionsTable is generic but NOT designed for editing** — it supports `onRowClick` (whole-row action) not cell-level interaction. Story 4.2 needs a dedicated `TransactionsTable` component.
- **Stable sort with `desc(transactions.id)` tiebreaker** — maintained after edit since ID doesn't change.
- **PortfolioSelector preserves existing search params** — fixed in 4.1 code review. No regression risk from this story.
- **`NumericCell` is defined locally** in transactions-columns.tsx — keep it there.
- **Transaction model uses `grossAmount` not `price`** — refactored in commit `0d14974`. All code and schemas must use `grossAmount`.
- **Action column displays capitalized** — `<span className="capitalize">{row.original.action}</span>`. In edit mode, use lowercase values in the select options.

### Git Intelligence

Recent commits show the project consistently follows:
- Feat commits with story number: `feat: story X.X — description`
- Fix commits for code review: `fix: code review fixes for story X.X — details`
- Refactor commits for data model changes: `refactor: switch transaction model from price-per-share to gross amount`

Files modified in recent commits relevant to this story:
- `src/server/queries/transactions.ts` — last modified in 4.1 (adding getTransactions, computeNetAmount)
- `src/components/domain/portfolio-selector.tsx` — fixed in 4.1 review to preserve search params
- `src/components/domain/transactions-columns.tsx` — created in 4.1

### Performance Requirement

**NFR4**: Transaction edit, add, or delete triggers recomputation and UI update within 1 second. Since positions are computed on read and the dataset is ~1400 transactions, this should be met naturally. No caching or optimization needed — the existing computation pipeline handles this.

### Project Structure Notes

- All new files follow `kebab-case` naming
- Server action file goes in `src/server/actions/` alongside existing `market-data.ts`
- Zod schema goes in `src/shared/schemas/` (first schema file — directory exists but is empty)
- Client components go in `src/components/domain/` alongside existing components
- No changes to DB schema (transactions table unchanged)
- No new Shadcn components needed beyond existing Table primitives

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4, Story 4.2 AC lines 683-731]
- [Source: _bmad-output/planning-artifacts/architecture.md — ActionResult type, Server Action template, Write path data flow, Zod validation pattern]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — UX-DR8 inline editing, UX-DR20 error display, UX-DR22 sort indicators, Journey 4 error correction flow]
- [Source: _bmad-output/planning-artifacts/prd.md — FR15, FR19, FR29, FR41, FR47, NFR4]
- [Source: src/server/actions/market-data.ts — Server Action pattern reference]
- [Source: src/server/types/action-result.ts — Current ActionResult type]
- [Source: src/server/queries/transactions.ts — TransactionRow interface, getTransactions, computeNetAmount]
- [Source: src/components/domain/transactions-columns.tsx — Column definitions]
- [Source: src/components/domain/positions-table.tsx — Generic table component pattern]
- [Source: src/app/transactions/page.tsx — Current page structure]
- [Source: src/server/db/schema.ts — Transactions table schema]
- [Source: src/shared/schemas/ — Empty directory, first schema goes here]
- [Source: _bmad-output/implementation-artifacts/4-1-transaction-ledger-with-filtering-and-sorting.md — Previous story learnings and review findings]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- Fixed ESLint error: replaced `useEffect` setState with React "adjust state during render" pattern in EditableCell
- Removed unused `cn` import from TransactionsTable
- Replaced `EDITABLE_FIELDS` const (only used as type) with inline type union in server action

### Completion Notes List
- Extended `ActionResult` with optional `fieldErrors` (backward compatible)
- Created Zod 4 transaction validation schema with cross-field refinements for FR29 (negative grossAmount only for dividend, non-negative quantity/fees)
- Created `updateTransaction` server action following established pattern: Zod validation -> Drizzle mutation -> revalidatePath -> ActionResult
- Created `EditableCell` client component with display/edit modes, Enter/Tab/Escape keyboard handling, inline error display, and save highlight animation
- Created `TransactionsTable` client component managing editing/error/highlight state, calling server action, with TanStack Table sorting
- Converted `transactions-columns.tsx` from static array to `getTransactionsColumns()` function accepting edit context; editable columns use EditableCell, computed columns (netAmount, netAvgPrice) remain read-only
- Updated transactions page to use new TransactionsTable
- 27 new tests (17 schema + 10 server action), 140 total tests pass, 0 lint errors

### File List
- `src/server/types/action-result.ts` — Modified: added `fieldErrors` to failure case
- `src/shared/schemas/transaction.ts` — Created: Zod validation schema
- `src/shared/schemas/transaction.test.ts` — Created: 17 schema validation tests
- `src/server/actions/transactions.ts` — Created: `updateTransaction` server action
- `src/server/actions/transactions.test.ts` — Created: 10 server action tests
- `src/components/domain/editable-cell.tsx` — Created: inline edit cell component
- `src/components/domain/transactions-table.tsx` — Created: dedicated editable transactions table
- `src/components/domain/transactions-columns.tsx` — Modified: converted to function with edit context
- `src/app/transactions/page.tsx` — Modified: switched from PositionsTable to TransactionsTable

## Change Log
- 2026-04-08: Implemented inline transaction editing with full-row Zod validation, field-specific error display, and automatic recomputation cascade via revalidatePath
