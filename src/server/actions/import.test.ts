import { vi, describe, it, expect, beforeEach } from "vitest";
import ExcelJS from "exceljs";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/server/db", () => {
  const mockAll = vi.fn().mockReturnValue([]);
  const mockFrom = vi.fn().mockReturnValue({ all: mockAll, where: vi.fn().mockReturnValue({ all: mockAll }) });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });

  return {
    db: {
      select: mockSelect,
      _mocks: { mockAll, mockFrom, mockSelect },
    },
  };
});

import { db } from "@/server/db";
import { validateImport } from "./import";

const mocks = (db as unknown as { _mocks: Record<string, ReturnType<typeof vi.fn>> })._mocks;

async function createExcelFile(
  rows: Record<string, unknown>[],
  headers?: string[],
): Promise<File> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Transactions");

  const cols = headers ?? [
    "Date", "Ticker", "Action", "Quantity", "Gross Amount", "Fees", "Portfolio", "Currency",
  ];
  sheet.addRow(cols);

  for (const row of rows) {
    sheet.addRow(cols.map((h) => {
      const key = h.toLowerCase() === "gross amount" ? "grossAmount" : h.toLowerCase();
      return row[key];
    }));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new File([buffer], "test.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function validRowData(overrides: Record<string, unknown> = {}) {
  return {
    date: "2025-03-15",
    ticker: "AAPL",
    action: "buy",
    quantity: 10,
    grossAmount: 1500,
    fees: 4.95,
    portfolio: "Main",
    currency: "USD",
    ...overrides,
  };
}

describe("validateImport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAll.mockReturnValue([]);
  });

  it("returns error when no file provided", async () => {
    const formData = new FormData();
    const result = await validateImport(formData);
    expect(result).toEqual({ success: false, error: "No file provided" });
  });

  it("returns error for non-xlsx file", async () => {
    const file = new File(["data"], "test.csv", { type: "text/csv" });
    const formData = new FormData();
    formData.append("file", file);
    const result = await validateImport(formData);
    expect(result).toEqual({ success: false, error: "Only .xlsx files are supported" });
  });

  it("returns error for empty file (no data rows)", async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet("Transactions");
    const buffer = await workbook.xlsx.writeBuffer();
    const file = new File([buffer], "test.xlsx");
    const formData = new FormData();
    formData.append("file", file);
    const result = await validateImport(formData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("empty");
    }
  });

  it("returns error for missing required columns", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Transactions");
    sheet.addRow(["Date", "Ticker"]); // Missing columns
    sheet.addRow(["2025-03-15", "AAPL"]);
    const buffer = await workbook.xlsx.writeBuffer();
    const file = new File([buffer], "test.xlsx");
    const formData = new FormData();
    formData.append("file", file);
    const result = await validateImport(formData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Missing columns");
    }
  });

  it("validates all rows and returns correct summary for valid file", async () => {
    const file = await createExcelFile([validRowData()]);
    const formData = new FormData();
    formData.append("file", file);
    const result = await validateImport(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary.total).toBe(1);
      expect(result.data.summary.valid).toBe(1);
      expect(result.data.summary.errors).toBe(0);
      expect(result.data.summary.duplicates).toBe(0);
    }
  });

  it("marks rows with validation errors correctly", async () => {
    const file = await createExcelFile([
      validRowData(),
      validRowData({ date: "bad-date", ticker: "MSFT" }),
    ]);
    const formData = new FormData();
    formData.append("file", file);
    const result = await validateImport(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary.valid).toBe(1);
      expect(result.data.summary.errors).toBe(1);
      const errorRow = result.data.rows.find((r) => r.status === "error");
      expect(errorRow?.errors).toBeDefined();
      expect(errorRow?.errors?.some((e) => e.field === "date")).toBe(true);
    }
  });

  it("rejects negative grossAmount on buy (FR29)", async () => {
    const file = await createExcelFile([validRowData({ grossAmount: -100 })]);
    const formData = new FormData();
    formData.append("file", file);
    const result = await validateImport(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary.errors).toBe(1);
      const errorRow = result.data.rows[0];
      expect(errorRow.status).toBe("error");
      expect(errorRow.errors?.some((e) => e.field === "grossAmount")).toBe(true);
    }
  });

  it("marks sell exceeding held shares as error (FR28)", async () => {
    // No existing positions (mockAll returns [])
    const file = await createExcelFile([
      validRowData({ action: "sell", quantity: 10 }),
    ]);
    const formData = new FormData();
    formData.append("file", file);
    const result = await validateImport(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      const errorRow = result.data.rows[0];
      expect(errorRow.status).toBe("error");
      expect(errorRow.errors?.some((e) => e.message.includes("Cannot sell more than held"))).toBe(true);
    }
  });

  it("allows sell when existing positions cover it", async () => {
    // Mock existing buy of 20 shares
    mocks.mockAll.mockReturnValue([
      { id: 1, ticker: "AAPL", portfolio: "Main", action: "buy", quantity: 20, grossAmount: 3000, date: "2025-01-01" },
    ]);
    const file = await createExcelFile([
      validRowData({ action: "sell", quantity: 10 }),
    ]);
    const formData = new FormData();
    formData.append("file", file);
    const result = await validateImport(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rows[0].status).toBe("valid");
    }
  });

  it("detects duplicates against existing DB transactions", async () => {
    mocks.mockAll.mockReturnValue([
      { id: 42, date: "2025-03-15", ticker: "AAPL", action: "buy", quantity: 10, grossAmount: 1500, portfolio: "Main" },
    ]);
    const file = await createExcelFile([validRowData()]);
    const formData = new FormData();
    formData.append("file", file);
    const result = await validateImport(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary.duplicates).toBe(1);
      const dupRow = result.data.rows[0];
      expect(dupRow.status).toBe("duplicate");
      expect(dupRow.duplicateOf?.source).toBe("existing");
      expect(dupRow.duplicateOf?.existingId).toBe(42);
    }
  });

  it("detects duplicates within batch", async () => {
    const row = validRowData();
    const file = await createExcelFile([row, row]);
    const formData = new FormData();
    formData.append("file", file);
    const result = await validateImport(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary.valid).toBe(1);
      expect(result.data.summary.duplicates).toBe(1);
      const dupRow = result.data.rows.find((r) => r.status === "duplicate");
      expect(dupRow?.duplicateOf?.source).toBe("batch");
    }
  });

  it("handles case-insensitive column headers", async () => {
    const file = await createExcelFile(
      [validRowData()],
      ["DATE", "TICKER", "ACTION", "QUANTITY", "GROSS AMOUNT", "FEES", "PORTFOLIO", "CURRENCY"],
    );
    const formData = new FormData();
    formData.append("file", file);
    const result = await validateImport(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary.valid).toBe(1);
    }
  });

  it("uppercases ticker and currency in parsed data", async () => {
    const file = await createExcelFile([validRowData({ ticker: "aapl", currency: "usd" })]);
    const formData = new FormData();
    formData.append("file", file);
    const result = await validateImport(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rows[0].data.ticker).toBe("AAPL");
      expect(result.data.rows[0].data.currency).toBe("USD");
    }
  });

  it("processes sell-more-than-held in chronological order", async () => {
    // Buy first, then sell — should pass when in date order
    const file = await createExcelFile([
      validRowData({ date: "2025-03-15", action: "buy", quantity: 10 }),
      validRowData({ date: "2025-03-16", action: "sell", quantity: 5 }),
    ]);
    const formData = new FormData();
    formData.append("file", file);
    const result = await validateImport(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      // Both rows should be valid (buy first in chronological order gives position to sell from)
      const validRows = result.data.rows.filter((r) => r.status === "valid");
      expect(validRows.length).toBe(2);
    }
  });

  it("defaults missing fees to 0", async () => {
    const row = validRowData();
    delete (row as Record<string, unknown>).fees;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Transactions");
    sheet.addRow(["Date", "Ticker", "Action", "Quantity", "Gross Amount", "Fees", "Portfolio", "Currency"]);
    sheet.addRow(["2025-03-15", "AAPL", "buy", 10, 1500, undefined, "Main", "USD"]);
    const buffer = await workbook.xlsx.writeBuffer();
    const file = new File([buffer], "test.xlsx");
    const formData = new FormData();
    formData.append("file", file);
    const result = await validateImport(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rows[0].data.fees).toBe(0);
    }
  });
});
