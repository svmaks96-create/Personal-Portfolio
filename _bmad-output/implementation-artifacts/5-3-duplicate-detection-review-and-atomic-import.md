# Story 5.3: Duplicate Detection Review & Atomic Import

Status: done

## Story

As a user,
I want to review flagged duplicates with the ability to override per row and then import all confirmed transactions atomically,
so that I never get accidental duplicates but can still import legitimate same-day trades.

## Acceptance Criteria

1. **Given** validated rows are checked against existing transactions and within the import batch **When** duplicate detection runs **Then** duplicates are identified by matching on: date, ticker, action, quantity, grossAmount, and portfolio (FR25). Note: the epics spec says "price" but the implemented field is `grossAmount` (price-per-share was replaced with gross amount in the data model refactor — commit `0d14974`).

2. **Given** duplicates are found **When** Step 3 (Duplicate Review) of the import wizard renders **Then** I see a table showing flagged duplicate rows with amber row backgrounds **And** a summary is displayed: "[N] potential duplicates" **And** each flagged row has a skip/override toggle (default: skip) (FR26, UX-DR10 Step 3)

3. **Given** I review a flagged duplicate **When** I toggle a row from "Skip" to "Override" **Then** that row will be included in the import despite being flagged as a duplicate **And** the toggle state is visually clear (skip = row dimmed/struck-through, override = row normal)

4. **Given** all duplicates have been reviewed (or no duplicates were found) **When** Step 4 (Confirm) renders **Then** I see the final count of rows to be imported: "[N] transactions ready to import" **And** a primary "Import" button is displayed (UX-DR10 Step 4)

5. **Given** I click the "Import" button **When** the `commitImport` Server Action executes **Then** all confirmed rows (valid + overridden duplicates, excluding skipped duplicates) are inserted into the transactions table in a single atomic operation **And** if any row fails to insert, the entire batch is rolled back — no partial imports (FR27) **And** `revalidatePath('/', 'layout')` is called after successful import

6. **Given** the import completes successfully **When** the Server Action returns success **Then** an inline success banner appears: "[N] transactions imported successfully" with green-tinted background **And** the banner auto-dismisses after 5 seconds (UX-DR20) **And** I am redirected to the Dashboard page where the imported data is reflected in metrics and positions

7. **Given** the import wizard is implemented **When** I examine the client-side code **Then** the import wizard uses `useReducer` with the existing state shape: `{ step, file, parsedRows, validationErrors, duplicates, confirmedRows }` **And** the wizard component remains `'use client'`

## Tasks / Subtasks

- [x] Task 1: Add new reducer actions and update state for duplicate toggle (AC: 2, 3)
  - [x] 1.1 Add `TOGGLE_DUPLICATE` action to reducer — toggles a duplicate row between "skip" and "override"
  - [x] 1.2 Add `overriddenDuplicates: Set<number>` (rowIndex set) to `ImportWizardState` or track override state within the reducer's `confirmedRows`/`duplicates` arrays
  - [x] 1.3 Update `confirmedRows` derivation: valid rows + overridden duplicate rows (not skipped duplicates). Follow the same pattern as `SET_ROW_ERRORS` handler — re-filter `parsedRows` after status change, don't maintain a separate tracking structure.
  - [x] 1.4 Add reducer tests for the new action

- [x] Task 2: Implement Step 3 — Duplicate Review UI (AC: 2, 3)
  - [x] 2.1 Create `ImportDuplicateTable` component in `src/components/domain/import-duplicate-table.tsx`
  - [x] 2.2 Table shows duplicate rows with: all 8 data fields read-only, `duplicateOf` source info ("Matches existing transaction" or "Matches row N in this file"), skip/override toggle per row
  - [x] 2.3 Amber row background (`bg-amber-50`) for flagged duplicates
  - [x] 2.4 Skip state: row dimmed (`opacity-50`) with strikethrough text; Override state: row normal appearance
  - [x] 2.5 Summary header: "[N] potential duplicates"
  - [x] 2.6 "Continue" button to advance to Step 4; "Back" button to return to Step 2 (or Step 1 if no errors existed)
  - [x] 2.7 Replace Step 3 placeholder in `import-wizard.tsx` with `ImportDuplicateTable`

