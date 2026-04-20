"use client";

import { useReducer, useRef, useState, useCallback, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  validateImport,
  revalidateImportRows,
  commitImport,
} from "@/server/actions/import";
import { ImportValidationTable } from "@/components/domain/import-validation-table";
import { ImportDuplicateTable } from "@/components/domain/import-duplicate-table";
import { TerminalPanel } from "@/components/domain/terminal-panel";
import {
  TerminalKpiStrip,
  type TerminalKpiCell,
} from "@/components/domain/terminal-kpi-strip";
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

// --- Button primitives ------------------------------------------------------

function TerminalButton({
  children,
  onClick,
  disabled,
  variant = "default",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "primary" | "danger";
  type?: "button" | "submit";
}) {
  const base =
    "border px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] disabled:opacity-35";
  const tone =
    variant === "primary"
      ? "border-foreground bg-foreground text-background hover:opacity-90"
      : variant === "danger"
        ? "border-neg text-neg hover:bg-neg-soft"
        : "border-line bg-panel text-foreground hover:bg-panel-strong";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(base, tone)}
    >
      {children}
    </button>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground before:content-['//_']">
      {children}
    </span>
  );
}

// --- Stepper ---------------------------------------------------------------

interface StepDef {
  n: 1 | 2 | 3 | 4;
  label: string;
  meta: string;
}

