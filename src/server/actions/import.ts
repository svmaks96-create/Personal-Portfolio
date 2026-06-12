"use server";

import ExcelJS from "exceljs";
import { format } from "date-fns";
import Decimal from "decimal.js";
import { db } from "@/server/db";
import { transactions } from "@/server/db/schema";
import { revalidatePath } from "next/cache";
import { importRowSchema, COLUMN_MAP, REQUIRED_COLUMNS } from "@/shared/schemas/import";
import type { ActionResult } from "@/server/types/action-result";
import type {
  ImportValidationRow,
  ImportValidationResult,
} from "@/server/types/import";

export async function validateImport(
  formData: FormData,
): Promise<ActionResult<ImportValidationResult>> {
  try {
    // 1. Extract file from FormData
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return { success: false, error: "No file provided" };
    }
    if (!file.name.endsWith(".xlsx")) {
      return { success: false, error: "Only .xlsx files are supported" };
    }

    // 2. Parse with ExcelJS
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.getWorksheet(1);
    if (!sheet || sheet.rowCount < 2) {
      return { success: false, error: "File is empty or has no data rows" };
    }

    // 3. Map column headers (row 1)
    const headerRow = sheet.getRow(1);
    const columnIndexMap: Record<string, number> = {};
    headerRow.eachCell((cell, colNumber) => {
      const header = String(cell.value ?? "").trim().toLowerCase();
      const fieldName = COLUMN_MAP[header];
      if (fieldName) {
        columnIndexMap[fieldName] = colNumber;
      }
    });

    const missingColumns = REQUIRED_COLUMNS.filter(
      (col) => !columnIndexMap[COLUMN_MAP[col]],
    );
    if (missingColumns.length > 0) {
      return {
        success: false,
        error: `Missing columns: ${missingColumns.join(", ")}`,
      };
    }

    // 4. Parse data rows (row 2+)
    const rows: ImportValidationRow[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;

      const rawData: Record<string, unknown> = {};
      let allEmpty = true;

      for (const [fieldName, colIndex] of Object.entries(columnIndexMap)) {
        let value: unknown = row.getCell(colIndex).value;

        // Handle ExcelJS special cell types
        if (value && typeof value === "object") {
          if ("richText" in value) {
            value = (value as { richText: Array<{ text: string }> }).richText
              .map((rt) => rt.text)
              .join("");
          } else if ("result" in value) {
            // Formula cell — use the computed result
            value = (value as { result: unknown }).result;
          } else if ("text" in value) {
            // Hyperlink cell — use the display text
            value = (value as { text: string }).text;
          } else if ("error" in value) {
            // Error cell (#REF!, #DIV/0!, etc.) — treat as empty
            value = null;
          }
        }

        if (value !== null && value !== undefined && value !== "") {
          allEmpty = false;
        }

        // Type coercion
        if (fieldName === "date") {
          if (value instanceof Date) {
            rawData[fieldName] = format(value, "yyyy-MM-dd");
          } else {
            rawData[fieldName] = value != null ? String(value).trim() : "";
          }
        } else if (["quantity", "grossAmount", "fees"].includes(fieldName)) {
          rawData[fieldName] = value != null ? Number(value) : undefined;
        } else if (fieldName === "action") {
          rawData[fieldName] = value != null ? String(value).trim().toLowerCase() : "";
        } else if (fieldName === "instrument") {
          // Blank cells fall back to the Zod default ("stock")
          const text = value != null ? String(value).trim().toLowerCase() : "";
          rawData[fieldName] = text === "" ? undefined : text;
        } else {
          rawData[fieldName] = value != null ? String(value).trim() : "";
        }
      }

      if (allEmpty) return;

      rows.push({
        rowIndex: rowNumber,
        data: rawData as ImportValidationRow["data"],
        status: "valid",
      });
    });

    if (rows.length === 0) {
      return { success: false, error: "File is empty or has no data rows" };
    }

    // 5. Per-row Zod validation
    for (const row of rows) {
      const result = importRowSchema.safeParse(row.data);
      if (!result.success) {
        row.status = "error";
        row.errors = result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        }));
      } else {
        // Apply Zod transforms (uppercase ticker/currency, instrument default)
        row.data = {
          ...row.data,
          ticker: result.data.ticker,
          currency: result.data.currency,
          fees: result.data.fees,
          instrument: result.data.instrument,
        };
      }
    }

    // 6. Sell-more-than-held checks (FR28)
    checkSellMoreThanHeld(rows);

    // 7. Duplicate detection (FR25)
    checkDuplicates(rows);

    // 8. Build and return results
    return { success: true, data: buildResult(rows) };
  } catch (error) {
    console.error("validateImport failed:", error);
    return {
      success: false,
      error: "Failed to validate import file. Please try again.",
    };
  }
}

export async function revalidateImportRows(
  rows: ImportValidationRow[],
): Promise<ActionResult<ImportValidationResult>> {
  try {
    // 1. Reset all statuses and errors
    for (const row of rows) {
      row.status = "valid";
      row.errors = undefined;
      row.duplicateOf = undefined;
    }

    // 2. Per-row Zod validation
    for (const row of rows) {
      const result = importRowSchema.safeParse(row.data);
      if (!result.success) {
        row.status = "error";
        row.errors = result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        }));
      } else {
        row.data = {
          ...row.data,
          ticker: result.data.ticker,
          currency: result.data.currency,
          fees: result.data.fees,
          instrument: result.data.instrument,
        };
      }
    }

    // 3. Sell-more-than-held checks
    checkSellMoreThanHeld(rows);

    // 4. Duplicate detection
    checkDuplicates(rows);

    // 5. Return results
    return { success: true, data: buildResult(rows) };
  } catch (error) {
    console.error("revalidateImportRows failed:", error);
    return {
      success: false,
      error: "Failed to re-validate rows. Please try again.",
    };
  }
}

