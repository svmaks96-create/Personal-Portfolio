# Story 5.2: Validation Error Display & Inline Correction

Status: review

## Story

As a user,
I want to see exactly which rows have errors and fix them directly in the UI without re-uploading,
so that I can correct mistakes quickly and proceed with the import.

## Acceptance Criteria

1. **Given** the validation found rows with errors **When** Step 2 (Validation) of the import wizard renders **Then** I see a table showing ALL imported rows (valid + error) with error indicators, error rows are clearly distinguishable from valid rows, and the error count is displayed: "[N] rows need attention" (UX-DR10 Step 2)

2. **Given** a row has a validation error on a specific field **When** the validation table renders that row **Then** the error cell has a red border and a specific error message is displayed below the cell (e.g., "Required field", "Negative quantity not allowed for buy", "Cannot sell more than held") (FR23, UX-DR11)

3. **Given** I click on an error cell in the validation table **When** the cell becomes editable **Then** I can correct the value using the same inline editing pattern as the transactions table (click -> input -> Enter saves), correcting the value triggers immediate re-validation of that specific row, and if the correction resolves the error, the red border and error message are removed (FR24, UX-DR11)

4. **Given** all errors have been corrected **When** no error rows remain **Then** the wizard enables progression to the next step (Step 3: Duplicates, or Step 4: Confirm if no duplicates)

5. **Given** some errors remain uncorrected **When** I attempt to proceed **Then** the wizard prevents progression and keeps the error display visible

## Tasks / Subtasks

- [x] Task 1: Create `ImportValidationTable` component (AC: 1, 2)
  - [x] 1.1 Create `src/components/domain/import-validation-table.tsx` as `'use client'` component
  - [x] 1.2 Render all rows (valid + error) in a Shadcn Table with columns: Row #, Date, Ticker, Action, Quantity, Gross Amount, Fees, Portfolio, Currency, Status
  - [x] 1.3 Style error rows with `bg-red-50` background to distinguish from valid rows
  - [x] 1.4 Style error cells with `ring-1 ring-red-500` border and error message text below in `text-red-500 text-xs`
  - [x] 1.5 Display error count header: "[N] rows need attention"

- [x] Task 2: Implement inline cell editing in validation table (AC: 3)
  - [x] 2.1 Reuse `EditableCell` component from `src/components/domain/editable-cell.tsx` for cell editing
  - [x] 2.2 Make ALL cells editable on error rows (click -> input -> Enter/Tab saves -> Escape cancels)
  - [x] 2.3 Use correct input types per field: `date` for date, `select` for action (options: buy/sell/dividend/fee), `number` for quantity/grossAmount/fees, `text` for ticker/portfolio/currency
  - [x] 2.4 On save: update the row data in wizard state and trigger re-validation

- [x] Task 3: Implement client-side re-validation (AC: 3, 4)
  - [x] 3.1 After cell edit, run `importRowSchema.safeParse()` on the updated row data (schema is in `src/shared/schemas/import.ts`, safe for client import)
  - [x] 3.2 If validation passes: clear errors, set row status to "valid"
  - [x] 3.3 If validation fails: update errors array with new Zod issues
  - [x] 3.4 Recalculate error count after each edit

- [x] Task 4: Create `revalidateImportRows` server action for sell-more-than-held re-checks (AC: 3)
  - [x] 4.1 Add `revalidateImportRows` to `src/server/actions/import.ts` accepting `ImportValidationRow[]` (no FormData needed)
  - [x] 4.2 Re-run Zod validation, sell-more-than-held checks (FR28), and duplicate detection (FR25) on the full row set
  - [x] 4.3 Return `ActionResult<ImportValidationResult>` with updated statuses
  - [x] 4.4 Call this action when user clicks "Continue" to catch sell-more-than-held errors that client-side Zod can't detect

- [x] Task 5: Add reducer actions and wire up wizard step 2 (AC: 4, 5)
  - [x] 5.1 Add `UPDATE_ROW` reducer action to `import-wizard.tsx` — updates a specific row's data by rowIndex
  - [x] 5.2 Add `SET_ROW_ERRORS` reducer action — updates a specific row's errors and status after re-validation
  - [x] 5.3 Add `REVALIDATE_RESULTS` reducer action — accepts full re-validation results from server action
  - [x] 5.4 Replace Step 2 placeholder with `ImportValidationTable` component
  - [x] 5.5 Add "Continue" button: disabled while errors remain; on click, call `revalidateImportRows`, then advance to Step 3 or 4
  - [x] 5.6 Keep "Back to Upload" button (calls RESET)

