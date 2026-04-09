# Story 6.2: Transaction Delete & Bulk Delete

Status: ready-for-dev

## Story

As a user,
I want to delete individual or multiple transactions with a confirmation step,
So that I can remove incorrect entries while being protected from accidental deletion.

## Acceptance Criteria

1. **Given** the transactions table is displayed **When** I look at a transaction row **Then** I see a delete button (destructive style: white background, `red-600` text and border) on the row (FR17)

2. **Given** I click the delete button on a transaction row **When** the click event fires **Then** a Shadcn AlertDialog appears asking for confirmation: "Delete this transaction? This will recompute affected positions." with a "Delete" destructive button and a "Cancel" ghost button (UX-DR15)

3. **Given** I confirm the deletion in the dialog **When** the `deleteTransaction` Server Action executes **Then** the transaction is removed from the database, `revalidatePath('/', 'layout')` triggers recomputation, and if this was the last transaction for a ticker+portfolio combination the position is automatically removed (FR42)

4. **Given** I click "Cancel" in the delete confirmation dialog **When** the dialog closes **Then** no deletion occurs and the transaction remains

5. **Given** the transactions table is displayed **When** I look at the leftmost column **Then** I see a checkbox column for row selection with a "select all" checkbox in the column header (FR18, UX-DR7)

6. **Given** I have selected one or more transactions via checkboxes **When** I click the "Delete Selected" button (destructive style) **Then** a Shadcn AlertDialog appears: "Delete [N] selected transactions? This will recompute affected positions." with a "Delete [N]" destructive button and a "Cancel" ghost button (UX-DR15)

7. **Given** I confirm the bulk deletion **When** the `bulkDeleteTransactions` Server Action executes **Then** all selected transactions are removed in a single operation, `revalidatePath('/', 'layout')` triggers recomputation, positions with no remaining transactions are automatically removed (FR42), and checkboxes are cleared after successful deletion

8. **Given** a delete or bulk delete creates a negative position (more shares sold than bought in remaining transactions) **When** the positions table re-renders **Then** the affected position row is highlighted with amber background and warning icon. The system does NOT prevent the delete — it flags the invalid state for the user to resolve (FR41, UX-DR26)

## Tasks / Subtasks

- [ ] Task 0: Install required Shadcn components (AC: 2, 5, 6)
  - [ ] 0.1 Install `alert-dialog` component: `npx shadcn@latest add alert-dialog`
  - [ ] 0.2 Install `checkbox` component: `npx shadcn@latest add checkbox`
  - [ ] 0.3 Verify components exist at `src/components/ui/alert-dialog.tsx` and `src/components/ui/checkbox.tsx`

- [ ] Task 1: Create `deleteTransaction` Server Action (AC: 3)
  - [ ] 1.1 Add `deleteTransaction(id: number)` to `src/server/actions/transactions.ts`
  - [ ] 1.2 Validate `id` is a positive integer
  - [ ] 1.3 Verify the transaction exists before deleting (return error if not found, same pattern as `updateTransaction` line 26-28)
  - [ ] 1.4 Execute `db.delete(transactions).where(eq(transactions.id, id)).run()`
  - [ ] 1.5 Call `revalidatePath('/', 'layout')` after successful deletion
  - [ ] 1.6 Return `ActionResult` (void data on success)

- [ ] Task 2: Create `bulkDeleteTransactions` Server Action (AC: 7)
  - [ ] 2.1 Add `bulkDeleteTransactions(ids: number[])` to `src/server/actions/transactions.ts`
  - [ ] 2.2 Validate `ids` is a non-empty array of positive integers (use Zod: `z.array(z.number().int().positive()).min(1)`)
  - [ ] 2.3 Execute `db.delete(transactions).where(inArray(transactions.id, ids)).run()` — single statement, atomic
  - [ ] 2.4 Call `revalidatePath('/', 'layout')` after successful deletion
  - [ ] 2.5 Return `ActionResult<{ deletedCount: number }>` with the count of deleted rows