- [x] Task 3: Implement Step 4 — Confirm & Import UI (AC: 4, 6)
  - [x] 3.1 Replace Step 4 placeholder in `import-wizard.tsx` with confirm layout
  - [x] 3.2 Display: "[N] transactions ready to import" count (valid + overridden duplicates)
  - [x] 3.3 Primary "Import" button (only one primary button in view per UX spec)
  - [x] 3.4 "Back" button (secondary/ghost) to return to previous step
  - [x] 3.5 Success banner: green-tinted inline banner ("[N] transactions imported successfully"), auto-dismiss after 5s
  - [x] 3.6 Error banner: red inline banner with error message if import fails, persists until dismissed
  - [x] 3.7 After success + 5s dismiss, redirect to Dashboard (`/`) using `router.push('/')` — requires `useRouter` from `next/navigation` (not currently imported in import-wizard.tsx)

- [x] Task 4: Create `commitImport` Server Action (AC: 5)
  - [x] 4.1 Add `commitImport` to `src/server/actions/import.ts`
  - [x] 4.2 Input: array of `ImportValidationRow["data"]` objects (the confirmed rows)
  - [x] 4.3 Re-validate all rows with Zod before inserting (guard against stale validation — deferred review finding from 5.1)
  - [x] 4.4 Use `db.transaction((tx) => { ... })` for atomic insert — same pattern as `seed.ts` and `market-data.ts`
  - [x] 4.5 Insert each row into `transactions` table via `tx.insert(transactions).values(...)` 
  - [x] 4.6 Call `revalidatePath('/', 'layout')` (from `next/cache`) after successful commit
  - [x] 4.7 Return `ActionResult<{ importedCount: number }>` — never return computed data
  - [x] 4.8 On any insert failure, transaction auto-rolls back (better-sqlite3 behavior). Return `ActionResult` with error.

- [x] Task 5: Write tests (AC: all)
  - [x] 5.1 Unit tests for `commitImport` server action: success case, atomic rollback on failure, Zod re-validation rejection, empty batch handling
  - [x] 5.2 Unit tests for duplicate toggle reducer action
  - [x] 5.3 Unit tests for confirmed row count derivation (valid + overridden - skipped)
  - [x] 5.4 Update existing import action tests if needed

- [x] Task 6: Lint & verify
  - [x] 6.1 Run `npm run lint` — 0 errors
  - [x] 6.2 Run `npm run test:run` — all tests pass

## Dev Notes

### Architecture Compliance

- **Data flow:** `commitImport` is a Server Action (write path). It validates with Zod, inserts via Drizzle, calls `revalidatePath('/', 'layout')`, returns `ActionResult`. Fresh data arrives via Server Component re-render — the action never returns computed data.
- **Atomic operations:** Use `db.transaction()` — same pattern as `src/server/db/seed.ts:10` and `src/server/actions/market-data.ts:54`. better-sqlite3 transactions auto-rollback on error.
- **Server-only boundary:** `commitImport` lives in `src/server/actions/import.ts`. Client code never imports `db`, `drizzle-orm`, or `decimal.js`.
- **ActionResult pattern:** Return `ActionResult<{ importedCount: number }>` from `src/server/types/action-result.ts`.
- **No API routes:** All server logic via Server Actions only.

### Existing Code to Extend (NOT Reinvent)

- **Import wizard reducer:** `src/components/domain/import-wizard.tsx` — add `TOGGLE_DUPLICATE` action to existing `reducer()` function and `ImportAction` union type. The state shape (`ImportWizardState`) already has `duplicates` and `confirmedRows` arrays.
- **Duplicate detection:** Already fully implemented in `src/server/actions/import.ts` — `checkDuplicates()` helper runs during `validateImport` and `revalidateImportRows`. Creates 6-field composite key: `date|ticker|action|quantity|grossAmount|portfolio`. Each duplicate row has `duplicateOf: { source, existingId?, batchRowIndex? }`.
- **Import types:** `src/server/types/import.ts` — `ImportValidationRow` already has `status: "valid" | "error" | "duplicate"` and `duplicateOf` field. No changes needed.
- **Validation table as reference:** `src/components/domain/import-validation-table.tsx` — use as pattern reference for the duplicate table. Reuse Shadcn `<Table>` structure, row styling patterns.
- **EditableCell:** `src/components/domain/editable-cell.tsx` — NOT needed for duplicate table (read-only display). Do not import it.