- [x] Task 6: Write tests (AC: all)
  - [x] 6.1 Unit tests for `revalidateImportRows` server action (Zod re-validation, sell-more-than-held re-check, duplicate re-check)
  - [x] 6.2 Unit tests for `importRowSchema` client-side re-validation edge cases (correcting errors resolves them, introducing new errors catches them)
  - [x] 6.3 Test reducer actions: UPDATE_ROW, SET_ROW_ERRORS, REVALIDATE_RESULTS

- [x] Task 7: Lint and verify all tests pass
  - [x] 7.1 Run `npm run lint` — 0 errors
  - [x] 7.2 Run `npm run test:run` — all tests pass

## Dev Notes

### Architecture Compliance

- **Data flow:** This story adds a client-side validation loop. The `importRowSchema` lives in `src/shared/schemas/import.ts` (pure Zod, no server imports) and is safe for client-side import. The sell-more-than-held check requires DB access and MUST remain server-side.
- **Server Actions return `ActionResult<T>`:** The new `revalidateImportRows` action follows this pattern. It does NOT call `revalidatePath` — no DB mutation occurs.
- **No API routes:** All server logic via Server Actions only.
- **decimal.js server-side only:** The sell-more-than-held check in `revalidateImportRows` uses decimal.js. Never import decimal.js in client code.

### Re-Validation Strategy (Two-Tier)

**Tier 1 — Client-side (immediate, on each cell edit):**
- Run `importRowSchema.safeParse()` on the edited row
- Catches: format errors, missing fields, negative values, type mismatches
- Provides instant visual feedback (red border removed when fixed)
- Does NOT catch sell-more-than-held (needs DB) or duplicates (needs full batch context)

**Tier 2 — Server-side (on "Continue" click):**
- Call `revalidateImportRows` with all current rows
- Re-runs Zod validation + sell-more-than-held + duplicate detection
- If new errors found: update wizard state, stay on Step 2
- If all clear: advance to Step 3 (duplicates) or Step 4 (confirm)

This gives users instant feedback for most errors while ensuring data integrity for DB-dependent checks.

### Existing Code to Reuse

| What | Where | How to Reuse |
|---|---|---|
| `EditableCell` component | `src/components/domain/editable-cell.tsx` | Use directly for inline editing cells. Supports text/number/date/select input types, Enter/Tab/Escape keyboard handling, blur-to-save, error display below cell. |
| `importRowSchema` | `src/shared/schemas/import.ts` | Import in client component for Tier 1 re-validation. Safe for client import (pure Zod). |
| `ImportValidationRow` type | `src/server/types/import.ts` | Type-only import (no runtime code). Defines row shape including `errors` array. |
| Shadcn Table components | `@/components/ui/table` | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableHead`, `TableCell` |
| `cn()` utility | `@/lib/utils` | For conditional class merging |
| Wizard state & reducer | `src/components/domain/import-wizard.tsx` | Extend existing reducer with new actions |
| `validateImport` server action | `src/server/actions/import.ts` | Reference for sell-more-than-held and duplicate detection logic to replicate in `revalidateImportRows` |

### Component Props Design

```typescript
// ImportValidationTable props
interface ImportValidationTableProps {
  rows: ImportValidationRow[];
  onUpdateRow: (rowIndex: number, field: keyof ImportValidationRow['data'], value: string | number) => void;
}
```

The table receives all rows (valid + error) and a callback to update a row's field. The parent (`ImportWizard`) handles state updates and re-validation. The table is a controlled display component.

**Edit state management:** The `ImportValidationTable` must track which cell is currently being edited. Add local component state: `editingCell: { rowIndex: number; field: string } | null`. Set on `onStartEdit`, clear on `onSave`/`onCancel`. Pass `isEditing={editingCell?.rowIndex === row.rowIndex && editingCell?.field === field}` to each `EditableCell`. Pass `isHighlighted={false}` (no save-highlight animation needed in validation context — the error clearing IS the visual feedback).

### Cell Error Display Pattern

Per UX-DR11 and the existing `EditableCell` pattern:
- Error cells: `ring-1 ring-red-500` border (red border around the cell)
- Error message: `text-red-500 text-xs` block below the cell value
- On fix: border and message removed immediately after successful client-side re-validation
- Valid cells: no special styling

### Row Styling

- Error rows: `bg-red-50` background (light red tint for full row)
- Valid rows: default background (no special styling)
- This matches the UX spec: "error rows are clearly distinguishable from valid rows"

### Wizard Step 2 Layout

```
[N] rows need attention                    (error count header)