- [ ] Task 3: Add checkbox selection column to transactions table (AC: 5)
  - [ ] 3.1 Enable TanStack Table row selection: add `rowSelection` state to `TransactionsTable`
  - [ ] 3.2 Add `getRowId: (row) => String(row.id)` to TanStack Table options
  - [ ] 3.3 Add `onRowSelectionChange` and `enableRowSelection: true` to table config
  - [ ] 3.4 Add a new first column in `transactions-columns.tsx` with Checkbox in header (select all) and Checkbox in cell (select row)
  - [ ] 3.5 Checkbox column should have no sorting, fixed narrow width
  - [ ] 3.6 Pass `rowSelection` and `onRowSelectionChange` from `TransactionsTable` to column definitions

- [ ] Task 4: Add delete button column to transactions table (AC: 1)
  - [ ] 4.1 Add a delete button column as the last column in `transactions-columns.tsx`
  - [ ] 4.2 Button style: destructive variant — white background, `red-600` text, `red-600` border, Trash2 icon from lucide-react
  - [ ] 4.3 Button should be small (`h-7 w-7` icon button) to fit in the row
  - [ ] 4.4 Delete column should have no sorting, fixed narrow width

- [ ] Task 5: Add delete confirmation dialog (AC: 2, 4, 6)
  - [ ] 5.1 Create `DeleteConfirmationDialog` component in `src/components/domain/delete-confirmation-dialog.tsx`
  - [ ] 5.2 Use Shadcn `AlertDialog` (not Dialog — AlertDialog is semantically correct for destructive confirmations)
  - [ ] 5.3 Props: `open: boolean`, `onOpenChange`, `count: number` (1 for single, N for bulk), `onConfirm: () => void`
  - [ ] 5.4 Single: "Delete this transaction? This will recompute affected positions."
  - [ ] 5.5 Bulk: "Delete [N] selected transactions? This will recompute affected positions."
  - [ ] 5.6 Confirm button: destructive style, text "Delete" (single) or "Delete [N]" (bulk)
  - [ ] 5.7 Cancel button: ghost style

- [ ] Task 6: Wire up single delete flow in TransactionsTable (AC: 1, 2, 3, 4)
  - [ ] 6.1 Add `deleteTarget: { id: number } | null` state to track which transaction is pending deletion
  - [ ] 6.2 Delete button click sets `deleteTarget`; dialog opens when `deleteTarget !== null`
  - [ ] 6.3 On confirm: call `deleteTransaction(deleteTarget.id)`, handle success/error
  - [ ] 6.4 On success: clear `deleteTarget` (dialog closes, revalidation refreshes table)
  - [ ] 6.5 On error: show error via toast or inline (match existing error patterns)

- [ ] Task 7: Wire up bulk delete flow in TransactionsTable (AC: 6, 7)
  - [ ] 7.1 Add "Delete Selected" button in the controls area above the table (next to "Add Transaction" button)
  - [ ] 7.2 Button only visible/enabled when `Object.keys(rowSelection).length > 0`
  - [ ] 7.3 Destructive button style: white background, `red-600` text + border
  - [ ] 7.4 Add `isBulkDeleting: boolean` state to track bulk delete dialog
  - [ ] 7.5 On confirm: call `bulkDeleteTransactions(selectedIds)`, handle success/error
  - [ ] 7.6 On success: clear `rowSelection` (checkboxes reset), clear `isBulkDeleting`
  - [ ] 7.7 Disable delete button and "Delete Selected" button during pending operations

- [ ] Task 8: Negative position warning display (AC: 8)
  - [ ] 8.1 Check if positions table already has amber highlighting for negative positions (it may already exist from prior computation logic)
  - [ ] 8.2 If not present: in the positions table component, check if `quantity < 0` and apply `bg-amber-50` background + warning icon
  - [ ] 8.3 This is a display-only concern — the computation engine already handles negative positions correctly

- [ ] Task 9: Testing (AC: all)
  - [ ] 9.1 Unit tests for `deleteTransaction` in `src/server/actions/transactions.test.ts`: success, not-found, invalid id, revalidation
  - [ ] 9.2 Unit tests for `bulkDeleteTransactions`: success with count, empty array rejection, invalid ids, revalidation
  - [ ] 9.3 Run `npm run lint` then `npm run test:run` — all existing tests (235+) must continue passing

## Dev Notes

### Architecture Compliance