// --- Shared helpers ---

function buildResult(rows: ImportValidationRow[]): ImportValidationResult {
  return {
    rows,
    summary: {
      total: rows.length,
      valid: rows.filter((r) => r.status === "valid").length,
      errors: rows.filter((r) => r.status === "error").length,
      duplicates: rows.filter((r) => r.status === "duplicate").length,
    },
  };
}

function checkSellMoreThanHeld(rows: ImportValidationRow[]): void {
  const existingPositions = db
    .select({
      ticker: transactions.ticker,
      portfolio: transactions.portfolio,
      action: transactions.action,
      instrument: transactions.instrument,
      quantity: transactions.quantity,
    })
    .from(transactions)
    .all();

  const positionMap = new Map<string, Decimal>();
  for (const tx of existingPositions) {
    const key = `${tx.ticker}:${tx.portfolio}:${tx.instrument}`;
    const current = positionMap.get(key) ?? new Decimal(0);
    if (tx.action === "buy") positionMap.set(key, current.plus(tx.quantity));
    if (tx.action === "sell") positionMap.set(key, current.minus(tx.quantity));
  }

  const validRows = rows.filter((r) => r.status === "valid");
  validRows.sort((a, b) => a.data.date.localeCompare(b.data.date));

  for (const row of validRows) {
    const key = `${row.data.ticker}:${row.data.portfolio}:${row.data.instrument}`;
    const held = positionMap.get(key) ?? new Decimal(0);

    if (row.data.action === "sell") {
      if (new Decimal(row.data.quantity).greaterThan(held)) {
        row.status = "error";
        row.errors = [
          {
            field: "quantity",
            message: `Cannot sell more than held (have ${held.toNumber()}, selling ${row.data.quantity})`,
          },
        ];
        continue;
      }
      positionMap.set(key, held.minus(row.data.quantity));
    } else if (row.data.action === "buy") {
      positionMap.set(key, held.plus(row.data.quantity));
    }
  }
}

function checkDuplicates(rows: ImportValidationRow[]): void {
  const existingTransactions = db
    .select({
      id: transactions.id,
      date: transactions.date,
      ticker: transactions.ticker,
      action: transactions.action,
      instrument: transactions.instrument,
      quantity: transactions.quantity,
      grossAmount: transactions.grossAmount,
      portfolio: transactions.portfolio,
    })
    .from(transactions)
    .all();

  const existingKeys = new Map<string, number>();
  for (const tx of existingTransactions) {
    const key = `${tx.date}|${tx.ticker}|${tx.action}|${tx.instrument}|${tx.quantity}|${tx.grossAmount}|${tx.portfolio}`;
    existingKeys.set(key, tx.id);
  }

  const batchKeys = new Map<string, number>();
  for (const row of rows) {
    if (row.status !== "valid") continue;

    const key = `${row.data.date}|${row.data.ticker}|${row.data.action}|${row.data.instrument}|${row.data.quantity}|${row.data.grossAmount}|${row.data.portfolio}`;

    const existingId = existingKeys.get(key);
    if (existingId !== undefined) {
      row.status = "duplicate";
      row.duplicateOf = { source: "existing", existingId };
      continue;
    }

    const batchRow = batchKeys.get(key);
    if (batchRow !== undefined) {
      row.status = "duplicate";
      row.duplicateOf = { source: "batch", batchRowIndex: batchRow };
      continue;
    }

    batchKeys.set(key, row.rowIndex);
  }
}

export async function commitImport(
  rows: ImportValidationRow["data"][],
): Promise<ActionResult<{ importedCount: number }>> {
  try {
    if (rows.length === 0) {
      return { success: false, error: "No rows to import" };
    }

    // Re-validate all rows with Zod before inserting (stale validation guard)
    // Use transformed values (uppercased ticker/currency, fees default) for insert
    const validatedRows: Array<{
      date: string;
      ticker: string;
      action: "buy" | "sell" | "dividend" | "fee";
      instrument: "stock" | "option";
      quantity: number;
      grossAmount: number;
      fees: number;
      portfolio: string;
      currency: string;
    }> = [];

    for (const row of rows) {
      const result = importRowSchema.safeParse(row);
      if (!result.success) {
        const issues = result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        return {
          success: false,
          error: `Validation failed for row (${row.ticker} ${row.date}): ${issues}`,
        };
      }
      validatedRows.push(result.data);
    }

    // Atomic insert
    db.transaction((tx) => {
      for (const row of validatedRows) {
        tx.insert(transactions)
          .values({
            date: row.date,
            ticker: row.ticker,
            action: row.action,
            instrument: row.instrument,
            quantity: row.quantity,
            grossAmount: row.grossAmount,
            fees: row.fees,
            portfolio: row.portfolio,
            currency: row.currency,
          })
          .run();
      }
    });

    revalidatePath("/", "layout");

    return { success: true, data: { importedCount: rows.length } };
  } catch (error) {
    console.error("commitImport failed:", error);
    return {
      success: false,
      error: "Failed to import transactions. Please try again.",
    };
  }
}
