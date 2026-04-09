# Story 6.1: Manual Transaction Add

Status: review

## Story

As a user,
I want to add a new transaction directly in the UI without going through the import flow,
So that I can quickly record a new trade or correct a missing entry.

## Acceptance Criteria

1. **Given** I am on the Transactions page **When** I click an "Add Transaction" button **Then** an inline row appears at the top of the transactions table (not a modal) with input fields for: Date, Ticker, Action (dropdown: buy/sell/dividend/fee), Quantity, Price, Fees, Portfolio, Currency, plus "Save" and "Cancel" (ghost) buttons (FR16, UX-DR9)

2. **Given** I fill in the add transaction row **When** I click "Save" **Then** the `addTransaction` Server Action validates input with the same rules as import: all required fields present, negative values rejected for quantity/price on buy/sell/fee (permitted only for dividend withholding), sell-more-than-held check, and duplicate detection against existing transactions (matching on date, ticker, action, quantity, grossAmount, portfolio) (FR30)

3. **Given** validation passes and no duplicates found **When** the Server Action completes **Then** the transaction is inserted into the database, `revalidatePath('/', 'layout')` triggers recomputation, the inline add row disappears, and the new transaction appears at its correct sorted position

4. **Given** validation fails **When** the Server Action returns errors **Then** field-specific errors display inline below the affected input fields in red text, the add row remains open for correction, and errors persist until resolved (UX-DR20)

5. **Given** a duplicate is detected during manual add **When** the Server Action returns the duplicate warning **Then** the user is informed a matching transaction exists and can choose to proceed (override) or cancel

6. **Given** I click "Cancel" on the add transaction row **When** the cancel action fires **Then** the inline row disappears without saving, no Server Action is called

## Tasks / Subtasks

- [x] Task 1: Create `addTransaction` Server Action (AC: 2, 3, 4, 5)
  - [x] 1.1 Add `addTransaction` function to `src/server/actions/transactions.ts`
  - [x] 1.2 Validate full record with `transactionSchema` from `src/shared/schemas/transaction.ts`
  - [x] 1.3 Implement sell-more-than-held check (reuse logic from `checkSellMoreThanHeld` in `import.ts`)
  - [x] 1.4 Implement duplicate detection (reuse logic from `checkDuplicates` in `import.ts`)
  - [x] 1.5 Return `ActionResult<{ id: number; isDuplicate?: boolean }>` — on duplicate, return `{ success: false, error: "duplicate", fieldErrors: {} }` with a distinguishable error type so the client can show the override prompt
  - [x] 1.6 Accept an `overrideDuplicate: boolean` parameter to skip duplicate check on retry
  - [x] 1.7 Insert via `db.insert(transactions).values({...}).run()` + `revalidatePath('/', 'layout')`
  - [x] 1.8 Write unit tests in `src/server/actions/transactions.test.ts`

- [x] Task 2: Add inline add row to TransactionsTable (AC: 1, 4, 6)
  - [x] 2.1 Add `isAdding` state + toggle to `TransactionsTable` (`src/components/domain/transactions-table.tsx`)
  - [x] 2.2 Create an `AddTransactionRow` component in `src/components/domain/add-transaction-row.tsx`
  - [x] 2.3 Render input fields matching the 8 editable columns (reuse same field types as `EditableCell`: date, text, number, select)
  - [x] 2.4 Action field: `<select>` dropdown with options `["buy", "sell", "dividend", "fee"]`
  - [x] 2.5 Save button (secondary style) and Cancel button (ghost style) at the end of the row
  - [x] 2.6 On Save: call `addTransaction`, handle field-level errors below inputs (red text, same pattern as `EditableCell` error display)
  - [x] 2.7 On Cancel: clear form and hide row, no server call
  - [x] 2.8 On success: hide row, form resets (revalidation brings fresh data)

- [x] Task 3: Handle duplicate detection UX (AC: 5)
  - [x] 3.1 When `addTransaction` returns a duplicate error, show an inline warning banner in the add row area
  - [x] 3.2 Provide "Add Anyway" (override) and "Cancel" options
  - [x] 3.3 "Add Anyway" re-calls `addTransaction` with `overrideDuplicate: true`

