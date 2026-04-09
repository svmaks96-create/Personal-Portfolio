"use client";

import { useReducer, useRef, useState, useCallback, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  validateImport,
  revalidateImportRows,
  commitImport,
} from "@/server/actions/import";
import { ImportValidationTable } from "@/components/domain/import-validation-table";
import { ImportDuplicateTable } from "@/components/domain/import-duplicate-table";
import { importRowSchema } from "@/shared/schemas/import";
import type {
  ImportValidationRow,
  ImportValidationResult,
} from "@/server/types/import";
import { cn } from "@/lib/utils";

export type ImportWizardState = {
  step: 1 | 2 | 3 | 4;
  file: File | null;
  fileName: string | null;
  parsedRows: ImportValidationRow[];
  validationErrors: ImportValidationRow[];
  duplicates: ImportValidationRow[];
  confirmedRows: ImportValidationRow[];
  overriddenDuplicates: Set<number>;
  isProcessing: boolean;
  uploadError: string | null;
};

export type ImportAction =
  | { type: "SET_FILE"; file: File }
  | { type: "SET_PROCESSING"; isProcessing: boolean }
  | { type: "SET_UPLOAD_ERROR"; error: string }
  | { type: "SET_VALIDATION_RESULTS"; result: ImportValidationResult }
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
  | { type: "REVALIDATE_RESULTS"; result: ImportValidationResult }
  | { type: "TOGGLE_DUPLICATE"; rowIndex: number }
  | { type: "GO_TO_STEP"; step: 1 | 2 | 3 | 4 }
  | { type: "RESET" };

const initialState: ImportWizardState = {
  step: 1,
  file: null,
  fileName: null,
  parsedRows: [],
  validationErrors: [],
  duplicates: [],
  confirmedRows: [],
  overriddenDuplicates: new Set(),
  isProcessing: false,
  uploadError: null,
};

function deriveConfirmedRows(
  rows: ImportValidationRow[],
  overrides: Set<number>,
): ImportValidationRow[] {
  return rows.filter(
    (r) =>
      r.status === "valid" ||
      (r.status === "duplicate" && overrides.has(r.rowIndex)),
  );
}

function getNextStep(result: ImportValidationResult): 1 | 2 | 3 | 4 {
  if (result.summary.errors > 0) return 2;
  if (result.summary.duplicates > 0) return 3;
  return 4;
}

export function reducer(state: ImportWizardState, action: ImportAction): ImportWizardState {
  switch (action.type) {
    case "SET_FILE":
      return {
        ...state,
        file: action.file,
        fileName: action.file.name,
        uploadError: null,
      };
    case "SET_PROCESSING":
      return { ...state, isProcessing: action.isProcessing };
    case "SET_UPLOAD_ERROR":
      return { ...state, uploadError: action.error, isProcessing: false };
    case "SET_VALIDATION_RESULTS": {
      const { result } = action;
      return {
        ...state,
        parsedRows: result.rows,
        validationErrors: result.rows.filter((r) => r.status === "error"),
        duplicates: result.rows.filter((r) => r.status === "duplicate"),
        confirmedRows: result.rows.filter((r) => r.status === "valid"),
        overriddenDuplicates: new Set(),
        isProcessing: false,
        step: getNextStep(result),
      };
    }
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
      const dupes = updatedRows.filter((r) => r.status === "duplicate");
      return {
        ...state,
        parsedRows: updatedRows,
        validationErrors: updatedRows.filter((r) => r.status === "error"),
        confirmedRows: deriveConfirmedRows(updatedRows, state.overriddenDuplicates),
        duplicates: dupes,
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
        overriddenDuplicates: new Set(),
        isProcessing: false,
      };
    }
    case "TOGGLE_DUPLICATE": {
      const nextOverrides = new Set(state.overriddenDuplicates);
      if (nextOverrides.has(action.rowIndex)) {
        nextOverrides.delete(action.rowIndex);
      } else {
        nextOverrides.add(action.rowIndex);
      }
      return {
        ...state,
        overriddenDuplicates: nextOverrides,
        confirmedRows: deriveConfirmedRows(state.parsedRows, nextOverrides),
      };
    }
    case "GO_TO_STEP":
      return { ...state, step: action.step };
    case "RESET":
      return {
        step: 1 as const,
        file: null,
        fileName: null,
        parsedRows: [],
        validationErrors: [],
        duplicates: [],
        confirmedRows: [],
        overriddenDuplicates: new Set<number>(),
        isProcessing: false,
        uploadError: null,
      };
    default:
      return state;
  }
}

