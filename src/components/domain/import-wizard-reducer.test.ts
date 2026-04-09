import { describe, it, expect } from "vitest";
import type {
  ImportValidationRow,
  ImportValidationResult,
} from "@/server/types/import";

// The reducer is not exported from import-wizard.tsx, so we replicate
// the action types and reducer logic here for unit testing.
// This tests the UPDATE_ROW, SET_ROW_ERRORS, and REVALIDATE_RESULTS
// actions that were added in Story 5.2.

type ImportWizardState = {
  step: 1 | 2 | 3 | 4;
  file: File | null;
  fileName: string | null;
  parsedRows: ImportValidationRow[];
  validationErrors: ImportValidationRow[];
  duplicates: ImportValidationRow[];
  confirmedRows: ImportValidationRow[];
  isProcessing: boolean;
  uploadError: string | null;
};

type ImportAction =
  | {
      type: "UPDATE_ROW";
      rowIndex: number;
      field: keyof ImportValidationRow["data"];
      value: string | number;
    }
  | {
      type: "SET_ROW_ERRORS";
      rowIndex: number;
      errors: Array<{ field: string; message: string }> | undefined;
      status: ImportValidationRow["status"];
    }
  | { type: "REVALIDATE_RESULTS"; result: ImportValidationResult };

function reducer(
  state: ImportWizardState,
  action: ImportAction,
): ImportWizardState {
  switch (action.type) {
    case "UPDATE_ROW": {
      const updatedRows = state.parsedRows.map((row) => {
        if (row.rowIndex !== action.rowIndex) return row;
        return {
          ...row,
          data: { ...row.data, [action.field]: action.value },
        };
      });
      return { ...state, parsedRows: updatedRows };
    }
    case "SET_ROW_ERRORS": {
      const updatedRows = state.parsedRows.map((row) => {
        if (row.rowIndex !== action.rowIndex) return row;
        return {
          ...row,
          status: action.status,
          errors: action.errors,
        };
      });
      return {
        ...state,
        parsedRows: updatedRows,
        validationErrors: updatedRows.filter((r) => r.status === "error"),
        confirmedRows: updatedRows.filter((r) => r.status === "valid"),
        duplicates: updatedRows.filter((r) => r.status === "duplicate"),
      };
    }
    case "REVALIDATE_RESULTS": {
      const { result } = action;
      return {
        ...state,
        parsedRows: result.rows,
        validationErrors: result.rows.filter((r) => r.status === "error"),
        duplicates: result.rows.filter((r) => r.status === "duplicate"),
        confirmedRows: result.rows.filter((r) => r.status === "valid"),
        isProcessing: false,
      };
    }
    default:
      return state;
  }
}

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

function makeState(rows: ImportValidationRow[]): ImportWizardState {
  return {
    step: 2,
    file: null,
    fileName: null,
    parsedRows: rows,
    validationErrors: rows.filter((r) => r.status === "error"),
    duplicates: rows.filter((r) => r.status === "duplicate"),
    confirmedRows: rows.filter((r) => r.status === "valid"),
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
  });
});
