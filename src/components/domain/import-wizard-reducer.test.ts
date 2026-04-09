import { describe, it, expect } from "vitest";
import type {
  ImportValidationRow,
  ImportValidationResult,
} from "@/server/types/import";
import { reducer } from "./import-wizard";
import type { ImportWizardState } from "./import-wizard";

function makeRow(
  rowIndex: number,
  overrides: Partial<ImportValidationRow["data"]> = {},
  status: ImportValidationRow["status"] = "valid",
): ImportValidationRow {
  return {
    rowIndex,
    data: {
      date: "2025-03-15",
      ticker: "AAPL",
      action: "buy",
      quantity: 10,
      grossAmount: 1500,
      fees: 4.95,
      portfolio: "Main",
      currency: "USD",
      ...overrides,
    },
    status,
  };
}

function makeState(
  rows: ImportValidationRow[],
  overriddenDuplicates: Set<number> = new Set(),
): ImportWizardState {
  return {
    step: 2,
    file: null,
    fileName: null,
    parsedRows: rows,
    validationErrors: rows.filter((r) => r.status === "error"),
    duplicates: rows.filter((r) => r.status === "duplicate"),
    confirmedRows: rows.filter(
      (r) =>
        r.status === "valid" ||
        (r.status === "duplicate" && overriddenDuplicates.has(r.rowIndex)),
    ),
    overriddenDuplicates,
    isProcessing: false,
    uploadError: null,
  };
}

describe("import wizard reducer — UPDATE_ROW", () => {
  it("updates a specific field on the target row", () => {
    const state = makeState([makeRow(2), makeRow(3, { ticker: "MSFT" })]);
    const next = reducer(state, {
      type: "UPDATE_ROW",
      rowIndex: 2,
      field: "quantity",
      value: 20,
    });
    expect(next.parsedRows[0].data.quantity).toBe(20);
    expect(next.parsedRows[1].data.quantity).toBe(10); // unchanged
  });

  it("does not mutate original state", () => {
    const state = makeState([makeRow(2)]);
    const next = reducer(state, {
      type: "UPDATE_ROW",
      rowIndex: 2,
      field: "ticker",
      value: "MSFT",
    });
    expect(state.parsedRows[0].data.ticker).toBe("AAPL");
    expect(next.parsedRows[0].data.ticker).toBe("MSFT");
  });

  it("handles string fields correctly", () => {
    const state = makeState([makeRow(2)]);
    const next = reducer(state, {
      type: "UPDATE_ROW",
      rowIndex: 2,
      field: "date",
      value: "2025-04-01",
    });
    expect(next.parsedRows[0].data.date).toBe("2025-04-01");
  });
});

describe("import wizard reducer — SET_ROW_ERRORS", () => {
  it("sets errors on a specific row and updates derived arrays", () => {
    const state = makeState([makeRow(2), makeRow(3, { ticker: "MSFT" })]);
    const next = reducer(state, {
      type: "SET_ROW_ERRORS",
      rowIndex: 2,
      errors: [{ field: "date", message: "Invalid date" }],
      status: "error",
    });
    expect(next.parsedRows[0].status).toBe("error");
    expect(next.parsedRows[0].errors).toHaveLength(1);
    expect(next.validationErrors).toHaveLength(1);
    expect(next.confirmedRows).toHaveLength(1);
  });

  it("clears errors when status changes to valid", () => {
    const errorRow = makeRow(2, {}, "error");
    errorRow.errors = [{ field: "date", message: "Invalid date" }];
    const state = makeState([errorRow, makeRow(3, { ticker: "MSFT" })]);

    const next = reducer(state, {
      type: "SET_ROW_ERRORS",
      rowIndex: 2,
      errors: undefined,
      status: "valid",
    });
    expect(next.parsedRows[0].status).toBe("valid");
    expect(next.parsedRows[0].errors).toBeUndefined();
    expect(next.validationErrors).toHaveLength(0);
    expect(next.confirmedRows).toHaveLength(2);
  });
});

describe("import wizard reducer — REVALIDATE_RESULTS", () => {
  it("replaces all rows and derived arrays from server result", () => {
    const state = makeState([makeRow(2, {}, "error")]);
    state.isProcessing = true;

    const result: ImportValidationResult = {
      rows: [
        makeRow(2),
        makeRow(3, { ticker: "MSFT" }, "duplicate"),
      ],
      summary: { total: 2, valid: 1, errors: 0, duplicates: 1 },
    };

    const next = reducer(state, {
      type: "REVALIDATE_RESULTS",
      result,
    });

    expect(next.parsedRows).toHaveLength(2);
    expect(next.confirmedRows).toHaveLength(1);
    expect(next.duplicates).toHaveLength(1);
    expect(next.validationErrors).toHaveLength(0);
    expect(next.isProcessing).toBe(false);
    expect(next.overriddenDuplicates.size).toBe(0);
  });
});

describe("import wizard reducer — TOGGLE_DUPLICATE", () => {
  it("adds rowIndex to overriddenDuplicates and updates confirmedRows", () => {
    const dupRow = makeRow(2, { ticker: "MSFT" }, "duplicate");
    dupRow.duplicateOf = { source: "existing", existingId: 42 };
    const state = makeState([makeRow(3), dupRow]);
    state.step = 3;

    const next = reducer(state, { type: "TOGGLE_DUPLICATE", rowIndex: 2 });

    expect(next.overriddenDuplicates.has(2)).toBe(true);
    expect(next.confirmedRows).toHaveLength(2); // valid + overridden
  });

  it("removes rowIndex from overriddenDuplicates when toggled again", () => {
    const dupRow = makeRow(2, { ticker: "MSFT" }, "duplicate");
    dupRow.duplicateOf = { source: "existing", existingId: 42 };
    const state = makeState([makeRow(3), dupRow], new Set([2]));
    state.step = 3;

    const next = reducer(state, { type: "TOGGLE_DUPLICATE", rowIndex: 2 });

    expect(next.overriddenDuplicates.has(2)).toBe(false);
    expect(next.confirmedRows).toHaveLength(1); // only valid
  });

  it("does not mutate original state", () => {
    const dupRow = makeRow(2, {}, "duplicate");
    const state = makeState([makeRow(3), dupRow]);

    reducer(state, { type: "TOGGLE_DUPLICATE", rowIndex: 2 });

    expect(state.overriddenDuplicates.has(2)).toBe(false);
    expect(state.confirmedRows).toHaveLength(1);
  });

  it("confirmed rows include valid + overridden, exclude skipped duplicates", () => {
    const dup1 = makeRow(2, { ticker: "MSFT" }, "duplicate");
    const dup2 = makeRow(4, { ticker: "GOOG" }, "duplicate");
    const state = makeState([makeRow(3), dup1, dup2]);

    // Override only dup1
    const next = reducer(state, { type: "TOGGLE_DUPLICATE", rowIndex: 2 });

    expect(next.confirmedRows).toHaveLength(2); // valid row 3 + overridden row 2
    expect(next.confirmedRows.map((r) => r.rowIndex)).toEqual(
      expect.arrayContaining([3, 2]),
    );
  });
});

describe("import wizard reducer — SET_VALIDATION_RESULTS resets overrides", () => {
  it("clears overriddenDuplicates on new validation results", () => {
    const state = makeState([], new Set([2, 3]));
    const result: ImportValidationResult = {
      rows: [makeRow(2)],
      summary: { total: 1, valid: 1, errors: 0, duplicates: 0 },
    };

    const next = reducer(state, { type: "SET_VALIDATION_RESULTS", result });

    expect(next.overriddenDuplicates.size).toBe(0);
  });
});