function Step2Validation({
  state,
  dispatch,
}: {
  state: ImportWizardState;
  dispatch: React.Dispatch<ImportAction>;
}) {
  const errorCount = state.parsedRows.filter(
    (r) => r.status === "error",
  ).length;

  // Keep a ref to latest parsedRows to avoid stale closure in handleUpdateRow
  const parsedRowsRef = useRef(state.parsedRows);
  useEffect(() => {
    parsedRowsRef.current = state.parsedRows;
  }, [state.parsedRows]);

  const handleUpdateRow = useCallback(
    (
      rowIndex: number,
      field: keyof ImportValidationRow["data"],
      value: string | number,
    ) => {
      // Update the row data in state
      dispatch({ type: "UPDATE_ROW", rowIndex, field, value });

      // Client-side re-validation (Tier 1) — use ref for latest rows
      const row = parsedRowsRef.current.find((r) => r.rowIndex === rowIndex);
      if (!row) return;

      const updatedData = { ...row.data, [field]: value };
      const result = importRowSchema.safeParse(updatedData);

      if (result.success) {
        dispatch({
          type: "SET_ROW_ERRORS",
          rowIndex,
          errors: undefined,
          status: "valid",
        });
      } else {
        dispatch({
          type: "SET_ROW_ERRORS",
          rowIndex,
          errors: result.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
          status: "error",
        });
      }
    },
    [dispatch],
  );

  const handleContinue = useCallback(async () => {
    dispatch({ type: "SET_PROCESSING", isProcessing: true });

    try {
      // Server-side re-validation (Tier 2)
      const result = await revalidateImportRows(state.parsedRows);

      if (!result.success) {
        dispatch({ type: "SET_UPLOAD_ERROR", error: result.error });
        return;
      }

      dispatch({ type: "REVALIDATE_RESULTS", result: result.data });

      // Only advance if no errors remain
      if (result.data.summary.errors === 0) {
        const nextStep = result.data.summary.duplicates > 0 ? 3 : 4;
        dispatch({ type: "GO_TO_STEP", step: nextStep as 1 | 2 | 3 | 4 });
      }
    } catch {
      dispatch({
        type: "SET_UPLOAD_ERROR",
        error: "Failed to re-validate rows. Please try again.",
      });
    }
  }, [dispatch, state.parsedRows]);

  return (
    <div className="space-y-4">
      <ImportValidationTable
        rows={state.parsedRows}
        onUpdateRow={handleUpdateRow}
      />

      {state.uploadError && (
        <p className="text-sm text-red-600">{state.uploadError}</p>
      )}

      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          onClick={() => dispatch({ type: "RESET" })}
          disabled={state.isProcessing}
        >
          Back to Upload
        </Button>
        <Button
          onClick={handleContinue}
          disabled={errorCount > 0 || state.isProcessing}
        >
          {state.isProcessing ? "Validating..." : "Continue"}
        </Button>
      </div>
    </div>
  );
}

function Step4Confirm({
  state,
  dispatch,
}: {
  state: ImportWizardState;
  dispatch: React.Dispatch<ImportAction>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [importResult, setImportResult] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Auto-dismiss success banner after 5s then redirect
  useEffect(() => {
    if (importResult?.type !== "success") return;
    const timer = setTimeout(() => {
      router.push("/");
    }, 5000);
    return () => clearTimeout(timer);
  }, [importResult, router]);

  const handleImport = useCallback(() => {
    startTransition(async () => {
      try {
        const rowData = state.confirmedRows.map((r) => r.data);
        const result = await commitImport(rowData);

        if (result.success) {
          setImportResult({
            type: "success",
            message: `${result.data.importedCount} transactions imported successfully`,
          });
        } else {
          setImportResult({ type: "error", message: result.error });
        }
      } catch {
        setImportResult({
          type: "error",
          message: "Failed to import transactions. Please try again.",
        });
      }
    });
  }, [state.confirmedRows]);

  const previousStep = state.duplicates.length > 0 ? 3 : 2;

  return (
    <div className="space-y-4">
      {importResult?.type === "success" && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {importResult.message}
        </div>
      )}

      {importResult?.type === "error" && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{importResult.message}</span>
          <button
            onClick={() => setImportResult(null)}
            className="ml-2 text-red-500 hover:text-red-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {!importResult?.type && (
        <>
          <p className="text-sm text-zinc-600">
            {state.confirmedRows.length} transactions ready to import
          </p>

          <div className="flex items-center justify-between">
            <Button
              variant="secondary"
              onClick={() =>
                dispatch({
                  type: "GO_TO_STEP",
                  step: previousStep as 1 | 2 | 3 | 4,
                })
              }
              disabled={isPending}
            >
              Back
            </Button>
            <Button onClick={handleImport} disabled={isPending || state.confirmedRows.length === 0}>
              {isPending ? "Importing..." : "Import"}
            </Button>
          </div>
        </>
      )}

      {importResult?.type === "success" && (
        <p className="text-xs text-zinc-400">
          Redirecting to dashboard...
        </p>
      )}
    </div>
  );
}