- **Server Action pattern:** Follow exact pattern in `src/server/actions/transactions.ts` — validate inputs, perform DB operation via Drizzle, `revalidatePath('/', 'layout')`, return `ActionResult<T>`. Never return computed data.
- **ActionResult type:** `src/server/types/action-result.ts` — `{ success: true; data: T } | { success: false; error: string; fieldErrors?: Record<string, string> }`.
- **DB operations:** Use Drizzle's `db.delete(transactions).where(...)` — import `eq` and `inArray` from `drizzle-orm`.
- **Revalidation:** Always `revalidatePath('/', 'layout')` — root layout scope, never just `revalidatePath('/')`.
- **Financial math:** No `decimal.js` needed for delete operations — deletion doesn't require arithmetic.

### Existing Code to Reuse — DO NOT Reinvent

- **`updateTransaction` pattern** (`src/server/actions/transactions.ts:16-68`): Follow the same structure — validate, check existence with `db.select().from(transactions).where(eq(transactions.id, id)).get()`, mutate, revalidate, return.
- **`EditableCell` styling** (`src/components/domain/editable-cell.tsx`): Reference its button/error styling for consistency.
- **`AddTransactionRow` integration pattern** (`src/components/domain/transactions-table.tsx`): The add row is managed as state in `TransactionsTable` — follow the same pattern for delete state (dialog open/target tracking).
- **Column definition pattern** (`src/components/domain/transactions-columns.tsx`): All columns use the same structure with `meta: { align: "center" as const }`. Add checkbox and delete columns following this pattern.

### Shadcn Components to Install

The following components are NOT yet installed and must be added:
- **AlertDialog:** `npx shadcn@latest add alert-dialog` — use for delete confirmations (NOT Dialog — AlertDialog is the correct semantic choice for destructive confirmations that require user acknowledgment)
- **Checkbox:** `npx shadcn@latest add checkbox` — use for row selection column

### TanStack Table Row Selection

TanStack Table has built-in row selection support. To enable:
1. Add `rowSelection` state: `const [rowSelection, setRowSelection] = useState<RowSelectionState>({})`
2. Add to table options: `state: { sorting, rowSelection }`, `onRowSelectionChange: setRowSelection`, `enableRowSelection: true`
3. Add `getRowId: (row) => String(row.id)` so selection keys are transaction IDs (not array indices)
4. Access selected row IDs: `Object.keys(rowSelection).map(Number)` — these are the transaction IDs to pass to `bulkDeleteTransactions`
5. Clear selection after delete: `setRowSelection({})`

### Column Structure Changes

Current columns (10): date, ticker, action, quantity, grossAmount, fees, portfolio, currency, netAmount, netAvgPrice

New columns to add:
- **First column (index 0):** Checkbox selection column — no header text, narrow width (~40px), no sorting
- **Last column:** Delete action column — no header text, narrow width (~40px), no sorting, contains Trash2 icon button

The `editableCellRenderer` helper in `transactions-columns.tsx` receives a context object (`ctx`) — the delete and checkbox columns do NOT use `editableCellRenderer`, they render custom cells directly. Pass callbacks for selection change and delete click through column meta or through the context object pattern already established.

### Delete Button Styling (UX Spec)

Per UX-DR15 and the spec:
- **Inline delete button:** Small icon button in row — `variant="outline"` with custom classes: `text-red-600 border-red-600 hover:bg-red-50 h-7 w-7 p-0`
- **"Delete Selected" button:** Same destructive style as inline but with text: `text-red-600 border-red-600 hover:bg-red-50`
- Use `Trash2` icon from `lucide-react` for the inline delete button

### AlertDialog Content

Single delete:
```
Title: "Delete Transaction"
Description: "Delete this transaction? This will recompute affected positions."
Cancel: "Cancel" (ghost)
Action: "Delete" (destructive: bg-red-600 text-white hover:bg-red-700)
```

Bulk delete:
```
Title: "Delete Transactions"  
Description: "Delete [N] selected transactions? This will recompute affected positions."
Cancel: "Cancel" (ghost)
Action: "Delete [N]" (destructive: bg-red-600 text-white hover:bg-red-700)
```

### Negative Position Handling (FR41)

