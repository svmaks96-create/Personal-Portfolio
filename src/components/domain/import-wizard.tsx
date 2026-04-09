"use client";

import { useReducer, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  validateImport,
  revalidateImportRows,
} from "@/server/actions/import";
import { ImportValidationTable } from "@/components/domain/import-validation-table";
import { importRowSchema } from "@/shared/schemas/import";
import type {
  ImportValidationRow,
  ImportValidationResult,
} from "@/server/types/import";
import { cn } from "@/lib/utils";

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
  isProcessing: false,
  uploadError: null,
};

function getNextStep(result: ImportValidationResult): 1 | 2 | 3 | 4 {
  if (result.summary.errors > 0) return 2;
  if (result.summary.duplicates > 0) return 3;
  return 4;
}

function reducer(state: ImportWizardState, action: ImportAction): ImportWizardState {
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
    case "GO_TO_STEP":
      return { ...state, step: action.step };
    case "RESET":
      return initialState;
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

  const handleUpdateRow = useCallback(
    (
      rowIndex: number,
      field: keyof ImportValidationRow["data"],
      value: string | number,
    ) => {
      // Update the row data in state
      dispatch({ type: "UPDATE_ROW", rowIndex, field, value });

      // Client-side re-validation (Tier 1)
      const row = state.parsedRows.find((r) => r.rowIndex === rowIndex);
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
    [dispatch, state.parsedRows],
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
          <Button variant="secondary" asChild>
            <a href="/template.xlsx" download>Download Template</a>
          </Button>

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

      {/* Step 3: Duplicates placeholder */}
      {state.step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">
            {state.duplicates.length} potential duplicates — review coming in
            Story 5.3
          </p>
          <div className="text-sm text-zinc-500">
            <p>Summary: {state.parsedRows.length} total rows</p>
            <p>{state.confirmedRows.length} valid</p>
            <p>{state.duplicates.length} duplicates</p>
          </div>
          <Button variant="secondary" onClick={() => dispatch({ type: "RESET" })}>
            Back to Upload
          </Button>
        </div>
      )}

      {/* Step 4: Confirm placeholder */}
      {state.step === 4 && (
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">
            {state.confirmedRows.length} transactions ready to import — commit
            coming in Story 5.3
          </p>
          <Button variant="secondary" onClick={() => dispatch({ type: "RESET" })}>
            Back to Upload
          </Button>
        </div>
      )}
    </div>
  );
}