export function ImportWizard() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".xlsx")) {
        dispatch({ type: "SET_UPLOAD_ERROR", error: "Only .xlsx files are supported" });
        return;
      }

      dispatch({ type: "SET_FILE", file });
      dispatch({ type: "SET_PROCESSING", isProcessing: true });

      try {
        const formData = new FormData();
        formData.append("file", file);

        const result = await validateImport(formData);

        if (!result.success) {
          dispatch({ type: "SET_UPLOAD_ERROR", error: result.error });
          return;
        }

        dispatch({ type: "SET_VALIDATION_RESULTS", result: result.data });
      } catch {
        dispatch({ type: "SET_UPLOAD_ERROR", error: "Failed to validate file. Please try again." });
      }
    },
    [],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsDragOver(false);
      if (state.isProcessing) return;

      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [state.isProcessing, handleFile],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset so the same file can be re-selected
      e.target.value = "";
    },
    [handleFile],
  );

  const stepLabels = ["Upload File", "Validation", "Duplicates", "Confirm"];

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm text-zinc-500">
        {stepLabels.map((label, i) => {
          const stepNum = (i + 1) as 1 | 2 | 3 | 4;
          const isActive = state.step === stepNum;
          return (
            <span key={stepNum} className="flex items-center gap-2">
              {i > 0 && <span className="text-zinc-300">/</span>}
              <span
                className={cn(
                  "tabular-nums",
                  isActive ? "font-medium text-zinc-900" : "text-zinc-400",
                )}
              >
                Step {stepNum}: {label}
              </span>
            </span>
          );
        })}
      </div>

      {/* Step content */}
      {state.step === 1 && (
        <div className="space-y-4">
          {/* Download template */}
          <a
            href="/template.xlsx"
            download
            className="inline-flex h-8 items-center justify-center rounded-lg bg-secondary px-2.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            Download Template
          </a>

          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => !state.isProcessing && fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && !state.isProcessing) {
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={(e) => {
              e.preventDefault();
              if (!state.isProcessing) {
                dragCounterRef.current++;
                setIsDragOver(true);
              }
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              dragCounterRef.current--;
              if (dragCounterRef.current <= 0) {
                dragCounterRef.current = 0;
                setIsDragOver(false);
              }
            }}
            onDrop={handleDrop}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-12 text-center transition-colors",
              state.isProcessing
                ? "cursor-not-allowed border-zinc-200 bg-zinc-50 text-zinc-400"
                : isDragOver
                  ? "border-zinc-900 bg-zinc-50"
                  : "border-zinc-200 hover:border-zinc-300",
            )}
          >
            {state.isProcessing ? (
              <p className="text-sm text-zinc-500">Validating...</p>
            ) : (
              <>
                <p className="text-sm text-zinc-600">
                  Drag and drop your .xlsx file here
                </p>
                <p className="text-xs text-zinc-400">or click to browse</p>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileInput}
            className="hidden"
          />

          {/* Upload error */}
          {state.uploadError && (
            <p className="text-sm text-red-600">{state.uploadError}</p>
          )}
        </div>
      )}

      {/* Step 2: Validation errors */}
      {state.step === 2 && (
        <Step2Validation
          state={state}
          dispatch={dispatch}
        />
      )}

      {/* Step 3: Duplicate review */}
      {state.step === 3 && (
        <div className="space-y-4">
          <ImportDuplicateTable
            duplicates={state.duplicates}
            overriddenDuplicates={state.overriddenDuplicates}
            onToggleDuplicate={(rowIndex) =>
              dispatch({ type: "TOGGLE_DUPLICATE", rowIndex })
            }
          />

          <div className="flex items-center justify-between">
            <Button
              variant="secondary"
              onClick={() =>
                dispatch({
                  type: "GO_TO_STEP",
                  step: 2,
                })
              }
            >
              Back
            </Button>
            <Button
              onClick={() => dispatch({ type: "GO_TO_STEP", step: 4 })}
              disabled={state.confirmedRows.length === 0}
            >
              Continue
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Confirm & import */}
      {state.step === 4 && (
        <Step4Confirm state={state} dispatch={dispatch} />
      )}
    </div>
  );
}