function Stepper({
  current,
  steps,
  onStepClick,
}: {
  current: 1 | 2 | 3 | 4;
  steps: StepDef[];
  onStepClick: (n: 1 | 2 | 3 | 4) => void;
}) {
  return (
    <div className="grid grid-cols-4 border border-line">
      {steps.map((s) => {
        const state = s.n < current ? "done" : s.n === current ? "active" : "pending";
        return (
          <button
            key={s.n}
            type="button"
            onClick={() => onStepClick(s.n)}
            className={cn(
              "relative flex flex-col gap-1.5 border-r border-line px-4 py-3.5 text-left last:border-r-0 cursor-pointer",
              state === "active" && "bg-panel-strong",
              state === "active" &&
                "after:absolute after:inset-x-0 after:-bottom-[1px] after:h-[2px] after:bg-foreground",
            )}
          >
            <div
              className={cn(
                "font-mono text-[9px] uppercase tracking-[0.22em]",
                state === "pending"
                  ? "text-muted-foreground/60"
                  : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "mr-1",
                  state === "done" ? "text-pos" : "text-muted-foreground",
                )}
              >
                {state === "done" ? "✓" : "▸"}
              </span>
              Step {String(s.n).padStart(2, "0")}
            </div>
            <div
              className={cn(
                "font-mono text-[13px] font-medium tracking-[0.08em] uppercase",
                state === "active"
                  ? "text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {s.label}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
              {s.meta}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// --- Step 2 (validation) ---------------------------------------------------

function Step2Validation({
  state,
  dispatch,
}: {
  state: ImportWizardState;
  dispatch: React.Dispatch<ImportAction>;
}) {
  const errorCount = state.parsedRows.filter((r) => r.status === "error").length;

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
      dispatch({ type: "UPDATE_ROW", rowIndex, field, value });

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
      const result = await revalidateImportRows(state.parsedRows);

      if (!result.success) {
        dispatch({ type: "SET_UPLOAD_ERROR", error: result.error });
        return;
      }

      dispatch({ type: "REVALIDATE_RESULTS", result: result.data });

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
    <TerminalPanel
      label="Validation"
      tag={`${errorCount} row${errorCount === 1 ? "" : "s"} need attention`}
      action={
        state.fileName ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            File: {state.fileName}
          </span>
        ) : null
      }
    >
      <ImportValidationTable
        rows={state.parsedRows}
        onUpdateRow={handleUpdateRow}
      />

      {state.uploadError && (
        <p className="mt-3 font-mono text-[11px] text-neg">{state.uploadError}</p>
      )}

      <div className="mt-4 flex items-center justify-between">
        <TerminalButton
          onClick={() => dispatch({ type: "RESET" })}
          disabled={state.isProcessing}
        >
          ← Back to upload
        </TerminalButton>
        <div className="flex items-center gap-3">
          <Hint>Fix errors inline · values re-validate automatically</Hint>
          <TerminalButton
            variant="primary"
            onClick={handleContinue}
            disabled={errorCount > 0 || state.isProcessing}
          >
            {state.isProcessing ? "Validating…" : "Continue →"}
          </TerminalButton>
        </div>
      </div>
    </TerminalPanel>
  );
}

// --- Step 4 (confirm) ------------------------------------------------------

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
  const validCount = state.parsedRows.filter((r) => r.status === "valid").length;
  const overrideCount = state.overriddenDuplicates.size;
  const totalCount = state.confirmedRows.length;

  return (
    <TerminalPanel
      label="Confirm"
      tag={`Ready to commit ${totalCount} rows`}
      action={
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Final review
        </span>
      }
    >
      {importResult?.type === "success" && (
        <div className="mb-4 border border-pos bg-pos-soft px-4 py-3 font-mono text-[11px] text-pos">
          {importResult.message}
          <p className="mt-1 text-[10px] text-muted-foreground">
            Redirecting to dashboard…
          </p>
        </div>
      )}

      {importResult?.type === "error" && (
        <div className="mb-4 flex items-center justify-between border border-neg bg-[var(--row-error-bg)] px-4 py-3 font-mono text-[11px] text-neg">
          <span>{importResult.message}</span>
          <button
            type="button"
            onClick={() => setImportResult(null)}
            className="underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {!importResult?.type && (
        <>
          <div className="mb-5 grid grid-cols-3 gap-3">
            <div className="border border-line px-4 py-3.5">
              <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
                <span className="mr-1 text-muted-foreground">▸</span>
                Valid rows
              </div>
              <div className="mt-1.5 font-mono text-[22px] font-medium leading-none text-pos tabular-nums">
                {validCount}
              </div>
            </div>
            <div className="border border-line px-4 py-3.5">
              <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
                <span className="mr-1 text-muted-foreground">▸</span>
                Duplicates to override
              </div>
              <div className="mt-1.5 font-mono text-[22px] font-medium leading-none tabular-nums text-[var(--warn)]">
                {overrideCount}
              </div>
            </div>
            <div className="border border-line px-4 py-3.5">
              <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
                <span className="mr-1 text-muted-foreground">▸</span>
                Total to import
              </div>
              <div className="mt-1.5 font-mono text-[22px] font-medium leading-none text-foreground tabular-nums">
                {totalCount}
              </div>
            </div>
          </div>
          <div className="mb-4">
            <Hint>
              This will write {totalCount} transaction{totalCount === 1 ? "" : "s"} to the database. Dashboard metrics will refresh immediately.
            </Hint>
          </div>
          <div className="flex items-center justify-between">
            <TerminalButton
              onClick={() =>
                dispatch({ type: "GO_TO_STEP", step: previousStep as 1 | 2 | 3 | 4 })
              }
              disabled={isPending}
            >
              ← Back
            </TerminalButton>
            <div className="flex items-center gap-3">
              <TerminalButton
                onClick={() => dispatch({ type: "RESET" })}
                disabled={isPending}
              >
                Start over
              </TerminalButton>
              <TerminalButton
                variant="primary"
                onClick={handleImport}
                disabled={isPending || totalCount === 0}
              >
                {isPending ? "Importing…" : `[ Import ${totalCount} rows ]`}
              </TerminalButton>
            </div>
          </div>
        </>
      )}
    </TerminalPanel>
  );
}

// --- Main component --------------------------------------------------------

export function ImportWizard() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFile = useCallback(async (file: File) => {
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
  }, []);

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
      e.target.value = "";
    },
    [handleFile],
  );

  const errorCount = state.parsedRows.filter((r) => r.status === "error").length;
  const dupCount = state.duplicates.length;
  const validCount = state.parsedRows.filter((r) => r.status === "valid").length;
  const parsedCount = state.parsedRows.length;
  const overrideCount = state.overriddenDuplicates.size;

  const steps: StepDef[] = [
    { n: 1, label: "Upload File", meta: "Drop .xlsx · template available" },
    {
      n: 2,
      label: "Validation",
      meta: `${errorCount} error${errorCount === 1 ? "" : "s"} to resolve`,
    },
    {
      n: 3,
      label: "Duplicates",
      meta: `${dupCount} duplicate${dupCount === 1 ? "" : "s"} to review`,
    },
    {
      n: 4,
      label: "Confirm",
      meta: `${state.confirmedRows.length} row${state.confirmedRows.length === 1 ? "" : "s"} ready`,
    },
  ];

  const kpiCells: TerminalKpiCell[] = [
    { label: "Parsed Rows", value: String(parsedCount) },
    {
      label: "Valid",
      value: String(validCount),
      valueTone: validCount > 0 ? "pos" : null,
    },
    {
      label: "Errors",
      value: String(errorCount),
      valueTone: errorCount > 0 ? "neg" : null,
    },
    {
      label: "Duplicates",
      value: String(dupCount),
      valueTone: dupCount > 0 ? "warn" : null,
    },
  ];

  return (
    <div className="space-y-5">
      <Stepper
        current={state.step}
        steps={steps}
        onStepClick={(n) => dispatch({ type: "GO_TO_STEP", step: n })}
      />

      <TerminalKpiStrip cells={kpiCells} columns={4} />

      {state.step === 1 && (
        <TerminalPanel
          label="Upload"
          tag="Drag a .xlsx file"
          action={
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Step 01
            </span>
          }
        >
          <div className="mb-3.5">
            <a
              href="/template.xlsx"
              download
              className="inline-flex items-center gap-2 border border-line bg-panel px-3.5 py-[7px] font-mono text-[10px] uppercase tracking-[0.18em] text-foreground hover:bg-panel-strong"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M6 2 V8 M3 5 L6 8 L9 5" />
                <path d="M2 10 H10" />
              </svg>
              Download template
            </a>
          </div>

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
              "cursor-pointer border-2 border-dashed px-10 py-16 text-center transition-colors",
              state.isProcessing
                ? "cursor-not-allowed border-line bg-panel-strong text-muted-foreground"
                : isDragOver
                  ? "border-foreground bg-panel-strong text-foreground"
                  : "border-line text-muted-foreground hover:border-foreground hover:bg-panel-strong hover:text-foreground",
            )}
          >
            {state.isProcessing ? (
              <p className="font-mono text-[13px] uppercase tracking-[0.18em]">
                Validating…
              </p>
            ) : (
              <>
                <p className="font-mono text-[14px] uppercase tracking-[0.22em] text-foreground">
                  <span className="mr-1 text-pos">▸</span>
                  Drop .xlsx file here
                </p>
                <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                  Or click to browse · max 10 MB · first row = headers
                </p>
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

          {state.uploadError && (
            <p className="mt-3 font-mono text-[11px] text-neg">
              {state.uploadError}
            </p>
          )}

          <div className="mt-4 flex items-center justify-between">
            <Hint>Use the template for guaranteed column match</Hint>
          </div>
        </TerminalPanel>
      )}

      {state.step === 2 && <Step2Validation state={state} dispatch={dispatch} />}

      {state.step === 3 && (
        <TerminalPanel
          label="Duplicates"
          tag={`${dupCount} match${dupCount === 1 ? "" : "es"} existing data`}
          action={
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Check to override
            </span>
          }
        >
          <ImportDuplicateTable
            duplicates={state.duplicates}
            overriddenDuplicates={state.overriddenDuplicates}
            onToggleDuplicate={(rowIndex) =>
              dispatch({ type: "TOGGLE_DUPLICATE", rowIndex })
            }
          />

          <div className="mt-4 flex items-center justify-between">
            <TerminalButton
              onClick={() => dispatch({ type: "GO_TO_STEP", step: 2 })}
            >
              ← Back
            </TerminalButton>
            <div className="flex items-center gap-3">
              <Hint>
                {overrideCount} duplicate{overrideCount === 1 ? "" : "s"} will be imported
              </Hint>
              <TerminalButton
                variant="primary"
                onClick={() => dispatch({ type: "GO_TO_STEP", step: 4 })}
                disabled={state.confirmedRows.length === 0}
              >
                Continue →
              </TerminalButton>
            </div>
          </div>
        </TerminalPanel>
      )}

      {state.step === 4 && <Step4Confirm state={state} dispatch={dispatch} />}
    </div>
  );
}