| Row | Date | Ticker | Action | Qty | Gross Amount | Fees | Portfolio | Currency | Status |
|-----|------|--------|--------|-----|--------------|------|-----------|----------|--------|
| 2   | ...  | AAPL   | buy    | -5  | 1000         | 5    | Fidelity  | USD      | error  |
|     |      |        |        | ^red border                                      |        |
|     |      |        |        | "Quantity cannot be negative"                     |        |
| 3   | ...  | MSFT   | buy    | 10  | 500          | 0    | Fidelity  | USD      | valid  |
| ...                                                                                       |

[Back to Upload]                              [Continue →]  (disabled if errors > 0)
```

### Input Types Per Field

| Field | Input Type | Notes |
|---|---|---|
| date | `date` | HTML date picker, value format YYYY-MM-DD |
| ticker | `text` | Zod transform uppercases |
| action | `select` | Options: buy, sell, dividend, fee |
| quantity | `number` | Step attribute for decimals |
| grossAmount | `number` | Step attribute for decimals |
| fees | `number` | Step attribute for decimals |
| portfolio | `text` | Free text |
| currency | `text` | Zod transform uppercases, max 3 chars |

### `revalidateImportRows` Server Action Design

```typescript
// In src/server/actions/import.ts
export async function revalidateImportRows(
  rows: ImportValidationRow[]
): Promise<ActionResult<ImportValidationResult>>
```

This action:
1. Resets all row statuses to "valid"
2. Runs `importRowSchema.safeParse()` on each row
3. Sorts valid rows chronologically, loads DB positions, runs sell-more-than-held checks
4. Runs duplicate detection (vs DB + within batch)
5. Returns updated `ImportValidationResult`

Extract the sell-more-than-held and duplicate detection logic from `validateImport` into shared helper functions to avoid code duplication between `validateImport` and `revalidateImportRows`.

### Keyboard Navigation

Reuse existing `EditableCell` keyboard handling:
- **Enter:** Save and exit edit mode
- **Tab:** Save and move to next editable cell (via `onTabToNext` callback)
- **Escape:** Cancel edit, revert to original value
- **Click cell:** Enter edit mode

### Anti-Patterns to Avoid

- Do NOT import `decimal.js` in client components — sell-more-than-held is server-only
- Do NOT format numbers in components — use raw values for editing, display formatting only for non-editing state
- Do NOT create a new API route — use Server Actions only
- Do NOT add new derived state arrays to the reducer — the existing `validationErrors`, `duplicates`, `confirmedRows` arrays are already derived in `SET_VALIDATION_RESULTS`. Recompute them similarly in `REVALIDATE_RESULTS`. For error counts in the validation table, compute inline: `rows.filter(r => r.status === 'error').length`
- Do NOT call `revalidatePath` from `revalidateImportRows` — no DB mutation occurs
- Do NOT re-upload the file for re-validation — work with in-memory row data
- Always handle optional `errors` field with `row.errors ?? []` — `ImportValidationRow.errors` is optional (`errors?: Array<...>`)
- ALL rows are editable (valid and error) — a user may edit a valid row and introduce a new error, which must be caught
- When calling `importRowSchema.safeParse()` for re-validation, pass the current `row.data` as-is. Already-uppercased ticker/currency values will pass through transforms harmlessly.
- **Known `EditableCell` blur double-fire:** For non-select inputs, `onBlur` calls `commitSave` directly (not the guarded `handleBlur`). If Enter/Tab triggers save, blur also fires. Guard in the `onUpdateRow` handler: skip re-validation if value hasn't changed from current state.

### Project Structure Notes

New/modified files:
```
src/components/domain/import-validation-table.tsx  (NEW — listed in architecture)
src/components/domain/import-wizard.tsx             (MODIFY — replace Step 2 placeholder, add reducer actions)
src/server/actions/import.ts                        (MODIFY — add revalidateImportRows action, extract shared helpers)
src/server/actions/import.test.ts                   (MODIFY — add revalidateImportRows tests)
```

### Previous Story Intelligence (5.1)

**Key learnings from Story 5.1:**
- ExcelJS cell types need special handling (formula, hyperlink, rich text, error cells) — already handled in `validateImport`
- Column name mapping is case-insensitive: "Gross Amount" -> `grossAmount`
- The data model uses `grossAmount` (not price-per-share) — ensure all UI labels match
- `importRowSchema` includes `.transform()` calls (uppercase ticker/currency) — after `safeParse()` succeeds, use the transformed `result.data` not the original input
- Empty rows are filtered out during parsing — validation table should never show empty rows
- Sell-more-than-held errors include position context in the message: "Cannot sell more than held (have X, selling Y)"
- Duplicate detection uses 6-field composite key: `date|ticker|action|quantity|grossAmount|portfolio`

**Review findings from 5.1 that affect this story:**
- Button components should use `asChild` prop when wrapping `<a>` tags
- Error handling should always have try-catch around server action calls
- NaN values can slip through — the schema now has explicit NaN guards

### Git Intelligence

Recent commits show the pattern: implementation commit followed by code review fix commit. The existing codebase uses:
- Shadcn Table components for all data tables
- `EditableCell` for inline editing in transactions table
- `useReducer` pattern for complex client state (import wizard)
- Co-located test files with `.test.ts` suffix
- Server actions that never throw, always return `ActionResult`

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 5, Story 5.2]
- [Source: _bmad-output/planning-artifacts/architecture.md — Data Flow, ActionResult, Project Structure, Error Handling]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Import Wizard, Error Feedback, Form & Editing Patterns]
- [Source: _bmad-output/planning-artifacts/prd.md — FR23, FR24, UX-DR10, UX-DR11]
- [Source: _bmad-output/implementation-artifacts/5-1-excel-template-download-and-file-upload-with-validation.md — Previous story context]
- [Source: src/components/domain/editable-cell.tsx — Reusable inline editing component]
- [Source: src/components/domain/import-wizard.tsx — Existing wizard state and reducer]
- [Source: src/server/actions/import.ts — Existing validateImport action]
- [Source: src/shared/schemas/import.ts — importRowSchema for client-side re-validation]
- [Source: src/server/types/import.ts — ImportValidationRow, ImportValidationResult types]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None — clean implementation, all tests passed on first run.

### Completion Notes List

- Created `ImportValidationTable` component with Shadcn Table, error row styling (`bg-red-50`), error cell borders (`ring-1 ring-red-500`), error messages, and error count header
- Reused `EditableCell` component for inline editing with correct input types per field (date, select, number, text)
- Implemented two-tier re-validation: Tier 1 (client-side `importRowSchema.safeParse()` on each edit) and Tier 2 (server-side `revalidateImportRows` on Continue click)
- Extracted `checkSellMoreThanHeld` and `checkDuplicates` helper functions from `validateImport` to share with `revalidateImportRows` — no code duplication
- Added `buildResult` helper to construct `ImportValidationResult` consistently
- Added 3 new reducer actions: `UPDATE_ROW`, `SET_ROW_ERRORS`, `REVALIDATE_RESULTS`
- Created `Step2Validation` sub-component in wizard to encapsulate step 2 logic (state, handlers, layout)
- Continue button disabled when errors remain (AC 5); enabled and triggers server re-validation when all clear (AC 4)
- Guarded against `EditableCell` blur double-fire by skipping re-validation when value unchanged
- All cells are editable on all rows (valid and error), per dev notes
- Added 7 tests for `revalidateImportRows`, 5 tests for schema re-validation edge cases, 5 tests for reducer actions
- Final: 0 lint errors, 205 tests passing

### Change Log

- 2026-04-09: Story 5.2 implementation complete — validation error display, inline correction, two-tier re-validation

### File List

- `src/components/domain/import-validation-table.tsx` (NEW)
- `src/components/domain/import-wizard.tsx` (MODIFIED)
- `src/server/actions/import.ts` (MODIFIED)
- `src/server/actions/import.test.ts` (MODIFIED)
- `src/shared/schemas/import.test.ts` (MODIFIED)
- `src/components/domain/import-wizard-reducer.test.ts` (NEW)