- [x] Task 4: Add "Add Transaction" button to page (AC: 1)
  - [x] 4.1 Pass `onAddClick` callback from `TransactionsTable` or add button above the table in `transactions/page.tsx`
  - [x] 4.2 Button style: secondary (white background, zinc-900 border) per UX spec
  - [x] 4.3 Button disabled while add row is already open

- [x] Task 5: Testing (AC: all)
  - [x] 5.1 Unit tests for `addTransaction` server action: success, Zod rejection, sell-more-than-held, duplicate detection, override
  - [x] 5.2 Unit tests for any new reducer/state logic if applicable (no new reducer — state is simple useState in components)

## Dev Notes

### Architecture Compliance

- **Server Action pattern:** Follow exact pattern in `src/server/actions/transactions.ts:16-68` — validate with Zod, mutate via Drizzle, `revalidatePath('/', 'layout')`, return `ActionResult<T>`. Never return computed data.
- **Zod schema:** Reuse `transactionSchema` from `src/shared/schemas/transaction.ts` — it already handles all validation (required fields, YYYY-MM-DD date, uppercase transforms on ticker/currency, negative amount only for dividends, quantity > 0 for buy/sell).
- **ActionResult type:** `src/server/types/action-result.ts` — discriminated union `{ success: true, data: T } | { success: false, error: string, fieldErrors?: Record<string, string> }`.
- **DB insert:** Use `db.insert(transactions).values({...}).run()` — same as `commitImport` in `import.ts:307+`.
- **Financial math:** Use `decimal.js` for sell-more-than-held check (server-side only). See `checkSellMoreThanHeld` in `import.ts:219-261` for the exact pattern.

### Reuse Existing Code — DO NOT Reinvent

- **Duplicate detection logic:** Extract/reuse from `checkDuplicates` in `src/server/actions/import.ts:263-305`. The 6-field composite key is: `date|ticker|action|quantity|grossAmount|portfolio`. For a single-row add, query existing transactions and check if the key matches. You may extract a shared helper or inline it — do NOT rewrite the matching logic from scratch.
- **Sell-more-than-held logic:** Extract/reuse from `checkSellMoreThanHeld` in `src/server/actions/import.ts:219-261`. Query existing positions by ticker+portfolio, compute held shares via `decimal.js` (buy adds, sell subtracts), compare against the new sell quantity.
- **EditableCell component:** `src/components/domain/editable-cell.tsx` — reuse its input styling (`ring-1 ring-zinc-900`, `h-7 px-1 text-[14px]`), select pattern, and error display (`<span className="block text-red-500 text-xs">`). The add row inputs should look identical to inline edit inputs.
- **Column field types:** `src/components/domain/transactions-columns.tsx` defines input types per field — date (date), ticker (text), action (select), quantity (number), grossAmount (number), fees (number), portfolio (text), currency (text). Match these exactly.

### Inline Add Row Design

- The add row renders at the **top of the table body**, before sorted data rows. It is NOT a modal or dialog.
- The row must have the same column structure as data rows (same widths, alignment) so inputs align with the table columns.
- The DB column is `gross_amount` but the TypeScript field is `grossAmount` — Drizzle maps via the schema. The Zod schema uses `grossAmount`.
- Default values: fees should default to `0` (matching `importRowSchema` behavior). Other fields start empty.
- The "Add Transaction" button lives in the controls area above the table. UX spec says secondary style: white background, zinc-900 border.

### TransactionsTable Integration

The current `TransactionsTable` component (`src/components/domain/transactions-table.tsx`) is a client component that:
- Takes `data: TransactionRow[]` as props from the server component page
- Manages `editingCell`, `cellError`, `highlightedCells` state
- Uses TanStack React Table with sorting

To add the inline row:
1. Add `isAdding` boolean state
2. When `isAdding`, render `AddTransactionRow` before the data rows in `<TableBody>`
3. The add row is independent of TanStack Table's row model — it's a manual `<TableRow>` with `<TableCell>` elements containing inputs
4. After successful save, set `isAdding = false` — revalidation will re-render with new data

