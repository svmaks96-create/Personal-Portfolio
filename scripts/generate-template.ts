import ExcelJS from "exceljs";

async function generateTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Transactions");

  sheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Ticker", key: "ticker", width: 12 },
    { header: "Action", key: "action", width: 12 },
    { header: "Quantity", key: "quantity", width: 12 },
    { header: "Gross Amount", key: "grossAmount", width: 16 },
    { header: "Fees", key: "fees", width: 10 },
    { header: "Portfolio", key: "portfolio", width: 22 },
    { header: "Currency", key: "currency", width: 10 },
  ];

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF4F4F5" },
  };

  // Example rows showing all action types and edge cases
  const examples = [
    { date: "2025-01-10", ticker: "AAPL", action: "buy", quantity: 15, grossAmount: 3450.00, fees: 4.95, portfolio: "Interactive Brokers", currency: "USD" },
    { date: "2025-02-03", ticker: "MSFT", action: "buy", quantity: 8, grossAmount: 3200.00, fees: 3.50, portfolio: "Interactive Brokers", currency: "USD" },
    { date: "2025-03-15", ticker: "AAPL", action: "dividend", quantity: 0, grossAmount: 3.75, fees: 0, portfolio: "Interactive Brokers", currency: "USD" },
    { date: "2025-03-15", ticker: "AAPL", action: "dividend", quantity: 0, grossAmount: -0.56, fees: 0, portfolio: "Interactive Brokers", currency: "USD" },
    { date: "2025-04-01", ticker: "AAPL", action: "sell", quantity: 5, grossAmount: 1200.00, fees: 4.95, portfolio: "Interactive Brokers", currency: "USD" },
    { date: "2025-04-15", ticker: "VOO", action: "buy", quantity: 3, grossAmount: 1500.00, fees: 0, portfolio: "Fidelity", currency: "USD" },
    { date: "2025-05-01", ticker: "AAPL", action: "fee", quantity: 0, grossAmount: 0, fees: 12.00, portfolio: "Interactive Brokers", currency: "USD" },
  ];

  const exampleFill: ExcelJS.FillPattern = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFFBEB" },
  };
  const exampleFont: Partial<ExcelJS.Font> = { color: { argb: "FF92400E" }, italic: true };

  for (const example of examples) {
    const row = sheet.addRow(example);
    row.font = exampleFont;
    row.fill = exampleFill;
  }

  // Add a note row after examples
  const noteRow = sheet.addRow([]);
  const noteCell = noteRow.getCell(1);
  noteCell.value = "↑ Delete these example rows before importing. Enter your data below.";
  noteCell.font = { bold: true, color: { argb: "FFDC2626" } };
  sheet.mergeCells(noteRow.number, 1, noteRow.number, 8);

  // Data validation for Action column (rows 2-1000)
  for (let row = 2; row <= 1000; row++) {
    sheet.getCell(`C${row}`).dataValidation = {
      type: "list",
      formulae: ['"buy,sell,dividend,fee"'],
      showErrorMessage: true,
      errorTitle: "Invalid Action",
      error: "Must be buy, sell, dividend, or fee",
    };
  }

  // Freeze header row
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  await workbook.xlsx.writeFile("public/template.xlsx");
  console.log("Template generated: public/template.xlsx");
}

generateTemplate();