### Stale Validation Guard (Deferred from 5.1 Review)

Review finding from Story 5.1: "Between validation and commit, DB state could change; commit step should re-validate." The `commitImport` action MUST re-validate all rows with Zod before inserting. This prevents:
- Rows that were corrected in Step 2 but somehow regressed
- Schema violations from client-side state manipulation

### UX Patterns from Spec

- **Amber for duplicates:** `bg-amber-50` row background, "Potential duplicate" label (from UX spec feedback patterns)
- **Skip/Override toggle:** Default is "Skip". Skip = dimmed/struck-through. Override = normal appearance.
- **Success feedback:** Inline banner, green-tinted, auto-dismiss 5s. NOT a toast/modal.
- **Error feedback:** Inline banner, persists until resolved. NOT a toast/modal.
- **One primary button per view:** Step 4's "Import" is the primary button. "Back" should be secondary/ghost.
- **No modals for non-destructive feedback.** Import confirmation is a button click, not a modal dialog (import is additive, not destructive).

### Transaction Table Schema

```typescript
// src/server/db/schema.ts
transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  ticker: text("ticker").notNull(),
  action: text("action").$type<"buy"|"sell"|"dividend"|"fee">().notNull(),
  quantity: real("quantity").notNull(),
  grossAmount: real("gross_amount").notNull(),   // Note: column is gross_amount
  fees: real("fees").notNull().default(0),
  portfolio: text("portfolio").notNull(),
  currency: text("currency").notNull(),
});
```

Map from `ImportValidationRow["data"]` fields to schema:
- `data.grossAmount` → column `gross_amount` (Drizzle handles via `grossAmount` property)
- All other fields map 1:1

### Performance Constraint

- FR (NFR): "Import validation and duplicate detection for a 1400+ row batch completes within 5 seconds"
- SQLite with better-sqlite3 is synchronous — a single `db.transaction()` with 1400 inserts is fast (milliseconds).

### Project Structure Notes

Files to create:
- `src/components/domain/import-duplicate-table.tsx` (NEW)

Files to modify:
- `src/components/domain/import-wizard.tsx` (add TOGGLE_DUPLICATE action, Step 3/4 UI)
- `src/server/actions/import.ts` (add `commitImport`)
- `src/server/actions/import.test.ts` (add commitImport tests)
- `src/components/domain/import-wizard-reducer.test.ts` (add toggle tests)

### Previous Story Learnings

**From Story 5.2:**
- `EditableCell` component supports text, number, date, select types — but NOT needed here (duplicate table is read-only)
- Two-tier re-validation pattern: Tier 1 client-side Zod, Tier 2 server-side. For commitImport, only server-side Zod re-validation matters.
- `checkSellMoreThanHeld` and `checkDuplicates` were extracted as reusable helpers — use `checkDuplicates` if needed during commit, but primary duplicate detection already happened.
- `Step2Validation` was extracted as a sub-component — follow same pattern for Step 3 and Step 4.
- Used `useRef` for latest parsedRows to avoid stale closure — may need similar pattern if callbacks reference state.

**From Story 5.1 review (deferred findings):**
- Date regex accepts invalid calendar dates (e.g. `2024-02-31`) — pre-existing, not in scope
- Stale validation between validate and commit — **IN SCOPE: commitImport must re-validate**
- `rawData as ImportValidationRow["data"]` cast unsafe on error rows — was addressed in 5.2 inline editing

**From Story 5.1/5.2 code review fixes:**
- Button components: use render prop pattern for base-ui Button (not `asChild` — was changed in commit `87f273b`)
- Always wrap server action calls in try-catch
- NaN guards already in schema

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 5.3 acceptance criteria]
- [Source: _bmad-output/planning-artifacts/prd.md — FR25-FR27, FR30]
- [Source: _bmad-output/planning-artifacts/architecture.md — ActionResult pattern, atomic operations, import wizard state]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — import wizard steps, feedback patterns, button hierarchy]
- [Source: src/server/actions/import.ts — existing validateImport, revalidateImportRows, checkDuplicates]
- [Source: src/components/domain/import-wizard.tsx — existing reducer, state shape, step placeholders]
- [Source: src/server/db/seed.ts — db.transaction() pattern]
- [Source: src/server/actions/market-data.ts — db.transaction() + insert pattern]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None — clean implementation, no blocking issues encountered.