When a delete removes transactions that cause a position to have more sells than buys:
- The computation engine (`src/server/services/computation.ts`) already computes positions from the full transaction ledger — it will produce a negative quantity naturally.
- The display concern is in the positions table components. Check `src/components/domain/active-positions-table.tsx` for existing row styling.
- If not already implemented: conditionally apply `className="bg-amber-50"` to rows where `quantity < 0` and add a `AlertTriangle` icon from lucide-react.
- This is a minor display enhancement — do NOT block the delete flow on this check.

### Position Auto-Removal (FR42)

This happens automatically via the computation engine: positions are computed on read from the transaction ledger. If all transactions for a ticker+portfolio are deleted, no position will be computed for that combination. No explicit "delete position" code is needed.

### State Management in TransactionsTable

Current states in `TransactionsTable`:
- `isAdding` — controls add row visibility
- `editingCell` — tracks which cell is being inline-edited  
- `cellError` — tracks field-level validation errors
- `highlightedCells` — tracks cells that just saved (animation)
- `sorting` — TanStack sorting state

New states to add:
- `rowSelection: RowSelectionState` — TanStack row selection state (object keyed by row ID)
- `deleteTarget: { id: number } | null` — which single transaction is pending deletion confirmation
- `isBulkDeleting: boolean` — whether the bulk delete confirmation dialog is open
- `isDeleting: boolean` — loading state during delete server action execution (disable buttons)

### Interaction Between Add Row and Selection

When `isAdding` is true (add row is open):
- Checkboxes should still be functional (no conflict)
- Delete buttons should still work (add row is independent)
- No special interaction logic needed

### Project Structure Notes

- Modified: `src/server/actions/transactions.ts` — add `deleteTransaction`, `bulkDeleteTransactions`
- Modified: `src/server/actions/transactions.test.ts` — add tests for both new actions
- Modified: `src/components/domain/transactions-table.tsx` — add row selection, delete target state, dialogs, "Delete Selected" button
- Modified: `src/components/domain/transactions-columns.tsx` — add checkbox column (first) and delete column (last)
- New: `src/components/domain/delete-confirmation-dialog.tsx` — reusable AlertDialog for single/bulk delete
- New: `src/components/ui/alert-dialog.tsx` — installed via Shadcn CLI
- New: `src/components/ui/checkbox.tsx` — installed via Shadcn CLI

### Testing Standards

- Unit tests in `src/server/actions/transactions.test.ts` (extend existing file)
- Follow mocking pattern from existing tests: mock `db.delete(transactions).where(...).run()` chain
- For `deleteTransaction`: test success, not-found (mock `.get()` returning undefined), invalid id
- For `bulkDeleteTransactions`: test success with deletedCount, empty array, invalid ids
- Verify `revalidatePath` called on success, NOT called on failure
- Run `npm run lint` first, then `npm run test:run`
- All existing 235+ tests must continue passing

### Previous Story (6.1) Intelligence

Key learnings from Story 6.1 implementation and code review:
- **Double-click prevention:** Use `useRef` guard for synchronous double-click prevention on server action calls (apply to delete confirm button)
- **Save/Cancel in separate TableRow:** Previous story placed Save/Cancel buttons in a separate `<TableRow>` with `colSpan` — acceptable pattern
- **`COLUMN_COUNT` constant:** A constant was extracted for `colSpan` values — update this if adding checkbox and delete columns (current value likely needs increment by 2)
- **Clear editingCell on state transitions:** When opening add row, editingCell is cleared. Similarly, consider clearing editingCell when initiating a delete
- **Error string conventions:** Use concise error strings for ActionResult — e.g., `"Transaction not found"`, `"No transaction IDs provided"`

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 6, Story 6.2]
- [Source: _bmad-output/planning-artifacts/prd.md — FR17, FR18, FR19, FR41, FR42]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — UX-DR7, UX-DR15, UX-DR26]
- [Source: _bmad-output/planning-artifacts/architecture.md — Server Action pattern, recomputation cascade]
- [Source: src/server/actions/transactions.ts — updateTransaction pattern, addTransaction pattern]
- [Source: src/server/actions/transactions.test.ts — test mocking patterns]
- [Source: src/components/domain/transactions-table.tsx — current table state management]
- [Source: src/components/domain/transactions-columns.tsx — column definition patterns]
- [Source: _bmad-output/implementation-artifacts/6-1-manual-transaction-add.md — previous story learnings and review findings]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