### Transactions Page Integration

The page `src/app/transactions/page.tsx` is a Server Component. The "Add Transaction" button needs to be in a client component since it toggles state. Options:
- Add it inside `TransactionsTable` (simplest — button above the table inside the client component)
- Or add it to `ControlsBar` (would require passing a callback from `TransactionsTable`)

Recommended: Add the button inside `TransactionsTable` above the table `<div>`, keeping all add-row state co-located.

### Error Handling

- Field-level Zod errors: Parse `result.error.issues` into `fieldErrors` map (same as `updateTransaction` pattern at line 40-46 of `transactions.ts`)
- Sell-more-than-held: Return as `fieldErrors.quantity` with message "Cannot sell more than held (have X, selling Y)"
- Duplicate: Return a distinguishable error (e.g., `error: "Duplicate transaction detected"`) so client can show override UI instead of a normal error

### Project Structure Notes

- New server action: `addTransaction` in existing `src/server/actions/transactions.ts`
- New component: `src/components/domain/add-transaction-row.tsx`
- Modified components: `src/components/domain/transactions-table.tsx`
- No new Zod schemas needed — reuse `transactionSchema`
- No new query functions needed — `revalidatePath` handles fresh data

### Testing Standards

- Unit tests in `src/server/actions/transactions.test.ts` (extend existing file)
- Follow patterns from `import.test.ts`: test success path, Zod rejection, business rule violations, edge cases
- Run `npm run lint` first, then `npm run test:run` to verify
- All 216 existing tests must continue passing

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 6, Story 6.1]
- [Source: _bmad-output/planning-artifacts/prd.md — FR16, FR29, FR30, FR39, FR41]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — UX-DR9, UX-DR15, UX-DR20]
- [Source: src/server/actions/transactions.ts — updateTransaction pattern]
- [Source: src/server/actions/import.ts — checkDuplicates, checkSellMoreThanHeld, commitImport]
- [Source: src/shared/schemas/transaction.ts — transactionSchema]
- [Source: src/components/domain/transactions-table.tsx — current table implementation]
- [Source: src/components/domain/editable-cell.tsx — input styling and error display]

## Change Log

- 2026-04-09: Implemented story 6.1 — addTransaction server action with Zod validation, sell-more-than-held check, duplicate detection with override, inline add row UI in TransactionsTable, and 20 unit tests.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None — clean implementation, no blockers encountered.

### Completion Notes List

- Task 1: Created `addTransaction` server action in `src/server/actions/transactions.ts` with full Zod validation, sell-more-than-held check (reusing logic from import.ts), duplicate detection with 6-field composite key, and `overrideDuplicate` parameter. Returns `ActionResult<{ id: number }>`.
- Task 2: Created `AddTransactionRow` component with 8 input fields matching table columns, field-level error display, Save/Cancel buttons. Integrated into `TransactionsTable` as a manual `<TableRow>` at top of `<TableBody>`.
- Task 3: Duplicate detection UX — when duplicate detected, shows amber warning banner with "Add Anyway" (override) and "Cancel" options inline.
- Task 4: Added "Add Transaction" button (secondary variant, sm size) with Plus icon above the table inside `TransactionsTable`. Disabled while add row is open.
- Task 5: 20 unit tests for `addTransaction` covering: success path, Zod rejection (ticker, date, quantity, grossAmount, fees, currency), cross-field refinement, sell-more-than-held, duplicate detection, override, and no-insert guards. All 235 tests pass (215 existing + 20 new).

### File List

- `src/server/actions/transactions.ts` — Modified: added `addTransaction` server action + `decimal.js` import
- `src/server/actions/transactions.test.ts` — Modified: updated mock setup, added 20 tests for `addTransaction`
- `src/components/domain/add-transaction-row.tsx` — New: inline add transaction row component
- `src/components/domain/transactions-table.tsx` — Modified: added `isAdding` state, "Add Transaction" button, `AddTransactionRow` integration