### Completion Notes List

- **Task 1:** Added `TOGGLE_DUPLICATE` action and `overriddenDuplicates: Set<number>` to wizard state. Created `deriveConfirmedRows()` helper to compute valid + overridden duplicate rows. Overrides reset on new validation results or revalidation. 4 new reducer tests added.
- **Task 2:** Created `ImportDuplicateTable` component with read-only table, amber backgrounds, skip/override toggle buttons, duplicate source info. Integrated into Step 3 with Continue/Back navigation.
- **Task 3:** Created `Step4Confirm` sub-component with "[N] transactions ready to import" count, primary Import button, green success banner (auto-dismiss 5s + redirect), red error banner (dismiss button), Back navigation to previous step.
- **Task 4:** Added `commitImport` server action with Zod re-validation guard, `db.transaction()` atomic insert, `revalidatePath('/', 'layout')`, `ActionResult<{ importedCount }>` return type.
- **Task 5:** 6 commitImport tests (success, empty batch, Zod rejection, rollback, revalidatePath, negative quantity), 4 TOGGLE_DUPLICATE reducer tests, 1 SET_VALIDATION_RESULTS override reset test. Total: 39 tests in modified files, 216 across full suite.
- **Task 6:** 0 lint errors (3 pre-existing warnings). All 216 tests pass.

### Change Log

- Story 5.3 implementation complete (Date: 2026-04-09)
  - Duplicate review UI with skip/override toggle per row
  - Confirm & import UI with success/error feedback and redirect
  - Atomic `commitImport` server action with Zod re-validation
  - 11 new unit tests added

### Review Findings

- [x] [Review][Patch] `commitImport` uses raw `row` values instead of Zod-transformed `result.data` — ticker/currency not uppercased, fees `.default(0)` not applied [`src/server/actions/import.ts:316-344`]
- [x] [Review][Patch] Step 3 "Continue" and Step 4 "Import" buttons not disabled when `confirmedRows` is empty — user can advance to Step 4 with 0 rows and click Import to get an error [`src/components/domain/import-wizard.tsx:581,371`]
- [x] [Review][Patch] `initialState` shares a mutable `Set` singleton — `RESET` spreads `initialState` which reuses the same `Set` reference; concurrent StrictMode double-invocations could share state [`src/components/domain/import-wizard.tsx:60`]
- [x] [Review][Patch] Step 3 "Back" goes to Step 1 when no validation errors existed — user loses all duplicate override selections and must re-upload [`src/components/domain/import-wizard.tsx:571`]
- [x] [Review][Defer] `commitImport` does not re-check duplicates or sell-more-than-held at commit time (TOCTOU gap) [`src/server/actions/import.ts`] — deferred, single-user localhost app; already noted in 5-1 deferred work
- [x] [Review][Defer] No upper-bound on `rows` array length in `commitImport` — no size/count limit on client-provided data [`src/server/actions/import.ts`] — deferred, single-user localhost app
- [x] [Review][Defer] Batch-internal duplicate detection is asymmetric — only second occurrence flagged, user cannot skip first occurrence [`src/server/actions/import.ts:checkDuplicates`] — deferred, pre-existing design decision

### File List

- `src/components/domain/import-wizard.tsx` (MODIFIED) — added TOGGLE_DUPLICATE action, overriddenDuplicates state, deriveConfirmedRows helper, Step4Confirm component, replaced Step 3/4 placeholders
- `src/components/domain/import-duplicate-table.tsx` (NEW) — duplicate review table with skip/override toggles
- `src/server/actions/import.ts` (MODIFIED) — added commitImport server action with Zod re-validation and atomic insert
- `src/server/actions/import.test.ts` (MODIFIED) — added 6 commitImport tests, extended db mock with transaction/insert
- `src/components/domain/import-wizard-reducer.test.ts` (MODIFIED) — added 5 TOGGLE_DUPLICATE and override reset tests
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MODIFIED) — status updated to review
